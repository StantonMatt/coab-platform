import { z } from 'zod';

/**
 * Search schema for customer search
 * Requires minimum 2 characters
 */
export const searchSchema = z.object({
  q: z
    .string()
    .min(2, 'Búsqueda debe tener al menos 2 caracteres')
    .max(100, 'Búsqueda muy larga'),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * Pagination schema for list endpoints
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * Customer ID parameter schema
 */
export const customerIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID debe ser numérico'),
});

// Type exports
export type SearchInput = z.infer<typeof searchSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type CustomerIdInput = z.infer<typeof customerIdSchema>;


