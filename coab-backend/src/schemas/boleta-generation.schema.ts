import { z } from 'zod';

/**
 * Schema for boleta generation preview request
 */
export const generarPreviewSchema = z.object({
  periodo: z.string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El período debe tener formato YYYY-MM')
    .describe('Período en formato YYYY-MM (ej: 2025-01)')
});

export type GenerarPreviewRequest = z.infer<typeof generarPreviewSchema>;

/**
 * Schema for boleta import request
 */
export const importarBoletasSchema = z.object({
  periodo: z.string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El período debe tener formato YYYY-MM')
    .describe('Período en formato YYYY-MM (ej: 2025-01)'),
  sobreescribir: z.boolean()
    .optional()
    .default(false)
    .describe('Si es true, elimina boletas existentes antes de importar')
});

export type ImportarBoletasRequest = z.infer<typeof importarBoletasSchema>;

/**
 * Schema for a single boleta preview item (response)
 */
export const boletaPreviewSchema = z.object({
  clienteId: z.string(),
  numeroCliente: z.string(),
  nombreCliente: z.string(),
  rutCliente: z.string().nullable(),
  consumoM3: z.number(),
  cargoFijo: z.number(),
  costoAgua: z.number(),
  costoAlcantarillado: z.number(),
  costoTratamiento: z.number(),
  subtotal: z.number(),
  montoDescuento: z.number(),
  montoSubsidio: z.number(),
  montoTotalMes: z.number(),
  saldoAnterior: z.number(),
  montoRepactacion: z.number(),
  montoOtrosCargos: z.number(),
  montoNeto: z.number(),
  montoIva: z.number(),
  montoTotal: z.number(),
  numeroFolio: z.string(),
  tieneDescuento: z.boolean(),
  tieneSubsidio: z.boolean(),
  tieneRepactacion: z.boolean(),
  tieneMultas: z.boolean(),
  observaciones: z.string()
});

/**
 * Schema for preview summary (response)
 */
export const previewSummarySchema = z.object({
  totalBoletas: z.number(),
  totalMonto: z.number(),
  conDescuento: z.number(),
  conSubsidio: z.number(),
  conRepactacion: z.number(),
  conMultas: z.number(),
  montoTotalDescuentos: z.number(),
  montoTotalSubsidios: z.number()
});

/**
 * Schema for preview response
 */
export const previewResponseSchema = z.object({
  periodo: z.string(),
  periodoLabel: z.string(),
  boletas: z.array(boletaPreviewSchema),
  summary: previewSummarySchema,
  boletasExistentes: z.number(),
  folioInicial: z.number()
});

/**
 * Schema for import result response
 */
export const importResultSchema = z.object({
  periodo: z.string(),
  boletasCreadas: z.number(),
  boletasActualizadas: z.number(),
  notasCredito: z.number(),
  multas: z.number(),
  descuentos: z.number(),
  reposiciones: z.number(),
  errores: z.array(z.string())
});

