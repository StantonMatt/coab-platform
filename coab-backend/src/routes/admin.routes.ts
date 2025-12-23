import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import * as adminService from '../services/admin.service.js';
import * as twilioService from '../services/twilio.service.js';
import * as autopagoService from '../services/autopago.service.js';
import * as pdfService from '../services/pdf.service.js';
import * as jobService from '../services/job.service.js';
import { requireAdmin } from '../middleware/auth.middleware.js';
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

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply admin auth middleware to all routes
  fastify.addHook('onRequest', requireAdmin);

  /**
   * GET /admin/clientes?q=...
   * Search customers by RUT, name, or address
   */
  fastify.get('/clientes', async (request, reply) => {
    try {
      const query = searchSchema.parse(request.query);
      const result = await adminService.searchCustomers(
        query.q,
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
};

export default adminRoutes;
