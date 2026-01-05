import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import * as lecturasService from '../../services/lecturas.service.js';
import * as pdfService from '../../services/pdf.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';
import {
  updateLecturaSchema,
  createCorreccionSchema,
  lecturaIdSchema,
  lecturasQuerySchema,
} from '../../schemas/lecturas.schema.js';

const lecturasRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/lecturas/periodos-disponibles
   * Get list of periods (year-month) that have lecturas, with boleta PDF status
   * Note: This is slow (N+1 queries). Use /periodos-light for filter dropdowns.
   */
  fastify.get('/lecturas/periodos-disponibles', async (request, reply) => {
    try {
      const periodos = await pdfService.getAvailablePeriods();
      return { periodos };
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener períodos disponibles');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al obtener períodos disponibles',
        },
      });
    }
  });

  /**
   * GET /admin/lecturas/periodos-light
   * Lightweight version - just returns distinct periods without boleta stats
   * Single query, very fast - use this for filter dropdowns
   */
  fastify.get('/lecturas/periodos-light', async (request, reply) => {
    try {
      const periodos = await lecturasService.getAvailablePeriodsLight();
      return { periodos };
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener períodos');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al obtener períodos',
        },
      });
    }
  });

  /**
   * GET /admin/lecturas
   * List all lecturas with filters
   */
  fastify.get('/lecturas', async (request, reply) => {
    try {
      const query = lecturasQuerySchema.parse(request.query);
      const result = await lecturasService.getAllLecturas({
        page: query.page,
        limit: query.limit,
        medidorId: query.medidorId,
        clienteId: query.clienteId,
        periodoAno: query.periodoAno,
        periodoMes: query.periodoMes,
        conCorreccion: query.conCorreccion,
        search: query.search,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      });
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener lecturas');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener lecturas' },
      });
    }
  });

  /**
   * GET /admin/lecturas/:id
   * Get a single lectura by ID
   */
  fastify.get('/lecturas/:id', async (request, reply) => {
    try {
      const params = lecturaIdSchema.parse(request.params);
      const lectura = await lecturasService.getLecturaById(BigInt(params.id));
      return lectura;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      if (error.message === 'Lectura no encontrada') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      fastify.log.error(error, 'Error al obtener lectura');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener lectura' },
      });
    }
  });

  /**
   * GET /admin/lecturas/:id/context
   * Get context for a lectura (previous reading and average consumption)
   */
  fastify.get('/lecturas/:id/context', async (request, reply) => {
    try {
      const params = lecturaIdSchema.parse(request.params);
      const context = await lecturasService.getLecturaContext(BigInt(params.id));
      return context;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      if (error.message === 'Lectura no encontrada') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      fastify.log.error(error, 'Error al obtener contexto de lectura');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener contexto' },
      });
    }
  });

  /**
   * PATCH /admin/lecturas/:id
   * Update lectura before boleta (edit_before_boleta permission)
   */
  fastify.patch(
    '/lecturas/:id',
    { preHandler: requirePermission('lecturas', 'edit_before_boleta') },
    async (request, reply) => {
      try {
        const params = lecturaIdSchema.parse(request.params);
        const data = updateLecturaSchema.parse(request.body);
        const lectura = await lecturasService.updateLectura(
          BigInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { lecturaId: params.id, adminEmail: request.user!.email },
          'Lectura actualizada'
        );

        return lectura;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Lectura no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('No se puede editar')) {
          return reply.code(409).send({
            error: { code: 'CONFLICT', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar lectura');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar lectura' },
        });
      }
    }
  );

  /**
   * POST /admin/lecturas/:id/correccion
   * Create correction for lectura (after boleta)
   */
  fastify.post(
    '/lecturas/:id/correccion',
    { preHandler: requirePermission('lecturas', 'create_correction') },
    async (request, reply) => {
      try {
        const params = lecturaIdSchema.parse(request.params);
        const data = createCorreccionSchema.parse(request.body);
        const result = await lecturasService.createCorreccion(
          BigInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { lecturaId: params.id, adminEmail: request.user!.email },
          'Corrección de lectura creada'
        );

        return reply.code(201).send(result);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Lectura no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al crear corrección');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al crear corrección' },
        });
      }
    }
  );
};

export default lecturasRoutes;

