import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as medidoresService from '../../services/medidores.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';
import {
  createMedidorSchema,
  updateMedidorSchema,
  medidorIdSchema,
} from '../../schemas/medidores.schema.js';

const medidoresRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/medidores
   * List all medidores with pagination and filters
   */
  fastify.get('/medidores', async (request, reply) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          estado: z.string().optional(),
          search: z.string().optional(),
          sortBy: z.enum(['numeroSerie', 'cliente', 'estado', 'fechaInstalacion']).optional().default('fechaInstalacion'),
          sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
        })
        .parse(request.query);

      const result = await medidoresService.getAllMedidores(query.page, query.limit, {
        estado: query.estado,
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
      fastify.log.error(error, 'Error al obtener medidores');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener medidores' },
      });
    }
  });

  /**
   * GET /admin/medidores/:id
   * Get a single medidor by ID with full details
   */
  fastify.get('/medidores/:id', async (request, reply) => {
    try {
      const params = medidorIdSchema.parse(request.params);
      const medidor = await medidoresService.getMedidorById(BigInt(params.id));
      return medidor;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      if (error.message === 'Medidor no encontrado') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      fastify.log.error(error, 'Error al obtener medidor');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener medidor' },
      });
    }
  });

  /**
   * POST /admin/medidores
   * Create a new medidor (supervisor+)
   */
  fastify.post(
    '/medidores',
    { preHandler: requirePermission('medidores', 'create') },
    async (request, reply) => {
      try {
        const data = createMedidorSchema.parse(request.body);
        const medidor = await medidoresService.createMedidor(data, request.user!.email!);

        fastify.log.info(
          { medidorId: medidor.id, adminEmail: request.user!.email },
          'Medidor creado'
        );

        return reply.code(201).send(medidor);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Dirección no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al crear medidor');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al crear medidor' },
        });
      }
    }
  );

  /**
   * PATCH /admin/medidores/:id
   * Update an existing medidor (supervisor+)
   */
  fastify.patch(
    '/medidores/:id',
    { preHandler: requirePermission('medidores', 'edit') },
    async (request, reply) => {
      try {
        const params = medidorIdSchema.parse(request.params);
        const data = updateMedidorSchema.parse(request.body);
        const medidor = await medidoresService.updateMedidor(
          BigInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { medidorId: medidor.id, adminEmail: request.user!.email },
          'Medidor actualizado'
        );

        return medidor;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Medidor no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar medidor');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar medidor' },
        });
      }
    }
  );

  /**
   * PATCH /admin/medidores/:id/toggle-ruta
   * Toggle mostrar_en_ruta for a medidor
   */
  fastify.patch(
    '/medidores/:id/toggle-ruta',
    { preHandler: requirePermission('medidores', 'edit') },
    async (request, reply) => {
      try {
        const params = medidorIdSchema.parse(request.params);
        const result = await medidoresService.toggleMostrarEnRuta(
          BigInt(params.id),
          request.user!.email!
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Medidor no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar medidor');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar medidor' },
        });
      }
    }
  );

  /**
   * DELETE /admin/medidores/:id
   * Delete a medidor (admin only, only if no lecturas)
   */
  fastify.delete(
    '/medidores/:id',
    { preHandler: requirePermission('medidores', 'delete') },
    async (request, reply) => {
      try {
        const params = medidorIdSchema.parse(request.params);
        const result = await medidoresService.deleteMedidor(
          BigInt(params.id),
          request.user!.email!
        );

        fastify.log.info(
          { medidorId: params.id, adminEmail: request.user!.email },
          'Medidor eliminado'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Medidor no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('No se puede eliminar')) {
          return reply.code(409).send({
            error: { code: 'CONFLICT', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al eliminar medidor');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar medidor' },
        });
      }
    }
  );
};

export default medidoresRoutes;

