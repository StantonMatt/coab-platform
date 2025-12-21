/**
 * Mercado Pago Payment Service
 * Handles payment creation, verification, and FIFO application to boletas
 */

import { MercadoPagoConfig, Payment } from 'mercadopago';
import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { env } from '../config/env.js';
import {
  getCurrentBalance,
  getBoletasPartialPaymentMap,
  recalculateBoletaEstados,
  type FIFOResult,
} from './billing.service.js';

// Type for transaction client
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Initialize MercadoPago client
const mercadopagoClient = env.MERCADOPAGO_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN })
  : null;

const paymentApi = mercadopagoClient ? new Payment(mercadopagoClient) : null;

// Types
export interface CardPaymentData {
  token: string; // Card token from frontend CardPayment Brick
  installments: number;
  payment_method_id: string; // visa, mastercard, etc.
  issuer_id?: string;
  payer: {
    email: string;
    identification?: {
      type: string; // RUT for Chile
      number: string;
    };
  };
}

export interface CreatePaymentInput {
  clienteId: bigint;
  monto: number;
  descripcion: string;
  cardPaymentData: CardPaymentData;
  boletaIds?: string[]; // Optional: specific boletas to pay
  idempotencyKey?: string;
}

export interface PaymentResult {
  success: boolean;
  transaccionOnlineId: string;
  mercadopagoId?: string;
  estado: string;
  estadoDetalle?: string;
  mensaje: string;
  boletasAfectadas?: Array<{
    boletaId: string;
    montoAplicado: number;
    tipo: 'completo' | 'parcial';
  }>;
  saldoNuevo?: number;
}

/**
 * Check if Mercado Pago is configured
 */
export function isConfigured(): boolean {
  return !!mercadopagoClient && !!env.MERCADOPAGO_ACCESS_TOKEN;
}

/**
 * Get public key for frontend (safe to expose)
 */
export function getPublicKey(): string | null {
  return env.MERCADOPAGO_PUBLIC_KEY || null;
}

/**
 * Create a payment using Mercado Pago
 * Applies FIFO logic to pending boletas on success
 */
