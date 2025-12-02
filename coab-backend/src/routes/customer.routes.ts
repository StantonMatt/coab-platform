import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { paginationSchema, boletaIdSchema } from '../schemas/customer.schema.js';
import * as customerService from '../services/customer.service.js';
import { requireCliente } from '../middleware/auth.middleware.js';

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
  });
};

export default customerRoutes;

