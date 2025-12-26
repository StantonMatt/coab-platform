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
import { Plus, RefreshCw, Check, X, Search } from 'lucide-react';
import { formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  clienteId: string;
  montoDeudaInicial: string;
  totalCuotas: string;
  observaciones: string;
}

const emptyForm: RepactacionFormData = {
  clienteId: '',
  montoDeudaInicial: '',
  totalCuotas: '12',
  observaciones: '',
};

export default function AdminRepactacionesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const _canCreate = useCanAccess('repactaciones', 'create');
  void _canCreate; // For future use

  const [activeTab, setActiveTab] = useState('repactaciones');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<RepactacionFormData>(emptyForm);
  const [page, setPage] = useState(1);
  const [solicitudesPage, setSolicitudesPage] = useState(1);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');

  // Sort state
  const [sortBy, setSortBy] = useState<string>('fechaInicio');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Detail modal state
  const [selectedRepactacion, setSelectedRepactacion] = useState<Repactacion | null>(null);

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

  // Confirm dialog states
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveCuotas, setApproveCuotas] = useState('12');

  // Query for repactaciones
  const { data: repactacionesData, isLoading: loadingRepactaciones } = useQuery({
    queryKey: ['admin', 'repactaciones', page, estadoFilter, sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (estadoFilter) params.append('estado', estadoFilter);
      params.append('sortBy', sortBy);
      params.append('sortDirection', sortDirection);
      const res = await adminApiClient.get(`/admin/repactaciones?${params}`);
      return res.data as {
        repactaciones: Repactacion[];
        pagination: { total: number; page: number; limit: number; totalPages: number };
      };
    },
    enabled: activeTab === 'repactaciones',
  });

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
      return adminApiClient.post('/admin/repactaciones', {
        clienteId: data.clienteId,
        montoDeudaInicial: parseFloat(data.montoDeudaInicial),
        totalCuotas: parseInt(data.totalCuotas),
        observaciones: data.observaciones || null,
      });
    },
    onSuccess: () => {
      toast({ title: 'Repactación creada', description: 'La repactación se ha creado exitosamente.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'repactaciones'] });
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'repactaciones'] });
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

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApiClient.post(`/admin/repactaciones/${id}/cancelar`);
    },
    onSuccess: () => {
      toast({ title: 'Repactación cancelada', description: 'La repactación ha sido cancelada.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'repactaciones'] });
      setCancelConfirmOpen(false);
      setCancelingId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo cancelar la repactación.',
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
            {r.numeroConvenio || `#${r.id}`}
          </span>
          <div className="text-xs text-slate-500">Cliente: {r.numeroCliente}</div>
        </div>
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
      render: (r: Repactacion) => (
        <div>
          <p className="font-medium">{r.cliente?.nombre || `Cliente #${r.clienteId}`}</p>
        </div>
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
      header: (
        <SortableHeader
          column="estado"
          label="Estado"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (r: Repactacion) => <StatusBadge status={r.estado} statusMap={ESTADO_MAP} />,
    },
    {
      key: 'fechaInicio',
      header: (
        <SortableHeader
          column="fechaInicio"
          label="Inicio"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (r: Repactacion) =>
        r.fechaInicio ? format(new Date(r.fechaInicio), 'dd/MM/yyyy', { locale: es }) : '-',
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
        s.creadoEn ? format(new Date(s.creadoEn), 'dd/MM/yyyy', { locale: es }) : '-',
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
              value={estadoFilter || 'all'}
              onValueChange={(val) => {
                setEstadoFilter(val === 'all' ? '' : val);
                setPage(1);
              }}
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
            data={repactacionesData?.repactaciones || []}
            columns={repactacionesColumns}
            isLoading={loadingRepactaciones}
            keyExtractor={(r) => r.id}
            emptyMessage="No hay repactaciones registradas"
            emptyIcon={<RefreshCw className="h-12 w-12 text-slate-300" />}
            onRowClick={(r) => setSelectedRepactacion(r)}
            pagination={
              repactacionesData?.pagination && {
                page: repactacionesData.pagination.page,
                totalPages: repactacionesData.pagination.totalPages,
                total: repactacionesData.pagination.total,
                onPageChange: setPage,
              }
            }
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
                    {selectedRepactacion.numeroConvenio || `Convenio #${selectedRepactacion.id}`}
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
                      ? format(new Date(selectedRepactacion.fechaInicio), 'dd/MM/yyyy', { locale: es })
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

              {/* Actions */}
              {selectedRepactacion.estado === 'activo' && (
                <div className="pt-4 border-t border-slate-200">
                  <PermissionGate entity="repactaciones" action="delete">
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        setCancelingId(selectedRepactacion.id);
                        setCancelConfirmOpen(true);
                        setSelectedRepactacion(null);
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar Repactación
                    </Button>
                  </PermissionGate>
                </div>
              )}
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
              <Label>ID del Cliente *</Label>
              <Input
                type="text"
                value={formData.clienteId}
                onChange={(e) => setFormData({ ...formData, clienteId: e.target.value })}
                required
                placeholder="Ingrese ID del cliente"
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
              <Select
                value={formData.totalCuotas}
                onValueChange={(val) => setFormData({ ...formData, totalCuotas: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 6, 9, 12, 18, 24, 36].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} cuotas
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Select value={approveCuotas} onValueChange={setApproveCuotas}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 6, 9, 12, 18, 24, 36].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} cuotas
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Cancel Confirmation */}
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="¿Cancelar repactación?"
        description="Esta acción cancelará la repactación. El saldo restante volverá al cliente."
        onConfirm={() => cancelingId && cancelMutation.mutate(cancelingId)}
        isLoading={cancelMutation.isPending}
        variant="destructive"
        confirmText="Cancelar Repactación"
      />

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
