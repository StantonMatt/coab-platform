import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import adminApiClient from '@/lib/adminApi';
import { useSortState, UseSortStateReturn } from './SortableHeader';

// ============================================
// Debounce Hook
// ============================================

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ============================================
// Types
// ============================================

export interface Pagination {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
}

export interface PaginationResponse<T> {
  pagination: Pagination;
  [key: string]: T[] | Pagination | unknown;
}

export interface UseAdminTableOptions<TFilters extends Record<string, unknown> = Record<string, unknown>, TMetadata = unknown> {
  /** API endpoint path (e.g., '/admin/lecturas') */
  endpoint: string;
  /** React Query key prefix (e.g., 'admin-lecturas') */
  queryKey: string;
  /** Key in response that contains the data array (e.g., 'lecturas', 'multas') */
  dataKey: string;
  /** Default sort configuration */
  defaultSort?: {
    column: string;
    direction: 'asc' | 'desc';
  };
  /** Default filter values */
  defaultFilters?: TFilters;
  /** Items per page */
  limit?: number;
  /** Optional metadata endpoint (fetched in parallel) */
  metadataEndpoint?: string;
  /** Key in metadata response that contains the data */
  metadataKey?: string;
  /** Called when metadata is loaded - use to set initial filters from metadata */
  onMetadataLoaded?: (metadata: TMetadata) => Partial<TFilters> | void;
  /** Whether to wait for metadata before fetching data (default: false) */
  waitForMetadata?: boolean;
  /** Custom query function (if you need special handling) */
  customQueryFn?: (params: URLSearchParams) => Promise<unknown>;
  /** Whether the query should be enabled (default: true) */
  enabled?: boolean;
  /** 
   * Filter keys that should be debounced (e.g., ['search', 'q'])
   * These filters will wait for debounceMs before triggering API calls
   */
  debouncedFilterKeys?: (keyof TFilters)[];
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** 
   * Cache time for data queries in milliseconds (default: 30000)
   * Data won't refetch if it's younger than this
   */
  dataStaleTime?: number;
}

