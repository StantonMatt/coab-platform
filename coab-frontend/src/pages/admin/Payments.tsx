import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import adminApiClient from '@/lib/adminApi';
import { formatearRUT, formatearPesos } from '@coab/utils';
import { Search, ArrowLeft, CreditCard, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';

interface Payment {
  id: string;
  monto: number;
  fechaPago: string;
  tipoPago: string;
  estado: string;
  numeroTransaccion: string | null;
  observaciones: string | null;
  operador: string | null;
  cliente: {
    id: string;
    nombre: string;
    rut: string;
    numeroCliente: string;
  } | null;
}

interface PaymentsResponse {
  pagos: Payment[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  resumen: {
    totalMonto: number;
    cantidadPagos: number;
  };
}

const PAYMENT_TYPES: Record<string, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  cheque: 'Cheque',
  webpay: 'WebPay',
  mercadopago: 'Mercado Pago',
  caja_vecina: 'CajaVecina',
  paga_qui: 'PagaQui',
};

const PAYMENT_STATES: Record<string, { label: string; color: string }> = {
  completado: { label: 'Completado', color: 'bg-emerald-100 text-emerald-700' },
  pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
  reversado: { label: 'Reversado', color: 'bg-slate-100 text-slate-700' },
};

export default function PaymentsPage() {
  const navigate = useNavigate();
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [tipoPago, setTipoPago] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const limit = 20;

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [fechaDesde, fechaHasta, tipoPago, estado]);

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', limit.toString());
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (fechaDesde) params.set('fechaDesde', fechaDesde);
    if (fechaHasta) params.set('fechaHasta', fechaHasta);
    if (tipoPago) params.set('tipoPago', tipoPago);
    if (estado) params.set('estado', estado);
    return params.toString();
  };

  const { data, isLoading, error } = useQuery<PaymentsResponse>({
    queryKey: ['admin-payments', page, debouncedQuery, fechaDesde, fechaHasta, tipoPago, estado],
    queryFn: async () => {
      const res = await adminApiClient.get<PaymentsResponse>(`/admin/pagos?${buildQueryParams()}`);
      return res.data;
    },
  });

  const clearFilters = () => {
    setSearchQuery('');
    setFechaDesde('');
    setFechaHasta('');
    setTipoPago('');
    setEstado('');
    setPage(1);
  };

  const hasActiveFilters = fechaDesde || fechaHasta || tipoPago || estado || debouncedQuery;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

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
              <CreditCard className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Pagos</h1>
              <p className="text-sm text-slate-500">
                Historial de todos los pagos
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Search and Filters */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-4 pb-4 space-y-4">
            {/* Search row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente, RUT o N° transacción..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white border-slate-300"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={showFilters ? 'bg-blue-50 border-blue-200' : ''}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtros
                {hasActiveFilters && (
                  <span className="ml-2 w-2 h-2 rounded-full bg-blue-600" />
                )}
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" onClick={clearFilters} className="text-slate-500">
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>

            {/* Filters row */}
            {showFilters && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Desde
                  </label>
                  <Input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="bg-white border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Hasta
                  </label>
                  <Input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="bg-white border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Tipo de Pago
                  </label>
                  <Select value={tipoPago} onValueChange={setTipoPago}>
                    <SelectTrigger className="bg-white border-slate-300">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      {Object.entries(PAYMENT_TYPES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Estado
                  </label>
                  <Select value={estado} onValueChange={setEstado}>
                    <SelectTrigger className="bg-white border-slate-300">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      {Object.entries(PAYMENT_STATES).map(([value, { label }]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        {data && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-600">Total:</span>
              <span className="font-semibold text-slate-900">
                {formatearPesos(data.resumen.totalMonto)}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-600">Pagos:</span>
              <span className="font-semibold text-slate-900">
                {data.resumen.cantidadPagos.toLocaleString('es-CL')}
              </span>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-2 text-slate-500">
              <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Cargando pagos...
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-600">Error al cargar pagos</p>
          </div>
        )}

        {/* No Results */}
        {!isLoading && data?.pagos.length === 0 && (
          <div className="text-center py-12">
            <CreditCard className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">Sin resultados</p>
            <p className="text-slate-500 text-sm">
              No se encontraron pagos con los filtros aplicados
            </p>
          </div>
        )}

        {/* Results Table */}
        {data && data.pagos.length > 0 && (
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Monto
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider hidden md:table-cell">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider hidden lg:table-cell">
                      Referencia
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.pagos.map((payment) => (
                    <tr
                      key={payment.id}
                      className={`hover:bg-blue-50/50 transition-colors ${
                        payment.cliente ? 'cursor-pointer' : ''
                      }`}
                      onClick={() => {
                        if (payment.cliente) {
                          navigate(`/admin/clientes/${payment.cliente.id}`);
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-700">
                          {formatDate(payment.fechaPago)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {payment.cliente ? (
                          <div>
                            <span className="font-medium text-slate-900 block">
                              {payment.cliente.nombre}
                            </span>
                            <span className="text-xs text-slate-500">
                              {payment.cliente.rut
                                ? formatearRUT(payment.cliente.rut)
                                : `N° ${payment.cliente.numeroCliente}`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Sin cliente</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-900">
                          {formatearPesos(payment.monto)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-slate-600">
                          {PAYMENT_TYPES[payment.tipoPago] || payment.tipoPago}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            PAYMENT_STATES[payment.estado]?.color ||
                            'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {PAYMENT_STATES[payment.estado]?.label || payment.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-slate-500 font-mono">
                          {payment.numeroTransaccion || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-slate-600">
                  Página {data.pagination.page} de {data.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}


