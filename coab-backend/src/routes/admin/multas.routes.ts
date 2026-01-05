import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as multasService from '../../services/multas.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';
import {
  createMultaSchema,
  updateMultaSchema,
  multaIdSchema,
} from '../../schemas/multas.schema.js';

const multasRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/multas
   * List all multas with filters
   */
  fastify.get('/multas', async (request, reply) => {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        estado: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(['numeroCliente', 'monto', 'periodo', 'fechaCreacion']).optional(),
        sortDirection: z.enum(['asc', 'desc']).optional(),
      }).parse(request.query);
      const result = await multasService.getAllMultas({
        page: query.page,
        limit: query.limit,
        estado: query.estado,
        search: query.search,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      });
      return result;
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener multas');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al obtener multas' } });
    }
  });

  /**
   * GET /admin/multas/:id
   * Get a single multa by ID
   */
  fastify.get('/multas/:id', async (request, reply) => {
    try {
      const params = multaIdSchema.parse(request.params);
      const multa = await multasService.getMultaById(BigInt(params.id));
      return multa;
    } catch (error: any) {
      if (error.message === 'Multa no encontrada') {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      fastify.log.error(error, 'Error al obtener multa');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al obtener multa' } });
    }
  });

  /**
   * POST /admin/multas
   * Create a new multa
   */
  fastify.post('/multas', { preHandler: requirePermission('multas', 'create') }, async (request, reply) => {
    try {
      const data = createMultaSchema.parse(request.body);
      const multa = await multasService.createMulta(data, request.user!.email!);
      return reply.code(201).send(multa);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      }
      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      fastify.log.error(error, 'Error al crear multa');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al crear multa' } });
    }
  });

  /**
   * PATCH /admin/multas/:id
   * Update a multa
   */
  fastify.patch('/multas/:id', { preHandler: requirePermission('multas', 'edit') }, async (request, reply) => {
    try {
      const params = multaIdSchema.parse(request.params);
      const data = updateMultaSchema.parse(request.body);
      const multa = await multasService.updateMulta(BigInt(params.id), data, request.user!.email!);
      return multa;
    } catch (error: any) {
      if (error.message === 'Multa no encontrada') {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      fastify.log.error(error, 'Error al actualizar multa');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar multa' } });
    }
  });

  /**
   * POST /admin/multas/:id/cancelar
   * Cancel a multa
   */
  fastify.post('/multas/:id/cancelar', { preHandler: requirePermission('multas', 'cancel') }, async (request, reply) => {
    try {
      const params = multaIdSchema.parse(request.params);
      const result = await multasService.cancelMulta(BigInt(params.id), request.user!.email!);
      return result;
    } catch (error: any) {
      if (error.message === 'Multa no encontrada') {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      if (error.message.includes('ya está cancelada')) {
        return reply.code(409).send({ error: { code: 'CONFLICT', message: error.message } });
      }
      fastify.log.error(error, 'Error al cancelar multa');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al cancelar multa' } });
    }
  });
};

export default multasRoutes;

