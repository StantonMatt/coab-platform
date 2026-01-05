import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as tarifasService from '../../services/tarifas.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';
import {
  createTarifaSchema,
  updateTarifaSchema,
  tarifaIdSchema,
} from '../../schemas/tarifas.schema.js';

const tarifasRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/tarifas
   * List all tarifas with pagination
   */
  fastify.get('/tarifas', async (request, reply) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          sortBy: z.enum(['fechaInicio', 'cargoFijo', 'costoM3']).optional().default('fechaInicio'),
          sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
        })
        .parse(request.query);

      const result = await tarifasService.getAllTarifas(query.page, query.limit, query.sortBy, query.sortDirection);
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener tarifas');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener tarifas' },
      });
    }
  });

  /**
   * GET /admin/tarifas/vigente
   * Get the current active tarifa
   */
  fastify.get('/tarifas/vigente', async (request, reply) => {
    try {
      const tarifa = await tarifasService.getCurrentTarifa();
      if (!tarifa) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'No hay tarifa vigente' },
        });
      }
      return tarifa;
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener tarifa vigente');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener tarifa vigente' },
      });
    }
  });

  /**
   * GET /admin/tarifas/:id
   * Get a single tarifa by ID
   */
  fastify.get('/tarifas/:id', async (request, reply) => {
    try {
      const params = tarifaIdSchema.parse(request.params);
      const tarifa = await tarifasService.getTarifaById(BigInt(params.id));
      return tarifa;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      if (error.message === 'Tarifa no encontrada') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      fastify.log.error(error, 'Error al obtener tarifa');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener tarifa' },
      });
    }
  });

  /**
   * POST /admin/tarifas
   * Create a new tarifa (admin only)
   */
  fastify.post(
    '/tarifas',
    { preHandler: requirePermission('tarifas', 'create') },
    async (request, reply) => {
      try {
        const data = createTarifaSchema.parse(request.body);
        const tarifa = await tarifasService.createTarifa(data, request.user!.email!);

        fastify.log.info(
          { tarifaId: tarifa.id, adminEmail: request.user!.email },
          'Tarifa creada'
        );

        return reply.code(201).send(tarifa);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        fastify.log.error(error, 'Error al crear tarifa');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al crear tarifa' },
        });
      }
    }
  );

  /**
   * PATCH /admin/tarifas/:id
   * Update an existing tarifa (admin only)
   */
  fastify.patch(
    '/tarifas/:id',
    { preHandler: requirePermission('tarifas', 'edit') },
    async (request, reply) => {
      try {
        const params = tarifaIdSchema.parse(request.params);
        const data = updateTarifaSchema.parse(request.body);
        const tarifa = await tarifasService.updateTarifa(
          BigInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { tarifaId: tarifa.id, adminEmail: request.user!.email },
          'Tarifa actualizada'
        );

        return tarifa;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Tarifa no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar tarifa');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar tarifa' },
        });
      }
    }
  );

  /**
   * DELETE /admin/tarifas/:id
   * Delete a tarifa (admin only, not the current one)
   */
  fastify.delete(
    '/tarifas/:id',
    { preHandler: requirePermission('tarifas', 'delete') },
    async (request, reply) => {
      try {
        const params = tarifaIdSchema.parse(request.params);
        const result = await tarifasService.deleteTarifa(
          BigInt(params.id),
          request.user!.email!
        );

        fastify.log.info(
          { tarifaId: params.id, adminEmail: request.user!.email },
          'Tarifa eliminada'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Tarifa no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('No se puede eliminar')) {
          return reply.code(409).send({
            error: { code: 'CONFLICT', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al eliminar tarifa');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar tarifa' },
        });
      }
    }
  );
};

export default tarifasRoutes;

