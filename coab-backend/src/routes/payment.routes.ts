/**
 * Payment Routes
 * Customer-facing payment endpoints for Mercado Pago integration
 */

import { FastifyPluginAsync } from 'fastify';
import { z, ZodError } from 'zod';
import * as mercadopagoService from '../services/mercadopago.service.js';
import { requireCliente } from '../middleware/auth.middleware.js';
import prisma from '../lib/prisma.js';

// Schema for creating a payment
const createPaymentSchema = z.object({
  monto: z.number().positive('El monto debe ser mayor a 0'),
  descripcion: z.string().optional().default('Pago de servicios COAB'),
  boletaIds: z.array(z.string()).optional(), // Optional: specific boletas to pay
  cardPaymentData: z.object({
    token: z.string().min(1, 'Token de tarjeta requerido'),
    installments: z.number().int().min(1).max(12).default(1),
    payment_method_id: z.string().min(1, 'Método de pago requerido'),
    issuer_id: z.string().optional(),
    payer: z.object({
      email: z.string().email('Email inválido'),
      identification: z
        .object({
          type: z.string().default('RUT'),
          number: z.string(),
        })
        .optional(),
    }),
  }),
  idempotencyKey: z.string().optional(),
});

const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require customer authentication
  fastify.addHook('preHandler', requireCliente);

  /**
   * GET /pagos/config
   * Get Mercado Pago configuration (public key)
   */
  fastify.get('/config', async (_request, reply) => {
    if (!mercadopagoService.isConfigured()) {
      return reply.code(503).send({
        error: {
          code: 'MP_NOT_CONFIGURED',
          message: 'Pagos en línea no disponibles momentáneamente',
        },
      });
    }

    return {
      publicKey: mercadopagoService.getPublicKey(),
      enabled: true,
    };
  });

  /**
   * GET /pagos/boletas-pendientes
   * Get customer's pending boletas for payment selection
   */
  fastify.get('/boletas-pendientes', async (request) => {
    const clienteId = BigInt(request.user!.userId.toString());
    const result = await mercadopagoService.getCustomerPendingBoletas(clienteId);

    return {
      boletas: result.boletas,
      total: result.saldoActual, // Use actual balance, not sum of boletas
    };
  });

  /**
   * POST /pagos/mercadopago
   * Create a payment with Mercado Pago
   */
  fastify.post(
    '/mercadopago',
    {
      config: {
        rateLimit: {
          max: 10, // 10 payment attempts per 15 minutes
          timeWindow: '15 minutes',
          keyGenerator: (req) => `payment-${req.user?.userId || req.ip}`,
        },
      },
    },
    async (request, reply) => {
      try {
        // Validate MP is configured
        if (!mercadopagoService.isConfigured()) {
          return reply.code(503).send({
            error: {
              code: 'MP_NOT_CONFIGURED',
              message: 'Pagos en línea no disponibles momentáneamente',
            },
          });
        }

        // Validate input
        const data = createPaymentSchema.parse(request.body);
        const clienteId = BigInt(request.user!.userId.toString());

        // Validate amount against pending balance
        const pendingData = await mercadopagoService.getCustomerPendingBoletas(clienteId);
        const totalPending = pendingData.saldoActual;

        // If specific boletas selected, validate they exist
        if (data.boletaIds && data.boletaIds.length > 0) {
          const selectedIds = new Set(data.boletaIds);
          const validIds = new Set(pendingData.boletas.map((b) => b.id));

          for (const id of selectedIds) {
            if (!validIds.has(id)) {
              return reply.code(400).send({
                error: {
                  code: 'INVALID_BOLETA',
                  message: `Boleta ${id} no encontrada o ya pagada`,
                },
              });
            }
          }

          // Calculate expected amount for selected boletas (using montoAdeudado)
          const selectedTotal = pendingData.boletas
            .filter((b) => selectedIds.has(b.id))
            .reduce((sum, b) => sum + b.montoAdeudado, 0);

          if (data.monto < selectedTotal * 0.01) {
            // Allow at least 1% underpayment for rounding
            return reply.code(400).send({
              error: {
                code: 'AMOUNT_TOO_LOW',
                message: 'El monto es menor al total de las boletas seleccionadas',
              },
            });
          }
        }

        // Don't allow overpayment beyond balance (prevent fraud)
        if (data.monto > totalPending * 1.5) {
          return reply.code(400).send({
            error: {
              code: 'AMOUNT_TOO_HIGH',
              message: 'El monto excede significativamente el saldo pendiente',
            },
          });
        }

        // Create payment
        const result = await mercadopagoService.createPayment(
          {
            clienteId,
            monto: data.monto,
            descripcion: data.descripcion,
            cardPaymentData: data.cardPaymentData,
            boletaIds: data.boletaIds,
            idempotencyKey: data.idempotencyKey,
          },
          request.ip,
          fastify.log
        );

        if (!result.success && result.estado !== 'pending' && result.estado !== 'in_process') {
          return reply.code(400).send({
            error: {
              code: 'PAYMENT_FAILED',
              message: result.mensaje,
              estado: result.estado,
              estadoDetalle: result.estadoDetalle,
            },
            transaccionId: result.transaccionOnlineId,
          });
        }

        return {
          success: result.success,
          transaccionId: result.transaccionOnlineId,
          mercadopagoId: result.mercadopagoId,
          estado: result.estado,
          mensaje: result.mensaje,
          boletasAfectadas: result.boletasAfectadas,
          saldoNuevo: result.saldoNuevo,
        };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
              details: error.errors,
            },
          });
        }

        fastify.log.error(error, 'Payment creation error');

        return reply.code(500).send({
          error: {
            code: 'PAYMENT_ERROR',
            message: error.message || 'Error al procesar el pago',
          },
        });
      }
    }
  );

  /**
   * GET /pagos/:id
   * Get payment details
   */
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const clienteId = BigInt(request.user!.userId.toString());

    try {
      const payment = await mercadopagoService.getPaymentById(id);

      if (!payment) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Transacción no encontrada' },
        });
      }

      // Security: Only allow customer to see their own payments
      if (payment.cliente_id !== clienteId) {
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'No autorizado' },
        });
      }

      return {
        id: payment.id.toString(),
        proveedor: payment.proveedor,
        referenciaExterna: payment.referencia_externa,
        monto: Number(payment.monto),
        estado: payment.estado,
        estadoDetalle: payment.estado_detalle,
        metodoPago: payment.metodo_pago,
        cuotas: payment.cuotas,
        creadoEn: payment.creado_en,
        actualizadoEn: payment.actualizado_en,
      };
    } catch (error: any) {
      fastify.log.error(error, 'Error fetching payment');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener la transacción' },
      });
    }
  });

  /**
   * GET /pagos/historial
   * Get customer's online payment history
   */
  fastify.get('/historial', async (request) => {
    const clienteId = BigInt(request.user!.userId.toString());
    const query = request.query as { limit?: string; cursor?: string };
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const cursor = query.cursor;

    const payments = await prisma.transacciones_online.findMany({
      where: { cliente_id: clienteId },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: BigInt(cursor) } : undefined,
      orderBy: { creado_en: 'desc' },
      select: {
        id: true,
        proveedor: true,
        referencia_externa: true,
        monto: true,
        estado: true,
        metodo_pago: true,
        cuotas: true,
        creado_en: true,
      },
    });

    const hasNextPage = payments.length > limit;
    const data = hasNextPage ? payments.slice(0, -1) : payments;
    const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

    return {
      data: data.map((p) => ({
        id: p.id.toString(),
        proveedor: p.proveedor,
        referenciaExterna: p.referencia_externa,
        monto: Number(p.monto),
        estado: p.estado,
        metodoPago: p.metodo_pago,
        cuotas: p.cuotas,
        creadoEn: p.creado_en,
      })),
      pagination: { hasNextPage, nextCursor },
    };
  });
};

export default paymentRoutes;

/**
 * Webhook routes - separate plugin for public webhook endpoint
 */
export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /webhooks/mercadopago
   * Mercado Pago IPN webhook (public, no auth required)
   */
  fastify.post('/mercadopago', async (request, reply) => {
    try {
      const payload = request.body as { type: string; data: { id: string } };

      if (!payload || !payload.type || !payload.data) {
        return reply.code(400).send({ error: 'Invalid webhook payload' });
      }

      const result = await mercadopagoService.handleWebhook(payload, fastify.log);

      return { received: true, processed: result.processed };
    } catch (error: any) {
      fastify.log.error(error, 'Webhook processing error');
      // Return 200 anyway to prevent MP from retrying
      return { received: true, error: error.message };
    }
  });
};

