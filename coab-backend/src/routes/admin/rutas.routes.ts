import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as rutasService from '../../services/rutas.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';
import {
  createRutaSchema,
  updateRutaSchema,
  rutaIdSchema,
} from '../../schemas/rutas.schema.js';

const rutasRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admin/rutas
   * List all rutas with pagination
   */
  fastify.get('/rutas', async (request, reply) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          sortBy: z.enum(['nombre', 'cantidadDirecciones', 'fechaCreacion']).optional().default('nombre'),
          sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
        })
        .parse(request.query);

      const result = await rutasService.getAllRutas(query.page, query.limit, query.sortBy, query.sortDirection);
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener rutas');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener rutas' },
      });
    }
  });

  /**
   * GET /admin/rutas/:id
   * Get a single ruta by ID
   */
  fastify.get('/rutas/:id', async (request, reply) => {
    try {
      const params = rutaIdSchema.parse(request.params);
      const ruta = await rutasService.getRutaById(BigInt(params.id));
      return ruta;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      if (error.message === 'Ruta no encontrada') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      fastify.log.error(error, 'Error al obtener ruta');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener ruta' },
      });
    }
  });

  /**
   * POST /admin/rutas
   * Create a new ruta (admin only)
   */
  fastify.post(
    '/rutas',
    { preHandler: requirePermission('rutas', 'create') },
    async (request, reply) => {
      try {
        const data = createRutaSchema.parse(request.body);
        const ruta = await rutasService.createRuta(data, request.user!.email!);

        fastify.log.info(
          { rutaId: ruta.id, adminEmail: request.user!.email },
          'Ruta creada'
        );

        return reply.code(201).send(ruta);
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message.includes('Ya existe')) {
          return reply.code(409).send({
            error: { code: 'DUPLICATE', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al crear ruta');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al crear ruta' },
        });
      }
    }
  );

  /**
   * PATCH /admin/rutas/:id
   * Update an existing ruta (admin only)
   */
  fastify.patch(
    '/rutas/:id',
    { preHandler: requirePermission('rutas', 'edit') },
    async (request, reply) => {
      try {
        const params = rutaIdSchema.parse(request.params);
        const data = updateRutaSchema.parse(request.body);
        const ruta = await rutasService.updateRuta(
          BigInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { rutaId: ruta.id, adminEmail: request.user!.email },
          'Ruta actualizada'
        );

        return ruta;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Ruta no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('Ya existe')) {
          return reply.code(409).send({
            error: { code: 'DUPLICATE', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar ruta');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar ruta' },
        });
      }
    }
  );

  /**
   * DELETE /admin/rutas/:id
   * Delete a ruta (admin only, only if no direcciones)
   */
  fastify.delete(
    '/rutas/:id',
    { preHandler: requirePermission('rutas', 'delete') },
    async (request, reply) => {
      try {
        const params = rutaIdSchema.parse(request.params);
        const result = await rutasService.deleteRuta(
          BigInt(params.id),
          request.user!.email!
        );

        fastify.log.info(
          { rutaId: params.id, adminEmail: request.user!.email },
          'Ruta eliminada'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Ruta no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('No se puede eliminar')) {
          return reply.code(409).send({
            error: { code: 'CONFLICT', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al eliminar ruta');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar ruta' },
        });
      }
    }
  );

  /**
   * GET /admin/rutas/:id/direcciones
   * Get all direcciones for a specific ruta
   */
  fastify.get('/rutas/:id/direcciones', async (request, reply) => {
    try {
      const params = rutaIdSchema.parse(request.params);
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .parse(request.query);

      const result = await rutasService.getDireccionesByRuta(
        BigInt(params.id),
        query.page,
        query.limit
      );
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener direcciones de ruta');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener direcciones' },
      });
    }
  });

  /**
   * POST /admin/rutas/:id/direcciones/reasignar
   * Reassign direcciones to a different ruta
   */
  fastify.post(
    '/rutas/:id/direcciones/reasignar',
    { preHandler: requirePermission('rutas', 'edit') },
    async (request, reply) => {
      try {
        const params = rutaIdSchema.parse(request.params);
        const body = z
          .object({
            direccionIds: z.array(z.string()).min(1, 'Debe seleccionar al menos una dirección'),
          })
          .parse(request.body);

        const result = await rutasService.reassignDirecciones(
          body.direccionIds,
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
        if (error.message === 'Ruta destino no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al reasignar direcciones');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al reasignar direcciones' },
        });
      }
    }
  );
};

export default rutasRoutes;

