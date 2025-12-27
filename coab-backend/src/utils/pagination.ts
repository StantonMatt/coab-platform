/**
 * Utilidades centralizadas para paginación en el backend
 * Estandariza parámetros y respuestas de paginación en todos los servicios
 */

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Convierte opciones de paginación a parámetros de Prisma
 */
export function buildPaginationParams(options: PaginationOptions) {
  return {
    skip: (options.page - 1) * options.limit,
    take: options.limit,
  };
}

/**
 * Construye una respuesta paginada estandarizada
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  options: PaginationOptions
): PaginatedResult<T> {
  return {
    data,
    pagination: {
      total,
      page: options.page,
      limit: options.limit,
      totalPages: Math.ceil(total / options.limit),
    },
  };
}

/**
 * Construye el objeto orderBy para Prisma basado en sortBy y sortDirection
 * Soporta ordenamiento anidado usando notación de punto (e.g., "cliente.numero_cliente")
 */
export function buildOrderBy(
  sortBy: string | undefined,
  sortDirection: 'asc' | 'desc' = 'desc',
  defaultOrderBy: Record<string, 'asc' | 'desc'> = { id: 'desc' }
): Record<string, unknown> {
  if (!sortBy) {
    return defaultOrderBy;
  }

  // Soportar ordenamiento anidado con notación de punto
  const parts = sortBy.split('.');
  if (parts.length === 1) {
    return { [sortBy]: sortDirection };
  }

  // Construir objeto anidado para relaciones
  // e.g., "cliente.numero_cliente" -> { cliente: { numero_cliente: 'asc' } }
  let result: Record<string, unknown> = { [parts[parts.length - 1]]: sortDirection };
  for (let i = parts.length - 2; i >= 0; i--) {
    result = { [parts[i]]: result };
  }
  return result;
}

/**
 * Valida y normaliza opciones de paginación con valores por defecto
 */
export function normalizePaginationOptions(
  page?: number,
  limit?: number,
  sortBy?: string,
  sortDirection?: string
): PaginationOptions {
  return {
    page: Math.max(1, page ?? 1),
    limit: Math.min(100, Math.max(1, limit ?? 50)),
    sortBy: sortBy || undefined,
    sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
  };
}

