import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AdminLayout,
  DataTable,
  StatusBadge,
  ConfirmDialog,
  PermissionGate,
  SortableHeader,
  useCanAccess,
  useAdminTable,
} from '@/components/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { Plus, RefreshCw, Check, X, Search, Pencil, Trash2 } from 'lucide-react';
import { formatearPesos, formatearFecha, formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';

interface Repactacion {
  id: string;
  numeroConvenio: string | null;
  clienteId: string;
  numeroCliente: string;
  montoDeudaInicial: number;
  totalCuotas: number;
  montoCuotaInicial: number;
  montoCuotaBase: number;
  fechaInicio: string;
  fechaTerminoReal: string | null;
  estado: string;
  observaciones: string | null;
  cliente: {
    id: string;
    numeroCliente: string;
    nombre: string;
  } | null;
}

interface SolicitudRepactacion {
  id: string;
  clienteId: string;
  numeroCliente: string;
  montoDeudaEstimado: number;
  cuotasSolicitadas: number;
  motivo: string | null;
  estado: string;
  revisadoPor: string | null;
  fechaRevision: string | null;
  motivoRechazo: string | null;
  repactacionId: string | null;
  creadoEn: string;
  cliente: {
    id: string;
    numeroCliente: string;
    nombre: string;
  } | null;
}

interface RepactacionFormData {
  numeroCliente: string;
  montoDeudaInicial: string;
  totalCuotas: string;
  fechaInicio: string; // Format: YYYY-MM
  observaciones: string;
}

// Month names in Spanish
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Generate allowed month options: 5 months back to 2 months forward
function generateMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  
  // Start from 5 months ago, go to 2 months ahead (8 total options)
  for (let offset = -5; offset <= 2; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-indexed
    const value = `${year}-${String(month).padStart(2, '0')}`;
    const label = `${MESES[month - 1]} ${year}`;
    options.push({ value, label });
  }
  
  return options;
}

const monthOptions = generateMonthOptions();

