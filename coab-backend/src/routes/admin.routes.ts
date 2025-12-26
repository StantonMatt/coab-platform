import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import prisma from '../lib/prisma.js';
import * as adminService from '../services/admin.service.js';
import * as twilioService from '../services/twilio.service.js';
import * as autopagoService from '../services/autopago.service.js';
import * as pdfService from '../services/pdf.service.js';
import * as jobService from '../services/job.service.js';
import * as rutasService from '../services/rutas.service.js';
import * as tarifasService from '../services/tarifas.service.js';
import * as subsidiosService from '../services/subsidios.service.js';
import * as clientesService from '../services/clientes.service.js';
import * as medidoresService from '../services/medidores.service.js';
import * as lecturasService from '../services/lecturas.service.js';
import * as multasService from '../services/multas.service.js';
import * as descuentosService from '../services/descuentos.service.js';
import * as cortesService from '../services/cortes.service.js';
import * as repactacionesService from '../services/repactaciones.service.js';
import { requireAdmin, requirePermission } from '../middleware/auth.middleware.js';
import { z } from 'zod';

// Schema for batch PDF generation
const batchPDFSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo debe tener formato YYYY-MM'),
  regenerar: z.boolean().optional().default(false),
  generarZip: z.boolean().optional().default(false), // ZIP generation is optional (slow)
});

// Schema for boleta ID param
const boletaIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de boleta inválido'),
});

