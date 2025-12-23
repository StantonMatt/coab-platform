/**
 * PDF Generation Service
 * Generates boleta PDFs using React-PDF and stores them in Supabase Storage
 * Supports parallel processing and batch operations with progress tracking
 */

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import archiver from 'archiver';
import { Readable, PassThrough } from 'stream';
import prisma from '../lib/prisma.js';
import { env } from '../config/env.js';
import { BoletaTemplate } from '../pdf/BoletaTemplate.js';
import { BoletaData, ClienteData } from '../pdf/types.js';
import { format } from 'date-fns';
import * as jobService from './job.service.js';

// Concurrency limit for parallel PDF generation
const CONCURRENCY_LIMIT = 10;

const STORAGE_BUCKET = 'boletas';

// Lazy initialization of Supabase client
let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridos para almacenamiento de PDFs');
    }
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }
  return supabaseClient;
}

/**
 * Generate QR code as data URL for payment
 */
async function generatePaymentQR(
  numeroCliente: string,
  montoTotal: number
): Promise<string> {
  // Create a payment URL or payment reference
  const paymentData = `COAB:${numeroCliente}:${montoTotal}`;
  
  try {
    const qrDataUrl = await QRCode.toDataURL(paymentData, {
      width: 200,
      margin: 1,
      color: {
        dark: '#0066CC',
        light: '#FFFFFF',
      },
    });
    return qrDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return '';
  }
}

/**
 * Fetch boleta data from database and format for PDF
 */
async function fetchBoletaData(boletaId: bigint): Promise<{
  boleta: BoletaData;
  cliente: ClienteData;
} | null> {
  const boletaRecord = await prisma.boletas.findUnique({
    where: { id: boletaId },
    include: {
      cliente: {
        include: {
          direcciones: {
            take: 1,
          },
        },
      },
    },
  });

  if (!boletaRecord || !boletaRecord.cliente) {
    return null;
  }

  const cliente = boletaRecord.cliente;
  const direccion = cliente.direcciones[0];

  // Build full name
  const nombreCompleto = [
    cliente.primer_apellido,
    cliente.segundo_apellido,
    cliente.primer_nombre,
    cliente.segundo_nombre,
  ]
    .filter(Boolean)
    .join(' ');

  // Build address
  const direccionCompleta = direccion
    ? [direccion.direccion_calle, direccion.direccion_numero, direccion.poblacion]
        .filter(Boolean)
        .join(' ')
    : 'Sin dirección';

  // Get meter readings for this period
  // For now, calculate from consumo_m3
  const consumoM3 = Number(boletaRecord.consumo_m3 || 0);
  // We'll estimate readings - in production, you'd fetch from lecturas table
  const lecturaActual = 0; // Placeholder - needs to be fetched from lecturas
  const lecturaAnterior = 0; // Placeholder - needs to be fetched from lecturas

  const boleta: BoletaData = {
    id: boletaRecord.id,
    numeroFolio: boletaRecord.numero_folio || `B-${boletaRecord.id}`,
    fechaEmision: boletaRecord.fecha_emision,
    fechaVencimiento: boletaRecord.fecha_vencimiento,
    periodoDesde: boletaRecord.periodo_desde,
    periodoHasta: boletaRecord.periodo_hasta,
    costoCargoFijo: Number(boletaRecord.costo_cargo_fijo || 0),
    costoAgua: Number(boletaRecord.costo_agua || 0),
    costoAlcantarillado: Number(boletaRecord.costo_alcantarillado || 0),
    costoTratamiento: Number(boletaRecord.costo_tratamiento || 0),
    montoTotalMes: Number(boletaRecord.monto_total_mes || 0),
    montoSaldoAnterior: Number(boletaRecord.monto_saldo_anterior || 0),
    montoRepactacion: Number(boletaRecord.monto_repactacion || 0),
    montoSubsidio: Number(boletaRecord.monto_subsidio || 0),
    montoTotal: Number(boletaRecord.monto_total || 0),
    consumoM3,
    lecturaAnterior,
    lecturaActual,
  };

  const clienteData: ClienteData = {
    id: cliente.id,
    numeroCliente: cliente.numero_cliente,
    rut: cliente.rut,
    nombreCompleto,
    direccion: direccionCompleta,
    comuna: direccion?.comuna || '',
  };

  return { boleta, cliente: clienteData };
}

/**
 * Fetch meter readings for a boleta's period
 */
