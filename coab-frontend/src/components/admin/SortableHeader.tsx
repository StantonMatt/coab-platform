import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

// ============================================
// Sort Context - allows SortableHeader to get sort state from parent
// ============================================

export interface SortState {
  sortBy: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
}

const SortContext = createContext<SortState | null>(null);

export function SortProvider({
  children,
  sortBy,
  sortDirection,
  onSort,
}: SortState & { children: ReactNode }) {
  return (
    <SortContext.Provider value={{ sortBy, sortDirection, onSort }}>
      {children}
    </SortContext.Provider>
  );
}

export function useSortContext() {
  return useContext(SortContext);
}

// ============================================
// useSortState Hook - manages sort state with optional page reset
// ============================================

export interface UseSortStateOptions {
  defaultColumn?: string | null;
  defaultDirection?: 'asc' | 'desc';
  onSortChange?: () => void; // Called when sort changes (e.g., to reset page)
}

export interface UseSortStateReturn {
  sortBy: string | null;
  sortDirection: 'asc' | 'desc';
  handleSort: (column: string) => void;
  setSortBy: (column: string | null) => void;
  setSortDirection: (direction: 'asc' | 'desc') => void;
  resetSort: () => void;
}

/**
 * Hook to manage sort state for admin tables.
 * Handles toggling between asc/desc and switching columns.
 * 
 * @example
 * const { sortBy, sortDirection, handleSort } = useSortState({
 *   defaultColumn: 'nombre',
 *   defaultDirection: 'asc',
 *   onSortChange: () => setPage(1),
 * });
 */
export function useSortState(options: UseSortStateOptions = {}): UseSortStateReturn {
  const {
    defaultColumn = null,
    defaultDirection = 'asc',
    onSortChange,
  } = options;

  const [sortBy, setSortBy] = useState<string | null>(defaultColumn);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultDirection);

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      // Toggle direction
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column - start with default direction
      setSortBy(column);
      setSortDirection(defaultDirection);
    }
    onSortChange?.();
  }, [sortBy, defaultDirection, onSortChange]);

  const resetSort = useCallback(() => {
    setSortBy(defaultColumn);
    setSortDirection(defaultDirection);
    onSortChange?.();
  }, [defaultColumn, defaultDirection, onSortChange]);

  return {
    sortBy,
    sortDirection,
    handleSort,
    setSortBy,
    setSortDirection,
    resetSort,
  };
}

// ============================================
// SortableHeader Component
// ============================================

interface SortableHeaderProps {
  column: string;
  label: string;
  // These are optional if using SortContext
  sortBy?: string | null;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string) => void;
}

/**
 * Reusable sortable header component for admin tables.
 * Can receive sort props directly OR use SortContext from parent DataTable.
 * 
 * @example
 * // With context (simpler - DataTable provides sort state):
 * <SortableHeader column="nombre" label="Nombre" />
 * 
 * // Without context (explicit props):
 * <SortableHeader
 *   column="nombre"
 *   label="Nombre"
 *   sortBy={sortBy}
 *   sortDirection={sortDirection}
 *   onSort={handleSort}
 * />
 */
export function SortableHeader({
  column,
  label,
  sortBy: propSortBy,
  sortDirection: propSortDirection,
  onSort: propOnSort,
}: SortableHeaderProps) {
  const context = useSortContext();

  // Use props if provided, otherwise fall back to context
  const sortBy = propSortBy ?? context?.sortBy ?? null;
  const sortDirection = propSortDirection ?? context?.sortDirection ?? 'asc';
  const onSort = propOnSort ?? context?.onSort;

  const isActive = sortBy === column;

  const handleClick = () => {
    if (onSort) {
      onSort(column);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors font-semibold"
    >
      {label}
      {isActive ? (
        sortDirection === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}