// Schema for job ID param
const jobIdParamSchema = z.object({
  id: z.string().uuid('ID de trabajo inválido'),
});
import { env } from '../config/env.js';
import {
  searchSchema,
  paginationSchema,
  customerIdSchema,
} from '../schemas/admin.schema.js';
import { paymentSchema } from '../schemas/payment.schema.js';
import {
  createRutaSchema,
  updateRutaSchema,
  rutaIdSchema,
} from '../schemas/rutas.schema.js';
import {
  createTarifaSchema,
  updateTarifaSchema,
  tarifaIdSchema,
} from '../schemas/tarifas.schema.js';
import {
  createSubsidioSchema,
  updateSubsidioSchema,
  subsidioIdSchema,
} from '../schemas/subsidios.schema.js';
import {
  updateClienteContactSchema,
  updateClienteFullSchema,
  updateDireccionSchema,
  clienteIdSchema as clienteIdSchemaNew,
} from '../schemas/clientes.schema.js';
import {
  createMedidorSchema,
  updateMedidorSchema,
  medidorIdSchema,
} from '../schemas/medidores.schema.js';
import {
  updateLecturaSchema,
  createCorreccionSchema,
  lecturaIdSchema,
  lecturasQuerySchema,
} from '../schemas/lecturas.schema.js';
import {
  createMultaSchema,
  updateMultaSchema,
  multaIdSchema,
} from '../schemas/multas.schema.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply admin auth middleware to all routes
  fastify.addHook('onRequest', requireAdmin);

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
   * GET /admin/clientes/buscar-boleta?q=...&periodo=YYYY-MM
   * Search for clients and boletas by RUT, numero_cliente, or name for a specific period
   * Returns up to 10 matching results
   */
  fastify.get('/clientes/buscar-boleta', async (request, reply) => {
    try {
      const query = z.object({
        q: z.string().min(1, 'Debe ingresar un término de búsqueda'),
        periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo debe tener formato YYYY-MM'),
      }).parse(request.query);

      const results = await pdfService.searchClientBoleta(query.q, query.periodo);
      
      // Return empty array instead of 404 - let frontend handle display
      return { resultados: results };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }
      fastify.log.error(error, 'Error al buscar boleta de cliente');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error al buscar boleta',
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
  // PDF Generation Endpoints
  // =========================================================================

  /**
   * GET /admin/boletas/:id/pdf
   * Download a single boleta as PDF
   */
  fastify.get('/boletas/:id/pdf', async (request, reply) => {
    try {
      const params = boletaIdParamSchema.parse(request.params);
      const boletaId = BigInt(params.id);

      // Check if PDF exists in storage
      const exists = await pdfService.pdfExists(boletaId);
      if (!exists) {
        // Generate and store the PDF
        const result = await pdfService.generateAndStorePDF(boletaId);
        if (!result.success) {
          // Fallback: generate on-the-fly
          const pdfBuffer = await pdfService.generateBoletaPDF(boletaId);
          if (!pdfBuffer) {
            return reply.code(500).send({
              error: { code: 'PDF_GENERATION_FAILED', message: 'Error al generar PDF' },
            });
          }
          return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="boleta-${params.id}.pdf"`)
            .send(pdfBuffer);
        }
      }

      // Get signed URL from storage
      const urlResult = await pdfService.getStoredPDFUrl(boletaId);
      if (urlResult.error || !urlResult.url) {
        const pdfBuffer = await pdfService.generateBoletaPDF(boletaId);
        if (!pdfBuffer) {
          return reply.code(500).send({
            error: { code: 'PDF_GENERATION_FAILED', message: 'Error al generar PDF' },
          });
        }
        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="boleta-${params.id}.pdf"`)
          .send(pdfBuffer);
      }

      return { url: urlResult.url };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al descargar boleta PDF');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al descargar boleta' },
      });
    }
  });

  /**
   * POST /admin/boletas/:id/regenerar-pdf
   * Regenerate PDF for a specific boleta
   */
  fastify.post('/boletas/:id/regenerar-pdf', async (request, reply) => {
    try {
      const params = boletaIdParamSchema.parse(request.params);
      const boletaId = BigInt(params.id);

      const result = await pdfService.regeneratePDF(boletaId);

      if (!result.success) {
        return reply.code(500).send({
          error: { code: 'PDF_GENERATION_FAILED', message: result.error },
        });
      }

      fastify.log.info(
        { boletaId: params.id, adminEmail: request.user!.email },
        'PDF regenerado'
      );

      return { success: true, path: result.path, message: 'PDF regenerado correctamente' };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al regenerar PDF');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al regenerar PDF' },
      });
    }
  });

  /**
   * GET /admin/boletas/periodo-stats
   * Get boleta counts for a specific period
   */
  fastify.get('/boletas/periodo-stats', async (request, reply) => {
    try {
      const query = z.object({
        periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo debe tener formato YYYY-MM'),
      }).parse(request.query);

      const stats = await pdfService.getPeriodStats(query.periodo);
      return stats;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener estadísticas del período');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener estadísticas' },
      });
    }
  });

  /**
   * POST /admin/boletas/generar-pdfs
   * Start async batch PDF generation job with progress tracking
   * Returns job ID immediately, processing happens in background
   */
  fastify.post('/boletas/generar-pdfs', async (request, reply) => {
    try {
      const data = batchPDFSchema.parse(request.body);

      fastify.log.info(
        { periodo: data.periodo, regenerar: data.regenerar, generarZip: data.generarZip, adminEmail: request.user!.email },
        'Iniciando trabajo de generación masiva de PDFs'
      );

      // Start async job and return job ID immediately
      const { jobId } = await pdfService.startBatchGeneration(
        data.periodo,
        data.regenerar,
        request.user!.email!,
        data.generarZip
      );

      fastify.log.info(
        { jobId, periodo: data.periodo },
        'Trabajo de generación de PDFs creado'
      );

      return {
        success: true,
        jobId,
        periodo: data.periodo,
        mensaje: 'Trabajo de generación iniciado. Use GET /admin/jobs/:id para consultar progreso.',
      };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error iniciando generación masiva de PDFs');
      return reply.code(500).send({
        error: { code: 'BATCH_GENERATION_FAILED', message: 'Error al iniciar generación de PDFs' },
      });
    }
  });

  /**
   * GET /admin/jobs/:id
   * Get job status and progress
   */
  fastify.get('/jobs/:id', async (request, reply) => {
    try {
      const params = jobIdParamSchema.parse(request.params);
      const job = await jobService.getJob(params.id);

      if (!job) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Trabajo no encontrado' },
        });
      }

      return job;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener estado del trabajo');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener estado del trabajo' },
      });
    }
  });

  /**
   * GET /admin/jobs/:id/download
   * Get signed URL for ZIP download
   */
  fastify.get('/jobs/:id/download', async (request, reply) => {
    try {
      const params = jobIdParamSchema.parse(request.params);
      const job = await jobService.getJob(params.id);

      if (!job) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Trabajo no encontrado' },
        });
      }

      if (job.estado !== 'completado') {
        return reply.code(400).send({
          error: { code: 'JOB_NOT_COMPLETE', message: 'El trabajo aún no ha terminado' },
        });
      }

      if (!job.zipPath) {
        return reply.code(404).send({
          error: { code: 'NO_ZIP', message: 'No hay archivo ZIP disponible para este trabajo' },
        });
      }

      const result = await pdfService.getZipDownloadUrl(job.zipPath);

      if (result.error || !result.url) {
        return reply.code(500).send({
          error: { code: 'DOWNLOAD_ERROR', message: result.error || 'Error al obtener enlace de descarga' },
        });
      }

      return { url: result.url, filename: `boletas_${job.periodo}.zip` };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al obtener enlace de descarga');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener enlace de descarga' },
      });
    }
  });

  /**
   * POST /admin/jobs/:id/cancel
   * Cancel a running job
   */
  fastify.post('/jobs/:id/cancel', async (request, reply) => {
    try {
      const params = jobIdParamSchema.parse(request.params);
      const cancelled = await jobService.cancelJob(params.id);

      if (!cancelled) {
        return reply.code(400).send({
          error: { code: 'CANCEL_FAILED', message: 'No se pudo cancelar el trabajo. Puede que ya haya terminado.' },
        });
      }

      fastify.log.info(
        { jobId: params.id, adminEmail: request.user!.email },
        'Trabajo de generación de PDFs cancelado'
      );

      return { success: true, mensaje: 'Trabajo cancelado' };
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message },
        });
      }
      fastify.log.error(error, 'Error al cancelar trabajo');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al cancelar trabajo' },
      });
    }
  });

  /**
   * GET /admin/jobs
   * Get recent jobs for current admin
   */
  fastify.get('/jobs', async (request, reply) => {
    try {
      const jobs = await jobService.getRecentJobs(request.user!.email!, 10);
      return { jobs };
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener trabajos recientes');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Error al obtener trabajos' },
      });
    }
  });

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

  /**
   * GET /admin/pagos
   * List all payments with filters, search, and pagination
   */
  fastify.get('/pagos', async (request, reply) => {
    try {
      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        fechaDesde: z.string().optional(),
        fechaHasta: z.string().optional(),
        tipoPago: z.string().optional(),
        estado: z.string().optional(),
        q: z.string().optional(),
        sortBy: z.enum(['fecha', 'monto', 'cliente', 'estado']).optional().default('fecha'),
        sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
      });

      const query = querySchema.parse(request.query);

      const result = await adminService.getAllPayments({
        page: query.page,
        limit: query.limit,
        fechaDesde: query.fechaDesde ? new Date(query.fechaDesde) : undefined,
        fechaHasta: query.fechaHasta ? new Date(query.fechaHasta) : undefined,
        tipoPago: query.tipoPago,
        estado: query.estado,
        search: query.q,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      });

      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Parámetros de consulta inválidos',
            details: error.errors,
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
   * POST /admin/pagos
   * Register a manual payment with FIFO boleta application
   */
  fastify.post('/pagos', async (request, reply) => {
    try {
      // Validate input with Zod
      const validatedData = paymentSchema.parse(request.body);

      const result = await adminService.registrarPago(
        validatedData,
        request.user!.email!,
        request.ip,
        request.headers['user-agent'] || 'unknown',
        fastify.log
      );

      return reply.code(201).send(result);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos de pago inválidos',
            details: error.errors,
          },
        });
      }

      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }

      fastify.log.error(error, 'Payment registration error');

      return reply.code(500).send({
        error: {
          code: 'PAYMENT_ERROR',
          message: error.message,
        },
      });
    }
  });

  /**
   * POST /admin/procesar-autopagos
   * Trigger batch processing of all pending auto-payments
   * Can be called by admin or by external cron with CRON_SECRET header
   */
  fastify.post(
    '/procesar-autopagos',
    {
      // Skip admin auth if cron secret is provided
      preHandler: async (request, reply) => {
        const cronSecret = request.headers['x-cron-secret'];

        // If valid cron secret, allow access
        if (cronSecret && env.CRON_SECRET && cronSecret === env.CRON_SECRET) {
          return;
        }

        // Otherwise, require admin auth
        await requireAdmin(request, reply);
      },
    },
    async (request, reply) => {
      try {
        fastify.log.info('Iniciando procesamiento de pagos automáticos');

        const result = await autopagoService.processAllPendingAutoPayments(
          fastify.log
        );

        fastify.log.info(
          {
            procesados: result.procesados,
            exitosos: result.exitosos,
            fallidos: result.fallidos,
            omitidos: result.omitidos,
          },
          'Procesamiento de pagos automáticos completado'
        );

        return {
          success: true,
          mensaje: `Procesados: ${result.procesados}, Exitosos: ${result.exitosos}, Fallidos: ${result.fallidos}, Omitidos: ${result.omitidos}`,
          ...result,
        };
      } catch (error: any) {
        fastify.log.error(error, 'Error procesando pagos automáticos');
        return reply.code(500).send({
          error: {
            code: 'PROCESSING_ERROR',
            message: 'Error al procesar pagos automáticos',
          },
        });
      }
    }
  );

  // =========================================================================
  // RUTAS CRUD Endpoints
  // =========================================================================

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

  // =========================================================================
  // TARIFAS CRUD Endpoints
  // =========================================================================

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
          sortBy: z.enum(['porcentaje', 'limiteM3', 'fechaInicio', 'estado']).optional().default('fechaInicio'),
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
        })
        .parse(request.query);

      const result = await subsidiosService.getSubsidioHistorial({
        page: query.page,
        limit: query.limit,
        subsidioId: query.subsidioId,
        tipoCambio: query.tipoCambio,
        search: query.search,
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
          })
          .parse(request.body);

        const result = await subsidiosService.assignSubsidioToClient(
          BigInt(body.clienteId),
          body.subsidioId,
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
        fastify.log.error(error, 'Error al asignar subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al asignar subsidio' },
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
          })
          .parse(request.body);

        const result = await subsidiosService.removeSubsidioFromClient(
          BigInt(body.clienteId),
          body.subsidioId,
          body.motivo || '',
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
        fastify.log.error(error, 'Error al remover subsidio');
        return reply.code(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Error al remover subsidio' },
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

  // =========================================================================
  // MEDIDORES CRUD Endpoints
  // =========================================================================

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
        search: query.search,
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
   * GET /admin/clientes/:id/medidores
   * Get all medidores for a specific cliente
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

  // =========================================================================
  // LECTURAS Endpoints
  // =========================================================================

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
   * GET /admin/clientes/:id/lecturas
   * Get lecturas for a cliente
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

  // =========================================================================
  // MULTAS CRUD Endpoints
  // =========================================================================

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

  fastify.get('/clientes/:id/multas', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const multas = await multasService.getMultasByCliente(BigInt(params.id));
      return { multas };
    } catch (error: any) {
      fastify.log.error(error, 'Error al obtener multas del cliente');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al obtener multas' } });
    }
  });

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
  // CORTES DE SERVICIO CRUD Endpoints
  // =========================================================================

  fastify.get('/cortes', async (request, reply) => {
    try {
      const query = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(50),
        estado: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(['cliente', 'fechaCorte', 'estado', 'fechaReposicion']).optional().default('fechaCorte'),
        sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
      }).parse(request.query);
      return await cortesService.getAllCortes(query.page, query.limit, query.estado, query.search, query.sortBy, query.sortDirection);
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al obtener cortes' } });
    }
  });

  fastify.get('/cortes/:id', async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await cortesService.getCorteById(BigInt(id));
    } catch (error: any) {
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  fastify.get('/clientes/:id/cortes', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const cortes = await cortesService.getCortesByCliente(BigInt(params.id));
      return { cortes };
    } catch (error: any) {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  fastify.get('/clientes/:id/descuentos', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const descuentos = await descuentosService.getDescuentosByCliente(BigInt(params.id));
      return { descuentos };
    } catch (error: any) {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al obtener descuentos del cliente' } });
    }
  });

  fastify.post('/cortes', { preHandler: requirePermission('cortes_servicio', 'create') }, async (request, reply) => {
    try {
      const data = z.object({ clienteId: z.string().regex(/^\d+$/), fechaCorte: z.string().optional(), motivoCorte: z.string().min(1), observaciones: z.string().optional() }).parse(request.body);
      return reply.code(201).send(await cortesService.createCorte(data, request.user!.email!));
    } catch (error: any) {
      if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error al crear corte' } });
    }
  });

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

  // =========================================================================
  // REPACTACIONES CRUD Endpoints
  // =========================================================================

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

  fastify.get('/repactaciones/:id', async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await repactacionesService.getRepactacionById(BigInt(id));
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  fastify.get('/clientes/:id/repactaciones', async (request, reply) => {
    try {
      const params = clienteIdSchemaNew.parse(request.params);
      const repactaciones = await repactacionesService.getRepactacionesByCliente(BigInt(params.id));
      return { repactaciones };
    } catch (error: any) {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  fastify.post('/repactaciones', { preHandler: requirePermission('repactaciones', 'create') }, async (request, reply) => {
    try {
      const data = z.object({
        clienteId: z.string().regex(/^\d+$/),
        montoDeudaInicial: z.number().positive(),
        totalCuotas: z.number().int().min(1).max(60),
        fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        numeroConvenio: z.string().optional(),
        observaciones: z.string().optional(),
      }).parse(request.body);
      return reply.code(201).send(await repactacionesService.createRepactacion(data, request.user!.email!));
    } catch (error: any) {
      if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } });
      if (error.message?.includes('no encontrado')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      fastify.log.error(error);
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

  fastify.patch('/repactaciones/:id', { preHandler: requirePermission('repactaciones', 'edit') }, async (request, reply) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(request.params);
      return await repactacionesService.updateRepactacion(BigInt(id), request.body, request.user!.email!);
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: error.message } });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

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

  // Solicitudes de repactación
  fastify.get('/solicitudes-repactacion', async (request, reply) => {
    try {
      const query = z.object({ page: z.coerce.number().default(1), limit: z.coerce.number().default(50), estado: z.string().optional() }).parse(request.query);
      return await repactacionesService.getAllSolicitudes(query.page, query.limit, query.estado);
    } catch (error: any) {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error' } });
    }
  });

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

export default adminRoutes;
