import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as adminService from '../../services/admin.service.js';
import * as autopagoService from '../../services/autopago.service.js';
import { requireAdmin } from '../../middleware/auth.middleware.js';
import { paymentSchema } from '../../schemas/payment.schema.js';
import { env } from '../../config/env.js';

const pagosRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/pagos
   * List all payments with filters, search, and pagination
   */
  fastify.get('/pagos', async (request, reply) => {
    try {
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        fechaDesde: z.string().optional(),
        fechaHasta: z.string().optional(),
        tipoPago: z.string().optional(),
        estado: z.string().optional(),
        q: z.string().optional(),
        sortBy: z.enum(['fecha', 'monto', 'cliente', 'estado']).optional().default('fecha'),
        sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
      });

      const query = querySchema.parse(request.query);

      const result = await adminService.getAllPayments({
        page: query.page,
        limit: query.limit,
        fechaDesde: query.fechaDesde ? new Date(query.fechaDesde) : undefined,
        fechaHasta: query.fechaHasta ? new Date(query.fechaHasta) : undefined,
        tipoPago: query.tipoPago,
        estado: query.estado,
        search: query.q,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      });

      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Parámetros de consulta inválidos',
            details: error.errors,
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
   * POST /admin/pagos
   * Register a manual payment with FIFO boleta application
   */
  fastify.post('/pagos', async (request, reply) => {
    try {
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

  /**
   * POST /admin/procesar-autopagos
   * Trigger batch processing of all pending auto-payments
   * Can be called by admin or by external cron with CRON_SECRET header
   */
  fastify.post(
    '/procesar-autopagos',
    {
      preHandler: async (request, reply) => {
        const cronSecret = request.headers['x-cron-secret'];

        // If valid cron secret, allow access
        if (cronSecret && env.CRON_SECRET && cronSecret === env.CRON_SECRET) {
          return;
        }

        // Otherwise, require admin auth (note: already applied by index.ts, but kept for cron case)
        await requireAdmin(request, reply);
      },
    },
    async (request, reply) => {
      try {
        fastify.log.info('Iniciando procesamiento de pagos automáticos');

        const result = await autopagoService.processAllPendingAutoPayments(
          fastify.log
        );

        fastify.log.info(
          {
            procesados: result.procesados,
            exitosos: result.exitosos,
            fallidos: result.fallidos,
            omitidos: result.omitidos,
          },
          'Procesamiento de pagos automáticos completado'
        );

        return {
          success: true,
          mensaje: `Procesados: ${result.procesados}, Exitosos: ${result.exitosos}, Fallidos: ${result.fallidos}, Omitidos: ${result.omitidos}`,
          ...result,
        };
      } catch (error: any) {
        fastify.log.error(error, 'Error procesando pagos automáticos');
        return reply.code(500).send({
          error: {
            code: 'PROCESSING_ERROR',
            message: 'Error al procesar pagos automáticos',
          },
        });
      }
    }
  );
};

export default pagosRoutes;