export async function createPayment(
  input: CreatePaymentInput,
  ipAddress: string,
  logger: {
    info: (msg: string, data?: object) => void;
    error: (msg: string, data?: object) => void;
  }
): Promise<PaymentResult> {
  if (!paymentApi) {
    throw new Error('Mercado Pago no está configurado');
  }

  const {
    clienteId,
    monto,
    descripcion,
    cardPaymentData,
    boletaIds,
    idempotencyKey,
  } = input;

  // Generate idempotency key if not provided
  const finalIdempotencyKey =
    idempotencyKey ||
    `mp-${clienteId}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Verify customer exists
        const cliente = await tx.clientes.findUnique({
          where: { id: clienteId },
          select: {
            id: true,
            rut: true,
            numero_cliente: true,
            primer_nombre: true,
            primer_apellido: true,
            correo: true,
          },
        });

        if (!cliente) {
          throw new Error('Cliente no encontrado');
        }

        // 2. Create initial transaction record
        const transaccionOnline = await tx.transacciones_online.create({
          data: {
            cliente_id: clienteId,
            proveedor: 'mercadopago',
            referencia_externa: 'pending', // Will be updated after MP call
            monto: monto,
            estado: 'pending',
            metodo_pago: cardPaymentData.payment_method_id,
            cuotas: cardPaymentData.installments,
            clave_idempotencia: finalIdempotencyKey,
          },
        });

        // 3. Call Mercado Pago API
        logger.info('Creating Mercado Pago payment', {
          transaccionOnlineId: transaccionOnline.id.toString(),
          clienteId: clienteId.toString(),
          monto,
        });

        let mpResponse;
        try {
          mpResponse = await paymentApi.create({
            body: {
              transaction_amount: monto,
              description: descripcion,
              payment_method_id: cardPaymentData.payment_method_id,
              installments: cardPaymentData.installments,
              token: cardPaymentData.token,
              issuer_id: cardPaymentData.issuer_id
                ? Number(cardPaymentData.issuer_id)
                : undefined,
              payer: {
                email:
                  cardPaymentData.payer.email ||
                  cliente.correo ||
                  'cliente@coab.cl',
                identification: cardPaymentData.payer.identification || {
                  type: 'RUT',
                  number: cliente.rut?.replace(/[.-]/g, '') || '0',
                },
              },
              additional_info: {
                items: [
                  {
                    id: transaccionOnline.id.toString(),
                    title: descripcion,
                    quantity: 1,
                    unit_price: monto,
                  },
                ],
              },
              statement_descriptor: 'COAB AGUA',
              external_reference: transaccionOnline.id.toString(),
            },
            requestOptions: {
              idempotencyKey: finalIdempotencyKey,
            },
          });
        } catch (mpError: any) {
          // Update transaction as failed
          await tx.transacciones_online.update({
            where: { id: transaccionOnline.id },
            data: {
              estado: 'rejected',
              estado_detalle: mpError.message || 'Error de Mercado Pago',
              datos_respuesta: { error: mpError.message },
              actualizado_en: new Date(),
            },
          });

          logger.error('Mercado Pago API error', {
            transaccionOnlineId: transaccionOnline.id.toString(),
            error: mpError.message,
          });

          return {
            success: false,
            transaccionOnlineId: transaccionOnline.id.toString(),
            estado: 'rejected',
            estadoDetalle: mpError.message,
            mensaje: 'Error al procesar el pago. Por favor intente nuevamente.',
          };
        }

        // 4. Update transaction with MP response
        const mpStatus = mpResponse.status || 'unknown';
        const mpStatusDetail = mpResponse.status_detail || '';

        await tx.transacciones_online.update({
          where: { id: transaccionOnline.id },
          data: {
            referencia_externa: mpResponse.id?.toString() || 'unknown',
            estado: mpStatus,
            estado_detalle: mpStatusDetail,
            datos_respuesta: mpResponse as unknown as Prisma.InputJsonValue,
            actualizado_en: new Date(),
          },
        });

        // 5. If payment approved, apply FIFO to boletas
        if (mpStatus === 'approved') {
          const fifoResult = await applyFIFOPayment(
            tx,
            clienteId,
            monto,
            transaccionOnline.id,
            cliente,
            boletaIds,
            logger
          );

          // Create audit log
          await tx.log_auditoria.create({
            data: {
              accion: 'PAGO_MERCADOPAGO',
              entidad: 'transacciones_online',
              entidad_id: transaccionOnline.id,
              usuario_tipo: 'cliente',
              usuario_email: cliente.correo,
              datos_nuevos: {
                mercadopagoId: mpResponse.id,
                monto,
                boletasAfectadas: fifoResult.boletasAfectadas.length,
                saldoNuevo: fifoResult.saldoNuevo,
              },
              ip_address: ipAddress,
            },
          });

          logger.info('Payment approved and applied', {
            transaccionOnlineId: transaccionOnline.id.toString(),
            mercadopagoId: mpResponse.id,
            boletasAfectadas: fifoResult.boletasAfectadas.length,
          });

          return {
            success: true,
            transaccionOnlineId: transaccionOnline.id.toString(),
            mercadopagoId: mpResponse.id?.toString(),
            estado: mpStatus,
            estadoDetalle: mpStatusDetail,
            mensaje: 'Pago aprobado exitosamente',
            boletasAfectadas: fifoResult.boletasAfectadas,
            saldoNuevo: fifoResult.saldoNuevo,
          };
        }

        // Payment not approved (pending, rejected, etc.)
        logger.info('Payment not approved', {
          transaccionOnlineId: transaccionOnline.id.toString(),
          mercadopagoId: mpResponse.id,
          status: mpStatus,
          statusDetail: mpStatusDetail,
        });

        return {
          success: mpStatus === 'in_process' || mpStatus === 'pending',
          transaccionOnlineId: transaccionOnline.id.toString(),
          mercadopagoId: mpResponse.id?.toString(),
          estado: mpStatus,
          estadoDetalle: mpStatusDetail,
          mensaje: getStatusMessage(mpStatus, mpStatusDetail),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 30000, // Longer timeout for MP API call
      }
    );
  } catch (error: any) {
    logger.error('Payment creation failed', {
      clienteId: clienteId.toString(),
      monto,
      error: error.message,
    });

    throw new Error(error.message || 'Error al procesar el pago');
  }
}

/**
 * Apply FIFO payment to boletas using centralized billing service
 * Creates payment record and recalculates boleta estados
 */
async function applyFIFOPayment(
  tx: TransactionClient,
  clienteId: bigint,
  monto: number,
  transaccionOnlineId: bigint,
  cliente: {
    id: bigint;
    rut: string | null;
    numero_cliente: string;
    primer_nombre: string;
    primer_apellido: string;
  },
  _boletaIds: string[] | undefined, // Not used - FIFO always applies to all pending
  logger: { info: (msg: string, data?: object) => void }
): Promise<{
  pago: { id: bigint };
  boletasAfectadas: Array<{
    boletaId: string;
    montoAplicado: number;
    tipo: 'completo' | 'parcial';
  }>;
  saldoNuevo: number;
  creditoDisponible: number;
}> {
  // Create pago record
  const pago = await tx.pagos.create({
    data: {
      cliente_id: clienteId,
      numero_cliente: cliente.numero_cliente,
      monto: monto,
      fecha_pago: new Date(),
      tipo_pago: 'mercadopago',
      estado: 'completado',
      numero_transaccion: transaccionOnlineId.toString(),
      observaciones: `Pago online - Transacción #${transaccionOnlineId}`,
      procesado: true,
    },
  });

  // Link pago to transaccion_online
  await tx.transacciones_online.update({
    where: { id: transaccionOnlineId },
    data: { pago_id: pago.id },
  });

  // Apply FIFO using centralized billing service
  const fifoResult = await recalculateBoletaEstados(clienteId, tx);

  // Convert FIFO result to boletasAfectadas format for response
  const boletasAfectadas = fifoResult.detalles.map((d) => ({
    boletaId: d.boletaId,
    montoAplicado: d.montoTotal,
    tipo: 'completo' as const,
  }));

  // Add credit note to payment if overpayment
  if (fifoResult.creditoDisponible > 0) {
    const observaciones = `Pago online - Transacción #${transaccionOnlineId}\n[Saldo a favor: $${fifoResult.creditoDisponible.toLocaleString('es-CL')}]`;
    await tx.pagos.update({
      where: { id: pago.id },
      data: { observaciones },
    });
  }

  logger.info('FIFO payment applied', {
    clienteId: clienteId.toString(),
    monto,
    boletasActualizadas: fifoResult.boletasActualizadas,
    saldoNuevo: fifoResult.saldoNuevo,
    creditoDisponible: fifoResult.creditoDisponible,
  });

  return {
    pago,
    boletasAfectadas,
    saldoNuevo: fifoResult.saldoNuevo,
    creditoDisponible: fifoResult.creditoDisponible,
  };
}

