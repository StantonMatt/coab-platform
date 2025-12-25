import { z } from 'zod';

/**
 * Schema for creating a new subsidio
 */
export const createSubsidioSchema = z.object({
  id: z.number().int().positive('El ID debe ser un número positivo'),
  limiteM3: z.number().int().positive('Límite M3 debe ser positivo'),
  porcentaje: z.number().min(0).max(100, 'El porcentaje debe estar entre 0 y 100'),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  fechaTermino: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  numeroDecreto: z.string().max(50).optional().nullable(),
  observaciones: z.string().max(500).optional().nullable(),
});

/**
 * Schema for updating an existing subsidio
 */
export const updateSubsidioSchema = z.object({
  limiteM3: z.number().int().positive().optional(),
  porcentaje: z.number().min(0).max(100).optional(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaTermino: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  numeroDecreto: z.string().max(50).optional().nullable(),
  observaciones: z.string().max(500).optional().nullable(),
  estado: z.enum(['activo', 'inactivo']).optional(),
});

/**
 * Schema for subsidio ID parameter
 */
export const subsidioIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de subsidio inválido'),
});

export type CreateSubsidioInput = z.infer<typeof createSubsidioSchema>;
export type UpdateSubsidioInput = z.infer<typeof updateSubsidioSchema>;


