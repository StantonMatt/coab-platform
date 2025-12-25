import { z } from 'zod';

/**
 * Schema for creating a new tarifa
 */
export const createTarifaSchema = z.object({
  costoDespacho: z.number().min(0, 'Debe ser mayor o igual a 0'),
  costoReposicion1: z.number().min(0, 'Debe ser mayor o igual a 0'),
  costoReposicion2: z.number().min(0, 'Debe ser mayor o igual a 0'),
  costoM3Agua: z.number().min(0, 'Debe ser mayor o igual a 0'),
  costoM3AlcantarilladoTratamiento: z.number().min(0).optional().nullable(),
  cargoFijo: z.number().min(0, 'Debe ser mayor o igual a 0'),
  tasaIva: z.number().min(0).max(1, 'La tasa IVA debe estar entre 0 y 1'),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional().nullable(),
  tasaInteresMensual: z.number().min(0).max(0.5).optional().default(0),
  diasGraciaInteres: z.number().int().min(0).optional().default(30),
});

/**
 * Schema for updating an existing tarifa
 */
export const updateTarifaSchema = z.object({
  costoDespacho: z.number().min(0).optional(),
  costoReposicion1: z.number().min(0).optional(),
  costoReposicion2: z.number().min(0).optional(),
  costoM3Agua: z.number().min(0).optional(),
  costoM3AlcantarilladoTratamiento: z.number().min(0).optional().nullable(),
  cargoFijo: z.number().min(0).optional(),
  tasaIva: z.number().min(0).max(1).optional(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  tasaInteresMensual: z.number().min(0).max(0.5).optional(),
  diasGraciaInteres: z.number().int().min(0).optional(),
});

/**
 * Schema for tarifa ID parameter
 */
export const tarifaIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de tarifa inválido'),
});

export type CreateTarifaInput = z.infer<typeof createTarifaSchema>;
export type UpdateTarifaInput = z.infer<typeof updateTarifaSchema>;


