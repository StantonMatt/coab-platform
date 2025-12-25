import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string | ReactNode;
  className?: string;
  headerClassName?: string;
  render?: (item: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string;
  // Pagination
  pagination?: {
    page: number;
    totalPages: number;
    total?: number;
    onPageChange: (page: number) => void;
  };
}

/**
 * Reusable data table component with pagination
 * 
 * @example
 * <DataTable
 *   columns={[
 *     { key: 'nombre', header: 'Nombre' },
 *     { key: 'estado', header: 'Estado', render: (item) => <Badge>{item.estado}</Badge> },
 *   ]}
 *   data={items}
 *   keyExtractor={(item) => item.id}
 *   onRowClick={(item) => navigate(`/admin/items/${item.id}`)}
 *   pagination={{ page, totalPages, onPageChange: setPage }}
 * />
 */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No hay datos disponibles',
  emptyIcon,
  onRowClick,
  rowClassName,
  pagination,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando...
          </div>
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          {emptyIcon && <div className="mb-3">{emptyIcon}</div>}
          <p>{emptyMessage}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-left ${column.headerClassName || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((item, index) => (
              <tr
                key={keyExtractor(item)}
                className={`
                  hover:bg-slate-50 transition-colors
                  ${onRowClick ? 'cursor-pointer hover:bg-blue-50/50' : ''}
                  ${rowClassName ? rowClassName(item) : ''}
                `}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 text-left ${column.className || ''}`}
                  >
                    {column.render
                      ? column.render(item, index)
                      : (item[column.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-sm text-slate-600">
            Página {pagination.page} de {pagination.totalPages}
            {pagination.total !== undefined && (
              <span className="ml-2 text-slate-400">
                ({pagination.total} registros)
              </span>
            )}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Status badge for common estados
 */
interface StatusBadgeProps {
  status: string;
  statusMap?: Record<string, { label: string; className: string }>;
}

const DEFAULT_STATUS_MAP: Record<string, { label: string; className: string }> = {
  activo: { label: 'Activo', className: 'bg-emerald-100 text-emerald-700' },
  inactivo: { label: 'Inactivo', className: 'bg-slate-100 text-slate-700' },
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  completado: { label: 'Completado', className: 'bg-emerald-100 text-emerald-700' },
  cancelado: { label: 'Cancelado', className: 'bg-red-100 text-red-700' },
  aprobada: { label: 'Aprobada', className: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', className: 'bg-red-100 text-red-700' },
  cortado: { label: 'Cortado', className: 'bg-red-100 text-red-700' },
  repuesto: { label: 'Repuesto', className: 'bg-emerald-100 text-emerald-700' },
};

export function StatusBadge({ status, statusMap = DEFAULT_STATUS_MAP }: StatusBadgeProps) {
  const config = statusMap[status] || { label: status, className: 'bg-slate-100 text-slate-700' };
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}


