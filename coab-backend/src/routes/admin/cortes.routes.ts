import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as cortesService from '../../services/cortes.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';

const cortesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/cortes
   * List all cortes with filters
   */
  fastify.get('/cortes', async (request, reply) => {
    try {
      const query = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(50),
        estado: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(['numeroCliente', 'fechaCorte', 'estado', 'fechaReposicion']).optional().default('fechaCorte'),
        sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
      }).parse(request.query);
      return await cortesService.getAllCortes(query.page, query.limit, query.estado, query.search, query.sortBy, query.sortDirection);
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al obtener cortes' } });
    }
  });

  /**
   * GET /admin/cortes/:id
   * Get a single corte by ID
   */
  fastify.get('/cortes/:id', async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await cortesService.getCorteById(BigInt(id));
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * POST /admin/cortes
   * Create a new corte
   */
  fastify.post('/cortes', { preHandler: requirePermission('cortes_servicio', 'create') }, async (request, reply) => {
    try {
      const data = z.object({ 
        numeroCliente: z.string().regex(/^\d+$/), 
        fechaCorte: z.string().optional(), 
        motivoCorte: z.string().min(1), 
        observaciones: z.string().optional(),
        montoCobrado: z.number().optional(),
      }).parse(request.body);
      return reply.code(201).send(await cortesService.createCorte(data, request.user!.email!));
    } catch (error: any) {
      if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al crear corte' } });
    }
  });

  /**
   * POST /admin/cortes/:id/reposicion
   * Authorize reposicion for a corte
   */
  fastify.post('/cortes/:id/reposicion', { preHandler: requirePermission('cortes_servicio', 'authorize_reposicion') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await cortesService.autorizarReposicion(BigInt(id), request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      if (error.message?.includes('ya fue')) return reply.code(409).send({ error: { code: 'CONFLICT', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * GET /admin/cortes/cliente/:clienteId/reposicion-info
   * Get reposicion info for a client (tarifa values and previous reposicion count)
   */
  fastify.get('/cortes/cliente/:clienteId/reposicion-info', async (request, reply) => {
    try {
      const { clienteId } = z.object({ clienteId: z.string().regex(/^\d+$/) }).parse(request.params);
      return await cortesService.getClienteReposicionInfo(BigInt(clienteId));
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al obtener información' } });
    }
  });

  /**
   * PATCH /admin/cortes/:id
   * Update a corte
   */
  fastify.patch('/cortes/:id', { preHandler: requirePermission('cortes_servicio', 'edit') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      const data = z.object({
        fechaCorte: z.string().optional(),
        motivoCorte: z.string().optional(),
        observaciones: z.string().optional(),
        montoCobrado: z.number().optional(),
      }).parse(request.body);
      return await cortesService.updateCorte(BigInt(id), data, request.user!.email!);
    } catch (error: any) {
      if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar corte' } });
    }
  });

  /**
   * DELETE /admin/cortes/:id
   * Delete a corte
   */
  fastify.delete('/cortes/:id', { preHandler: requirePermission('cortes_servicio', 'delete') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await cortesService.deleteCorte(BigInt(id), request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar corte' } });
    }
  });
};

export default cortesRoutes;

