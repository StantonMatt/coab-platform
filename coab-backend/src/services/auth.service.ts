import crypto from 'crypto';
import { hash, verify } from '@node-rs/argon2';
import { limpiarRUT } from '@coab/utils';
import prisma from '../lib/prisma.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/jwt.js';

/**
 * Auth errors with specific codes
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Login a customer with RUT and password
 */
export async function loginCliente(
  rut: string,
  password: string,
  ip: string,
  userAgent: string
) {
  // Normalize RUT (remove dots and dashes, uppercase K)
  const rutLimpio = limpiarRUT(rut);

  // Find customer by RUT
  const cliente = await prisma.clientes.findUnique({
    where: { rut: rutLimpio },
  });

  if (!cliente) {
    throw new AuthError('Credenciales inválidas', 'INVALID_CREDENTIALS');
  }

  // Check if password is set
  if (!cliente.hash_contrasena) {
    throw new AuthError(
      'Cuenta no configurada. Solicite un enlace de configuración.',
      'ACCOUNT_NOT_SETUP',
      403
    );
  }

  // Check if account is locked
  if (cliente.bloqueado_hasta && cliente.bloqueado_hasta > new Date()) {
    const minutosRestantes = Math.ceil(
      (cliente.bloqueado_hasta.getTime() - Date.now()) / 60000
    );
    throw new AuthError(
      `Cuenta bloqueada. Intente en ${minutosRestantes} minutos.`,
      'ACCOUNT_LOCKED',
      423
    );
  }

  // Check account status
  if (cliente.estado_cuenta === 'suspendida') {
    throw new AuthError(
      'Cuenta suspendida. Contacte a administración.',
      'ACCOUNT_SUSPENDED',
      403
    );
  }

  // Verify password with Argon2id
  let passwordValid = false;
  try {
    passwordValid = await verify(cliente.hash_contrasena, password);
  } catch {
    passwordValid = false;
  }

  if (!passwordValid) {
    // Increment failed attempts
    const newAttempts = cliente.intentos_fallidos + 1;
    const shouldLock = newAttempts >= 5;

    await prisma.clientes.update({
      where: { id: cliente.id },
      data: {
        intentos_fallidos: newAttempts,
        bloqueado_hasta: shouldLock
          ? new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
          : null,
      },
    });

    if (shouldLock) {
      throw new AuthError(
        'Cuenta bloqueada por múltiples intentos fallidos. Intente en 15 minutos.',
        'ACCOUNT_LOCKED',
        423
      );
    }

    throw new AuthError('Credenciales inválidas', 'INVALID_CREDENTIALS');
  }

  // Reset failed attempts on successful login
  await prisma.clientes.update({
    where: { id: cliente.id },
    data: {
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      estado_cuenta: 'activa',
      ultimo_inicio_sesion: new Date(),
    },
  });

  // Generate tokens
  const accessToken = await generateAccessToken({
    userId: cliente.id.toString(),
    tipo: 'cliente',
    rut: cliente.rut || undefined,
  });

  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  // Store refresh token hash
  await prisma.sesion_refresh.create({
    data: {
      token_hash: tokenHash,
      usuario_tipo: 'cliente',
      usuario_id: cliente.id.toString(),
      expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  // Build full name from parts
  const nombreCompleto = [
    cliente.primer_nombre,
    cliente.segundo_nombre,
    cliente.primer_apellido,
    cliente.segundo_apellido,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    accessToken,
    refreshToken,
    user: {
      id: cliente.id.toString(),
      rut: cliente.rut,
      numeroCliente: cliente.numero_cliente,
      nombre: nombreCompleto,
      email: cliente.correo,
      telefono: cliente.telefono,
      estadoCuenta: cliente.estado_cuenta,
    },
  };
}

/**
 * Refresh an access token using a refresh token
 * Implements token rotation for security
 */
export async function refreshAccessToken(
  refreshToken: string,
  ip: string,
  userAgent: string
) {
  // Hash the provided refresh token
  const tokenHash = hashRefreshToken(refreshToken);

  // Find valid session
  const session = await prisma.sesion_refresh.findFirst({
    where: {
      token_hash: tokenHash,
      usuario_tipo: 'cliente',
      expira_en: { gt: new Date() },
      revocado: false,
    },
  });

  if (!session) {
    throw new AuthError(
      'Token de refresco inválido o expirado',
      'INVALID_REFRESH_TOKEN'
    );
  }

  // Find the customer
  const cliente = await prisma.clientes.findUnique({
    where: { id: BigInt(session.usuario_id) },
  });

  if (!cliente) {
    throw new AuthError('Usuario no encontrado', 'USER_NOT_FOUND');
  }

  // Delete old session (token rotation)
  await prisma.sesion_refresh.delete({ where: { id: session.id } });

  // Generate new tokens
  const newAccessToken = await generateAccessToken({
    userId: cliente.id.toString(),
    tipo: 'cliente',
    rut: cliente.rut || undefined,
  });

  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);

  // Store new refresh token
  await prisma.sesion_refresh.create({
    data: {
      token_hash: newTokenHash,
      usuario_tipo: 'cliente',
      usuario_id: cliente.id.toString(),
      expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  // Update last activity
  await prisma.clientes.update({
    where: { id: cliente.id },
    data: { ultimo_inicio_sesion: new Date() },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Logout by revoking the refresh token
 */
export async function logout(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);

  // Delete the session (or mark as revoked)
  await prisma.sesion_refresh.deleteMany({
    where: { token_hash: tokenHash },
  });

  return { message: 'Sesión cerrada exitosamente' };
}

/**
 * Hash a password with Argon2id
 * Used for creating test users and password setup
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

