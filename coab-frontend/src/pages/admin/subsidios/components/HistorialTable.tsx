import { Search, Percent } from 'lucide-react';
import { formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, StatusBadge, SortableHeader } from '@/components/admin';
import type { HistorialEntry, HistorialFilters } from '../types';

interface HistorialTableProps {
  historialEntries: HistorialEntry[];
  tableProps: {
    isLoading: boolean;
    pagination?: {
      page: number;
      totalPages: number;
      total?: number;
      onPageChange: (page: number) => void;
    };
    sorting: {
      sortBy: string | null;
      sortDirection: 'asc' | 'desc';
      onSort: (column: string) => void;
    };
  };
  filters: HistorialFilters;
  setFilter: (key: keyof HistorialFilters, value: string) => void;
  onRowClick: (entry: HistorialEntry) => void;
}

export function HistorialTable({
  historialEntries,
  tableProps,
  filters,
  setFilter,
  onRowClick,
}: HistorialTableProps) {
  const columns = [
    {
      key: 'cliente',
      header: (
        <SortableHeader
          column="cliente"
          label="N° Cliente"
          sortBy={tableProps.sorting.sortBy}
          sortDirection={tableProps.sorting.sortDirection}
          onSort={tableProps.sorting.onSort}
        />
      ),
      render: (entry: HistorialEntry) => (
        <div>
          <span className="font-medium text-slate-900">{entry.numeroCliente}</span>
          {entry.cliente?.nombre && (
            <div className="text-xs text-slate-500">{entry.cliente.nombre}</div>
          )}
        </div>
      ),
    },
    {
      key: 'subsidio',
      header: (
        <SortableHeader
          column="subsidio"
          label="Subsidio"
          sortBy={tableProps.sorting.sortBy}
          sortDirection={tableProps.sorting.sortDirection}
          onSort={tableProps.sorting.onSort}
        />
      ),
      render: (entry: HistorialEntry) =>
        entry.subsidio ? (
          <span className="font-medium text-emerald-600">{entry.subsidio.porcentaje}%</span>
        ) : (
          <span className="text-slate-400">-</span>
        ),
    },
    {
      key: 'tipoCambio',
      header: 'Tipo',
      render: (entry: HistorialEntry) => (
        <StatusBadge
          status={entry.tipoCambio}
          statusMap={{
            alta: { label: 'Agregado', className: 'bg-emerald-100 text-emerald-700' },
            baja: { label: 'Eliminado', className: 'bg-red-100 text-red-700' },
            agregado: { label: 'Agregado', className: 'bg-emerald-100 text-emerald-700' },
            eliminado: { label: 'Eliminado', className: 'bg-red-100 text-red-700' },
          }}
        />
      ),
    },
    {
      key: 'esActivo',
      header: 'Estado Actual',
      render: (entry: HistorialEntry) => (
        <StatusBadge
          status={entry.esActivo ? 'activo' : 'inactivo'}
          statusMap={{
            activo: { label: 'Activo', className: 'bg-blue-100 text-blue-700' },
            inactivo: { label: 'Inactivo', className: 'bg-slate-100 text-slate-600' },
          }}
        />
      ),
    },
    {
      key: 'fechaCambio',
      header: (
        <SortableHeader
          column="fechaCambio"
          label="Fecha"
          sortBy={tableProps.sorting.sortBy}
          sortDirection={tableProps.sorting.sortDirection}
          onSort={tableProps.sorting.onSort}
        />
      ),
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (entry: HistorialEntry) =>
        entry.fechaCambio
          ? formatearFechaSinHora(entry.fechaCambio, FORMATOS_FECHA.CORTO)
          : '-',
    },
  ];

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por cliente..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={filters.tipoCambio || 'all'}
          onValueChange={(val) => setFilter('tipoCambio', val === 'all' ? '' : val)}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="agregado">Agregados</SelectItem>
            <SelectItem value="eliminado">Eliminados</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.esActivo || 'all'}
          onValueChange={(val) => setFilter('esActivo', val === 'all' ? '' : val)}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Estados</SelectItem>
            <SelectItem value="activo">Solo Activos</SelectItem>
            <SelectItem value="inactivo">Solo Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={historialEntries}
        keyExtractor={(entry) => entry.id}
        emptyMessage="No hay registros de subsidios"
        emptyIcon={<Percent className="h-12 w-12 text-slate-300" />}
        onRowClick={onRowClick}
        {...tableProps}
      />
    </>
  );
}