export interface UseAdminTableReturn<TData, TFilters extends Record<string, unknown>, TMetadata, TResponse = unknown> {
  /** Data array */
  data: TData[];
  /** Full raw response (for accessing additional fields like summaries) */
  rawResponse: TResponse | null;
  /** Loading state (includes metadata loading if waitForMetadata is true) */
  isLoading: boolean;
  /** Just the data loading state */
  isLoadingData: boolean;
  /** Whether a background refetch is in progress (for subtle loading indicators) */
  isFetching: boolean;
  /** Metadata loading state */
  isLoadingMetadata: boolean;
  /** Error state */
  error: Error | null;
  /** Pagination info */
  pagination: Pagination | null;
  /** Sorting controls from useSortState */
  sorting: UseSortStateReturn;
  /** Current filters */
  filters: TFilters;
  /** Set a single filter value */
  setFilter: <K extends keyof TFilters>(key: K, value: TFilters[K]) => void;
  /** Set multiple filters at once */
  setFilters: (newFilters: Partial<TFilters>) => void;
  /** Reset filters to defaults */
  resetFilters: () => void;
  /** Current page */
  page: number;
  /** Set page */
  setPage: (page: number) => void;
  /** Metadata (if metadataEndpoint provided) */
  metadata: TMetadata | null;
  /** Props ready to pass to DataTable */
  tableProps: {
    isLoading: boolean;
    pagination: {
      page: number;
      totalPages: number;
      total: number;
      onPageChange: (page: number) => void;
    } | undefined;
    sorting: {
      sortBy: string | null;
      sortDirection: 'asc' | 'desc';
      onSort: (column: string) => void;
    };
  };
  /** Invalidate and refetch data */
  refetch: () => void;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Reusable hook for admin table data management.
 * Handles pagination, sorting, filtering, and optional metadata fetching.
 * 
 * @example
 * // Basic usage
 * const { data, isLoading, tableProps, filters, setFilter } = useAdminTable<Multa>({
 *   endpoint: '/admin/multas',
 *   queryKey: 'admin-multas',
 *   dataKey: 'multas',
 *   defaultSort: { column: 'numeroCliente', direction: 'asc' },
 * });
 * 
 * @example
 * // With metadata (like Lecturas with periods)
 * const { data, isLoading, tableProps, metadata, filters, setFilter } = useAdminTable<
 *   Lectura,
 *   LecturaFilters,
 *   PeriodoDisponible[]
 * >({
 *   endpoint: '/admin/lecturas',
 *   queryKey: 'admin-lecturas',
 *   dataKey: 'lecturas',
 *   defaultSort: { column: 'numeroCliente', direction: 'asc' },
 *   defaultFilters: { periodoAno: '', periodoMes: '', search: '' },
 *   metadataEndpoint: '/admin/lecturas/periodos-light',
 *   metadataKey: 'periodos',
 *   onMetadataLoaded: (periodos) => {
 *     if (periodos.length > 0) {
 *       return {
 *         periodoAno: periodos[0].año.toString(),
 *         periodoMes: periodos[0].mes.toString(),
 *       };
 *     }
 *   },
 * });
 */
export function useAdminTable<
  TData,
  TFilters extends Record<string, unknown> = Record<string, unknown>,
  TMetadata = unknown
>(options: UseAdminTableOptions<TFilters, TMetadata>): UseAdminTableReturn<TData, TFilters, TMetadata> {
  const {
    endpoint,
    queryKey,
    dataKey,
    defaultSort,
    defaultFilters = {} as TFilters,
    limit = 20,
    metadataEndpoint,
    metadataKey,
    onMetadataLoaded,
    waitForMetadata = false,
    enabled = true,
    debouncedFilterKeys = [],
    debounceMs = 300,
    dataStaleTime = 30000, // 30 seconds default cache
  } = options;

  // ============================================
  // State
  // ============================================
  
  const [page, setPage] = useState(1);
  const [filters, setFiltersState] = useState<TFilters>(defaultFilters);
  const [filtersInitialized, setFiltersInitialized] = useState(!metadataEndpoint || !onMetadataLoaded);

  // Track debounced filter keys for stable reference
  const debouncedKeysRef = useRef(new Set(debouncedFilterKeys as string[]));
  useEffect(() => {
    debouncedKeysRef.current = new Set(debouncedFilterKeys as string[]);
  }, [debouncedFilterKeys]);

  // Extract values that need debouncing vs immediate values
  const debouncedFilterValues = useMemo(() => {
    const result: Partial<TFilters> = {};
    for (const key of debouncedKeysRef.current) {
      if (key in filters) {
        result[key as keyof TFilters] = filters[key as keyof TFilters];
      }
    }
    return result;
  }, [filters]);

  // Debounce the extracted values
  const debouncedValues = useDebouncedValue(debouncedFilterValues, debounceMs);

  // Combine immediate and debounced filters for the query
  const queryFilters = useMemo(() => {
    const result = { ...filters };
    // Override debounced keys with their debounced values
    for (const key of debouncedKeysRef.current) {
      if (key in debouncedValues) {
        result[key as keyof TFilters] = debouncedValues[key as keyof TFilters] as TFilters[keyof TFilters];
      }
    }
    return result;
  }, [filters, debouncedValues]);

  // Reset page when filters change
  const handlePageReset = useCallback(() => {
    setPage(1);
  }, []);

  // Sorting
  const sorting = useSortState({
    defaultColumn: defaultSort?.column ?? null,
    defaultDirection: defaultSort?.direction ?? 'asc',
    onSortChange: handlePageReset,
  });

  // ============================================
  // Metadata Query (optional, parallel)
  // ============================================
  
  const {
    data: metadataRaw,
    isLoading: isLoadingMetadata,
  } = useQuery({
    queryKey: [queryKey, 'metadata'],
    queryFn: async () => {
      if (!metadataEndpoint) return null;
      const res = await adminApiClient.get(metadataEndpoint);
      return res.data;
    },
    enabled: !!metadataEndpoint,
    staleTime: 5 * 60 * 1000, // Cache metadata for 5 minutes
  });

  // Extract metadata using key
  const metadata = useMemo(() => {
    if (!metadataRaw) return null;
    if (metadataKey && typeof metadataRaw === 'object' && metadataKey in metadataRaw) {
      return (metadataRaw as Record<string, unknown>)[metadataKey] as TMetadata;
    }
    return metadataRaw as TMetadata;
  }, [metadataRaw, metadataKey]);

  // Initialize filters from metadata
  useEffect(() => {
    if (metadata && onMetadataLoaded && !filtersInitialized) {
      const initialFilters = onMetadataLoaded(metadata);
      if (initialFilters) {
        setFiltersState(prev => ({ ...prev, ...initialFilters }));
      }
      setFiltersInitialized(true);
    }
  }, [metadata, onMetadataLoaded, filtersInitialized]);

  // ============================================
  // Main Data Query
  // ============================================
  
  const shouldFetchData = enabled && (waitForMetadata ? filtersInitialized : true);

  const {
    data: responseData,
    isLoading: isLoadingData,
    isFetching,
    error,
    refetch,
  } = useQuery({
    // Use queryFilters (with debounced values) for the query key
    queryKey: [queryKey, page, queryFilters, sorting.sortBy, sorting.sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      // Add sorting
      if (sorting.sortBy) {
        params.append('sortBy', sorting.sortBy);
        params.append('sortDirection', sorting.sortDirection);
      }
      
      // Add filters (using debounced queryFilters)
      Object.entries(queryFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });

      const res = await adminApiClient.get(`${endpoint}?${params}`);
      return res.data as PaginationResponse<TData>;
    },
    enabled: shouldFetchData,
    staleTime: dataStaleTime, // Cache data to reduce refetches
  });

