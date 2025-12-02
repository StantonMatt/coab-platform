import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import adminApiClient from '@/lib/adminApi';
import { formatearRUT, formatearPesos } from '@coab/utils';
import { Search, ArrowLeft, Lock, Users } from 'lucide-react';

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
    hasNextPage: boolean;
    nextCursor: string | null;
    total: number;
  };
}

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
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
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data: customersData,
    isLoading,
    error,
  } = useQuery<SearchResponse>({
    queryKey: ['admin-customers', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return {
          data: [],
          pagination: { hasNextPage: false, nextCursor: null, total: 0 },
        };
      }
      const res = await adminApiClient.get<SearchResponse>(
        `/admin/clientes?q=${encodeURIComponent(debouncedQuery)}`
      );
      return res.data;
    },
    enabled: debouncedQuery.length >= 2,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin/dashboard')}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Buscar Clientes
              </h1>
              <p className="text-sm text-slate-500">
                Busque por RUT, nombre o dirección
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Search Input */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <Input
                placeholder="Buscar por RUT, nombre, dirección o N° cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-base bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                autoFocus
              />
            </div>
            {searchQuery.length > 0 && searchQuery.length < 2 && (
              <p className="text-sm text-slate-500 mt-2">
                Ingrese al menos 2 caracteres para buscar
              </p>
            )}
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading && debouncedQuery.length >= 2 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-2 text-slate-500">
              <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Buscando clientes...
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-600">Error al buscar clientes</p>
          </div>
        )}

        {/* No Results */}
        {!isLoading &&
          debouncedQuery.length >= 2 &&
          customersData?.data.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">Sin resultados</p>
              <p className="text-slate-500 text-sm">
                No se encontraron clientes para "{debouncedQuery}"
              </p>
            </div>
          )}

        {/* Results Table */}
        {customersData && customersData.data.length > 0 && (
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      RUT
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider hidden md:table-cell">
                      Dirección
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider hidden lg:table-cell">
                      Teléfono
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Saldo
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customersData.data.map((customer: Customer) => (
                    <tr
                      key={customer.id}
                      className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                      onClick={() =>
                        navigate(`/admin/clientes/${customer.id}`)
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-slate-700">
                            {customer.rut ? formatearRUT(customer.rut) : '-'}
                          </span>
                          {customer.estaBloqueado && (
                            <Lock
                              className="h-4 w-4 text-red-500"
                              aria-label="Cuenta bloqueada"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900">
                          {customer.nombre}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-slate-600">
                          {customer.direccion || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-slate-600">
                          {customer.telefono || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-semibold ${
                            customer.saldo > 0
                              ? 'text-red-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {formatearPesos(customer.saldo)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            customer.estadoCuenta === 'AL_DIA'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {customer.estadoCuenta === 'AL_DIA'
                            ? 'Al día'
                            : 'Moroso'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination info */}
            {customersData.pagination.hasNextPage && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-center text-sm text-slate-600">
                Mostrando {customersData.data.length} resultados. Refine su
                búsqueda para ver más.
              </div>
            )}
          </Card>
        )}

        {/* Initial state - before search */}
        {!debouncedQuery && (
          <div className="text-center py-16">
            <Search className="h-16 w-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">
              Ingrese un término de búsqueda para encontrar clientes
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
