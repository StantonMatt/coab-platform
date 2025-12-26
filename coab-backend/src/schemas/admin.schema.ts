import { z } from 'zod';

/**
 * Search schema for customer search
 * Query is optional - if empty, returns all customers paginated
 */
export const searchSchema = z.object({
  q: z.string().max(100, 'Búsqueda muy larga').optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sortBy: z.enum(['rut', 'nombre', 'numeroCliente', 'saldo']).optional().default('nombre'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
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