  // Extract data array and pagination
  const data = useMemo(() => {
    if (!responseData) return [];
    if (dataKey && dataKey in responseData) {
      return responseData[dataKey] as TData[];
    }
    return [];
  }, [responseData, dataKey]);

  const pagination = responseData?.pagination ?? null;

  // ============================================
  // Filter Helpers
  // ============================================
  
  const setFilter = useCallback(<K extends keyof TFilters>(key: K, value: TFilters[K]) => {
    setFiltersState(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filter changes
  }, []);

  const setFilters = useCallback((newFilters: Partial<TFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilters);
    setPage(1);
  }, [defaultFilters]);

  // ============================================
  // Computed Loading State
  // ============================================
  
  const isLoading = isLoadingData || (waitForMetadata && (isLoadingMetadata || !filtersInitialized));

  // ============================================
  // Table Props (ready to spread into DataTable)
  // ============================================
  
  const tableProps = useMemo(() => ({
    isLoading,
    pagination: pagination ? {
      page: pagination.page,
      totalPages: pagination.totalPages,
      total: pagination.total,
      onPageChange: setPage,
    } : undefined,
    sorting: {
      sortBy: sorting.sortBy,
      sortDirection: sorting.sortDirection,
      onSort: sorting.handleSort,
    },
  }), [isLoading, pagination, sorting.sortBy, sorting.sortDirection, sorting.handleSort]);

  // ============================================
  // Return
  // ============================================
  
  return {
    data,
    rawResponse: responseData as unknown ?? null,
    isLoading,
    isLoadingData,
    isFetching,
    isLoadingMetadata,
    error: error as Error | null,
    pagination,
    sorting,
    filters,
    setFilter,
    setFilters,
    resetFilters,
    page,
    setPage,
    metadata,
    tableProps,
    refetch,
  };
}

