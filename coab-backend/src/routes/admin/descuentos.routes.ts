import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as descuentosService from '../../services/descuentos.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';

const descuentosRoutes: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // DESCUENTOS CRUD Endpoints
  // =========================================================================

  fastify.get('/descuentos', async (request, reply) => {
    try {
      const query = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(50),
        sortBy: z.enum(['nombre', 'tipo', 'valor', 'fechaCreacion']).optional().default('fechaCreacion'),
        sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
      }).parse(request.query);
      return await descuentosService.getAllDescuentos(query.page, query.limit, query.sortBy, query.sortDirection);
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al obtener descuentos' } });
    }
  });

  fastify.get('/descuentos/:id', async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await descuentosService.getDescuentoById(BigInt(id));
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  fastify.post('/descuentos', { preHandler: requirePermission('descuentos', 'create') }, async (request, reply) => {
    try {
      const data = z.object({ nombre: z.string().min(1), porcentaje: z.number().min(0).max(100), fechaInicio: z.string().optional(), fechaFin: z.string().optional(), descripcion: z.string().optional() }).parse(request.body);
      return reply.code(201).send(await descuentosService.createDescuento(data, request.user!.email!));
    } catch (error: any) {
      if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al crear descuento' } });
    }
  });

  fastify.patch('/descuentos/:id', { preHandler: requirePermission('descuentos', 'edit') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      const data = request.body;
      return await descuentosService.updateDescuento(BigInt(id), data, request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar' } });
    }
  });

  fastify.delete('/descuentos/:id', { preHandler: requirePermission('descuentos', 'delete') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await descuentosService.deleteDescuento(BigInt(id), request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar' } });
    }
  });

  // =========================================================================
  // DESCUENTOS APLICADOS Endpoints
  // =========================================================================

  fastify.get('/descuentos-aplicados', async (request, reply) => {
    try {
      const query = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(50),
        clienteId: z.string().optional(),
        rutaId: z.string().optional(),
        descuentoId: z.string().optional(),
        soloPlantilla: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
        soloAdhoc: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
        soloPendientes: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
        fechaDesde: z.string().optional(),
        fechaHasta: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(['cliente', 'monto', 'fecha', 'estado']).optional().default('fecha'),
        sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
      }).parse(request.query);

      return await descuentosService.getAllDescuentosAplicados(
        query.page,
        query.limit,
        {
          clienteId: query.clienteId,
          rutaId: query.rutaId,
          descuentoId: query.descuentoId,
          soloPlantilla: query.soloPlantilla,
          soloAdhoc: query.soloAdhoc,
          soloPendientes: query.soloPendientes,
          fechaDesde: query.fechaDesde,
          fechaHasta: query.fechaHasta,
          search: query.search,
        },
        query.sortBy,
        query.sortDirection
      );
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener descuentos aplicados');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener descuentos aplicados' },
      });
    }
  });

  fastify.get('/descuentos-aplicados/:id', async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await descuentosService.getDescuentoAplicadoById(BigInt(id));
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      fastify.log.error(error, 'Error al obtener descuento aplicado');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener descuento aplicado' },
      });
    }
  });

  fastify.post('/descuentos-aplicados/individual', { preHandler: requirePermission('descuentos', 'create') }, async (request, reply) => {
    try {
      const data = z.object({
        clienteId: z.string().regex(/^\d+$/, 'ID de cliente inválido'),
        tipo: z.enum(['porcentaje', 'monto_fijo']),
        valor: z.number().positive('El valor debe ser mayor a 0'),
        motivo: z.string().min(1, 'Debe proporcionar un motivo'),
      }).parse(request.body);

      const result = await descuentosService.createDescuentoIndividual(data, request.user!.email!);
      return reply.code(201).send(result);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      }
      if (error.message?.includes('no encontrado')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      fastify.log.error(error, 'Error al crear descuento individual');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al crear descuento' },
      });
    }
  });

  fastify.post('/descuentos-aplicados/masivo', { preHandler: requirePermission('descuentos', 'create') }, async (request, reply) => {
    try {
      const data = z.object({
        descuentoId: z.string().regex(/^\d+$/).optional(),
        template: z.object({
          nombre: z.string().min(1, 'Nombre es requerido'),
          tipo: z.enum(['porcentaje', 'monto_fijo']),
          valor: z.number().positive('El valor debe ser mayor a 0'),
          descripcion: z.string().optional(),
        }).optional(),
        recipientFilter: z.enum(['todos', 'ruta', 'manual']),
        rutaId: z.string().regex(/^\d+$/).optional(),
        clienteIds: z.array(z.string().regex(/^\d+$/)).optional(),
      }).refine(
        (d) => d.descuentoId || d.template,
        { message: 'Debe proporcionar un descuentoId existente o datos de template' }
      ).refine(
        (d) => d.recipientFilter !== 'ruta' || d.rutaId,
        { message: 'Debe especificar una ruta cuando el filtro es "ruta"' }
      ).refine(
        (d) => d.recipientFilter !== 'manual' || (d.clienteIds && d.clienteIds.length > 0),
        { message: 'Debe seleccionar al menos un cliente cuando el filtro es "manual"' }
      ).parse(request.body);

      const result = await descuentosService.createDescuentoMasivo(data, request.user!.email!);
      return reply.code(201).send(result);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      }
      if (error.message?.includes('no encontr')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      fastify.log.error(error, 'Error al crear descuento masivo');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: error.message || 'Error al crear descuento masivo' },
      });
    }
  });

  fastify.delete('/descuentos-aplicados/:id', { preHandler: requirePermission('descuentos', 'delete') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await descuentosService.deleteDescuentoAplicado(BigInt(id), request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      if (error.message?.includes('No se puede eliminar')) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      fastify.log.error(error, 'Error al eliminar descuento aplicado');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al eliminar descuento' },
      });
    }
  });

  fastify.get('/descuentos-aplicados/rutas', async (request, reply) => {
    try {
      const rutas = await descuentosService.getAllRutas();
      return { rutas };
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener rutas');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener rutas' },
      });
    }
  });

  fastify.get('/descuentos-aplicados/preview-count', async (request, reply) => {
    try {
      const query = z.object({
        filter: z.enum(['todos', 'ruta', 'manual']),
        rutaId: z.string().optional(),
        clienteIds: z.string().optional(),
      }).parse(request.query);

      const clienteIds = query.clienteIds?.split(',').filter(Boolean);
      const count = await descuentosService.getClientCountByFilter(
        query.filter,
        query.rutaId,
        clienteIds
      );
      return { count };
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener conteo de clientes');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener conteo' },
      });
    }
  });
};

export default descuentosRoutes;

