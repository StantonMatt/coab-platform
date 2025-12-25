import { z } from 'zod';

/**
 * Schema for creating a new ruta
 */
export const createRutaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  descripcion: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

/**
 * Schema for updating an existing ruta
 */
export const updateRutaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres').optional(),
  descripcion: z.string().max(500, 'Máximo 500 caracteres').nullable().optional(),
});

/**
 * Schema for ruta ID parameter
 */
export const rutaIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de ruta inválido'),
});

export type CreateRutaInput = z.infer<typeof createRutaSchema>;
export type UpdateRutaInput = z.infer<typeof updateRutaSchema>;


