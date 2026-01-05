import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Input } from '@/components/ui/input';
import { formatearRUT } from '@coab/utils';
import { Search, Lock, Users } from 'lucide-react';
import {
  AdminLayout,
  DataTable,
  StatusBadge,
  SortableHeader,
  useAdminTable,
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

interface CustomerFilters extends Record<string, unknown> {
  q: string;
}

export default function CustomersPage() {
  const navigate = useNavigate();

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Use the admin table hook with built-in debouncing for search
  const {
    data: customers,
    error,
    tableProps,
    filters,
    setFilter,
  } = useAdminTable<Customer, CustomerFilters>({
    endpoint: '/admin/clientes',
    queryKey: 'admin-customers',
    dataKey: 'data', // Clientes endpoint uses 'data' key
    defaultSort: { column: 'numeroCliente', direction: 'asc' },
    defaultFilters: { q: '' },
    debouncedFilterKeys: ['q'], // Debounce search input
    debounceMs: 300,
    dataStaleTime: 30000, // Cache for 30 seconds
  });

  const columns = [
    {
      key: 'numeroCliente',
      header: <SortableHeader column="numeroCliente" label="N° Cliente" />,
      render: (customer: Customer) => (
        <span className="font-mono text-sm text-slate-700">{customer.numeroCliente}</span>
      ),
    },
    {
      key: 'rut',
      header: <SortableHeader column="rut" label="RUT" />,
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
      header: <SortableHeader column="nombre" label="Nombre" />,
      render: (customer: Customer) => (
        <span className="font-medium text-slate-900">{customer.nombre}</span>
      ),
    },
    {
      key: 'direccion',
      header: 'Dirección',
      render: (customer: Customer) => (
        <span className="text-sm text-slate-600">{customer.direccion || '-'}</span>
      ),
    },
    {
      key: 'estado',
      header: <SortableHeader column="saldo" label="Estado" />,
      render: (customer: Customer) => (
        <StatusBadge
          status={customer.estadoCuenta === 'AL_DIA' ? 'activo' : 'pendiente'}
          label={customer.estadoCuenta === 'AL_DIA' ? 'Al día' : 'Moroso'}
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
            value={filters.q as string}
            onChange={(e) => setFilter('q', e.target.value)}
            className="pl-9"
          />
        </div>
        {filters.q && (filters.q as string).length > 0 && (filters.q as string).length < 2 && (
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
        data={customers}
        keyExtractor={(customer) => customer.id}
        emptyMessage={
          filters.q
            ? `No se encontraron clientes para "${filters.q}"`
            : 'No hay clientes registrados'
        }
        emptyIcon={<Users className="h-12 w-12 text-slate-300" />}
        onRowClick={(customer) => navigate(`/admin/clientes/${customer.id}`)}
        {...tableProps}
      />
    </AdminLayout>
  );
}
