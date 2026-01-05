import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import prisma from '../../lib/prisma.js';
import * as adminService from '../../services/admin.service.js';
import * as twilioService from '../../services/twilio.service.js';
import * as clientesService from '../../services/clientes.service.js';
import * as medidoresService from '../../services/medidores.service.js';
import * as lecturasService from '../../services/lecturas.service.js';
import * as multasService from '../../services/multas.service.js';
import * as descuentosService from '../../services/descuentos.service.js';
import * as cortesService from '../../services/cortes.service.js';
import * as repactacionesService from '../../services/repactaciones.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';
import {
  searchSchema,
  paginationSchema,
  customerIdSchema,
} from '../../schemas/admin.schema.js';
import {
  updateClienteContactSchema,
  updateClienteFullSchema,
  updateDireccionSchema,
  clienteIdSchema as clienteIdSchemaNew,
} from '../../schemas/clientes.schema.js';

const clientesRoutes: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // CLIENTES Search and List Endpoints
  // =========================================================================

  /**
   * GET /admin/clientes?q=...&page=1&limit=20
   * Search customers by RUT, name, or address
   * If q is empty, returns all current customers paginated
   */
  fastify.get('/clientes', async (request, reply) => {
    try {
      const query = searchSchema.parse(request.query);
      const result = await adminService.searchCustomers(
        query.q,
        query.page,
        query.limit,
        query.cursor,
        query.sortBy,
        query.sortDirection
      );
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }
      fastify.log.error(error, 'Error al buscar clientes');
      return reply.code(500).send({
        error: {
          code: 'SEARCH_FAILED',
          message: 'Error al buscar clientes',
        },
      });
    }
  });

  /**
   * GET /admin/clientes/:id
   * Get customer profile for admin view
   */
  fastify.get('/clientes/:id', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);
      const customer = await adminService.getCustomerProfile(BigInt(params.id));
      return customer;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }

      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      fastify.log.error(error, 'Error al obtener cliente');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al obtener cliente',
        },
      });
    }
  });

  /**
   * GET /admin/clientes/:id/pagos
   * Get customer payment history
   */
  fastify.get('/clientes/:id/pagos', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);
      const query = paginationSchema.parse(request.query);

      const result = await adminService.getCustomerPayments(
        BigInt(params.id),
        query.limit,
        query.cursor
      );
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
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
   * GET /admin/clientes/:id/boletas
   * Get customer boletas
   */
  fastify.get('/clientes/:id/boletas', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);
      const query = paginationSchema.parse(request.query);

      const result = await adminService.getCustomerBoletas(
        BigInt(params.id),
        query.limit,
        query.cursor
      );
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }
      fastify.log.error(error, 'Error al obtener boletas');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al obtener boletas',
        },
      });
    }
  });

  // =========================================================================
  // CLIENTES Account Actions
  // =========================================================================

  /**
   * POST /admin/clientes/:id/desbloquear
   * Unlock a customer account
   */
  fastify.post('/clientes/:id/desbloquear', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);

      const result = await adminService.unlockCustomerAccount(
        BigInt(params.id),
        request.user!.email!
      );

      fastify.log.info(
        { clienteId: params.id, adminEmail: request.user!.email },
        'Cuenta de cliente desbloqueada'
      );

      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }

      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
        });
      }

      fastify.log.error(error, 'Error al desbloquear cuenta');
      return reply.code(500).send({
        error: {
          code: 'UNLOCK_FAILED',
          message: 'Error al desbloquear cuenta',
        },
      });
    }
  });

  /**
   * POST /admin/clientes/:id/generar-setup
   * Generate a password setup token for a customer
   * Rate limited: 3 per customer per hour
   */
  fastify.post(
    '/clientes/:id/generar-setup',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
          keyGenerator: (req: any) => `setup-${(req.params as any).id}`,
        },
      },
    },
    async (request, reply) => {
      try {
        const params = customerIdSchema.parse(request.params);

        const result = await adminService.generateSetupToken(
          BigInt(params.id),
          request.user!.email!,
          request.ip
        );

        fastify.log.info(
          { clienteId: params.id, adminEmail: request.user!.email },
          'Token de configuración generado'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
            },
          });
        }

        if (error.message === 'Cliente no encontrado') {
          return reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: error.message,
            },
          });
        }

        fastify.log.error(error, 'Error al generar token de configuración');
        return reply.code(500).send({
          error: {
            code: 'TOKEN_GENERATION_FAILED',
            message: 'Error al generar enlace de configuración',
          },
        });
      }
    }
  );

  /**
   * POST /admin/clientes/:id/enviar-setup
   * Generate a password setup token AND send via WhatsApp
   * Rate limited: 3 per customer per hour
   */
  fastify.post(
    '/clientes/:id/enviar-setup',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
          keyGenerator: (req: any) => `enviar-setup-${(req.params as any).id}`,
        },
      },
    },
    async (request, reply) => {
      try {
        const params = customerIdSchema.parse(request.params);
        const clienteId = BigInt(params.id);

        // 1. Generate setup token
        const tokenResult = await adminService.generateSetupToken(
          clienteId,
          request.user!.email!,
          request.ip
        );

        // 2. Check if customer has phone number
        if (!tokenResult.cliente.telefono) {
          return reply.code(400).send({
            error: {
              code: 'NO_PHONE',
              message: 'Cliente no tiene teléfono registrado',
              setupUrl: tokenResult.setupUrl, // Still return URL for manual sharing
            },
          });
        }

        // 3. Send via WhatsApp
        const whatsappResult = await twilioService.sendSetupLinkViaWhatsApp(
          clienteId,
          tokenResult.setupUrl,
          tokenResult.cliente.nombre,
          tokenResult.cliente.telefono,
          fastify.log
        );

        fastify.log.info(
          {
            clienteId: params.id,
            adminEmail: request.user!.email,
            whatsappSuccess: whatsappResult.success,
          },
          'Enlace de configuración enviado'
        );

        return {
          ...tokenResult,
          whatsapp: whatsappResult,
        };
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
            },
          });
        }

        if (error.message === 'Cliente no encontrado') {
          return reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: error.message,
            },
          });
        }

        fastify.log.error(error, 'Error al enviar enlace de configuración');
        return reply.code(500).send({
          error: {
            code: 'SEND_SETUP_FAILED',
            message: 'Error al enviar enlace de configuración',
          },
        });
      }
    }
  );

  // =========================================================================
  // CLIENTES Edit Endpoints
  // =========================================================================

  /**
   * GET /admin/clientes/:id/editar
   * Get client data for editing
   */
  fastify.get('/clientes/:id/editar', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const cliente = await clientesService.getClienteForEdit(BigInt(params.id));
      return cliente;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      fastify.log.error(error, 'Error al obtener cliente para editar');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener cliente' },
      });
    }
  });

  /**
   * PATCH /admin/clientes/:id/contacto
   * Update client contact info only (billing_clerk and above)
   */
  fastify.patch(
    '/clientes/:id/contacto',
    { preHandler: requirePermission('clientes', 'edit_contact') },
    async (request, reply) => {
      try {
        const params = clienteIdSchemaNew.parse(request.params);
        const data = updateClienteContactSchema.parse(request.body);
        const result = await clientesService.updateClienteContact(
          BigInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { clienteId: params.id, adminEmail: request.user!.email },
          'Contacto de cliente actualizado'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Cliente no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar contacto del cliente');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar contacto' },
        });
      }
    }
  );

  /**
   * PATCH /admin/clientes/:id
   * Update full client info (supervisor and above)
   */
  fastify.patch(
    '/clientes/:id',
    { preHandler: requirePermission('clientes', 'edit_all') },
    async (request, reply) => {
      try {
        const params = clienteIdSchemaNew.parse(request.params);
        const data = updateClienteFullSchema.parse(request.body);
        const result = await clientesService.updateClienteFull(
          BigInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { clienteId: params.id, adminEmail: request.user!.email },
          'Cliente actualizado'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Cliente no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message === 'RUT inválido') {
          return reply.code(400).send({
            error: { code: 'INVALID_RUT', message: error.message },
          });
        }
        if (error.message.includes('Ya existe')) {
          return reply.code(409).send({
            error: { code: 'DUPLICATE', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar cliente');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar cliente' },
        });
      }
    }
  );

  /**
   * PATCH /admin/clientes/:id/direccion
   * Update client address (billing_clerk and above)
   */
  fastify.patch(
    '/clientes/:id/direccion',
    { preHandler: requirePermission('clientes', 'edit_contact') },
    async (request, reply) => {
      try {
        const params = clienteIdSchemaNew.parse(request.params);
        const data = updateDireccionSchema.parse(request.body);
        const result = await clientesService.updateClienteDireccion(
          BigInt(params.id),
          data,
          request.user!.email!
        );

        fastify.log.info(
          { clienteId: params.id, adminEmail: request.user!.email },
          'Dirección de cliente actualizada'
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
          });
        }
        if (error.message === 'Cliente no encontrado') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        fastify.log.error(error, 'Error al actualizar dirección');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al actualizar dirección' },
        });
      }
    }
  );

  // =========================================================================
  // CLIENTES Related Data Endpoints
  // =========================================================================

  /**
   * GET /admin/clientes/:id/medidores
   * Get meters for a customer
   */
  fastify.get('/clientes/:id/medidores', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const medidores = await medidoresService.getMedidoresByCliente(BigInt(params.id));
      return { medidores };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener medidores del cliente');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener medidores' },
      });
    }
  });

  /**
   * GET /admin/clientes/:id/lecturas
   * Get readings for a customer
   */
  fastify.get('/clientes/:id/lecturas', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const lecturas = await lecturasService.getLecturasByCliente(BigInt(params.id));
      return { lecturas };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener lecturas del cliente');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener lecturas' },
      });
    }
  });

  /**
   * GET /admin/clientes/:id/multas
   * Get fines for a customer
   */
  fastify.get('/clientes/:id/multas', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const multas = await multasService.getMultasByCliente(BigInt(params.id));
      return { multas };
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener multas del cliente');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener multas' },
      });
    }
  });

  /**
   * GET /admin/clientes/:id/cortes
   * Get service cuts for a customer
   */
  fastify.get('/clientes/:id/cortes', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const cortes = await cortesService.getCortesByCliente(BigInt(params.id));
      return { cortes };
    } catch (error: any) {
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener cortes' },
      });
    }
  });

  /**
   * GET /admin/clientes/:id/descuentos
   * Get discounts for a customer
   */
  fastify.get('/clientes/:id/descuentos', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const descuentos = await descuentosService.getDescuentosByCliente(BigInt(params.id));
      return { descuentos };
    } catch (error: any) {
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener descuentos del cliente' },
      });
    }
  });

  /**
   * GET /admin/clientes/:id/repactaciones
   * Get repactaciones for a customer
   */
  fastify.get('/clientes/:id/repactaciones', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const repactaciones = await repactacionesService.getRepactacionesByCliente(BigInt(params.id));
      return { repactaciones };
    } catch (error: any) {
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener repactaciones' },
      });
    }
  });

  // =========================================================================
  // DIRECCIONES Search Endpoint
  // =========================================================================

  /**
   * GET /admin/direcciones/search
   * Search direcciones by address, cliente name, or numero_cliente
   */
  fastify.get('/direcciones/search', async (request, reply) => {
    try {
      const query = z
        .object({
          q: z.string().min(2).max(100),
          limit: z.coerce.number().int().min(1).max(50).default(10),
        })
        .parse(request.query);

      const direcciones = await prisma.direcciones.findMany({
        where: {
          OR: [
            { direccion_calle: { contains: query.q, mode: 'insensitive' } },
            { poblacion: { contains: query.q, mode: 'insensitive' } },
            { cliente: { numero_cliente: { contains: query.q, mode: 'insensitive' } } },
            { cliente: { primer_nombre: { contains: query.q, mode: 'insensitive' } } },
            { cliente: { primer_apellido: { contains: query.q, mode: 'insensitive' } } },
          ],
        },
        take: query.limit,
        include: {
          cliente: {
            select: {
              id: true,
              numero_cliente: true,
              primer_nombre: true,
              primer_apellido: true,
            },
          },
          ruta: {
            select: { nombre: true },
          },
        },
        orderBy: { direccion_calle: 'asc' },
      });

      return {
        direcciones: direcciones.map((d) => ({
          id: d.id.toString(),
          direccion: `${d.direccion_calle} ${d.direccion_numero || ''}`.trim(),
          poblacion: d.poblacion,
          clienteId: d.cliente_id.toString(),
          clienteNombre: d.cliente
            ? `${d.cliente.primer_nombre} ${d.cliente.primer_apellido}`
            : null,
          clienteNumero: d.cliente?.numero_cliente || null,
          rutaNombre: d.ruta?.nombre || null,
        })),
      };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al buscar direcciones');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al buscar direcciones' },
      });
    }
  });
};

export default clientesRoutes;

