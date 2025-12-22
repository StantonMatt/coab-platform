/**
 * Transbank OneClick Service
 * Handles card inscription, one-click payments, and card management
 */

import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { createRequire } from 'module';
import prisma from '../lib/prisma.js';
import { env } from '../config/env.js';
import {
  recalculateBoletaEstados,
  type FIFOResult,
} from './billing.service.js';

// Import transbank-sdk (CommonJS module) using createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const TransbankSDK = require('transbank-sdk');
const Oneclick = TransbankSDK.Oneclick;
const TransactionDetail = TransbankSDK.TransactionDetail;

// Type for transaction client
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Get commerce codes and API keys from environment
function getCredentials() {
  const isProduction = env.TRANSBANK_ENVIRONMENT === 'production';
  
  return {
    commerceCode: env.TRANSBANK_COMMERCE_CODE,
    apiKey: env.TRANSBANK_API_KEY,
    childCommerceCode: env.TRANSBANK_CHILD_COMMERCE_CODE,
    isProduction,
  };
}

// Initialize inscription instance
function getInscriptionInstance() {
  const { commerceCode, apiKey, isProduction } = getCredentials();
  
  if (isProduction) {
    return Oneclick.MallInscription.buildForProduction(commerceCode, apiKey);
  }
  return Oneclick.MallInscription.buildForIntegration(commerceCode, apiKey);
}

// Initialize transaction instance
function getTransactionInstance() {
  const { commerceCode, apiKey, isProduction } = getCredentials();
  
  if (isProduction) {
    return Oneclick.MallTransaction.buildForProduction(commerceCode, apiKey);
  }
  return Oneclick.MallTransaction.buildForIntegration(commerceCode, apiKey);
}

// Types
export interface SavedCard {
  id: string;
  ultimosDigitos: string | null;
  tipoTarjeta: string | null;
  creadoEn: Date;
}

export interface InscriptionStartResult {
  success: boolean;
  token?: string;
  urlWebpay?: string;
  error?: string;
}

export interface InscriptionFinishResult {
  success: boolean;
  tarjetaId?: string;
  ultimosDigitos?: string;
  tipoTarjeta?: string;
  error?: string;
  responseCode?: number;
}

export interface PaymentResult {
  success: boolean;
  transaccionOnlineId?: string;
  buyOrder?: string;
  authorizationCode?: string;
  amount?: number;
  estado?: string;
  estadoDetalle?: string;
  mensaje: string;
  saldoNuevo?: number;
}

/**
 * Check if Transbank is configured
 */
export function isConfigured(): boolean {
  // Always "configured" because we can use integration credentials
  return true;
}

/**
 * Check if using production environment
 */
export function isProduction(): boolean {
  return env.TRANSBANK_ENVIRONMENT === 'production' && 
         !!env.TRANSBANK_COMMERCE_CODE && 
         !!env.TRANSBANK_API_KEY;
}

/**
 * Get customer's saved cards
 */
export async function getCustomerCards(clienteId: bigint): Promise<SavedCard[]> {
  const cards = await prisma.tarjetas_guardadas.findMany({
    where: {
      cliente_id: clienteId,
      activa: true,
    },
    orderBy: { creado_en: 'desc' },
    select: {
      id: true,
      ultimos_digitos: true,
      tipo_tarjeta: true,
      creado_en: true,
    },
  });

  return cards.map((card) => ({
    id: card.id.toString(),
    ultimosDigitos: card.ultimos_digitos,
    tipoTarjeta: card.tipo_tarjeta,
    creadoEn: card.creado_en,
  }));
}

/**
 * Start card inscription process
 * Returns URL to redirect user to Transbank
 */