async function fetchMeterReadings(
  clienteId: bigint,
  periodoDesde: Date
): Promise<{ lecturaAnterior: number; lecturaActual: number }> {
  // Get the periodo year and month
  const year = periodoDesde.getFullYear();
  const month = periodoDesde.getMonth() + 1;

  // Find the direccion and medidor for this client
  const direccion = await prisma.direcciones.findFirst({
    where: { cliente_id: clienteId },
    include: {
      medidores: {
        where: { estado: 'activo' },
        take: 1,
      },
    },
  });

  if (!direccion?.medidores[0]) {
    return { lecturaAnterior: 0, lecturaActual: 0 };
  }

  const medidorId = direccion.medidores[0].id;

  // Get current period reading
  const lecturaActualRecord = await prisma.lecturas.findFirst({
    where: {
      medidor_id: medidorId,
      periodo_ano: year,
      periodo_mes: month,
    },
  });

  // Get previous period reading
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const lecturaAnteriorRecord = await prisma.lecturas.findFirst({
    where: {
      medidor_id: medidorId,
      periodo_ano: prevYear,
      periodo_mes: prevMonth,
    },
  });

  return {
    lecturaAnterior: Number(lecturaAnteriorRecord?.valor_lectura || 0),
    lecturaActual: Number(lecturaActualRecord?.valor_lectura || 0),
  };
}

/**
 * Generate PDF buffer for a boleta
 */
export async function generateBoletaPDF(boletaId: bigint): Promise<Buffer | null> {
  const data = await fetchBoletaData(boletaId);
  if (!data) {
    console.error(`Boleta ${boletaId} not found`);
    return null;
  }

  // Fetch actual meter readings
  const readings = await fetchMeterReadings(
    data.cliente.id,
    data.boleta.periodoDesde
  );
  data.boleta.lecturaAnterior = readings.lecturaAnterior;
  data.boleta.lecturaActual = readings.lecturaActual;

  // Generate QR code
  const qrCodeDataUrl = await generatePaymentQR(
    data.cliente.numeroCliente,
    data.boleta.montoTotal
  );

  // Create React element
  const element = React.createElement(BoletaTemplate, {
    boleta: data.boleta,
    cliente: data.cliente,
    qrCodeDataUrl,
  });

  // Render to buffer
  const pdfBuffer = await renderToBuffer(element);
  
  return Buffer.from(pdfBuffer);
}

/**
 * Get storage path for a boleta PDF
 */
