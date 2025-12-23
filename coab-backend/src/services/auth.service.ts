import crypto from 'crypto';
import { hash, verify } from '@node-rs/argon2';
import { limpiarRUT } from '@coab/utils';
import prisma from '../lib/prisma.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/jwt.js';
import { sendWhatsAppMessage } from './twilio.service.js';

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

/**
 * Login an admin with email and password
 * Uses perfiles table with is_admin = true
 */
export async function loginAdmin(
  email: string,
  password: string,
  ip: string,
  userAgent: string
) {
  // Find admin by email (correo field)
  const admin = await prisma.perfiles.findFirst({
    where: {
      correo: email.toLowerCase(),
      is_admin: true,
    },
  });

  if (!admin) {
    throw new AuthError('Credenciales inválidas', 'INVALID_CREDENTIALS');
  }

  // Check if password is set
  if (!admin.hash_contrasena) {
    throw new AuthError(
      'Cuenta no configurada. Contacte al administrador.',
      'ACCOUNT_NOT_SETUP',
      403
    );
  }

  // Check if account is locked
  if (admin.bloqueado_hasta && admin.bloqueado_hasta > new Date()) {
    const minutosRestantes = Math.ceil(
      (admin.bloqueado_hasta.getTime() - Date.now()) / 60000
    );
    throw new AuthError(
      `Cuenta bloqueada. Intente en ${minutosRestantes} minutos.`,
      'ACCOUNT_LOCKED',
      423
    );
  }

  // Verify password with Argon2id
  let passwordValid = false;
  try {
    passwordValid = await verify(admin.hash_contrasena, password);
  } catch {
    passwordValid = false;
  }

  if (!passwordValid) {
    // Increment failed attempts
    const newAttempts = admin.intentos_fallidos + 1;
    const shouldLock = newAttempts >= 5;

    await prisma.perfiles.update({
      where: { id: admin.id },
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
  await prisma.perfiles.update({
    where: { id: admin.id },
    data: {
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      ultimo_inicio_sesion: new Date(),
    },
  });

  // Generate tokens (8h for admin, handled by jwt.ts)
  const accessToken = await generateAccessToken({
    userId: admin.id,
    tipo: 'admin',
    email: admin.correo || undefined,
    rol: admin.rol,
  });

  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  // Store refresh token hash
  await prisma.sesion_refresh.create({
    data: {
      token_hash: tokenHash,
      usuario_tipo: 'admin',
      usuario_id: admin.id,
      expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  // Build full name
  const nombreCompleto = [admin.nombre, admin.apellido]
    .filter(Boolean)
    .join(' ') || 'Administrador';

  return {
    accessToken,
    refreshToken,
    user: {
      id: admin.id,
      email: admin.correo,
      nombre: nombreCompleto,
      rol: admin.rol,
    },
  };
}

/**
 * Refresh an admin access token using a refresh token
 * Implements token rotation for security
 */
export async function refreshAdminToken(
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
      usuario_tipo: 'admin',
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

  // Find the admin (usuario_id is UUID for admins)
  const admin = await prisma.perfiles.findUnique({
    where: { id: session.usuario_id },
  });

  if (!admin || !admin.is_admin) {
    throw new AuthError('Usuario no encontrado', 'USER_NOT_FOUND');
  }

  // Delete old session (token rotation)
  await prisma.sesion_refresh.delete({ where: { id: session.id } });

  // Generate new tokens
  const newAccessToken = await generateAccessToken({
    userId: admin.id,
    tipo: 'admin',
    email: admin.correo || undefined,
    rol: admin.rol,
  });

  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);

  // Store new refresh token
  await prisma.sesion_refresh.create({
    data: {
      token_hash: newTokenHash,
      usuario_tipo: 'admin',
      usuario_id: admin.id,
      expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  // Update last activity
  await prisma.perfiles.update({
    where: { id: admin.id },
    data: { ultimo_inicio_sesion: new Date() },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Validate a setup token (for showing the setup form)
 * Returns customer info if valid, or { valid: false } if invalid/expired
 */
export async function validateSetupToken(token: string) {
  const tokenRecord = await prisma.token_configuracion.findFirst({
    where: {
      token: token,
      tipo: 'setup',
      usado: false,
      expira_en: { gt: new Date() },
    },
    include: {
      cliente: {
        select: {
          rut: true,
          primer_nombre: true,
          segundo_nombre: true,
          primer_apellido: true,
          segundo_apellido: true,
        },
      },
    },
  });

  if (!tokenRecord || !tokenRecord.cliente) {
    return { valid: false };
  }

  // Build full name
  const nombreCompleto = [
    tokenRecord.cliente.primer_nombre,
    tokenRecord.cliente.segundo_nombre,
    tokenRecord.cliente.primer_apellido,
    tokenRecord.cliente.segundo_apellido,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    valid: true,
    cliente: {
      rut: tokenRecord.cliente.rut,
      nombre: nombreCompleto,
    },
  };
}

/**
 * Setup customer password using setup token
 * Hashes password, marks token as used, creates audit log
 */
export async function setupPassword(
  token: string,
  password: string,
  ipAddress: string
) {
  // Find valid token
  const tokenRecord = await prisma.token_configuracion.findFirst({
    where: {
      token: token,
      tipo: 'setup',
      usado: false,
      expira_en: { gt: new Date() },
    },
    include: {
      cliente: true,
    },
  });

  if (!tokenRecord || !tokenRecord.cliente) {
    throw new Error('Token inválido o expirado');
  }

  // Hash password with Argon2id
  const hashContrasena = await hash(password, {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });

  // Update customer with password and mark token as used in a transaction
  await prisma.$transaction([
    prisma.clientes.update({
      where: { id: tokenRecord.cliente_id },
      data: {
        hash_contrasena: hashContrasena,
        estado_cuenta: 'activa',
      },
    }),
    prisma.token_configuracion.update({
      where: { id: tokenRecord.id },
      data: {
        usado: true,
        usado_en: new Date(),
        ip_uso: ipAddress,
      },
    }),
  ]);

  // Create audit log
  await prisma.log_auditoria.create({
    data: {
      accion: 'CONFIGURAR_CONTRASENA',
      entidad: 'clientes',
      entidad_id: tokenRecord.cliente_id,
      usuario_tipo: 'cliente',
      datos_nuevos: {
        setup_completado: true,
      },
      ip_address: ipAddress,
    },
  });

  return {
    success: true,
    message: 'Contraseña configurada exitosamente',
    rut: tokenRecord.cliente.rut,
  };
}

/**
 * Helper function for consistent timing (prevents timing attacks)
 */
async function waitUntil(startTime: number, minimumMs: number) {
  const elapsed = Date.now() - startTime;
  if (elapsed < minimumMs) {
    await new Promise((resolve) => setTimeout(resolve, minimumMs - elapsed));
  }
}

/**
 * Request password reset - generates 6-digit code sent via WhatsApp
 * Returns generic success to prevent RUT enumeration
 */
export async function solicitarReset(
  rut: string,
  ipAddress: string,
  logger: { info: (msg: string, data?: object) => void; warn: (msg: string, data?: object) => void; error: (msg: string, data?: object) => void }
) {
  const rutLimpio = limpiarRUT(rut);

  // Start timing for consistent response time (timing attack mitigation)
  const startTime = Date.now();
  const MINIMUM_RESPONSE_TIME = 1500; // 1.5 seconds minimum

  try {
    const cliente = await prisma.clientes.findUnique({
      where: { rut: rutLimpio },
      select: {
        id: true,
        rut: true,
        primer_nombre: true,
        telefono: true,
        hash_contrasena: true,
      },
    });

    // SECURITY: Don't reveal if RUT exists - consistent response
    if (!cliente || !cliente.telefono || !cliente.hash_contrasena) {
      // Wait to match normal processing time (timing attack mitigation)
      await waitUntil(startTime, MINIMUM_RESPONSE_TIME);

      logger.info('Password reset requested for non-existent/invalid customer', {
        rutPartial: rutLimpio.slice(0, 4) + '****',
        reason: !cliente
          ? 'not_found'
          : !cliente.telefono
            ? 'no_phone'
            : 'no_password',
      });

      // Return generic success to prevent RUT enumeration
      return {
        success: true,
        message:
          'Si el RUT existe y tiene teléfono registrado, recibirás un código por WhatsApp',
      };
    }

    // Delete any existing unused reset tokens for this customer
    await prisma.token_configuracion.deleteMany({
      where: {
        cliente_id: cliente.id,
        tipo: 'reset',
        usado: false,
      },
    });

    // Generate 6-digit code
    const codigo = String(Math.floor(100000 + Math.random() * 900000));

    // Create reset token (15 minute expiry)
    const tokenRecord = await prisma.token_configuracion.create({
      data: {
        cliente_id: cliente.id,
        token: codigo,
        tipo: 'reset',
        usado: false,
        expira_en: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        ip_creacion: ipAddress,
      },
    });

    // Send WhatsApp message
    const mensaje = `COAB - Código de recuperación

Tu código es: ${codigo}

Este código expira en 15 minutos.

Si no solicitaste este código, ignora este mensaje.`;

    const whatsappResult = await sendWhatsAppMessage(cliente.telefono, mensaje);

    if (!whatsappResult.success) {
      logger.warn('Failed to send WhatsApp reset code', {
        clienteId: cliente.id.toString(),
        error: whatsappResult.error,
      });
    }

    // Audit log
    await prisma.log_auditoria.create({
      data: {
        accion: 'SOLICITAR_RESET',
        entidad: 'clientes',
        entidad_id: cliente.id,
        usuario_tipo: 'cliente',
        datos_nuevos: {
          tokenExpiry: tokenRecord.expira_en.toISOString(),
          whatsappSent: whatsappResult.success,
        },
        ip_address: ipAddress,
      },
    });

    logger.info('Password reset code sent', {
      clienteId: cliente.id.toString(),
      rutPartial: rutLimpio.slice(0, 4) + '****',
      whatsappSuccess: whatsappResult.success,
    });

    // Wait to match minimum response time
    await waitUntil(startTime, MINIMUM_RESPONSE_TIME);

    return {
      success: true,
      message:
        'Si el RUT existe y tiene teléfono registrado, recibirás un código por WhatsApp',
    };
  } catch (error: any) {
    logger.error('Password reset request failed', {
      rutPartial: rutLimpio.slice(0, 4) + '****',
      error: error.message,
    });

    // Wait to match minimum response time
    await waitUntil(startTime, MINIMUM_RESPONSE_TIME);

    throw error;
  }
}

/**
 * Validate reset code and set new password
 * Includes brute force protection
 */
export async function validarCodigoReset(
  rut: string,
  codigo: string,
  nuevaContrasena: string,
  ipAddress: string,
  logger: { info: (msg: string, data?: object) => void; warn: (msg: string, data?: object) => void }
) {
  const rutLimpio = limpiarRUT(rut);

  const cliente = await prisma.clientes.findUnique({
    where: { rut: rutLimpio },
    select: { id: true, rut: true },
  });

  if (!cliente) {
    throw new Error('Código inválido o expirado');
  }

  // Find valid reset token
  const tokenRecord = await prisma.token_configuracion.findFirst({
    where: {
      cliente_id: cliente.id,
      token: codigo,
      tipo: 'reset',
      usado: false,
      expira_en: { gt: new Date() },
    },
  });

  if (!tokenRecord) {
    // Track failed attempt in audit log
    await prisma.log_auditoria.create({
      data: {
        accion: 'RESET_CODIGO_INVALIDO',
        entidad: 'clientes',
        entidad_id: cliente.id,
        usuario_tipo: 'cliente',
        datos_nuevos: {
          codigoIntentado: codigo.slice(0, 2) + '****',
        },
        ip_address: ipAddress,
      },
    });

    logger.warn('Invalid reset code attempt', {
      clienteId: cliente.id.toString(),
      rutPartial: rutLimpio.slice(0, 4) + '****',
    });

    throw new Error('Código inválido o expirado');
  }

  // Check for brute force (max 5 attempts per token window - last 15 minutes)
  const recentFailedAttempts = await prisma.log_auditoria.count({
    where: {
      accion: 'RESET_CODIGO_INVALIDO',
      entidad_id: cliente.id,
      creado_en: {
        gte: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
      },
    },
  });

  if (recentFailedAttempts >= 5) {
    // Invalidate the token
    await prisma.token_configuracion.update({
      where: { id: tokenRecord.id },
      data: { usado: true },
    });

    logger.warn('Reset token locked due to too many failed attempts', {
      clienteId: cliente.id.toString(),
    });

    throw new Error('Demasiados intentos fallidos. Solicita un nuevo código.');
  }

  // Code is valid - hash new password with Argon2id
  const hashContrasena = await hash(nuevaContrasena, {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });

  // Update password and mark token as used in a transaction
  await prisma.$transaction([
    prisma.clientes.update({
      where: { id: cliente.id },
      data: {
        hash_contrasena: hashContrasena,
        intentos_fallidos: 0, // Reset failed login attempts
        bloqueado_hasta: null, // Unlock account if locked
      },
    }),
    prisma.token_configuracion.update({
      where: { id: tokenRecord.id },
      data: {
        usado: true,
        usado_en: new Date(),
        ip_uso: ipAddress,
      },
    }),
  ]);

  // Audit log for successful reset
  await prisma.log_auditoria.create({
    data: {
      accion: 'RESET_CONTRASENA_EXITOSO',
      entidad: 'clientes',
      entidad_id: cliente.id,
      usuario_tipo: 'cliente',
      datos_nuevos: {
        reset_completado: true,
      },
      ip_address: ipAddress,
    },
  });

  // Invalidate all existing refresh sessions for security
  await prisma.sesion_refresh.deleteMany({
    where: { usuario_id: cliente.id.toString() },
  });

  logger.info('Password reset completed successfully', {
    clienteId: cliente.id.toString(),
    rutPartial: rutLimpio.slice(0, 4) + '****',
  });

  return {
    success: true,
    message: 'Contraseña actualizada exitosamente',
    rut: cliente.rut,
  };
}

/**
 * Change customer password (authenticated)
 * Requires verification of current password before allowing change
 */
export async function cambiarContrasena(
  clienteId: bigint,
  contrasenaActual: string,
  nuevaContrasena: string
) {
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: { hash_contrasena: true },
  });

  if (!cliente || !cliente.hash_contrasena) {
    throw new AuthError('Cuenta no configurada', 'ACCOUNT_NOT_SETUP', 400);
  }

  // Verify current password
  let passwordValid = false;
  try {
    passwordValid = await verify(cliente.hash_contrasena, contrasenaActual);
  } catch {
    passwordValid = false;
  }

  if (!passwordValid) {
    throw new AuthError('Contraseña actual incorrecta', 'INVALID_PASSWORD', 400);
  }

  // Hash new password with Argon2id
  const hashContrasena = await hash(nuevaContrasena, {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });

  await prisma.clientes.update({
    where: { id: clienteId },
    data: { hash_contrasena: hashContrasena },
  });

  return { success: true, message: 'Contraseña actualizada exitosamente' };
}

