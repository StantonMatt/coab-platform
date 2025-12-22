/**
 * Auto-Payment Service
 *
 * Handles automatic monthly payments using saved Transbank OneClick cards.
 * - Customer-facing: enable/disable auto-pay, get status
 * - Processing: charge customers with auto-pay enabled
 * - Retry logic: 3 attempts on days 5, 7, 9 of each month
 */

import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import * as billingService from './billing.service.js';
import * as transbankService from './transbank.service.js';
import * as emailService from './email.service.js';
import * as twilioService from './twilio.service.js';

// ============================================================================
// Types
// ============================================================================

export interface AutoPayStatus {
  activo: boolean;
  tarjetaId: string | null;
  tarjetaUltimosDigitos: string | null;
  tarjetaTipo: string | null;
  ultimoIntento: {
    fecha: Date;
    estado: string;
    monto: number;
    error: string | null;
  } | null;
}

export interface AutoPayHistory {
  id: string;
  fecha: Date;
  monto: number;
  estado: string;
  intentoNumero: number;
  errorMensaje: string | null;
}

interface ProcessResult {
  success: boolean;
  clienteId: string;
  monto?: number;
  error?: string;
  intentoNumero?: number;
}

interface BatchProcessResult {
  procesados: number;
  exitosos: number;
  fallidos: number;
  omitidos: number;
  detalles: ProcessResult[];
}

interface Logger {
  info: (msg: string, data?: object) => void;
  error: (msg: string, data?: object) => void;
}

// ============================================================================
// Customer-Facing Functions
// ============================================================================

/**
 * Get auto-pay status for a customer
 */
export async function getAutoPayStatus(clienteId: bigint): Promise<AutoPayStatus> {
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: {
      pago_automatico_activo: true,
      tarjeta_pago_automatico_id: true,
      tarjeta_pago_automatico: {
        select: {
          id: true,
          ultimos_digitos: true,
          tipo_tarjeta: true,
        },
      },
    },
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  // Get last attempt
  const ultimoIntento = await prisma.intentos_pago_automatico.findFirst({
    where: { cliente_id: clienteId },
    orderBy: { creado_en: 'desc' },
    select: {
      creado_en: true,
      estado: true,
      monto: true,
      error_mensaje: true,
    },
  });

  return {
    activo: cliente.pago_automatico_activo,
    tarjetaId: cliente.tarjeta_pago_automatico_id?.toString() || null,
    tarjetaUltimosDigitos: cliente.tarjeta_pago_automatico?.ultimos_digitos || null,
    tarjetaTipo: cliente.tarjeta_pago_automatico?.tipo_tarjeta || null,
    ultimoIntento: ultimoIntento
      ? {
          fecha: ultimoIntento.creado_en,
          estado: ultimoIntento.estado,
          monto: Number(ultimoIntento.monto),
          error: ultimoIntento.error_mensaje,
        }
      : null,
  };
}

/**
 * Get auto-pay history for a customer
 */
export async function getAutoPayHistory(
  clienteId: bigint,
  limit: number = 10
): Promise<AutoPayHistory[]> {
  const intentos = await prisma.intentos_pago_automatico.findMany({
    where: { cliente_id: clienteId },
    orderBy: { creado_en: 'desc' },
    take: limit,
    select: {
      id: true,
      creado_en: true,
      monto: true,
      estado: true,
      intento_numero: true,
      error_mensaje: true,
    },
  });

  return intentos.map((i) => ({
    id: i.id.toString(),
    fecha: i.creado_en,
    monto: Number(i.monto),
    estado: i.estado,
    intentoNumero: i.intento_numero,
    errorMensaje: i.error_mensaje,
  }));
}

/**
 * Enable auto-pay for a customer with a specific card
 */
export async function enableAutoPay(
  clienteId: bigint,
  tarjetaId: bigint
): Promise<{ success: boolean; error?: string }> {
  // Verify card belongs to customer and is active
  const tarjeta = await prisma.tarjetas_guardadas.findFirst({
    where: {
      id: tarjetaId,
      cliente_id: clienteId,
      activa: true,
    },
  });

  if (!tarjeta) {
    return {
      success: false,
      error: 'Tarjeta no encontrada o inactiva',
    };
  }

  await prisma.clientes.update({
    where: { id: clienteId },
    data: {
      pago_automatico_activo: true,
      tarjeta_pago_automatico_id: tarjetaId,
    },
  });

  // Log audit
  await prisma.log_auditoria.create({
    data: {
      accion: 'ACTIVAR_AUTOPAGO',
      entidad: 'clientes',
      entidad_id: clienteId,
      usuario_tipo: 'cliente',
      datos_nuevos: {
        pago_automatico_activo: true,
        tarjeta_pago_automatico_id: tarjetaId.toString(),
      },
    },
  });

  return { success: true };
}

