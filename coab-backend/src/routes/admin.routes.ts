import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import * as adminService from '../services/admin.service.js';
import * as infobipService from '../services/infobip.service.js';
import { requireAdmin } from '../middleware/auth.middleware.js';
import {
  searchSchema,
  paginationSchema,
  customerIdSchema,
} from '../schemas/admin.schema.js';
import { paymentSchema } from '../schemas/payment.schema.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply admin auth middleware to all routes
  fastify.addHook('onRequest', requireAdmin);

  /**
   * GET /admin/clientes?q=...
   * Search customers by RUT, name, or address
   */
  fastify.get('/clientes', async (request, reply) => {
    try {
      const query = searchSchema.parse(request.query);
      const result = await adminService.searchCustomers(
        query.q,
        query.limit,
        query.cursor
      );
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }
      fastify.log.error(error, 'Error al buscar clientes');
      return reply.code(500).send({
        error: {
          code: 'SEARCH_FAILED',
          message: 'Error al buscar clientes',
        },
      });
    }
  });

  /**
   * GET /admin/clientes/:id
   * Get customer profile for admin view
   */
  fastify.get('/clientes/:id', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);
      const customer = await adminService.getCustomerProfile(BigInt(params.id));
      return customer;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }

      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      fastify.log.error(error, 'Error al obtener cliente');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al obtener cliente',
        },
      });
    }
  });

  /**
   * GET /admin/clientes/:id/pagos
   * Get customer payment history
   */
  fastify.get('/clientes/:id/pagos', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);
      const query = paginationSchema.parse(request.query);

      const result = await adminService.getCustomerPayments(
        BigInt(params.id),
        query.limit,
        query.cursor
      );
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }
      fastify.log.error(error, 'Error al obtener pagos');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al obtener pagos',
        },
      });
    }
  });

  /**
   * GET /admin/clientes/:id/boletas
   * Get customer boletas
   */
  fastify.get('/clientes/:id/boletas', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);
      const query = paginationSchema.parse(request.query);

      const result = await adminService.getCustomerBoletas(
        BigInt(params.id),
        query.limit,
        query.cursor
      );
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }
      fastify.log.error(error, 'Error al obtener boletas');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al obtener boletas',
        },
      });
    }
  });

  /**
   * POST /admin/clientes/:id/desbloquear
   * Unlock a customer account
   */
  fastify.post('/clientes/:id/desbloquear', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);

      const result = await adminService.unlockCustomerAccount(
        BigInt(params.id),
        request.user!.email!
      );

      fastify.log.info(
        { clienteId: params.id, adminEmail: request.user!.email },
        'Cuenta de cliente desbloqueada'
      );

      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }

      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      fastify.log.error(error, 'Error al desbloquear cuenta');
      return reply.code(500).send({
        error: {
          code: 'UNLOCK_FAILED',
          message: 'Error al desbloquear cuenta',
        },
      });
    }
  });

  /**
   * POST /admin/clientes/:id/generar-setup
   * Generate a password setup token for a customer
   * Rate limited: 3 per customer per hour
   */
  fastify.post(
    '/clientes/:id/generar-setup',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
          keyGenerator: (req: any) => `setup-${(req.params as any).id}`,
        },
      },
    },
    async (request, reply) => {
      try {
        const params = customerIdSchema.parse(request.params);

        const result = await adminService.generateSetupToken(
          BigInt(params.id),
          request.user!.email!,
          request.ip
        );

        fastify.log.info(
          { clienteId: params.id, adminEmail: request.user!.email },
          'Token de configuración generado'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
            },
          });
        }

        if (error.message === 'Cliente no encontrado') {
          return reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: error.message,
            },
          });
        }

        fastify.log.error(error, 'Error al generar token de configuración');
        return reply.code(500).send({
          error: {
            code: 'TOKEN_GENERATION_FAILED',
            message: 'Error al generar enlace de configuración',
          },
        });
      }
    }
  );

  /**
   * POST /admin/clientes/:id/enviar-setup
   * Generate a password setup token AND send via WhatsApp
   * Rate limited: 3 per customer per hour
   */
  fastify.post(
    '/clientes/:id/enviar-setup',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
          keyGenerator: (req: any) => `enviar-setup-${(req.params as any).id}`,
        },
      },
    },
    async (request, reply) => {
      try {
        const params = customerIdSchema.parse(request.params);
        const clienteId = BigInt(params.id);

        // 1. Generate setup token
        const tokenResult = await adminService.generateSetupToken(
          clienteId,
          request.user!.email!,
          request.ip
        );

        // 2. Check if customer has phone number
        if (!tokenResult.cliente.telefono) {
          return reply.code(400).send({
            error: {
              code: 'NO_PHONE',
              message: 'Cliente no tiene teléfono registrado',
              setupUrl: tokenResult.setupUrl, // Still return URL for manual sharing
            },
          });
        }

        // 3. Send via WhatsApp
        const whatsappResult = await infobipService.sendSetupLinkViaWhatsApp(
          clienteId,
          tokenResult.setupUrl,
          tokenResult.cliente.nombre,
          tokenResult.cliente.telefono,
          fastify.log
        );

        fastify.log.info(
          {
            clienteId: params.id,
            adminEmail: request.user!.email,
            whatsappSuccess: whatsappResult.success,
          },
          'Enlace de configuración enviado'
        );

        return {
          ...tokenResult,
          whatsapp: whatsappResult,
        };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
            },
          });
        }

        if (error.message === 'Cliente no encontrado') {
          return reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: error.message,
            },
          });
        }

        fastify.log.error(error, 'Error al enviar enlace de configuración');
        return reply.code(500).send({
          error: {
            code: 'SEND_SETUP_FAILED',
            message: 'Error al enviar enlace de configuración',
          },
        });
      }
    }
  );

  /**
   * POST /admin/pagos
   * Register a manual payment with FIFO boleta application
   */
  fastify.post('/pagos', async (request, reply) => {
    try {
      // Validate input with Zod
      const validatedData = paymentSchema.parse(request.body);

      const result = await adminService.registrarPago(
        validatedData,
        request.user!.email!,
        request.ip,
        request.headers['user-agent'] || 'unknown',
        fastify.log
      );

      return reply.code(201).send(result);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos de pago inválidos',
            details: error.errors,
          },
        });
      }

      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }

      fastify.log.error(error, 'Payment registration error');

      return reply.code(500).send({
        error: {
          code: 'PAYMENT_ERROR',
          message: error.message,
        },
      });
    }
  });
};

export default adminRoutes;