/**
 * Get payment by ID
 */
export async function getPaymentById(paymentId: string) {
  return prisma.transacciones_online.findUnique({
    where: { id: BigInt(paymentId) },
    include: {
      cliente: {
        select: {
          id: true,
          rut: true,
          numero_cliente: true,
          primer_nombre: true,
          primer_apellido: true,
        },
      },
    },
  });
}

/**
 * Get payment status from Mercado Pago
 */
export async function getMercadoPagoPayment(mercadopagoId: string) {
  if (!paymentApi) {
    throw new Error('Mercado Pago no está configurado');
  }

  return paymentApi.get({ id: mercadopagoId });
}

/**
 * Handle Mercado Pago webhook (IPN)
 */
export async function handleWebhook(
  payload: { type: string; data: { id: string } },
  logger: {
    info: (msg: string, data?: object) => void;
    error: (msg: string, data?: object) => void;
  }
) {
  if (payload.type !== 'payment') {
    logger.info('Ignoring non-payment webhook', { type: payload.type });
    return { processed: false };
  }

  if (!paymentApi) {
    throw new Error('Mercado Pago no está configurado');
  }

  const mpPaymentId = payload.data.id;

  // Get payment details from MP
  const mpPayment = await paymentApi.get({ id: mpPaymentId });

  if (!mpPayment) {
    logger.error('Payment not found in Mercado Pago', { mpPaymentId });
    return { processed: false };
  }

  // Find our transaction by external reference
  const externalRef = mpPayment.external_reference;
  if (!externalRef) {
    logger.error('No external reference in MP payment', { mpPaymentId });
    return { processed: false };
  }

  const transaccion = await prisma.transacciones_online.findFirst({
    where: { id: BigInt(externalRef) },
  });

  if (!transaccion) {
    logger.error('Transaction not found', { externalRef, mpPaymentId });
    return { processed: false };
  }

  // Update transaction status
  await prisma.transacciones_online.update({
    where: { id: transaccion.id },
    data: {
      estado: mpPayment.status || 'unknown',
      estado_detalle: mpPayment.status_detail || '',
      datos_respuesta: mpPayment as unknown as Prisma.InputJsonValue,
      actualizado_en: new Date(),
    },
  });

  logger.info('Webhook processed', {
    mpPaymentId,
    transaccionId: transaccion.id.toString(),
    status: mpPayment.status,
  });

  return { processed: true, status: mpPayment.status };
}