// Get default month based on current day:
// - Days 1-15: default to previous month
// - Days 16-31: default to current month
function getDefaultMonth(): string {
  const now = new Date();
  const currentDay = now.getDate();
  const offset = currentDay <= 15 ? -1 : 0;
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

const emptyForm: RepactacionFormData = {
  numeroCliente: '',
  montoDeudaInicial: '',
  totalCuotas: '12',
  fechaInicio: getDefaultMonth(),
  observaciones: '',
};

interface RepactacionFilters extends Record<string, unknown> {
  estado: string;
}

// Edit Form Component
function EditRepactacionForm({
  repactacion,
  monthOptions,
  onSave,
  onCancel,
  isLoading,
}: {
  repactacion: Repactacion;
  monthOptions: { value: string; label: string }[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  // Parse the fechaInicio to YYYY-MM format
  const parseFechaInicio = (fecha: string | null): string => {
    if (!fecha) return monthOptions[0]?.value || '';
    const date = new Date(fecha);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  };

  const [monto, setMonto] = useState(String(repactacion.montoDeudaInicial));
  const [cuotas, setCuotas] = useState(String(repactacion.totalCuotas));
  const [fechaInicio, setFechaInicio] = useState(parseFechaInicio(repactacion.fechaInicio));
  const [observaciones, setObservaciones] = useState(repactacion.observaciones || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      montoDeudaInicial: parseFloat(monto),
      totalCuotas: parseInt(cuotas),
      fechaInicio: `${fechaInicio}-01`,
    };
    if (observaciones.trim()) {
      data.observaciones = observaciones.trim();
    }
    onSave(data);
  };

  const cuotaMensual = parseFloat(monto) / parseInt(cuotas) || 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-slate-50 rounded-lg text-sm">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-slate-500">Convenio:</span>
          <span className="font-medium">{repactacion.numeroConvenio || '-'}</span>
          <span className="text-slate-500">Cliente:</span>
          <span className="font-medium">{repactacion.cliente?.nombre || repactacion.numeroCliente}</span>
        </div>
      </div>

      <div>
        <Label>Monto de Deuda *</Label>
        <Input
          type="number"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
          min="1"
        />
      </div>

      <div>
        <Label>Número de Cuotas *</Label>
        <Input
          type="number"
          value={cuotas}
          onChange={(e) => setCuotas(e.target.value)}
          required
          min="1"
          max="120"
        />
      </div>

      {parseFloat(monto) > 0 && parseInt(cuotas) > 0 && (
        <div className="p-3 bg-blue-50 rounded-lg text-center">
          <p className="text-sm text-blue-600">Cuota Mensual Estimada</p>
          <p className="text-xl font-bold text-blue-700">{formatearPesos(Math.round(cuotaMensual))}</p>
        </div>
      )}

      <div>
        <Label>Fecha de Inicio *</Label>
        <Select value={fechaInicio} onValueChange={setFechaInicio}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccione mes" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Observaciones</Label>
        <Textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Notas adicionales..."
          rows={2}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function AdminRepactacionesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const _canCreate = useCanAccess('repactaciones', 'create');
  void _canCreate; // For future use

  // Use the admin table hook for repactaciones
  const {
    data: repactaciones,
    tableProps: repactacionesTableProps,
    filters,
    setFilter,
    refetch: refetchRepactaciones,
  } = useAdminTable<Repactacion, RepactacionFilters>({
    endpoint: '/admin/repactaciones',
    queryKey: 'admin-repactaciones',
    dataKey: 'repactaciones',
    defaultSort: { column: 'fechaInicio', direction: 'desc' },
    defaultFilters: { estado: '' },
    dataStaleTime: 30000, // Cache for 30 seconds
  });

  const [activeTab, setActiveTab] = useState('repactaciones');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<RepactacionFormData>(emptyForm);
  const [solicitudesPage, setSolicitudesPage] = useState(1);
  const [search, setSearch] = useState('');

  // Detail modal state
  const [selectedRepactacion, setSelectedRepactacion] = useState<Repactacion | null>(null);

  // Confirm dialog states
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveCuotas, setApproveCuotas] = useState('12');

  // Edit and delete states
  const [editingRepactacion, setEditingRepactacion] = useState<Repactacion | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Finalizar (complete/cancel) states
  const [finalizingRepactacion, setFinalizingRepactacion] = useState<Repactacion | null>(null);
  const [finalizarEstado, setFinalizarEstado] = useState<'completado' | 'cancelado'>('completado');

  // Permission checks
  const canEdit = useCanAccess('repactaciones', 'edit');
  const canDelete = useCanAccess('repactaciones', 'delete');

  // Query for solicitudes
  const { data: solicitudesData, isLoading: loadingSolicitudes } = useQuery({
    queryKey: ['admin', 'solicitudes-repactacion', solicitudesPage],
    queryFn: async () => {
      const res = await adminApiClient.get(
        `/admin/solicitudes-repactacion?page=${solicitudesPage}&limit=20`
      );
      return res.data as {
        solicitudes: SolicitudRepactacion[];
        pagination: { total: number; page: number; limit: number; totalPages: number };
      };
    },
    enabled: activeTab === 'solicitudes',
  });

  // Count pending solicitudes for badge
  const { data: pendingCount } = useQuery({
    queryKey: ['admin', 'solicitudes-repactacion-pending-count'],
    queryFn: async () => {
      const res = await adminApiClient.get('/admin/solicitudes-repactacion?estado=pendiente&limit=1');
      return res.data.pagination?.total || 0;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: RepactacionFormData) => {
      // Format fechaInicio as first day of selected month: YYYY-MM-01
      const fechaInicio = `${data.fechaInicio}-01`;
      const payload: Record<string, unknown> = {
        numeroCliente: data.numeroCliente.trim(),
        montoDeudaInicial: parseFloat(data.montoDeudaInicial),
        totalCuotas: parseInt(data.totalCuotas),
        fechaInicio,
      };
      // Only add observaciones if it has a value (Zod expects string | undefined, not null)
      if (data.observaciones?.trim()) {
        payload.observaciones = data.observaciones.trim();
      }
      return adminApiClient.post('/admin/repactaciones', payload);
    },
    onSuccess: () => {
      toast({ title: 'Repactación creada', description: 'La repactación se ha creado exitosamente.' });
      refetchRepactaciones();
      closeModal();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo crear la repactación.',
        variant: 'destructive',
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return adminApiClient.post(`/admin/solicitudes-repactacion/${id}/aprobar`);
    },
    onSuccess: () => {
      toast({ title: 'Solicitud aprobada', description: 'Se ha creado la repactación para el cliente.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'solicitudes-repactacion'] });
      refetchRepactaciones();
      setApprovingId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo aprobar la solicitud.',
        variant: 'destructive',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApiClient.post(`/admin/solicitudes-repactacion/${id}/rechazar`, {
        motivoRechazo: 'Rechazado por el administrador',
      });
    },
    onSuccess: () => {
      toast({ title: 'Solicitud rechazada', description: 'La solicitud ha sido rechazada.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'solicitudes-repactacion'] });
      setRejectConfirmOpen(false);
      setRejectingId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo rechazar la solicitud.',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      return adminApiClient.patch(`/admin/repactaciones/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: 'Repactación actualizada', description: 'Los cambios se guardaron correctamente.' });
      refetchRepactaciones();
      setEditingRepactacion(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo actualizar la repactación.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApiClient.delete(`/admin/repactaciones/${id}`);
    },
    onSuccess: () => {
      toast({ title: 'Repactación eliminada', description: 'La repactación ha sido eliminada.' });
      refetchRepactaciones();
      setDeleteConfirmOpen(false);
      setDeletingId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo eliminar la repactación.',
        variant: 'destructive',
      });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: string }) => {
      return adminApiClient.patch(`/admin/repactaciones/${id}`, { estado });
    },
    onSuccess: () => {
      const msg = finalizarEstado === 'completado' ? 'completada' : 'anulada';
      toast({ title: 'Repactación finalizada', description: `La repactación ha sido ${msg}.` });
      refetchRepactaciones();
      setFinalizingRepactacion(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo finalizar la repactación.',
        variant: 'destructive',
      });
    },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const getEstadoBadge = (estado: string) => {
    const styles: Record<string, string> = {
      activo: 'bg-blue-100 text-blue-700',
      completado: 'bg-green-100 text-green-700',
      cancelado: 'bg-red-100 text-red-700',
      pendiente: 'bg-yellow-100 text-yellow-700',
      aprobada: 'bg-green-100 text-green-700',
      rechazada: 'bg-red-100 text-red-700',
    };
    const labels: Record<string, string> = {
      activo: 'Activo',
      completado: 'Completado',
      cancelado: 'Cancelado',
      pendiente: 'Pendiente',
      aprobada: 'Aprobada',
      rechazada: 'Rechazada',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[estado] || 'bg-slate-100'}`}>
        {labels[estado] || estado}
      </span>
    );
  };

  const calcularCuota = () => {
    const monto = parseFloat(formData.montoDeudaInicial) || 0;
    const cuotas = parseInt(formData.totalCuotas) || 1;
    return Math.ceil(monto / cuotas);
  };

  const ESTADO_MAP: Record<string, { label: string; className: string }> = {
    activo: { label: 'Activo', className: 'bg-blue-100 text-blue-700' },
    completado: { label: 'Completado', className: 'bg-emerald-100 text-emerald-700' },
    cancelado: { label: 'Cancelado', className: 'bg-red-100 text-red-700' },
    pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  };

  const repactacionesColumns = [
    {
      key: 'convenio',
      header: 'Convenio',
      render: (r: Repactacion) => (
        <div>
          <span className="font-medium text-slate-900">
            {r.numeroConvenio || '-'}
          </span>
          <div className="text-xs text-slate-500">Cliente: {r.numeroCliente}</div>
        </div>
      ),
    },
    {
      key: 'cliente',
      header: <SortableHeader column="cliente" label="Cliente" />,
      render: (r: Repactacion) => (
        <div>
          <p className="font-medium">{r.cliente?.nombre || `Cliente #${r.clienteId}`}</p>
        </div>
      ),
    },
    {
      key: 'monto',
      header: <SortableHeader column="monto" label="Monto" />,
      render: (r: Repactacion) => (
        <div>
          <p className="font-medium">{formatearPesos(r.montoDeudaInicial)}</p>
          <p className="text-xs text-slate-500">
            {r.totalCuotas} cuotas de {formatearPesos(r.montoCuotaBase)}
          </p>
        </div>
      ),
    },
    {
      key: 'estado',
      header: <SortableHeader column="estado" label="Estado" />,
      render: (r: Repactacion) => <StatusBadge status={r.estado} statusMap={ESTADO_MAP} />,
    },
    {
      key: 'fechaInicio',
      header: <SortableHeader column="fechaInicio" label="Inicio" />,
      render: (r: Repactacion) =>
        r.fechaInicio ? formatearFechaSinHora(r.fechaInicio, FORMATOS_FECHA.CORTO) : '-',
    },
  ];

  const solicitudesColumns = [
    {
      key: 'cliente',
      header: 'Cliente',
      render: (s: SolicitudRepactacion) => (
        <div>
          <p className="font-medium">{s.cliente?.nombre || `Cliente #${s.clienteId}`}</p>
          <p className="text-xs text-slate-500">{s.numeroCliente}</p>
        </div>
      ),
    },
    {
      key: 'monto',
      header: 'Monto Solicitado',
      className: 'text-right',
      headerClassName: 'text-right',
      render: (s: SolicitudRepactacion) => formatearPesos(s.montoDeudaEstimado),
    },
    {
      key: 'cuotas',
      header: 'Cuotas',
      className: 'text-center',
      headerClassName: 'text-center',
      render: (s: SolicitudRepactacion) => s.cuotasSolicitadas,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (s: SolicitudRepactacion) => getEstadoBadge(s.estado),
    },
    {
      key: 'fecha',
      header: 'Fecha',
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (s: SolicitudRepactacion) =>
        s.creadoEn ? formatearFecha(s.creadoEn, FORMATOS_FECHA.CORTO) : '-',
    },
    {
      key: 'acciones',
      header: 'Acciones',
      className: 'text-right',
      headerClassName: 'text-right',
      render: (s: SolicitudRepactacion) => (
        <div className="flex justify-end gap-1">
          {s.estado === 'pendiente' && (
            <>
              <PermissionGate entity="solicitudes_repactacion" action="approve_request">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setApprovingId(s.id);
                    setApproveCuotas(s.cuotasSolicitadas.toString());
                  }}
                  className="text-green-600 hover:text-green-700"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </PermissionGate>
              <PermissionGate entity="solicitudes_repactacion" action="approve_request">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRejectingId(s.id);
                    setRejectConfirmOpen(true);
                  }}
                  className="text-slate-600 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </PermissionGate>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Repactaciones"
      subtitle="Gestiona convenios de pago y solicitudes de clientes"
      icon={<RefreshCw className="h-5 w-5 text-blue-600" />}
      actions={
        <PermissionGate entity="repactaciones" action="create">
          <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Repactación
          </Button>
        </PermissionGate>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="repactaciones">Repactaciones</TabsTrigger>
          <TabsTrigger value="solicitudes" className="relative">
            Solicitudes
            {pendingCount && pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-500 text-white rounded-full">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="repactaciones">
          {/* Filters */}
          <div className="mb-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente o convenio..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={filters.estado || 'all'}
              onValueChange={(val) => setFilter('estado', val === 'all' ? '' : val)}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            data={repactaciones}
            columns={repactacionesColumns}
            keyExtractor={(r) => r.id}
            emptyMessage="No hay repactaciones registradas"
            emptyIcon={<RefreshCw className="h-12 w-12 text-slate-300" />}
            onRowClick={(r) => setSelectedRepactacion(r)}
            {...repactacionesTableProps}
          />
        </TabsContent>

        <TabsContent value="solicitudes">
          <DataTable
            data={solicitudesData?.solicitudes || []}
            columns={solicitudesColumns}
            isLoading={loadingSolicitudes}
            keyExtractor={(s) => s.id}
            emptyMessage="No hay solicitudes pendientes"
            emptyIcon={<RefreshCw className="h-12 w-12 text-slate-300" />}
            pagination={
              solicitudesData?.pagination && {
                page: solicitudesData.pagination.page,
                totalPages: solicitudesData.pagination.totalPages,
                total: solicitudesData.pagination.total,
                onPageChange: setSolicitudesPage,
              }
            }
          />
        </TabsContent>
      </Tabs>

      {/* Repactacion Detail Modal */}
      <Dialog open={!!selectedRepactacion} onOpenChange={() => setSelectedRepactacion(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de Repactación</DialogTitle>
          </DialogHeader>
          {selectedRepactacion && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900 text-lg">
                    Convenio {selectedRepactacion.numeroConvenio || '-'}
                  </span>
                  <p className="text-sm text-slate-500">
                    Cliente: {selectedRepactacion.cliente?.nombre}
                  </p>
                </div>
                <StatusBadge status={selectedRepactacion.estado} statusMap={ESTADO_MAP} />
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-slate-500">Monto Deuda Inicial</span>
                  <span className="font-medium">{formatearPesos(selectedRepactacion.montoDeudaInicial)}</span>
                </div>
                <div>
                  <span className="block text-slate-500">Total Cuotas</span>
                  <span className="font-medium">{selectedRepactacion.totalCuotas}</span>
                </div>
                <div>
                  <span className="block text-slate-500">Monto Cuota</span>
                  <span className="font-medium">{formatearPesos(selectedRepactacion.montoCuotaBase)}</span>
                </div>
                <div>
                  <span className="block text-slate-500">Fecha Inicio</span>
                  <span className="font-medium">
                    {selectedRepactacion.fechaInicio
                      ? formatearFechaSinHora(selectedRepactacion.fechaInicio, FORMATOS_FECHA.CORTO)
                      : '-'}
                  </span>
                </div>
                {selectedRepactacion.observaciones && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Observaciones</span>
                    <span className="text-slate-700">{selectedRepactacion.observaciones}</span>
                  </div>
                )}
              </div>

              {/* Finalizar Repactación - only for active */}
              {selectedRepactacion.estado === 'activo' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 mb-3">
                    <strong>Finalizar Repactación:</strong> Termina la repactación cuando el cliente 
                    completa el pago o cuando se anula por impago.
                  </p>
                  <PermissionGate entity="repactaciones" action="edit">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-green-300 text-green-700 hover:bg-green-50"
                        onClick={() => {
                          setFinalizingRepactacion(selectedRepactacion);
                          setFinalizarEstado('completado');
                          setSelectedRepactacion(null);
                        }}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Completada
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setFinalizingRepactacion(selectedRepactacion);
                          setFinalizarEstado('cancelado');
                          setSelectedRepactacion(null);
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Anulada
                      </Button>
                    </div>
                  </PermissionGate>
                </div>
              )}

              {/* Corregir registro */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-sm text-slate-600 mb-3">
                  <strong>Corregir registro:</strong> Modifica o elimina este registro 
                  específico (para corregir errores de entrada).
                </p>
                <div className="flex gap-2">
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingRepactacion(selectedRepactacion);
                        setSelectedRepactacion(null);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setDeletingId(selectedRepactacion.id);
                        setDeleteConfirmOpen(true);
                        setSelectedRepactacion(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar Registro
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Repactación</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Número de Cliente *</Label>
              <Input
                type="text"
                value={formData.numeroCliente}
                onChange={(e) => setFormData({ ...formData, numeroCliente: e.target.value })}
                required
                placeholder="Ej: 110710"
              />
            </div>
            <div>
              <Label>Monto Original de Deuda *</Label>
              <Input
                type="number"
                value={formData.montoDeudaInicial}
                onChange={(e) => setFormData({ ...formData, montoDeudaInicial: e.target.value })}
                required
                placeholder="0"
              />
            </div>
            <div>
              <Label>Número de Cuotas *</Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={formData.totalCuotas}
                onChange={(e) => setFormData({ ...formData, totalCuotas: e.target.value })}
                required
                placeholder="Ej: 12"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ingrese el número de cuotas (1-120)
              </p>
            </div>

            <div>
              <Label>Fecha de Inicio *</Label>
              <Select
                value={formData.fechaInicio}
                onValueChange={(val) => setFormData({ ...formData, fechaInicio: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione mes" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                La repactación iniciará el día 1 del mes seleccionado
              </p>
            </div>

            {/* Preview */}
            {formData.montoDeudaInicial && (
              <Card className="bg-slate-50">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Cuota Mensual Estimada</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {formatearPesos(calcularCuota())}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                placeholder="Notas adicionales..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createMutation.isPending ? 'Creando...' : 'Crear Repactación'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approve Modal */}
      <Dialog open={!!approvingId} onOpenChange={() => setApprovingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aprobar Solicitud de Repactación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Número de Cuotas Aprobadas</Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={approveCuotas}
                onChange={(e) => setApproveCuotas(e.target.value)}
                placeholder="Ej: 12"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ingrese el número de cuotas aprobadas (1-120)
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApprovingId(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => approvingId && approveMutation.mutate({ id: approvingId })}
                disabled={approveMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {approveMutation.isPending ? 'Aprobando...' : 'Aprobar'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Finalizar Confirmation */}
      <ConfirmDialog
        open={!!finalizingRepactacion}
        onOpenChange={() => setFinalizingRepactacion(null)}
        title={finalizarEstado === 'completado' ? '¿Marcar como completada?' : '¿Anular repactación?'}
        description={
          finalizarEstado === 'completado'
            ? 'Esta acción marcará la repactación como completada. El cliente ha cumplido con el convenio de pago.'
            : 'Esta acción anulará la repactación. El saldo restante volverá al cliente como deuda pendiente.'
        }
        onConfirm={() => finalizingRepactacion && finalizeMutation.mutate({ id: finalizingRepactacion.id, estado: finalizarEstado })}
        isLoading={finalizeMutation.isPending}
        variant={finalizarEstado === 'completado' ? 'default' : 'destructive'}
        confirmText={finalizarEstado === 'completado' ? 'Marcar Completada' : 'Anular Repactación'}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="¿Eliminar repactación?"
        description="Esta acción eliminará permanentemente la repactación. Use esto solo para corregir errores de entrada."
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        isLoading={deleteMutation.isPending}
        variant="destructive"
        confirmText="Eliminar"
      />

      {/* Edit Modal */}
      <Dialog open={!!editingRepactacion} onOpenChange={() => setEditingRepactacion(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Repactación</DialogTitle>
          </DialogHeader>
          {editingRepactacion && (
            <EditRepactacionForm
              repactacion={editingRepactacion}
              monthOptions={monthOptions}
              onSave={(data) => updateMutation.mutate({ id: editingRepactacion.id, data })}
              onCancel={() => setEditingRepactacion(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation */}
      <ConfirmDialog
        open={rejectConfirmOpen}
        onOpenChange={setRejectConfirmOpen}
        title="¿Rechazar solicitud?"
        description="Esta acción rechazará la solicitud de repactación del cliente."
        onConfirm={() => rejectingId && rejectMutation.mutate(rejectingId)}
        isLoading={rejectMutation.isPending}
        variant="destructive"
        confirmText="Rechazar"
      />
    </AdminLayout>
  );
}
