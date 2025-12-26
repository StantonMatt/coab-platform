import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import adminApiClient from '@/lib/adminApi';
import { formatearRUT, formatearPesos } from '@coab/utils';
import { Search, CreditCard, Filter, X } from 'lucide-react';
import {
  AdminLayout,
  DataTable,
  StatusBadge,
  SortableHeader,
} from '@/components/admin';

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

const PAYMENT_STATES: Record<string, { label: string; className: string }> = {
  completado: { label: 'Completado', className: 'bg-emerald-100 text-emerald-700' },
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  rechazado: { label: 'Rechazado', className: 'bg-red-100 text-red-700' },
  reversado: { label: 'Reversado', className: 'bg-slate-100 text-slate-700' },
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

  // Sort state
  const [sortBy, setSortBy] = useState<string>('fecha');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Detail modal state
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

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
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [fechaDesde, fechaHasta, tipoPago, estado]);

  // Sort handler
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('desc');
    }
    setPage(1);
  };

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
    params.set('sortBy', sortBy);
    params.set('sortDirection', sortDirection);
    return params.toString();
  };

  const { data, isLoading } = useQuery<PaymentsResponse>({
    queryKey: ['admin-payments', page, debouncedQuery, fechaDesde, fechaHasta, tipoPago, estado, sortBy, sortDirection],
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

  const columns = [
    {
      key: 'fecha',
      header: (
        <SortableHeader
          column="fecha"
          label="Fecha"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (payment: Payment) => (
        <span className="text-sm text-slate-700">
          {formatDate(payment.fechaPago)}
        </span>
      ),
    },
    {
      key: 'cliente',
      header: (
        <SortableHeader
          column="cliente"
          label="Cliente"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (payment: Payment) => (
        payment.cliente ? (
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
        )
      ),
    },
    {
      key: 'monto',
      header: (
        <SortableHeader
          column="monto"
          label="Monto"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (payment: Payment) => (
        <span className="font-semibold text-slate-900">
          {formatearPesos(payment.monto)}
        </span>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      render: (payment: Payment) => (
        <span className="text-sm text-slate-600">
          {PAYMENT_TYPES[payment.tipoPago] || payment.tipoPago}
        </span>
      ),
    },
    {
      key: 'estado',
      header: (
        <SortableHeader
          column="estado"
          label="Estado"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (payment: Payment) => (
        <StatusBadge
          status={payment.estado}
          statusMap={PAYMENT_STATES}
        />
      ),
    },
  ];

  return (
    <AdminLayout
      title="Pagos"
      subtitle="Historial de todos los pagos"
      icon={<CreditCard className="h-5 w-5 text-blue-600" />}
    >
      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, RUT o N° transacción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
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

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Desde
              </label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
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
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Tipo de Pago
              </label>
              <Select value={tipoPago} onValueChange={setTipoPago}>
                <SelectTrigger>
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
                <SelectTrigger>
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
      </div>

      {/* Summary */}
      {data && (
        <div className="flex items-center gap-4 text-sm mb-4">
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

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data?.pagos || []}
        keyExtractor={(payment) => payment.id}
        isLoading={isLoading}
        emptyMessage="No se encontraron pagos con los filtros aplicados"
        emptyIcon={<CreditCard className="h-12 w-12 text-slate-300" />}
        onRowClick={(payment) => setSelectedPayment(payment)}
        pagination={
          data?.pagination && {
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            total: data.pagination.total,
            onPageChange: setPage,
          }
        }
      />

      {/* Detail Modal */}
      <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Pago</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              {/* Amount and Status */}
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-slate-900">
                  {formatearPesos(selectedPayment.monto)}
                </span>
                <StatusBadge
                  status={selectedPayment.estado}
                  statusMap={PAYMENT_STATES}
                />
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-slate-500">Fecha</span>
                  <span className="font-medium">{formatDate(selectedPayment.fechaPago)}</span>
                </div>
                <div>
                  <span className="block text-slate-500">Tipo de Pago</span>
                  <span className="font-medium">
                    {PAYMENT_TYPES[selectedPayment.tipoPago] || selectedPayment.tipoPago}
                  </span>
                </div>
                {selectedPayment.numeroTransaccion && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">N° Transacción</span>
                    <span className="font-mono text-sm">{selectedPayment.numeroTransaccion}</span>
                  </div>
                )}
                {selectedPayment.operador && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Operador</span>
                    <span className="font-medium">{selectedPayment.operador}</span>
                  </div>
                )}
                {selectedPayment.observaciones && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Observaciones</span>
                    <span className="text-slate-700">{selectedPayment.observaciones}</span>
                  </div>
                )}
              </div>

              {/* Client Info */}
              {selectedPayment.cliente && (
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Cliente</h4>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-900 block">
                        {selectedPayment.cliente.nombre}
                      </span>
                      <span className="text-sm text-slate-500">
                        {selectedPayment.cliente.rut
                          ? formatearRUT(selectedPayment.cliente.rut)
                          : `N° ${selectedPayment.cliente.numeroCliente}`}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedPayment(null);
                        navigate(`/admin/clientes/${selectedPayment.cliente!.id}`);
                      }}
                    >
                      Ver Perfil
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