/**
 * Disable auto-pay for a customer
 */
export async function disableAutoPay(
  clienteId: bigint
): Promise<{ success: boolean }> {
  await prisma.clientes.update({
    where: { id: clienteId },
    data: {
      pago_automatico_activo: false,
      // Keep the card reference for when they re-enable
    },
  });

  // Log audit
  await prisma.log_auditoria.create({
    data: {
      accion: 'DESACTIVAR_AUTOPAGO',
      entidad: 'clientes',
      entidad_id: clienteId,
      usuario_tipo: 'cliente',
      datos_nuevos: {
        pago_automatico_activo: false,
      },
    },
  });

  return { success: true };
}

// ============================================================================
// Processing Functions
// ============================================================================

/**
 * Build customer full name from name parts
 */
function buildFullName(cliente: {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}): string {
  return [
    cliente.primer_nombre,
    cliente.segundo_nombre,
    cliente.primer_apellido,
    cliente.segundo_apellido,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Get the latest unpaid boleta for a customer
 * Returns the most recent boleta that is still pending
 */
async function getLatestUnpaidBoleta(clienteId: bigint): Promise<{
  id: bigint;
  monto_total_mes: number;
  periodo_desde: Date;
  periodo_hasta: Date;
} | null> {
  const boleta = await prisma.boletas.findFirst({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente',
    },
    orderBy: { periodo_desde: 'desc' },
    select: {
      id: true,
      monto_total_mes: true,
      periodo_desde: true,
      periodo_hasta: true,
    },
  });

  if (!boleta || !boleta.monto_total_mes) {
    return null;
  }

  return {
    id: boleta.id,
    monto_total_mes: Number(boleta.monto_total_mes),
    periodo_desde: boleta.periodo_desde,
    periodo_hasta: boleta.periodo_hasta,
  };
}

/**
 * Get current attempt number for this billing period
 * Returns 1 for first attempt, 2 for second, etc.
 */
async function getCurrentAttemptNumber(
  clienteId: bigint,
  boletaId: bigint
): Promise<number> {
  const lastAttempt = await prisma.intentos_pago_automatico.findFirst({
    where: {
      cliente_id: clienteId,
      boleta_id: boletaId,
    },
    orderBy: { intento_numero: 'desc' },
    select: { intento_numero: true },
  });

  return (lastAttempt?.intento_numero || 0) + 1;
}

/**
 * Send notifications for auto-payment result
 */
async function sendNotifications(
  cliente: {
    correo: string | null;
    telefono: string | null;
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  },
  type: 'success' | 'failed' | 'disabled',
  data: {
    monto?: number;
    periodo?: string;
    nuevoSaldo?: number;
    errorMensaje?: string;
    intentoNumero?: number;
  },
  logger: Logger
): Promise<void> {
  const nombre = buildFullName(cliente);
  const firstName = cliente.primer_nombre;

  // Send WhatsApp
  if (cliente.telefono) {
    let message = '';

    if (type === 'success') {
      message = `Hola ${firstName},

Tu pago automatico de ${formatearPesos(data.monto || 0)} fue procesado exitosamente.

Boleta: ${data.periodo}
Nuevo saldo: ${formatearPesos(data.nuevoSaldo || 0)}

Gracias por usar COAB.`;
    } else if (type === 'failed') {
      message = `Hola ${firstName},

No pudimos procesar tu pago automatico de ${formatearPesos(data.monto || 0)}.

Motivo: ${data.errorMensaje || 'Error desconocido'}

Reintentaremos en 2 dias. Si deseas, puedes pagar manualmente en el portal.`;
    } else if (type === 'disabled') {
      message = `Hola ${firstName},

Despues de 3 intentos, no pudimos procesar tu pago automatico.

Tu pago automatico ha sido deshabilitado. Por favor, paga manualmente en el portal y verifica tu tarjeta.

Si necesitas ayuda, contacta a COAB.`;
    }

    const waResult = await twilioService.sendWhatsAppMessage(
      cliente.telefono,
      message
    );
    logger.info('WhatsApp notification sent', {
      type,
      success: waResult.success,
      error: waResult.error,
    });
  }

  // Send Email
  if (cliente.correo) {
    let emailResult;

    if (type === 'success') {
      emailResult = await emailService.sendAutoPaymentSuccess(
        cliente.correo,
        nombre,
        data.monto || 0,
        data.periodo || '',
        data.nuevoSaldo || 0
      );
    } else if (type === 'failed') {
      emailResult = await emailService.sendAutoPaymentFailed(
        cliente.correo,
        nombre,
        data.monto || 0,
        data.errorMensaje || 'Error desconocido',
        data.intentoNumero || 1
      );
    } else if (type === 'disabled') {
      emailResult = await emailService.sendAutoPaymentDisabled(
        cliente.correo,
        nombre
      );
    }

    if (emailResult) {
      logger.info('Email notification sent', {
        type,
        success: emailResult.success,
        error: emailResult.error,
      });
    }
  }
}

/**
 * Process auto-payment for a single customer
 */
export async function processClienteAutoPago(
  clienteId: bigint,
  logger: Logger
): Promise<ProcessResult> {
  try {
    // 1. Get customer with auto-pay settings
    const cliente = await prisma.clientes.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        numero_cliente: true,
        primer_nombre: true,
        segundo_nombre: true,
        primer_apellido: true,
        segundo_apellido: true,
        correo: true,
        telefono: true,
        pago_automatico_activo: true,
        tarjeta_pago_automatico_id: true,
        tarjeta_pago_automatico: {
          select: {
            id: true,
            activa: true,
          },
        },
      },
    });

    if (!cliente) {
      return {
        success: false,
        clienteId: clienteId.toString(),
        error: 'Cliente no encontrado',
      };
    }

    if (!cliente.pago_automatico_activo) {
      return {
        success: false,
        clienteId: clienteId.toString(),
        error: 'Pago automático no activo',
      };
    }

    if (
      !cliente.tarjeta_pago_automatico_id ||
      !cliente.tarjeta_pago_automatico?.activa
    ) {
      return {
        success: false,
        clienteId: clienteId.toString(),
        error: 'Tarjeta no configurada o inactiva',
      };
    }

    // 2. Get latest unpaid boleta
    const boleta = await getLatestUnpaidBoleta(clienteId);

    if (!boleta) {
      logger.info('Cliente sin boletas pendientes', {
        clienteId: clienteId.toString(),
      });
      return {
        success: true,
        clienteId: clienteId.toString(),
        monto: 0,
        error: 'Sin boletas pendientes',
      };
    }

    // 3. Check attempt number
    const intentoNumero = await getCurrentAttemptNumber(clienteId, boleta.id);

    if (intentoNumero > 3) {
      logger.info('Máximo de intentos alcanzado', {
        clienteId: clienteId.toString(),
        intentoNumero,
      });
      return {
        success: false,
        clienteId: clienteId.toString(),
        error: 'Máximo de intentos alcanzado',
        intentoNumero,
      };
    }

    // 4. Create attempt record
    const intento = await prisma.intentos_pago_automatico.create({
      data: {
        cliente_id: clienteId,
        boleta_id: boleta.id,
        tarjeta_id: cliente.tarjeta_pago_automatico_id,
        monto: boleta.monto_total_mes,
        intento_numero: intentoNumero,
        estado: 'pendiente',
      },
    });

    // 5. Format period for display
    const periodo = format(boleta.periodo_desde, 'MMMM yyyy', { locale: es });

    // 6. Attempt Transbank charge
    logger.info('Procesando pago automático', {
      clienteId: clienteId.toString(),
      monto: boleta.monto_total_mes,
      intentoNumero,
      boletaId: boleta.id.toString(),
    });

    const paymentResult = await transbankService.authorizePayment(
      clienteId,
      cliente.tarjeta_pago_automatico_id.toString(),
      boleta.monto_total_mes,
      `Pago automático ${periodo}`,
      '127.0.0.1', // Server IP for auto-payments
      logger
    );

    if (paymentResult.success) {
      // 7a. Success - update attempt record
      const nuevoSaldo = await billingService.getCurrentBalance(clienteId);

      await prisma.intentos_pago_automatico.update({
        where: { id: intento.id },
        data: {
          estado: 'exitoso',
          pago_id: paymentResult.pagoId ? BigInt(paymentResult.pagoId) : null,
          transbank_response: paymentResult as unknown as Prisma.InputJsonValue,
          procesado_en: new Date(),
        },
      });

      logger.info('Pago automático exitoso', {
        clienteId: clienteId.toString(),
        monto: boleta.monto_total_mes,
        pagoId: paymentResult.pagoId,
      });

      // Send success notification
      await sendNotifications(
        cliente,
        'success',
        {
          monto: boleta.monto_total_mes,
          periodo,
          nuevoSaldo,
        },
        logger
      );

      return {
        success: true,
        clienteId: clienteId.toString(),
        monto: boleta.monto_total_mes,
        intentoNumero,
      };
    } else {
      // 7b. Failure - update attempt and check if we should disable
      const errorMensaje = paymentResult.mensaje || 'Error desconocido';

      await prisma.intentos_pago_automatico.update({
        where: { id: intento.id },
        data: {
          estado: intentoNumero >= 3 ? 'deshabilitado' : 'fallido',
          error_mensaje: errorMensaje,
          transbank_response: paymentResult as unknown as Prisma.InputJsonValue,
          procesado_en: new Date(),
        },
      });

      logger.error('Pago automático fallido', {
        clienteId: clienteId.toString(),
        monto: boleta.monto_total_mes,
        error: errorMensaje,
        intentoNumero,
      });

      if (intentoNumero >= 3) {
        // Disable auto-pay after 3 failures
        await prisma.clientes.update({
          where: { id: clienteId },
          data: { pago_automatico_activo: false },
        });

        logger.info('Pago automático deshabilitado por fallos', {
          clienteId: clienteId.toString(),
        });

        // Send disabled notification
        await sendNotifications(cliente, 'disabled', {}, logger);

        // Audit log
        await prisma.log_auditoria.create({
          data: {
            accion: 'AUTOPAGO_DESHABILITADO_FALLOS',
            entidad: 'clientes',
            entidad_id: clienteId,
            usuario_tipo: 'system',
            datos_nuevos: {
              motivo: 'Deshabilitado después de 3 intentos fallidos',
              ultimoError: errorMensaje,
            },
          },
        });
      } else {
        // Send failure notification (will retry)
        await sendNotifications(
          cliente,
          'failed',
          {
            monto: boleta.monto_total_mes,
            errorMensaje,
            intentoNumero,
          },
          logger
        );
      }

      return {
        success: false,
        clienteId: clienteId.toString(),
        monto: boleta.monto_total_mes,
        error: errorMensaje,
        intentoNumero,
      };
    }
  } catch (error: any) {
    logger.error('Error procesando pago automático', {
      clienteId: clienteId.toString(),
      error: error.message,
    });

    return {
      success: false,
      clienteId: clienteId.toString(),
      error: error.message,
    };
  }
}

