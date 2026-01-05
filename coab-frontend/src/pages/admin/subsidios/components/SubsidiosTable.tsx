import { Check, Percent } from 'lucide-react';
import { DataTable, StatusBadge, SortableHeader } from '@/components/admin';
import type { Subsidio } from '../types';

interface SubsidiosTableProps {
  subsidios: Subsidio[];
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
  onRowClick: (subsidio: Subsidio) => void;
}

export function SubsidiosTable({ subsidios, tableProps, onRowClick }: SubsidiosTableProps) {
  const columns = [
    {
      key: 'id',
      header: <SortableHeader column="id" label="ID" />,
      render: (subsidio: Subsidio) => (
        <span className="font-medium text-slate-900">{subsidio.id}</span>
      ),
    },
    {
      key: 'porcentaje',
      header: <SortableHeader column="porcentaje" label="Descuento" />,
      render: (subsidio: Subsidio) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-emerald-600">{subsidio.porcentaje}%</span>
          {subsidio.esVigente && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
              <Check className="h-3 w-3 mr-1" />
              Vigente
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'limiteM3',
      header: <SortableHeader column="limiteM3" label="Límite m³" />,
      render: (subsidio: Subsidio) => (
        <span className="text-slate-700">{subsidio.limiteM3} m³</span>
      ),
    },
    {
      key: 'historial',
      header: <SortableHeader column="cantidadHistorial" label="Clientes" />,
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (subsidio: Subsidio) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          {subsidio.cantidadHistorial}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (subsidio: Subsidio) => <StatusBadge status={subsidio.estado} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={subsidios}
      keyExtractor={(subsidio) => subsidio.id}
      emptyMessage="No hay subsidios registrados"
      emptyIcon={<Percent className="h-12 w-12 text-slate-300" />}
      onRowClick={onRowClick}
      {...tableProps}
    />
  );
}