function getStoragePath(boleta: { periodoDesde: Date; clienteId: bigint; numeroFolio: string }): string {
  // Use UTC methods to avoid timezone issues (dates come as midnight UTC)
  const year = boleta.periodoDesde.getUTCFullYear();
  const month = String(boleta.periodoDesde.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${boleta.clienteId}_${boleta.numeroFolio}.pdf`;
}

/**
 * Generate PDF and upload to Supabase Storage
 */
export async function generateAndStorePDF(boletaId: bigint): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  try {
    // Get boleta info for path
    const boletaRecord = await prisma.boletas.findUnique({
      where: { id: boletaId },
      select: {
        periodo_desde: true,
        cliente_id: true,
        numero_folio: true,
      },
    });

    if (!boletaRecord || !boletaRecord.cliente_id) {
      return { success: false, error: 'Boleta no encontrada' };
    }

    // Generate PDF
    const pdfBuffer = await generateBoletaPDF(boletaId);
    if (!pdfBuffer) {
      return { success: false, error: 'Error al generar PDF' };
    }

    const storagePath = getStoragePath({
      periodoDesde: boletaRecord.periodo_desde,
      clienteId: boletaRecord.cliente_id,
      numeroFolio: boletaRecord.numero_folio || `B-${boletaId}`,
    });

    // Upload to Supabase Storage
    const { error: uploadError } = await getSupabase().storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true, // Overwrite if exists
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // Update boleta record with PDF path
    await prisma.boletas.update({
      where: { id: boletaId },
      data: {
        pdf_path: storagePath,
        pdf_generado_en: new Date(),
      },
    });

    return { success: true, path: storagePath };
  } catch (error: any) {
    console.error('Error generating/storing PDF:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get signed URL for a stored PDF
 */
export async function getStoredPDFUrl(boletaId: bigint): Promise<{
  url?: string;
  error?: string;
}> {
  const boletaRecord = await prisma.boletas.findUnique({
    where: { id: boletaId },
    select: {
      periodo_desde: true,
      cliente_id: true,
      numero_folio: true,
    },
  });

  if (!boletaRecord || !boletaRecord.cliente_id) {
    return { error: 'Boleta no encontrada' };
  }

  const storagePath = getStoragePath({
    periodoDesde: boletaRecord.periodo_desde,
    clienteId: boletaRecord.cliente_id,
    numeroFolio: boletaRecord.numero_folio || `B-${boletaId}`,
  });

  // Create signed URL (valid for 1 hour)
  const { data, error } = await getSupabase().storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error) {
    return { error: error.message };
  }

  return { url: data.signedUrl };
}

/**
 * Regenerate PDF (delete old and create new)
 */
export async function regeneratePDF(boletaId: bigint): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  // Simply call generateAndStorePDF which uses upsert
  return generateAndStorePDF(boletaId);
}

/**
 * Start an async batch PDF generation job
 * Returns the job ID immediately and processes in background
 */
export async function startBatchGeneration(
  periodo: string,
  regenerar: boolean,
  adminEmail: string,
  generarZip: boolean = false
): Promise<{ jobId: string }> {
  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  // Count boletas for this period
  const totalCount = await prisma.boletas.count({
    where: {
      periodo_desde: {
        gte: startDate,
        lte: endDate,
      },
      cliente_id: { not: null },
    },
  });

  // Create job
  const jobId = await jobService.createJob(periodo, regenerar, adminEmail, totalCount);

  // Start processing in background (don't await)
  processBatchJob(jobId, year, month, regenerar, generarZip).catch(error => {
    console.error(`Batch job ${jobId} failed:`, error);
    jobService.failJob(jobId, error.message);
  });

  return { jobId };
}

/**
 * Process batch PDF generation job in background
 */
async function processBatchJob(
  jobId: string,
  year: number,
  month: number,
  regenerate: boolean,
  generateZip: boolean = false
): Promise<void> {
  await jobService.startJob(jobId);

  // Use UTC dates to avoid timezone issues
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  // Build where clause - skip boletas with existing PDFs unless regenerating
  const whereClause: any = {
    periodo_desde: {
      gte: startDate,
      lte: endDate,
    },
    cliente_id: { not: null },
  };

  if (!regenerate) {
    whereClause.pdf_path = null;
  }

  const boletas = await prisma.boletas.findMany({
    where: whereClause,
    select: { id: true, numero_folio: true, cliente_id: true, periodo_desde: true },
  });

  const totalCount = await prisma.boletas.count({
    where: {
      periodo_desde: {
        gte: startDate,
        lte: endDate,
      },
      cliente_id: { not: null },
    },
  });

  const omitidos = totalCount - boletas.length;
  let procesados = 0;
  let exitosos = 0;
  let fallidos = 0;
  const errores: string[] = [];
  const generatedPaths: { path: string; boletaId: bigint; folio: string }[] = [];

  // Use p-limit for parallel processing
  const limit = pLimit(CONCURRENCY_LIMIT);

  const promises = boletas.map(boleta =>
    limit(async () => {
      // Check if job was cancelled
      if (await jobService.isJobCancelled(jobId)) {
        return;
      }

      const result = await generateAndStorePDF(boleta.id);
      procesados++;

      if (result.success && result.path) {
        exitosos++;
        generatedPaths.push({
          path: result.path,
          boletaId: boleta.id,
          folio: boleta.numero_folio || `B-${boleta.id}`,
        });
      } else {
        fallidos++;
        errores.push(`Boleta ${boleta.numero_folio || boleta.id}: ${result.error}`);
      }

      // Update progress every 5 PDFs or on last one
      if (procesados % 5 === 0 || procesados === boletas.length) {
        await jobService.updateProgress(jobId, procesados, exitosos, fallidos, omitidos, errores);
      }
    })
  );

  await Promise.all(promises);

  // Check if cancelled
  if (await jobService.isJobCancelled(jobId)) {
    return;
  }

  // Generate ZIP file with all PDFs (only if requested)
  let zipPath: string | null = null;
  if (generateZip && exitosos > 0) {
    try {
      zipPath = await generateBatchZip(year, month, generatedPaths);
    } catch (error: any) {
      console.error('Error generating ZIP:', error);
      errores.push(`Error al generar ZIP: ${error.message}`);
    }
  }

  // Update final progress
  await jobService.updateProgress(jobId, procesados, exitosos, fallidos, omitidos, errores);
  await jobService.completeJob(jobId, zipPath);
}

/**
 * Generate ZIP file containing all PDFs for a batch
 */
async function generateBatchZip(
  year: number,
  month: number,
  pdfPaths: { path: string; boletaId: bigint; folio: string }[]
): Promise<string> {
  const monthStr = String(month).padStart(2, '0');
  const zipFileName = `boletas_${year}-${monthStr}.zip`;
  const zipPath = `exports/${year}/${monthStr}/${zipFileName}`;

  // Create archive
  const archive = archiver('zip', { zlib: { level: 5 } });
  const chunks: Buffer[] = [];

  // Collect chunks
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  // Download each PDF and add to archive
  for (const pdf of pdfPaths) {
    try {
      const { data, error } = await getSupabase().storage
        .from(STORAGE_BUCKET)
        .download(pdf.path);

      if (!error && data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        archive.append(buffer, { name: `${pdf.folio}.pdf` });
      }
    } catch (error) {
      console.error(`Error adding PDF ${pdf.path} to ZIP:`, error);
    }
  }

  // Finalize archive
  await archive.finalize();

  // Combine all chunks
  const zipBuffer = Buffer.concat(chunks);

  // Upload ZIP to Supabase Storage
  const { error: uploadError } = await getSupabase().storage
    .from(STORAGE_BUCKET)
    .upload(zipPath, zipBuffer, {
      contentType: 'application/zip',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Error uploading ZIP: ${uploadError.message}`);
  }

  return zipPath;
}

