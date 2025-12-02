import { z } from 'zod';

/**
 * Pagination query parameters schema
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * Boleta ID parameter schema
 */
export const boletaIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID debe ser numérico'),
});

// Type exports
export type PaginationQuery = z.infer<typeof paginationSchema>;
export type BoletaIdParams = z.infer<typeof boletaIdSchema>;

