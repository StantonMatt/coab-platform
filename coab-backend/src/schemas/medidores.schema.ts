import { z } from 'zod';

/**
 * Schema for creating a new medidor
 */
export const createMedidorSchema = z.object({
  direccionId: z.string().regex(/^\d+$/, 'ID de dirección inválido'),
  numeroSerie: z.string().max(50, 'Máximo 50 caracteres').optional().nullable(),
  marca: z.string().max(100, 'Máximo 100 caracteres').optional().nullable(),
  modelo: z.string().max(100, 'Máximo 100 caracteres').optional().nullable(),
  fechaInstalacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional().nullable(),
  lecturaInicial: z.number().int().min(0, 'Lectura inicial debe ser >= 0').default(0),
  mostrarEnRuta: z.boolean().default(true),
});

/**
 * Schema for updating an existing medidor
 */
export const updateMedidorSchema = z.object({
  numeroSerie: z.string().max(50).optional().nullable(),
  marca: z.string().max(100).optional().nullable(),
  modelo: z.string().max(100).optional().nullable(),
  fechaInstalacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fechaRetiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  estado: z.enum(['activo', 'inactivo', 'retirado']).optional(),
  mostrarEnRuta: z.boolean().optional(),
  lecturaInicial: z.number().int().min(0).optional(),
});

/**
 * Schema for medidor ID parameter
 */
export const medidorIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de medidor inválido'),
});

export type CreateMedidorInput = z.infer<typeof createMedidorSchema>;
export type UpdateMedidorInput = z.infer<typeof updateMedidorSchema>;


