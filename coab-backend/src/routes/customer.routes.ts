import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import { paginationSchema, boletaIdSchema } from '../schemas/customer.schema.js';
import * as customerService from '../services/customer.service.js';
import * as autopagoService from '../services/autopago.service.js';
import { requireCliente } from '../middleware/auth.middleware.js';

// Schema for activar autopago
const activarAutopagoSchema = z.object({
  tarjetaId: z.string().min(1, 'ID de tarjeta requerido'),
});

const customerRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /clientes/notificaciones
   * Public endpoint - service interruption notifications
   * No authentication required
   */
  fastify.get('/notificaciones', async (request, reply) => {
    try {
      const notifications = await customerService.getActiveNotifications();
      return { data: notifications };
    } catch (error) {
      fastify.log.error(error, 'Error al obtener notificaciones');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al obtener notificaciones',
        },
      });
    }
  });

  /**
   * Protected customer routes
   * All routes below require valid cliente JWT token
   */
  fastify.register(async (protectedRoutes) => {
    // Add auth hook to all routes in this context
    protectedRoutes.addHook('onRequest', requireCliente);

    /**
     * GET /clientes/me
     * Get current customer's profile
     */
    protectedRoutes.get('/me', async (request, reply) => {
      try {
        const clienteId = request.user!.userId as bigint;
        const profile = await customerService.getCustomerProfile(clienteId);
        return profile;
      } catch (error: any) {
        if (error.message === 'Cliente no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al obtener perfil');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error interno' },
        });
      }
    });

    /**
     * GET /clientes/me/saldo
     * Get current customer's balance
     */
    protectedRoutes.get('/me/saldo', async (request, reply) => {
      try {
        const clienteId = request.user!.userId as bigint;
        const balance = await customerService.getCustomerBalance(clienteId);
        return balance;
      } catch (error) {
        fastify.log.error(error, 'Error al obtener saldo');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener saldo' },
        });
      }
    });

    /**
     * GET /clientes/me/pagos
     * Get customer's payment history (paginated)
     */
    protectedRoutes.get('/me/pagos', async (request, reply) => {
      try {
        const query = paginationSchema.parse(request.query);
        const clienteId = request.user!.userId as bigint;

        const result = await customerService.getCustomerPayments(
          clienteId,
          query.limit,
          query.cursor
        );

        return result;
      } catch (error) {
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
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener pagos' },
        });
      }
    });

    /**
     * GET /clientes/me/boletas
     * Get customer's boletas (paginated)
     */
    protectedRoutes.get('/me/boletas', async (request, reply) => {
      try {
        const query = paginationSchema.parse(request.query);
        const clienteId = request.user!.userId as bigint;

        const result = await customerService.getCustomerBoletas(
          clienteId,
          query.limit,
          query.cursor
        );

        return result;
      } catch (error) {
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
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener boletas' },
        });
      }
    });

    /**
     * GET /clientes/me/boletas/:id
     * Get single boleta detail
     */
    protectedRoutes.get('/me/boletas/:id', async (request, reply) => {
      try {
        const params = boletaIdSchema.parse(request.params);
        const clienteId = request.user!.userId as bigint;

        const boleta = await customerService.getBoletaById(
          clienteId,
          BigInt(params.id)
        );

        return boleta;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
            },
          });
        }
        if (error.message === 'Boleta no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al obtener boleta');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al obtener boleta' },
        });
      }
    });

    // =========================================================================
    // Auto-Payment (Pago Automático) Endpoints
    // =========================================================================

    /**
     * GET /clientes/me/autopago
     * Get auto-pay status and history
     */
    protectedRoutes.get('/me/autopago', async (request, reply) => {
      try {
        const clienteId = request.user!.userId as bigint;

        const [status, historial] = await Promise.all([
          autopagoService.getAutoPayStatus(clienteId),
          autopagoService.getAutoPayHistory(clienteId, 10),
        ]);

        return {
          data: {
            ...status,
            historial,
          },
        };
      } catch (error: any) {
        fastify.log.error(error, 'Error al obtener estado de pago automático');
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Error al obtener estado de pago automático',
          },
        });
      }
    });

    /**
     * POST /clientes/me/autopago/activar
     * Enable auto-pay with a specific card
     */
    protectedRoutes.post('/me/autopago/activar', async (request, reply) => {
      try {
        const body = activarAutopagoSchema.parse(request.body);
        const clienteId = request.user!.userId as bigint;

        const result = await autopagoService.enableAutoPay(
          clienteId,
          BigInt(body.tarjetaId)
        );

        if (!result.success) {
          return reply.code(400).send({
            error: {
              code: 'BAD_REQUEST',
              message: result.error || 'Error al activar pago automático',
            },
          });
        }

        fastify.log.info(
          { clienteId: clienteId.toString(), tarjetaId: body.tarjetaId },
          'Pago automático activado'
        );

        return {
          success: true,
          message: 'Pago automático activado correctamente',
        };
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
            },
          });
        }
        fastify.log.error(error, 'Error al activar pago automático');
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Error al activar pago automático',
          },
        });
      }
    });

    /**
     * POST /clientes/me/autopago/desactivar
     * Disable auto-pay
     */
    protectedRoutes.post('/me/autopago/desactivar', async (request, reply) => {
      try {
        const clienteId = request.user!.userId as bigint;

        await autopagoService.disableAutoPay(clienteId);

        fastify.log.info(
          { clienteId: clienteId.toString() },
          'Pago automático desactivado'
        );

        return {
          success: true,
          message: 'Pago automático desactivado correctamente',
        };
      } catch (error) {
        fastify.log.error(error, 'Error al desactivar pago automático');
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Error al desactivar pago automático',
          },
        });
      }
    });
  });
};

export default customerRoutes;

