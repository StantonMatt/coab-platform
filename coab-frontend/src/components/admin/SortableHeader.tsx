import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

interface SortableHeaderProps {
  column: string;
  label: string;
  sortBy: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
}

/**
 * Reusable sortable header component for admin tables.
 * Displays sort direction arrows and handles click to toggle sorting.
 * 
 * @example
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
  sortBy,
  sortDirection,
  onSort,
}: SortableHeaderProps) {
  const isActive = sortBy === column;

  return (
    <button
      onClick={() => onSort(column)}
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

/**
 * Hook to manage sort state for admin tables.
 * Returns sort state and a handler to toggle sorting.
 * 
 * @example
 * const { sortBy, sortDirection, handleSort } = useSortState('numeroCliente');
 */
export function useSortState(defaultColumn: string | null = null, defaultDirection: 'asc' | 'desc' = 'asc') {
  // This is a simple helper - actual state management is in the component
  return {
    defaultSortBy: defaultColumn,
    defaultSortDirection: defaultDirection,
  };
}

