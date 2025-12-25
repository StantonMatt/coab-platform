import { z } from 'zod';

/**
 * Schema for updating a lectura before boleta generation
 */
export const updateLecturaSchema = z.object({
  valorLectura: z.number().min(0, 'Lectura debe ser >= 0'),
  observaciones: z.string().max(500).optional().nullable(),
});

/**
 * Schema for creating a correction after boleta
 */
export const createCorreccionSchema = z.object({
  valorCorregido: z.number().min(0, 'Lectura debe ser >= 0'),
  motivoCorreccion: z.string().min(1, 'Motivo es requerido').max(500),
});

/**
 * Schema for lectura ID parameter
 */
export const lecturaIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de lectura inválido'),
});

/**
 * Schema for query parameters
 */
export const lecturasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  medidorId: z.string().optional(),
  clienteId: z.string().optional(),
  periodoAno: z.coerce.number().int().min(2000).max(2100).optional(),
  periodoMes: z.coerce.number().int().min(1).max(12).optional(),
  conCorreccion: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['periodo', 'numeroCliente', 'nombreCliente', 'lectura', 'estado']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export type UpdateLecturaInput = z.infer<typeof updateLecturaSchema>;
export type CreateCorreccionInput = z.infer<typeof createCorreccionSchema>;


