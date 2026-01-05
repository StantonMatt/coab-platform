import { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import * as pdfService from '../../services/pdf.service.js';
import * as jobService from '../../services/job.service.js';
import * as boletaGenerationService from '../../services/boleta-generation.service.js';
import { requirePermission } from '../../middleware/auth.middleware.js';
import { generarPreviewSchema, importarBoletasSchema } from '../../schemas/boleta-generation.schema.js';

// Schema for batch PDF generation
const batchPDFSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo debe tener formato YYYY-MM'),
  regenerar: z.boolean().optional().default(false),
  generarZip: z.boolean().optional().default(false),
});

// Schema for boleta ID param
const boletaIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de boleta inválido'),
});

// Schema for job ID param
const jobIdParamSchema = z.object({
  id: z.string().uuid('ID de trabajo inválido'),
});

const boletasRoutes: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // BOLETA Search Endpoints
  // =========================================================================

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

  // =========================================================================
  // BOLETAS PDF Endpoints
  // =========================================================================

  /**
   * GET /admin/boletas/:id/pdf
   * Download a single boleta as PDF
   */
  fastify.get('/boletas/:id/pdf', async (request, reply) => {
    try {
      const params = boletaIdParamSchema.parse(request.params);
      const boletaId = BigInt(params.id);

      const exists = await pdfService.pdfExists(boletaId);
      if (!exists) {
        const result = await pdfService.generateAndStorePDF(boletaId);
        if (!result.success) {
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
   */
  fastify.post('/boletas/generar-pdfs', async (request, reply) => {
    try {
      const data = batchPDFSchema.parse(request.body);

      fastify.log.info(
        { periodo: data.periodo, regenerar: data.regenerar, generarZip: data.generarZip, adminEmail: request.user!.email },
        'Iniciando trabajo de generación masiva de PDFs'
      );

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

  // =========================================================================
  // JOBS Endpoints
  // =========================================================================

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

  // =========================================================================
  // BOLETA GENERATION TOOL (Herramienta)
  // =========================================================================

  /**
   * POST /admin/boletas/generar-preview
   * Preview boletas for a period without saving to database
   */
  fastify.post('/boletas/generar-preview', { preHandler: requirePermission('boletas', 'create') }, async (request, reply) => {
    try {
      const { periodo } = generarPreviewSchema.parse(request.body);
      const result = await boletaGenerationService.generateBoletasPreview(periodo);
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ 
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } 
        });
      }
      fastify.log.error(error);
      return reply.code(500).send({ 
        error: { code: 'INTERNAL_ERROR', message: error.message || 'Error al generar preview' } 
      });
    }
  });

  /**
   * POST /admin/boletas/importar
   * Import boletas for a period (save to database)
   */
  fastify.post('/boletas/importar', { preHandler: requirePermission('boletas', 'create') }, async (request, reply) => {
    try {
      const { periodo, sobreescribir } = importarBoletasSchema.parse(request.body);
      const result = await boletaGenerationService.importBoletas(periodo, { sobreescribir });
      
      if (result.errores.length > 0) {
        return reply.code(400).send({
          error: { code: 'IMPORT_ERROR', message: result.errores[0] },
          resultado: result
        });
      }
      
      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ 
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } 
        });
      }
      fastify.log.error(error);
      return reply.code(500).send({ 
        error: { code: 'INTERNAL_ERROR', message: error.message || 'Error al importar boletas' } 
      });
    }
  });
};

export default boletasRoutes;

