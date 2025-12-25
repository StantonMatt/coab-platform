import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import adminApiClient from '@/lib/adminApi';
import { formatearRUT } from '@coab/utils';
import { Search, Lock, Users } from 'lucide-react';
import {
  AdminLayout,
  DataTable,
  StatusBadge,
} from '@/components/admin';

interface Customer {
  id: string;
  rut: string | null;
  numeroCliente: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  saldo: number;
  estadoCuenta: string;
  estaBloqueado: boolean;
}

interface SearchResponse {
  data: Customer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1); // Reset to page 1 on new search
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data: customersData,
    isLoading,
    error,
  } = useQuery<SearchResponse>({
    queryKey: ['admin-customers', debouncedQuery, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (debouncedQuery && debouncedQuery.length >= 2) {
        params.append('q', debouncedQuery);
      }
      const res = await adminApiClient.get<SearchResponse>(`/admin/clientes?${params}`);
      return res.data;
    },
  });

  const columns = [
    {
      key: 'rut',
      header: 'RUT',
      render: (customer: Customer) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-slate-700">
            {customer.rut ? formatearRUT(customer.rut) : '-'}
          </span>
          {customer.estaBloqueado && (
            <Lock className="h-4 w-4 text-red-500" aria-label="Cuenta bloqueada" />
          )}
        </div>
      ),
    },
    {
      key: 'nombre',
      header: 'Nombre',
      render: (customer: Customer) => (
        <span className="font-medium text-slate-900">{customer.nombre}</span>
      ),
    },
    {
      key: 'direccion',
      header: 'Dirección',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (customer: Customer) => (
        <span className="text-sm text-slate-600">{customer.direccion || '-'}</span>
      ),
    },
    {
      key: 'telefono',
      header: 'Teléfono',
      className: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
      render: (customer: Customer) => (
        <span className="text-sm text-slate-600">{customer.telefono || '-'}</span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      className: 'text-center',
      headerClassName: 'text-center',
      render: (customer: Customer) => (
        <StatusBadge
          status={customer.estadoCuenta === 'AL_DIA' ? 'activo' : 'pendiente'}
          customLabel={customer.estadoCuenta === 'AL_DIA' ? 'Al día' : 'Moroso'}
        />
      ),
    },
  ];

  return (
    <AdminLayout
      title="Clientes"
      subtitle="Gestión de clientes del sistema"
      icon={<Users className="h-5 w-5 text-blue-600" />}
    >
      {/* Search Input */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por RUT, nombre, dirección o N° cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {searchQuery.length > 0 && searchQuery.length < 2 && (
          <p className="text-sm text-slate-500 mt-2">
            Ingrese al menos 2 caracteres para filtrar
          </p>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="text-center py-12 bg-red-50 rounded-lg border border-red-200">
          <p className="text-red-600 font-medium">Error al cargar clientes</p>
          <p className="text-sm text-red-500 mt-1">
            Por favor, verifique su conexión e intente nuevamente.
          </p>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={customersData?.data || []}
        keyExtractor={(customer) => customer.id}
        isLoading={isLoading}
        emptyMessage={
          debouncedQuery
            ? `No se encontraron clientes para "${debouncedQuery}"`
            : 'No hay clientes registrados'
        }
        emptyIcon={<Users className="h-12 w-12 text-slate-300" />}
        onRowClick={(customer) => navigate(`/admin/clientes/${customer.id}`)}
        pagination={
          customersData?.pagination && {
            page: customersData.pagination.page,
            totalPages: customersData.pagination.totalPages,
            total: customersData.pagination.total,
            onPageChange: setPage,
          }
        }
      />
    </AdminLayout>
  );
}