/**
 * Process all pending auto-payments
 * Called by cron job or admin endpoint
 */
export async function processAllPendingAutoPayments(
  logger: Logger
): Promise<BatchProcessResult> {
  logger.info('Iniciando procesamiento de pagos automáticos');

  // Find all customers with auto-pay enabled and active card
  const clientesConAutoPago = await prisma.clientes.findMany({
    where: {
      pago_automatico_activo: true,
      tarjeta_pago_automatico_id: { not: null },
      tarjeta_pago_automatico: {
        activa: true,
      },
    },
    select: {
      id: true,
      numero_cliente: true,
    },
  });

  logger.info(`Encontrados ${clientesConAutoPago.length} clientes con pago automático`);

  const result: BatchProcessResult = {
    procesados: 0,
    exitosos: 0,
    fallidos: 0,
    omitidos: 0,
    detalles: [],
  };

  for (const cliente of clientesConAutoPago) {
    const processResult = await processClienteAutoPago(cliente.id, logger);
    result.detalles.push(processResult);
    result.procesados++;

    if (processResult.success) {
      if (processResult.monto === 0) {
        result.omitidos++; // No pending boletas
      } else {
        result.exitosos++;
      }
    } else {
      result.fallidos++;
    }

    // Small delay between customers to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logger.info('Procesamiento de pagos automáticos completado', {
    procesados: result.procesados,
    exitosos: result.exitosos,
    fallidos: result.fallidos,
    omitidos: result.omitidos,
  });

  return result;
}