/**
 * Get signed URL for downloading a ZIP file
 */
export async function getZipDownloadUrl(zipPath: string): Promise<{
  url?: string;
  error?: string;
}> {
  const { data, error } = await getSupabase().storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(zipPath, 3600); // 1 hour expiry

  if (error) {
    return { error: error.message };
  }

  return { url: data.signedUrl };
}

/**
 * Batch generate PDFs for a period (synchronous - for backwards compatibility)
 * Use startBatchGeneration for async processing with progress tracking
 */
export async function batchGeneratePDFs(
  year: number,
  month: number,
  regenerate: boolean = false
): Promise<{
  total: number;
  generated: number;
  failed: number;
  skipped: number;
  errors: string[];
}> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const whereClause: any = {
    periodo_desde: {
      gte: startDate,
      lte: endDate,
    },
    cliente_id: { not: null },
  };

  if (!regenerate) {
    whereClause.pdf_path = null;
  }

  const boletas = await prisma.boletas.findMany({
    where: whereClause,
    select: { id: true },
  });

  const totalCount = await prisma.boletas.count({
    where: {
      periodo_desde: {
        gte: startDate,
        lte: endDate,
      },
      cliente_id: { not: null },
    },
  });

  const result = {
    total: totalCount,
    generated: 0,
    failed: 0,
    skipped: totalCount - boletas.length,
    errors: [] as string[],
  };

  // Use p-limit for parallel processing
  const limit = pLimit(CONCURRENCY_LIMIT);

  const promises = boletas.map(boleta =>
    limit(async () => {
      const genResult = await generateAndStorePDF(boleta.id);
      if (genResult.success) {
        result.generated++;
      } else {
        result.failed++;
        result.errors.push(`Boleta ${boleta.id}: ${genResult.error}`);
      }
    })
  );

  await Promise.all(promises);

  return result;
}

/**
 * Check if PDF exists in storage
 */
export async function pdfExists(boletaId: bigint): Promise<boolean> {
  const boletaRecord = await prisma.boletas.findUnique({
    where: { id: boletaId },
    select: {
      periodo_desde: true,
      cliente_id: true,
      numero_folio: true,
    },
  });

  if (!boletaRecord || !boletaRecord.cliente_id) {
    return false;
  }

  const storagePath = getStoragePath({
    periodoDesde: boletaRecord.periodo_desde,
    clienteId: boletaRecord.cliente_id,
    numeroFolio: boletaRecord.numero_folio || `B-${boletaId}`,
  });

  const { data } = await getSupabase().storage.from(STORAGE_BUCKET).list(
    storagePath.split('/').slice(0, -1).join('/'),
    { search: storagePath.split('/').pop() }
  );

  return (data?.length || 0) > 0;
}

/**
 * Get statistics for a period (boleta counts, PDF counts)
 */
export async function getPeriodStats(periodo: string): Promise<{
  total: number;
  conPdf: number;
  sinPdf: number;
  periodo: string;
  periodoLabel: string;
}> {
  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  const [total, conPdf] = await Promise.all([
    prisma.boletas.count({
      where: {
        periodo_desde: {
          gte: startDate,
          lte: endDate,
        },
        cliente_id: { not: null },
      },
    }),
    prisma.boletas.count({
      where: {
        periodo_desde: {
          gte: startDate,
          lte: endDate,
        },
        cliente_id: { not: null },
        pdf_path: { not: null },
      },
    }),
  ]);

  // Format month name in Spanish
  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const periodoLabel = `${monthNames[month - 1]} ${year}`;

  return {
    total,
    conPdf,
    sinPdf: total - conPdf,
    periodo,
    periodoLabel,
  };
}