/**
 * Get user-friendly status message
 */
function getStatusMessage(status: string, statusDetail: string): string {
  switch (status) {
    case 'approved':
      return 'Pago aprobado exitosamente';
    case 'pending':
    case 'in_process':
      return 'Tu pago está siendo procesado. Te notificaremos cuando se confirme.';
    case 'rejected':
      return getRejectionMessage(statusDetail);
    case 'cancelled':
      return 'El pago fue cancelado';
    case 'refunded':
      return 'El pago fue reembolsado';
    default:
      return 'Estado del pago: ' + status;
  }
}

/**
 * Get user-friendly rejection message
 */
function getRejectionMessage(statusDetail: string): string {
  switch (statusDetail) {
    case 'cc_rejected_insufficient_amount':
      return 'Fondos insuficientes. Por favor use otra tarjeta.';
    case 'cc_rejected_bad_filled_card_number':
      return 'Número de tarjeta inválido. Verifique los datos.';
    case 'cc_rejected_bad_filled_date':
      return 'Fecha de vencimiento inválida.';
    case 'cc_rejected_bad_filled_security_code':
      return 'Código de seguridad inválido.';
    case 'cc_rejected_call_for_authorize':
      return 'Debe autorizar el pago con su banco.';
    case 'cc_rejected_card_disabled':
      return 'Tarjeta deshabilitada. Contacte a su banco.';
    case 'cc_rejected_duplicated_payment':
      return 'Ya realizaste un pago por ese monto. Espere unos minutos.';
    case 'cc_rejected_high_risk':
      return 'Pago rechazado por seguridad. Contacte a su banco.';
    case 'cc_rejected_max_attempts':
      return 'Excediste el límite de intentos. Use otra tarjeta.';
    default:
      return 'El pago fue rechazado. Por favor intente con otra tarjeta.';
  }
}

/**
 * Get customer pending boletas for payment selection
 * Returns individual monthly charges (monto_total_mes) and the actual balance owed
 * Uses centralized billing service for calculations
 */
export async function getCustomerPendingBoletas(clienteId: bigint) {
  // Use centralized balance and partial payment calculation
  const saldoActual = await getCurrentBalance(clienteId);
  const { map: partialPaymentMap } =
    await getBoletasPartialPaymentMap(clienteId);

  // Get pending boletas for display (using monto_total_mes for individual charges)
  const boletas = await prisma.boletas.findMany({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente',
    },
    orderBy: { fecha_emision: 'asc' },
    select: {
      id: true,
      numero_folio: true,
      periodo_desde: true,
      periodo_hasta: true,
      fecha_emision: true,
      fecha_vencimiento: true,
      monto_total_mes: true, // Individual month's charge, not cumulative
      monto_total: true, // Fallback
    },
  });

  // Map boletas with partial payment info from centralized calculation
  const boletasWithDebt = boletas.map((b) => {
    const partialInfo = partialPaymentMap.get(b.id.toString());
    const montoMes = Number(b.monto_total_mes || b.monto_total);

    return {
      id: b.id.toString(),
      numeroFolio: b.numero_folio,
      periodoDesde: b.periodo_desde,
      periodoHasta: b.periodo_hasta,
      fechaEmision: b.fecha_emision,
      fechaVencimiento: b.fecha_vencimiento,
      montoTotal: montoMes, // The monthly charge for this period
      montoAdeudado: partialInfo?.montoAdeudado ?? montoMes, // What's actually still owed
      parcialmentePagada: partialInfo?.parcialmentePagada ?? false,
    };
  });

  return {
    boletas: boletasWithDebt,
    saldoActual, // The actual total owed
  };
}
