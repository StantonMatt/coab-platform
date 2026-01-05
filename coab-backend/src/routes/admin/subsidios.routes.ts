import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as subsidiosService from '../../services/subsidios.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';
import {
  createSubsidioSchema,
  updateSubsidioSchema,
  subsidioIdSchema,
} from '../../schemas/subsidios.schema.js';

const subsidiosRoutes: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // SUBSIDIOS CRUD Endpoints
  // =========================================================================

  /**
   * GET /admin/subsidios
   * List all subsidios with pagination
   */
  fastify.get('/subsidios', async (request, reply) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          sortBy: z.enum(['id', 'porcentaje', 'limiteM3', 'fechaInicio', 'estado', 'cantidadHistorial']).optional().default('fechaInicio'),
          sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
        })
        .parse(request.query);

      const result = await subsidiosService.getAllSubsidios(query.page, query.limit, query.sortBy, query.sortDirection);
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener subsidios');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener subsidios' },
      });
    }
  });

  /**
   * GET /admin/subsidios/activos
   * Get all active subsidios
   */
  fastify.get('/subsidios/activos', async (request, reply) => {
    try {
      const subsidios = await subsidiosService.getActiveSubsidios();
      return { subsidios };
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener subsidios activos');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener subsidios activos' },
      });
    }
  });

  /**
   * GET /admin/subsidios/:id
   * Get a single subsidio by ID
   */
  fastify.get('/subsidios/:id', async (request, reply) => {
    try {
      const params = subsidioIdSchema.parse(request.params);
      const subsidio = await subsidiosService.getSubsidioById(parseInt(params.id));
      return subsidio;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      if (error.message === 'Subsidio no encontrado') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      fastify.log.error(error, 'Error al obtener subsidio');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener subsidio' },
      });
    }
  });

  /**
   * POST /admin/subsidios
   * Create a new subsidio (admin only)
   */
  fastify.post(
    '/subsidios',
    { preHandler: requirePermission('subsidios', 'create') },
    async (request, reply) => {
      try {
        const data = createSubsidioSchema.parse(request.body);
        const subsidio = await subsidiosService.createSubsidio(data, request.user!.email!);

        fastify.log.info(
          { subsidioId: subsidio.id, adminEmail: request.user!.email },
          'Subsidio creado'
        );

        return reply.code(201).send(subsidio);
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
        fastify.log.error(error, 'Error al crear subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al crear subsidio' },
        });
      }
    }
  );

  /**
   * PATCH /admin/subsidios/:id
   * Update an existing subsidio (admin only)
   */
  fastify.patch(
    '/subsidios/:id',
    { preHandler: requirePermission('subsidios', 'edit') },
    async (request, reply) => {
      try {
        const params = subsidioIdSchema.parse(request.params);
        const data = updateSubsidioSchema.parse(request.body);
        const subsidio = await subsidiosService.updateSubsidio(
          parseInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { subsidioId: subsidio.id, adminEmail: request.user!.email },
          'Subsidio actualizado'
        );

        return subsidio;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Subsidio no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar subsidio' },
        });
      }
    }
  );

  /**
   * DELETE /admin/subsidios/:id
   * Delete a subsidio (admin only, only if no historial)
   */
  fastify.delete(
    '/subsidios/:id',
    { preHandler: requirePermission('subsidios', 'delete') },
    async (request, reply) => {
      try {
        const params = subsidioIdSchema.parse(request.params);
        const result = await subsidiosService.deleteSubsidio(
          parseInt(params.id),
          request.user!.email!
        );

        fastify.log.info(
          { subsidioId: params.id, adminEmail: request.user!.email },
          'Subsidio eliminado'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Subsidio no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('No se puede eliminar')) {
          return reply.code(409).send({
            error: { code: 'CONFLICT', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al eliminar subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar subsidio' },
        });
      }
    }
  );

  // =========================================================================
  // SUBSIDIO HISTORIAL Endpoints
  // =========================================================================

  /**
   * GET /admin/subsidio-historial
   * List all subsidio historial entries with pagination and filters
   */
  fastify.get('/subsidio-historial', async (request, reply) => {
    try {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
          subsidioId: z.coerce.number().optional(),
          tipoCambio: z.string().optional(),
          search: z.string().optional(),
          sortBy: z.enum(['cliente', 'subsidio', 'fechaCambio', 'tipoCambio']).optional().default('fechaCambio'),
          sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
          esActivo: z.enum(['activo', 'inactivo']).optional(),
        })
        .parse(request.query);

      const result = await subsidiosService.getSubsidioHistorial({
        page: query.page,
        limit: query.limit,
        subsidioId: query.subsidioId,
        tipoCambio: query.tipoCambio,
        search: query.search,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        esActivo: query.esActivo,
      });
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener historial de subsidios');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener historial' },
      });
    }
  });

  /**
   * POST /admin/subsidio-historial/asignar
   * Assign a client to a subsidio
   */
  fastify.post(
    '/subsidio-historial/asignar',
    { preHandler: requirePermission('subsidios', 'create') },
    async (request, reply) => {
      try {
        const body = z
          .object({
            clienteId: z.string(),
            subsidioId: z.coerce.number(),
            fechaCambio: z.string().optional(),
          })
          .parse(request.body);

        const fechaCambio = body.fechaCambio ? new Date(body.fechaCambio) : undefined;
        const result = await subsidiosService.assignSubsidioToClient(
          BigInt(body.clienteId),
          body.subsidioId,
          request.user!.email!,
          fechaCambio
        );
        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'CLIENTE_YA_TIENE_SUBSIDIO') {
          return reply.code(409).send({
            error: {
              code: 'CLIENTE_YA_TIENE_SUBSIDIO',
              message: 'El cliente ya tiene un subsidio activo',
              currentSubsidio: error.currentSubsidio,
            },
          });
        }
        if (error.message.includes('no encontrado')) {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al asignar subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al asignar subsidio' },
        });
      }
    }
  );

  /**
   * POST /admin/subsidio-historial/reasignar
   * Reassign a client from one subsidy to another
   */
  fastify.post(
    '/subsidio-historial/reasignar',
    { preHandler: requirePermission('subsidios', 'edit') },
    async (request, reply) => {
      try {
        const body = z
          .object({
            clienteId: z.string(),
            newSubsidioId: z.coerce.number(),
            fechaCambio: z.string(),
          })
          .parse(request.body);

        const fechaCambio = new Date(body.fechaCambio);
        const result = await subsidiosService.reassignClienteSubsidio(
          BigInt(body.clienteId),
          body.newSubsidioId,
          fechaCambio,
          request.user!.email!
        );
        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message.includes('no encontrado')) {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('no tiene un subsidio activo')) {
          return reply.code(400).send({
            error: { code: 'NO_ACTIVE_SUBSIDIO', message: error.message },
          });
        }
        if (error.message.includes('ya tiene este subsidio')) {
          return reply.code(400).send({
            error: { code: 'SAME_SUBSIDIO', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al reasignar subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al reasignar subsidio' },
        });
      }
    }
  );

  /**
   * POST /admin/subsidio-historial/remover
   * Remove a client from a subsidio
   */
  fastify.post(
    '/subsidio-historial/remover',
    { preHandler: requirePermission('subsidios', 'delete') },
    async (request, reply) => {
      try {
        const body = z
          .object({
            clienteId: z.string(),
            subsidioId: z.coerce.number(),
            motivo: z.string().optional(),
            fechaCambio: z.string().optional(),
          })
          .parse(request.body);

        const fechaCambio = body.fechaCambio ? new Date(body.fechaCambio) : undefined;
        const result = await subsidiosService.removeSubsidioFromClient(
          BigInt(body.clienteId),
          body.subsidioId,
          body.motivo || '',
          request.user!.email!,
          fechaCambio
        );
        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message.includes('no encontrado')) {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('ya fue dado de baja')) {
          return reply.code(400).send({
            error: { code: 'YA_DADO_DE_BAJA', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al remover subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al remover subsidio' },
        });
      }
    }
  );

  /**
   * PATCH /admin/subsidio-historial/:id
   * Edit a subsidio historial entry (date and details only)
   */
  fastify.patch(
    '/subsidio-historial/:id',
    { preHandler: requirePermission('subsidios', 'edit') },
    async (request, reply) => {
      try {
        const params = z.object({ id: z.string() }).parse(request.params);
        const body = z
          .object({
            fechaCambio: z.string().optional(),
            detalles: z.string().optional(),
          })
          .parse(request.body);

        const fechaCambio = body.fechaCambio ? new Date(body.fechaCambio) : undefined;
        const result = await subsidiosService.updateHistorialEntry(
          BigInt(params.id),
          { fechaCambio, detalles: body.detalles },
          request.user!.email!
        );
        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message.includes('no encontrado')) {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al editar historial de subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al editar historial' },
        });
      }
    }
  );

  /**
   * DELETE /admin/subsidio-historial/:id
   * Delete a subsidio historial entry (for correcting mistakes, NOT for removing subsidy)
   */
  fastify.delete(
    '/subsidio-historial/:id',
    { preHandler: requirePermission('subsidios', 'delete') },
    async (request, reply) => {
      try {
        const params = z.object({ id: z.string() }).parse(request.params);
        await subsidiosService.deleteHistorialEntry(
          BigInt(params.id),
          request.user!.email!
        );
        return { success: true, message: 'Registro eliminado correctamente' };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message.includes('no encontrado')) {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al eliminar historial de subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar historial' },
        });
      }
    }
  );
};

export default subsidiosRoutes;

