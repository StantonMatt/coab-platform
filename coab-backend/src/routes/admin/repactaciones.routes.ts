import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as repactacionesService from '../../services/repactaciones.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';

const repactacionesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/repactaciones
   * List all repactaciones with filters
   */
  fastify.get('/repactaciones', async (request, reply) => {
    try {
      const query = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(50),
        estado: z.string().optional(),
        sortBy: z.enum(['cliente', 'monto', 'fechaInicio', 'estado']).optional().default('fechaInicio'),
        sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
      }).parse(request.query);
      return await repactacionesService.getAllRepactaciones(query.page, query.limit, query.estado, query.sortBy, query.sortDirection);
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * GET /admin/repactaciones/:id
   * Get a single repactacion by ID
   */
  fastify.get('/repactaciones/:id', async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await repactacionesService.getRepactacionById(BigInt(id));
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * POST /admin/repactaciones
   * Create a new repactacion
   */
  fastify.post('/repactaciones', { preHandler: requirePermission('repactaciones', 'create') }, async (request, reply) => {
    try {
      const data = z.object({
        numeroCliente: z.string().min(1, 'Número de cliente requerido'),
        montoDeudaInicial: z.number().positive(),
        totalCuotas: z.number().int().min(1).max(120),
        fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        numeroConvenio: z.string().nullish(),
        observaciones: z.string().nullish(),
      }).parse(request.body);
      return reply.code(201).send(await repactacionesService.createRepactacion(data, request.user!.email!));
    } catch (error: any) {
      if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * PATCH /admin/repactaciones/:id
   * Update a repactacion
   */
  fastify.patch('/repactaciones/:id', { preHandler: requirePermission('repactaciones', 'edit') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await repactacionesService.updateRepactacion(BigInt(id), request.body, request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * POST /admin/repactaciones/:id/cancelar
   * Cancel a repactacion
   */
  fastify.post('/repactaciones/:id/cancelar', { preHandler: requirePermission('repactaciones', 'cancel') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await repactacionesService.cancelRepactacion(BigInt(id), request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      if (error.message?.includes('ya está')) return reply.code(409).send({ error: { code: 'CONFLICT', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * DELETE /admin/repactaciones/:id
   * Delete a repactacion
   */
  fastify.delete('/repactaciones/:id', { preHandler: requirePermission('repactaciones', 'delete') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await repactacionesService.deleteRepactacion(BigInt(id), request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar repactación' } });
    }
  });

  // =========================================================================
  // SOLICITUDES DE REPACTACION
  // =========================================================================

  /**
   * GET /admin/solicitudes-repactacion
   * List all solicitudes
   */
  fastify.get('/solicitudes-repactacion', async (request, reply) => {
    try {
      const query = z.object({ page: z.coerce.number().default(1), limit: z.coerce.number().default(50), estado: z.string().optional() }).parse(request.query);
      return await repactacionesService.getAllSolicitudes(query.page, query.limit, query.estado);
    } catch (error: any) {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * POST /admin/solicitudes-repactacion/:id/aprobar
   * Approve a solicitud
   */
  fastify.post('/solicitudes-repactacion/:id/aprobar', { preHandler: requirePermission('solicitudes_repactacion', 'approve_request') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await repactacionesService.approveSolicitud(BigInt(id), request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      if (error.message?.includes('ya fue')) return reply.code(409).send({ error: { code: 'CONFLICT', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  /**
   * POST /admin/solicitudes-repactacion/:id/rechazar
   * Reject a solicitud
   */
  fastify.post('/solicitudes-repactacion/:id/rechazar', { preHandler: requirePermission('solicitudes_repactacion', 'approve_request') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      const { motivoRechazo } = z.object({ motivoRechazo: z.string().min(1) }).parse(request.body);
      return await repactacionesService.rejectSolicitud(BigInt(id), motivoRechazo, request.user!.email!);
    } catch (error: any) {
      if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      if (error.message?.includes('no encontrada')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      if (error.message?.includes('ya fue')) return reply.code(409).send({ error: { code: 'CONFLICT', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });
};

export default repactacionesRoutes;