export async function startInscription(
  clienteId: bigint,
  email: string,
  logger: { info: (msg: string, data?: object) => void; error: (msg: string, data?: object) => void }
): Promise<InscriptionStartResult> {
  try {
    const inscription = getInscriptionInstance();
    
    // Generate unique username based on clienteId
    const username = `cliente_${clienteId.toString()}`;
    
    // Response URL - where Transbank will redirect after card registration
    const responseUrl = `${env.FRONTEND_URL}/transbank/callback`;

    logger.info('Starting Transbank inscription', {
      clienteId: clienteId.toString(),
      username,
      responseUrl,
    });

    const response = await inscription.start(username, email, responseUrl);

    logger.info('Transbank inscription started', {
      clienteId: clienteId.toString(),
      hasToken: !!response.token,
      hasUrl: !!response.url_webpay,
    });

    return {
      success: true,
      token: response.token,
      urlWebpay: response.url_webpay,
    };
  } catch (error: any) {
    logger.error('Transbank inscription start error', {
      clienteId: clienteId.toString(),
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Error al iniciar inscripción de tarjeta',
    };
  }
}

/**
 * Finish card inscription after user returns from Transbank
 * Saves the card to database
 */
export async function finishInscription(
  clienteId: bigint,
  token: string,
  logger: { info: (msg: string, data?: object) => void; error: (msg: string, data?: object) => void }
): Promise<InscriptionFinishResult> {
  try {
    const inscription = getInscriptionInstance();

    logger.info('Finishing Transbank inscription', {
      clienteId: clienteId.toString(),
      tokenLength: token.length,
    });

    const response = await inscription.finish(token);

    logger.info('Transbank inscription finish response', {
      clienteId: clienteId.toString(),
      responseCode: response.response_code,
      hasTbkUser: !!response.tbk_user,
      cardType: response.card_type,
    });

    // Check if inscription was successful
    // response_code 0 means success
    if (response.response_code !== 0) {
      return {
        success: false,
        error: getInscriptionErrorMessage(response.response_code),
        responseCode: response.response_code,
      };
    }

    // Save card to database (upsert to handle re-registration)
    const savedCard = await prisma.tarjetas_guardadas.upsert({
      where: {
        cliente_id_tbk_user: {
          cliente_id: clienteId,
          tbk_user: response.tbk_user,
        },
      },
      update: {
        tbk_token: response.authorization_code || '',
        ultimos_digitos: response.card_number?.slice(-4) || null,
        tipo_tarjeta: mapCardType(response.card_type),
        activa: true,
        actualizado_en: new Date(),
      },
      create: {
        cliente_id: clienteId,
        proveedor: 'transbank_oneclick',
        tbk_user: response.tbk_user,
        tbk_token: response.authorization_code || '',
        ultimos_digitos: response.card_number?.slice(-4) || null,
        tipo_tarjeta: mapCardType(response.card_type),
        activa: true,
      },
    });

    logger.info('Card saved successfully', {
      clienteId: clienteId.toString(),
      tarjetaId: savedCard.id.toString(),
      tipoTarjeta: savedCard.tipo_tarjeta,
    });

    return {
      success: true,
      tarjetaId: savedCard.id.toString(),
      ultimosDigitos: savedCard.ultimos_digitos || undefined,
      tipoTarjeta: savedCard.tipo_tarjeta || undefined,
    };
  } catch (error: any) {
    logger.error('Transbank inscription finish error', {
      clienteId: clienteId.toString(),
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Error al completar inscripción de tarjeta',
    };
  }
}

/**
 * Authorize a payment using a saved card
 */
export async function authorizePayment(
  clienteId: bigint,
  tarjetaId: string,
  amount: number,
  descripcion: string,
  ipAddress: string,
  logger: { info: (msg: string, data?: object) => void; error: (msg: string, data?: object) => void }
): Promise<PaymentResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Get saved card
        const card = await tx.tarjetas_guardadas.findFirst({
          where: {
            id: BigInt(tarjetaId),
            cliente_id: clienteId,
            activa: true,
          },
        });

        if (!card) {
          return {
            success: false,
            mensaje: 'Tarjeta no encontrada o inactiva',
          };
        }

        // 2. Get customer info
        const cliente = await tx.clientes.findUnique({
          where: { id: clienteId },
          select: {
            id: true,
            numero_cliente: true,
            correo: true,
          },
        });

        if (!cliente) {
          return {
            success: false,
            mensaje: 'Cliente no encontrado',
          };
        }

        // 3. Create transaction record
        const transaccionOnline = await tx.transacciones_online.create({
          data: {
            cliente_id: clienteId,
            proveedor: 'transbank_oneclick',
            referencia_externa: 'pending',
            monto: amount,
            estado: 'pending',
            metodo_pago: card.tipo_tarjeta || 'tarjeta',
            cuotas: 1,
            clave_idempotencia: `tbk-${clienteId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          },
        });

        // 4. Create buy orders
        const { childCommerceCode } = getCredentials();
        const parentBuyOrder = `BO-${transaccionOnline.id.toString().padStart(10, '0')}`;
        const childBuyOrder = `CO-${transaccionOnline.id.toString().padStart(10, '0')}`;

        // 5. Authorize with Transbank
        const transaction = getTransactionInstance();
        const username = `cliente_${clienteId.toString()}`;

        const details = [
          new TransactionDetail(amount, childCommerceCode, childBuyOrder, 1),
        ];

        logger.info('Authorizing Transbank payment', {
          transaccionOnlineId: transaccionOnline.id.toString(),
          clienteId: clienteId.toString(),
          amount,
          parentBuyOrder,
        });

        let response;
        try {
          response = await transaction.authorize(
            username,
            card.tbk_user,
            parentBuyOrder,
            details
          );
        } catch (tbkError: any) {
          // Update transaction as failed
          await tx.transacciones_online.update({
            where: { id: transaccionOnline.id },
            data: {
              estado: 'rejected',
              estado_detalle: tbkError.message || 'Error de Transbank',
              datos_respuesta: { error: tbkError.message },
              actualizado_en: new Date(),
            },
          });

          logger.error('Transbank authorize error', {
            transaccionOnlineId: transaccionOnline.id.toString(),
            error: tbkError.message,
          });

          return {
            success: false,
            transaccionOnlineId: transaccionOnline.id.toString(),
            mensaje: 'Error al procesar el pago. Por favor intente nuevamente.',
          };
        }

        // 6. Process response
        const detail = response.details?.[0];
        const isApproved = detail?.response_code === 0;

        await tx.transacciones_online.update({
          where: { id: transaccionOnline.id },
          data: {
            referencia_externa: parentBuyOrder,
            estado: isApproved ? 'approved' : 'rejected',
            estado_detalle: detail?.response_code?.toString() || 'unknown',
            datos_respuesta: response as unknown as Prisma.InputJsonValue,
            actualizado_en: new Date(),
          },
        });

        // 7. If approved, apply FIFO to boletas
        if (isApproved) {
          const fifoResult = await applyFIFOPayment(
            tx,
            clienteId,
            amount,
            transaccionOnline.id,
            cliente,
            logger
          );

          // Create audit log
          await tx.log_auditoria.create({
            data: {
              accion: 'PAGO_TRANSBANK_ONECLICK',
              entidad: 'transacciones_online',
              entidad_id: transaccionOnline.id,
              usuario_tipo: 'cliente',
              usuario_email: cliente.correo,
              datos_nuevos: {
                buyOrder: parentBuyOrder,
                authorizationCode: detail?.authorization_code,
                monto: amount,
                saldoNuevo: fifoResult.saldoNuevo,
              },
              ip_address: ipAddress,
            },
          });

          logger.info('Payment approved and applied', {
            transaccionOnlineId: transaccionOnline.id.toString(),
            buyOrder: parentBuyOrder,
            authorizationCode: detail?.authorization_code,
          });

          return {
            success: true,
            transaccionOnlineId: transaccionOnline.id.toString(),
            buyOrder: parentBuyOrder,
            authorizationCode: detail?.authorization_code,
            amount,
            estado: 'approved',
            mensaje: 'Pago aprobado exitosamente',
            saldoNuevo: fifoResult.saldoNuevo,
          };
        }

        // Payment not approved
        logger.info('Payment not approved', {
          transaccionOnlineId: transaccionOnline.id.toString(),
          buyOrder: parentBuyOrder,
          responseCode: detail?.response_code,
        });

        return {
          success: false,
          transaccionOnlineId: transaccionOnline.id.toString(),
          buyOrder: parentBuyOrder,
          estado: 'rejected',
          estadoDetalle: detail?.response_code?.toString(),
          mensaje: getPaymentErrorMessage(detail?.response_code),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 30000,
      }
    );
  } catch (error: any) {
    logger.error('Payment authorization failed', {
      clienteId: clienteId.toString(),
      amount,
      error: error.message,
    });

    throw new Error(error.message || 'Error al procesar el pago');
  }
}

/**
 * Remove a saved card
 */
export async function removeCard(
  clienteId: bigint,
  tarjetaId: string,
  logger: { info: (msg: string, data?: object) => void; error: (msg: string, data?: object) => void }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get card from database
    const card = await prisma.tarjetas_guardadas.findFirst({
      where: {
        id: BigInt(tarjetaId),
        cliente_id: clienteId,
        activa: true,
      },
    });

    if (!card) {
      return {
        success: false,
        error: 'Tarjeta no encontrada',
      };
    }

    // Delete from Transbank
    const inscription = getInscriptionInstance();
    const username = `cliente_${clienteId.toString()}`;

    try {
      await inscription.delete(card.tbk_user, username);
    } catch (tbkError: any) {
      // Log but continue - we'll still deactivate locally
      logger.error('Transbank delete error (continuing with local delete)', {
        clienteId: clienteId.toString(),
        tarjetaId,
        error: tbkError.message,
      });
    }

    // Deactivate in database
    await prisma.tarjetas_guardadas.update({
      where: { id: BigInt(tarjetaId) },
      data: {
        activa: false,
        actualizado_en: new Date(),
      },
    });

    logger.info('Card removed successfully', {
      clienteId: clienteId.toString(),
      tarjetaId,
    });

    return { success: true };
  } catch (error: any) {
    logger.error('Remove card error', {
      clienteId: clienteId.toString(),
      tarjetaId,
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Error al eliminar tarjeta',
    };
  }
}

/**
 * Apply FIFO payment to boletas
 */
async function applyFIFOPayment(
  tx: TransactionClient,
  clienteId: bigint,
  monto: number,
  transaccionOnlineId: bigint,
  cliente: { id: bigint; numero_cliente: string },
  logger: { info: (msg: string, data?: object) => void }
): Promise<{ saldoNuevo: number }> {
  // Create pago record
  const pago = await tx.pagos.create({
    data: {
      cliente_id: clienteId,
      numero_cliente: cliente.numero_cliente,
      monto: monto,
      fecha_pago: new Date(),
      tipo_pago: 'transbank_oneclick',
      estado: 'completado',
      numero_transaccion: transaccionOnlineId.toString(),
      observaciones: `Pago OneClick - Transacción #${transaccionOnlineId}`,
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

  // Add credit note to payment if overpayment
  if (fifoResult.creditoDisponible > 0) {
    const observaciones = `Pago OneClick - Transacción #${transaccionOnlineId}\n[Saldo a favor: $${fifoResult.creditoDisponible.toLocaleString('es-CL')}]`;
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
  });

  return { saldoNuevo: fifoResult.saldoNuevo };
}

/**
 * Map Transbank card type to Spanish
 */
function mapCardType(cardType: string | undefined): string | null {
  if (!cardType) return null;
  
  const typeMap: Record<string, string> = {
    'Visa': 'visa',
    'MasterCard': 'mastercard',
    'Mastercard': 'mastercard',
    'AmericanExpress': 'amex',
    'Amex': 'amex',
    'Diners': 'diners',
    'Magna': 'magna',
    'Prepago': 'prepago',
    'Redcompra': 'redcompra',
  };

  return typeMap[cardType] || cardType.toLowerCase();
}

/**
 * Get user-friendly inscription error message
 */
function getInscriptionErrorMessage(responseCode: number): string {
  switch (responseCode) {
    case -1:
      return 'Error en la inscripción. Por favor intente nuevamente.';
    case -2:
      return 'Inscripción rechazada por el banco emisor.';
    case -3:
      return 'Error de comunicación. Por favor intente más tarde.';
    case -4:
      return 'Tarjeta no soportada para inscripción.';
    case -5:
      return 'Inscripción anulada por el usuario.';
    case -6:
      return 'Tarjeta vencida.';
    case -7:
      return 'Tarjeta bloqueada.';
    case -8:
      return 'Tarjeta inválida.';
    default:
      return `Error de inscripción (código: ${responseCode})`;
  }
}

/**
 * Get user-friendly payment error message
 */
function getPaymentErrorMessage(responseCode: number | undefined): string {
  if (responseCode === undefined) {
    return 'Error desconocido al procesar el pago.';
  }

  switch (responseCode) {
    case -1:
      return 'Pago rechazado. Por favor intente con otra tarjeta.';
    case -2:
      return 'Pago rechazado por el banco emisor.';
    case -3:
      return 'Error de comunicación. Por favor intente más tarde.';
    case -4:
      return 'Fondos insuficientes.';
    case -5:
      return 'Transacción anulada.';
    case -6:
      return 'Tarjeta vencida.';
    case -7:
      return 'Tarjeta bloqueada. Contacte a su banco.';
    case -8:
      return 'Tarjeta inválida.';
    case -96:
      return 'Sistema no disponible. Por favor intente más tarde.';
    case -97:
      return 'Monto excede límite máximo permitido.';
    case -98:
      return 'Monto menor al mínimo permitido.';
    case -99:
      return 'Cuotas no disponibles para este monto.';
    default:
      return `Pago rechazado (código: ${responseCode})`;
  }
}

