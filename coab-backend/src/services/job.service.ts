/**
 * Job Service for PDF batch generation job management
 * Tracks progress, status, and results of batch PDF generation jobs
 */

import prisma from '../lib/prisma.js';

export interface JobStatus {
  id: string;
  periodo: string;
  estado: 'pendiente' | 'procesando' | 'completado' | 'error' | 'cancelado';
  total: number;
  procesados: number;
  exitosos: number;
  fallidos: number;
  omitidos: number;
  regenerar: boolean;
  zipPath: string | null;
  errores: string[];
  iniciadoEn: Date;
  completadoEn: Date | null;
  adminEmail: string | null;
  porcentaje: number;
  tiempoEstimado: number | null; // seconds remaining
}

/**
 * Create a new batch PDF generation job
 */
export async function createJob(
  periodo: string,
  regenerar: boolean,
  adminEmail: string,
  total: number
): Promise<string> {
  const job = await prisma.trabajos_pdf.create({
    data: {
      periodo,
      regenerar,
      admin_email: adminEmail,
      total,
      estado: 'pendiente',
      errores: [],
    },
  });

  return job.id;
}

/**
 * Start processing a job (change status to 'procesando')
 */
export async function startJob(jobId: string): Promise<void> {
  await prisma.trabajos_pdf.update({
    where: { id: jobId },
    data: {
      estado: 'procesando',
      iniciado_en: new Date(),
    },
  });
}

/**
 * Update job progress during processing
 */
export async function updateProgress(
  jobId: string,
  procesados: number,
  exitosos: number,
  fallidos: number,
  omitidos: number,
  errores: string[]
): Promise<void> {
  await prisma.trabajos_pdf.update({
    where: { id: jobId },
    data: {
      procesados,
      exitosos,
      fallidos,
      omitidos,
      errores,
    },
  });
}

/**
 * Mark job as complete with optional ZIP path
 */
export async function completeJob(
  jobId: string,
  zipPath: string | null
): Promise<void> {
  await prisma.trabajos_pdf.update({
    where: { id: jobId },
    data: {
      estado: 'completado',
      zip_path: zipPath,
      completado_en: new Date(),
    },
  });
}

/**
 * Mark job as failed with error message
 */
export async function failJob(jobId: string, error: string): Promise<void> {
  const job = await prisma.trabajos_pdf.findUnique({
    where: { id: jobId },
    select: { errores: true },
  });

  const errores = Array.isArray(job?.errores) ? [...(job.errores as string[]), error] : [error];

  await prisma.trabajos_pdf.update({
    where: { id: jobId },
    data: {
      estado: 'error',
      errores,
      completado_en: new Date(),
    },
  });
}

/**
 * Cancel a running job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await prisma.trabajos_pdf.findUnique({
    where: { id: jobId },
    select: { estado: true },
  });

  if (!job || job.estado === 'completado' || job.estado === 'error') {
    return false;
  }

  await prisma.trabajos_pdf.update({
    where: { id: jobId },
    data: {
      estado: 'cancelado',
      completado_en: new Date(),
    },
  });

  return true;
}

/**
 * Get job status and progress
 */
export async function getJob(jobId: string): Promise<JobStatus | null> {
  const job = await prisma.trabajos_pdf.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return null;
  }

  // Calculate percentage
  const porcentaje = job.total > 0 
    ? Math.round((job.procesados / job.total) * 100) 
    : 0;

  // Estimate time remaining based on processing rate
  let tiempoEstimado: number | null = null;
  if (job.estado === 'procesando' && job.procesados > 0) {
    const elapsedMs = Date.now() - job.iniciado_en.getTime();
    const ratePerMs = job.procesados / elapsedMs;
    const remaining = job.total - job.procesados;
    if (ratePerMs > 0) {
      tiempoEstimado = Math.round((remaining / ratePerMs) / 1000); // seconds
    }
  }

  return {
    id: job.id,
    periodo: job.periodo,
    estado: job.estado as JobStatus['estado'],
    total: job.total,
    procesados: job.procesados,
    exitosos: job.exitosos,
    fallidos: job.fallidos,
    omitidos: job.omitidos,
    regenerar: job.regenerar,
    zipPath: job.zip_path,
    errores: Array.isArray(job.errores) ? (job.errores as string[]) : [],
    iniciadoEn: job.iniciado_en,
    completadoEn: job.completado_en,
    adminEmail: job.admin_email,
    porcentaje,
    tiempoEstimado,
  };
}

/**
 * Get recent jobs for a specific admin
 */
export async function getRecentJobs(adminEmail: string, limit: number = 10): Promise<JobStatus[]> {
  const jobs = await prisma.trabajos_pdf.findMany({
    where: { admin_email: adminEmail },
    orderBy: { iniciado_en: 'desc' },
    take: limit,
  });

  return jobs.map(job => ({
    id: job.id,
    periodo: job.periodo,
    estado: job.estado as JobStatus['estado'],
    total: job.total,
    procesados: job.procesados,
    exitosos: job.exitosos,
    fallidos: job.fallidos,
    omitidos: job.omitidos,
    regenerar: job.regenerar,
    zipPath: job.zip_path,
    errores: Array.isArray(job.errores) ? (job.errores as string[]) : [],
    iniciadoEn: job.iniciado_en,
    completadoEn: job.completado_en,
    adminEmail: job.admin_email,
    porcentaje: job.total > 0 ? Math.round((job.procesados / job.total) * 100) : 0,
    tiempoEstimado: null,
  }));
}

/**
 * Check if a job is cancelled
 */
export async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.trabajos_pdf.findUnique({
    where: { id: jobId },
    select: { estado: true },
  });

  return job?.estado === 'cancelado';
}

/**
 * Clean up old jobs and ZIP files (older than 7 days)
 */
export async function cleanupOldJobs(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  const result = await prisma.trabajos_pdf.deleteMany({
    where: {
      completado_en: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}




