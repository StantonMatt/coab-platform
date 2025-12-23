/**
 * Contact Verification Service
 * Handles email and phone verification via 6-digit codes
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { sendVerificationEmail } from './email.service.js';
import { sendVerificationSMS } from './twilio.service.js';

// Constants
const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS_PER_CODE = 3;
const MAX_CODES_PER_HOUR = 3;

interface VerificationResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Generate a 6-digit verification code
 */
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash a code with SHA-256
 */
function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Check rate limit: max 3 codes per hour per type
 */
async function checkRateLimit(
  clienteId: bigint,
  tipo: 'email' | 'telefono'
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentCodes = await prisma.verificacion_contacto.count({
    where: {
      cliente_id: clienteId,
      tipo,
      creado_en: { gte: oneHourAgo },
    },
  });

  return recentCodes < MAX_CODES_PER_HOUR;
}

/**
 * Initiate verification for email or phone change
 * Generates code, stores it, and sends via email/SMS
 */
export async function iniciarVerificacion(
  clienteId: bigint,
  tipo: 'email' | 'telefono',
  nuevoValor: string
): Promise<VerificationResult> {
  // Check rate limit
  const withinLimit = await checkRateLimit(clienteId, tipo);
  if (!withinLimit) {
    return {
      success: false,
      error: 'Demasiados intentos. Por favor espera una hora antes de intentar nuevamente.',
    };
  }

  // Delete any existing pending verification for this type
  await prisma.verificacion_contacto.deleteMany({
    where: {
      cliente_id: clienteId,
      tipo,
    },
  });

  // Generate 6-digit code
  const code = generateCode();
  const codigoHash = hashCode(code);

  // Calculate expiry (10 minutes from now)
  const expiraEn = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  // Store verification record
  await prisma.verificacion_contacto.create({
    data: {
      cliente_id: clienteId,
      tipo,
      nuevo_valor: nuevoValor,
      codigo_hash: codigoHash,
      expira_en: expiraEn,
    },
  });

  // Send code via appropriate channel
  let sendResult: { success: boolean; error?: string };

  if (tipo === 'email') {
    sendResult = await sendVerificationEmail(nuevoValor, code);
  } else {
    sendResult = await sendVerificationSMS(nuevoValor, code);
  }

  if (!sendResult.success) {
    // Clean up the verification record if sending failed
    await prisma.verificacion_contacto.deleteMany({
      where: {
        cliente_id: clienteId,
        tipo,
      },
    });

    return {
      success: false,
      error: sendResult.error || `Error al enviar código de verificación`,
    };
  }

  return {
    success: true,
    message:
      tipo === 'email'
        ? 'Código enviado a tu nuevo correo electrónico'
        : 'Código enviado por SMS a tu nuevo número',
  };
}

/**
 * Confirm verification with the 6-digit code
 * Updates contact info if code is valid
 */
export async function confirmarVerificacion(
  clienteId: bigint,
  tipo: 'email' | 'telefono',
  codigo: string
): Promise<VerificationResult> {
  // Find pending verification
  const verificacion = await prisma.verificacion_contacto.findFirst({
    where: {
      cliente_id: clienteId,
      tipo,
    },
  });

  if (!verificacion) {
    return {
      success: false,
      error: 'No hay verificación pendiente. Por favor solicita un nuevo código.',
    };
  }

  // Check if expired
  if (new Date() > verificacion.expira_en) {
    // Delete expired verification
    await prisma.verificacion_contacto.delete({
      where: { id: verificacion.id },
    });

    return {
      success: false,
      error: 'El código ha expirado. Por favor solicita uno nuevo.',
    };
  }

  // Check if too many attempts
  if (verificacion.intentos >= MAX_ATTEMPTS_PER_CODE) {
    // Delete verification after max attempts
    await prisma.verificacion_contacto.delete({
      where: { id: verificacion.id },
    });

    return {
      success: false,
      error: 'Demasiados intentos incorrectos. Por favor solicita un nuevo código.',
    };
  }

  // Verify code
  const codigoHash = hashCode(codigo);
  if (codigoHash !== verificacion.codigo_hash) {
    // Increment attempts
    await prisma.verificacion_contacto.update({
      where: { id: verificacion.id },
      data: { intentos: verificacion.intentos + 1 },
    });

    const remainingAttempts = MAX_ATTEMPTS_PER_CODE - verificacion.intentos - 1;
    return {
      success: false,
      error: `Código incorrecto. ${remainingAttempts > 0 ? `Te quedan ${remainingAttempts} intento(s).` : 'Por favor solicita un nuevo código.'}`,
    };
  }

  // Code is valid - update contact info in a transaction
  await prisma.$transaction([
    // Update the customer's contact info
    prisma.clientes.update({
      where: { id: clienteId },
      data:
        tipo === 'email'
          ? { correo: verificacion.nuevo_valor }
          : { telefono: verificacion.nuevo_valor },
    }),
    // Delete the verification record
    prisma.verificacion_contacto.delete({
      where: { id: verificacion.id },
    }),
  ]);

  return {
    success: true,
    message:
      tipo === 'email'
        ? 'Correo electrónico actualizado exitosamente'
        : 'Teléfono actualizado exitosamente',
  };
}

/**
 * Get pending verification status for a customer
 */
export async function getPendingVerification(
  clienteId: bigint,
  tipo: 'email' | 'telefono'
): Promise<{ pending: boolean; nuevoValor?: string; expiresAt?: Date }> {
  const verificacion = await prisma.verificacion_contacto.findFirst({
    where: {
      cliente_id: clienteId,
      tipo,
      expira_en: { gt: new Date() },
    },
    select: {
      nuevo_valor: true,
      expira_en: true,
    },
  });

  if (!verificacion) {
    return { pending: false };
  }

  return {
    pending: true,
    nuevoValor: verificacion.nuevo_valor,
    expiresAt: verificacion.expira_en,
  };
}

