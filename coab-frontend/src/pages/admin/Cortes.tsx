import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Scissors, Plus, Search, RefreshCcw, Pencil, Trash2, Info } from 'lucide-react';
import { formatearPesos, formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
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

interface CorteServicio {
  id: string;
  clienteId: string;
  numeroCliente: string;
  fechaCorte: string | null;
  fechaReposicion: string | null;
  motivoCorte: string;
  estado: string;
  numeroReposicion: number | null;
  montoCobrado: number | null;
  afectoIva: boolean;
  autorizadoCortePor: string | null;
  autorizadoReposicionPor: string | null;
  observaciones: string | null;
  fechaCreacion: string;
  cliente: {
    id: string;
    numeroCliente: string;
    nombre: string;
  } | null;
}

interface CorteFilters extends Record<string, unknown> {
  estado: string;
  search: string;
}

interface CorteFormData {
  numeroCliente: string;
  fechaCorte: string;
  motivoCorte: string;
  observaciones: string;
  usarMontoPersonalizado: boolean;
  montoPersonalizado: string;
}

const emptyForm: CorteFormData = {
  numeroCliente: '',
  fechaCorte: new Date().toISOString().split('T')[0],
  motivoCorte: 'No pago',
  observaciones: '',
  usarMontoPersonalizado: false,
  montoPersonalizado: '',
};

const ESTADO_MAP: Record<string, { label: string; className: string }> = {
  cortado: { label: 'Cortado', className: 'bg-red-100 text-red-700' },
  repuesto: { label: 'Repuesto', className: 'bg-emerald-100 text-emerald-700' },
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
};

// Edit Form Component
function EditCorteForm({
  corte,
  onSave,
  onCancel,
  isLoading,
}: {
  corte: CorteServicio;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [fechaCorte, setFechaCorte] = useState(
    corte.fechaCorte ? corte.fechaCorte.split('T')[0] : ''
  );
  const [motivoCorte, setMotivoCorte] = useState(corte.motivoCorte || 'No pago');
  const [observaciones, setObservaciones] = useState(corte.observaciones || '');
  const [usarMontoPersonalizado, setUsarMontoPersonalizado] = useState(!!corte.montoCobrado);
  const [montoPersonalizado, setMontoPersonalizado] = useState(
    corte.montoCobrado ? String(corte.montoCobrado) : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      fechaCorte,
      motivoCorte,
      observaciones: observaciones || null,
    };
    // Only include montoCobrado if using custom amount
    if (usarMontoPersonalizado && montoPersonalizado) {
      data.montoCobrado = parseFloat(montoPersonalizado);
    } else if (!usarMontoPersonalizado && corte.montoCobrado) {
      // Clear the custom amount if switching back to tarifa
      data.montoCobrado = null;
    }
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 bg-slate-50 rounded-lg text-sm">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-slate-500">Cliente:</span>
          <span className="font-medium">{corte.cliente?.nombre || corte.numeroCliente}</span>
          <span className="text-slate-500">Estado:</span>
          <span className="font-medium capitalize">{corte.estado}</span>
        </div>
      </div>

      <div>
        <Label>Fecha de Corte *</Label>
        <Input
          type="date"
          value={fechaCorte}
          onChange={(e) => setFechaCorte(e.target.value)}
          required
        />
      </div>

      <div>
        <Label>Motivo *</Label>
        <Select value={motivoCorte} onValueChange={setMotivoCorte}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="No pago">No pago</SelectItem>
            <SelectItem value="Fraude">Fraude</SelectItem>
            <SelectItem value="Solicitud cliente">Solicitud del cliente</SelectItem>
            <SelectItem value="Mantención">Mantención</SelectItem>
            <SelectItem value="Otro">Otro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Custom amount option */}
      <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="editUsarMontoPersonalizado"
            checked={usarMontoPersonalizado}
            onChange={(e) => setUsarMontoPersonalizado(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="editUsarMontoPersonalizado" className="text-sm text-slate-700">
            Usar monto personalizado (en lugar de tarifa)
          </label>
        </div>
        
        {usarMontoPersonalizado && (
          <div className="mt-2">
            <Input
              type="number"
              value={montoPersonalizado}
              onChange={(e) => setMontoPersonalizado(e.target.value)}
              placeholder="Monto personalizado"
            />
          </div>
        )}
      </div>

      <div>
        <Label>Observaciones</Label>
        <Textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Observaciones opcionales"
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

export default function AdminCortesPage() {
  const { toast } = useToast();
  const canReposicion = useCanAccess('cortes_servicio', 'authorize_reposicion');
  const canEdit = useCanAccess('cortes_servicio', 'edit');
  const canDelete = useCanAccess('cortes_servicio', 'delete');

  // Fetch current tarifa for reposicion values
  const { data: tarifaVigente } = useQuery({
    queryKey: ['tarifa-vigente'],
    queryFn: async () => {
      const res = await adminApiClient.get('/admin/tarifas/vigente');
      return res.data as {
        costoReposicion1: number;
        costoReposicion2: number;
      };
    },
  });

  // Use the admin table hook
  const {
    data: cortes,
    tableProps,
    filters,
    setFilter,
    refetch,
  } = useAdminTable<CorteServicio, CorteFilters>({
    endpoint: '/admin/cortes',
    queryKey: 'admin-cortes',
    dataKey: 'cortes',
    defaultSort: { column: 'fechaCorte', direction: 'desc' },
    defaultFilters: { estado: '', search: '' },
    debouncedFilterKeys: ['search'], // Debounce search input
    debounceMs: 300,
    dataStaleTime: 30000, // Cache for 30 seconds
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CorteFormData>(emptyForm);

  // Detail modal state
  const [selectedCorte, setSelectedCorte] = useState<CorteServicio | null>(null);

  // Reposicion state
  const [reposingCorte, setReposingCorte] = useState<CorteServicio | null>(null);

  // Fetch reposicion info when a corte is selected for reposicion
  const { data: reposicionInfo } = useQuery({
    queryKey: ['reposicion-info', reposingCorte?.clienteId],
    queryFn: async () => {
      if (!reposingCorte?.clienteId) return null;
      const res = await adminApiClient.get(`/admin/cortes/cliente/${reposingCorte.clienteId}/reposicion-info`);
      return res.data as {
        reposicionesPrevias: number;
        siguienteNumeroReposicion: number;
        tarifaReposicion1: number;
        tarifaReposicion2: number;
      };
    },
    enabled: !!reposingCorte?.clienteId,
  });

  // Edit and delete states
  const [editingCorte, setEditingCorte] = useState<CorteServicio | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: CorteFormData) => {
      return adminApiClient.post('/admin/cortes', {
        numeroCliente: data.numeroCliente,
        fechaCorte: data.fechaCorte,
        motivoCorte: data.motivoCorte,
        observaciones: data.observaciones || undefined,
        // Only send montoCobrado if using custom amount
        montoCobrado: data.usarMontoPersonalizado && data.montoPersonalizado
          ? parseFloat(data.montoPersonalizado)
          : undefined,
      });
    },
    onSuccess: () => {
      toast({ title: 'Corte registrado', description: 'El corte de servicio se ha registrado.' });
      refetch();
      closeModal();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo registrar el corte.',
        variant: 'destructive',
      });
    },
  });

  const reposicionMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApiClient.post(`/admin/cortes/${id}/reposicion`);
    },
    onSuccess: () => {
      toast({ title: 'Servicio repuesto', description: 'El servicio ha sido repuesto exitosamente.' });
      refetch();
      setReposingCorte(null);
      setSelectedCorte(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo realizar la reposición.',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      return adminApiClient.patch(`/admin/cortes/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: 'Corte actualizado', description: 'Los cambios se guardaron correctamente.' });
      refetch();
      setEditingCorte(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo actualizar el corte.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApiClient.delete(`/admin/cortes/${id}`);
    },
    onSuccess: () => {
      toast({ title: 'Corte eliminado', description: 'El registro ha sido eliminado.' });
      refetch();
      setDeleteConfirmOpen(false);
      setDeletingId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo eliminar el corte.',
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

  const columns = [
    {
      key: 'numeroCliente',
      header: <SortableHeader column="numeroCliente" label="Cliente" />,
      render: (c: CorteServicio) => (
        <div>
          <p className="font-semibold text-lg text-slate-900">{c.numeroCliente}</p>
          <p className="text-xs text-slate-500">
            {c.cliente?.nombre || '-'}
          </p>
        </div>
      ),
    },
    {
      key: 'fechaCorte',
      header: <SortableHeader column="fechaCorte" label="Fecha Corte" />,
      render: (c: CorteServicio) =>
        c.fechaCorte ? formatearFechaSinHora(c.fechaCorte, FORMATOS_FECHA.CORTO) : '-',
    },
    {
      key: 'motivoCorte',
      header: 'Motivo',
      render: (c: CorteServicio) => (
        <span className="text-sm text-slate-600">{c.motivoCorte || '-'}</span>
      ),
    },
    {
      key: 'estado',
      header: <SortableHeader column="estado" label="Estado" />,
      render: (c: CorteServicio) => (
        <StatusBadge status={c.estado} statusMap={ESTADO_MAP} />
      ),
    },
    {
      key: 'fechaReposicion',
      header: <SortableHeader column="fechaReposicion" label="Reposición" />,
      render: (c: CorteServicio) =>
        c.fechaReposicion ? formatearFechaSinHora(c.fechaReposicion, FORMATOS_FECHA.CORTO) : '-',
    },
  ];

  return (
    <AdminLayout
      title="Cortes de Servicio"
      subtitle="Gestiona los cortes y reposiciones de servicio"
      icon={<Scissors className="h-5 w-5 text-blue-600" />}
      actions={
        <PermissionGate entity="cortes_servicio" action="create">
          <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Corte
          </Button>
        </PermissionGate>
      }
    >
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
          value={filters.estado || 'all'}
          onValueChange={(val) => setFilter('estado', val === 'all' ? '' : val)}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="cortado">Cortado</SelectItem>
            <SelectItem value="repuesto">Repuesto</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={cortes}
        keyExtractor={(c) => c.id}
        emptyMessage="No hay cortes de servicio registrados"
        emptyIcon={<Scissors className="h-12 w-12 text-slate-300" />}
        onRowClick={(corte) => setSelectedCorte(corte)}
        {...tableProps}
      />

      {/* Detail Modal */}
      <Dialog open={!!selectedCorte} onOpenChange={() => setSelectedCorte(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Corte</DialogTitle>
          </DialogHeader>
          {selectedCorte && (
            <div className="space-y-4">
              {/* Client Info */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900 block text-lg">
                    {selectedCorte.cliente?.nombre || `Cliente #${selectedCorte.clienteId}`}
                  </span>
                  <span className="text-sm text-slate-500">
                    N° Cliente: {selectedCorte.numeroCliente}
                  </span>
                </div>
                <StatusBadge status={selectedCorte.estado} statusMap={ESTADO_MAP} />
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-slate-500">Fecha de Corte</span>
                  <span className="font-medium">
                    {selectedCorte.fechaCorte
                      ? formatearFechaSinHora(selectedCorte.fechaCorte, FORMATOS_FECHA.CORTO)
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500">Motivo</span>
                  <span className="font-medium">{selectedCorte.motivoCorte}</span>
                </div>
                {selectedCorte.fechaReposicion && (
                  <div>
                    <span className="block text-slate-500">Fecha de Reposición</span>
                    <span className="font-medium">
                      {formatearFechaSinHora(selectedCorte.fechaReposicion, FORMATOS_FECHA.CORTO)}
                    </span>
                  </div>
                )}
                {selectedCorte.montoCobrado && (
                  <div>
                    <span className="block text-slate-500">Monto Cobrado</span>
                    <span className="font-medium">{formatearPesos(selectedCorte.montoCobrado)}</span>
                  </div>
                )}
                {selectedCorte.autorizadoCortePor && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Autorizado por</span>
                    <span className="font-medium">{selectedCorte.autorizadoCortePor}</span>
                  </div>
                )}
                {selectedCorte.autorizadoReposicionPor && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Reposición autorizada por</span>
                    <span className="font-medium">{selectedCorte.autorizadoReposicionPor}</span>
                  </div>
                )}
                {selectedCorte.observaciones && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Observaciones</span>
                    <span className="text-slate-700">{selectedCorte.observaciones}</span>
                  </div>
                )}
              </div>

              {/* Reponer Servicio - only for cortado status */}
              {selectedCorte.estado === 'cortado' && canReposicion && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-sm text-emerald-800 mb-3">
                    <strong>Reponer Servicio:</strong> Marca el servicio como repuesto 
                    cuando se ha restablecido el suministro al cliente.
                  </p>
                  <Button
                    onClick={() => setReposingCorte(selectedCorte)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    size="sm"
                  >
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Reponer Servicio
                  </Button>
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
                        setEditingCorte(selectedCorte);
                        setSelectedCorte(null);
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
                        setDeletingId(selectedCorte.id);
                        setDeleteConfirmOpen(true);
                        setSelectedCorte(null);
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Corte de Servicio</DialogTitle>
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
              <Label>Fecha de Corte *</Label>
              <Input
                type="date"
                value={formData.fechaCorte}
                onChange={(e) => setFormData({ ...formData, fechaCorte: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Motivo *</Label>
              <Select
                value={formData.motivoCorte}
                onValueChange={(val) => setFormData({ ...formData, motivoCorte: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="No pago">No pago</SelectItem>
                  <SelectItem value="Fraude">Fraude</SelectItem>
                  <SelectItem value="Solicitud cliente">Solicitud del cliente</SelectItem>
                  <SelectItem value="Mantención">Mantención</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Tarifa Info Box */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-blue-800 mb-2">
                <Info className="h-4 w-4" />
                <span className="text-sm font-medium">Cargo por Reposición</span>
              </div>
              {tarifaVigente && (
                <div className="grid grid-cols-2 gap-2 text-sm text-blue-700 mb-2">
                  <span>1ª Reposición:</span>
                  <span className="font-medium">{formatearPesos(tarifaVigente.costoReposicion1)}</span>
                  <span>2ª+ Reposición:</span>
                  <span className="font-medium">{formatearPesos(tarifaVigente.costoReposicion2)}</span>
                </div>
              )}
              
              {/* Toggle for custom amount */}
              <div className="flex items-center gap-2 pt-2 border-t border-blue-200">
                <input
                  type="checkbox"
                  id="usarMontoPersonalizado"
                  checked={formData.usarMontoPersonalizado}
                  onChange={(e) => setFormData({ ...formData, usarMontoPersonalizado: e.target.checked })}
                  className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="usarMontoPersonalizado" className="text-sm text-blue-700">
                  Usar monto personalizado
                </label>
              </div>
              
              {formData.usarMontoPersonalizado && (
                <div className="mt-2">
                  <Input
                    type="number"
                    value={formData.montoPersonalizado}
                    onChange={(e) => setFormData({ ...formData, montoPersonalizado: e.target.value })}
                    placeholder="Monto personalizado"
                    className="bg-white"
                  />
                  <p className="text-xs text-blue-600 mt-1">
                    Este monto reemplazará el valor de tarifa para este corte.
                  </p>
                </div>
              )}
              
              {!formData.usarMontoPersonalizado && (
                <p className="text-xs text-blue-600 mt-2">
                  El cargo se determina automáticamente al reponer según el historial del cliente.
                </p>
              )}
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                placeholder="Observaciones opcionales"
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
                {createMutation.isPending ? 'Registrando...' : 'Registrar Corte'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reposicion Confirmation with Tarifa Info */}
      <Dialog open={!!reposingCorte} onOpenChange={(open) => !open && setReposingCorte(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Confirmar reposición de servicio?</DialogTitle>
          </DialogHeader>
          {reposingCorte && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Se repondrá el servicio para <strong>{reposingCorte.cliente?.nombre || reposingCorte.numeroCliente}</strong>.
              </p>

              {reposicionInfo && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-blue-800">
                    <Info className="h-4 w-4" />
                    <span className="font-medium">Información de Cargo</span>
                  </div>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p>
                      Reposiciones previas del cliente: <strong>{reposicionInfo.reposicionesPrevias}</strong>
                    </p>
                    <p>
                      Se aplicará: <strong>Reposición {reposicionInfo.siguienteNumeroReposicion}</strong> - {' '}
                      <strong className="text-blue-900">
                        {formatearPesos(
                          reposicionInfo.siguienteNumeroReposicion === 2
                            ? reposicionInfo.tarifaReposicion2
                            : reposicionInfo.tarifaReposicion1
                        )}
                      </strong>
                    </p>
                  </div>
                  <div className="text-xs text-blue-600 pt-2 border-t border-blue-200">
                    <p>Tarifa Reposición 1: {formatearPesos(reposicionInfo.tarifaReposicion1)}</p>
                    <p>Tarifa Reposición 2: {formatearPesos(reposicionInfo.tarifaReposicion2)}</p>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setReposingCorte(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => reposingCorte && reposicionMutation.mutate(reposingCorte.id)}
                  disabled={reposicionMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {reposicionMutation.isPending ? 'Procesando...' : 'Confirmar Reposición'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="¿Eliminar registro de corte?"
        description="Esta acción eliminará permanentemente el registro. Use esto solo para corregir errores de entrada."
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        isLoading={deleteMutation.isPending}
        variant="destructive"
        confirmText="Eliminar"
      />

      {/* Edit Modal */}
      <Dialog open={!!editingCorte} onOpenChange={() => setEditingCorte(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Corte de Servicio</DialogTitle>
          </DialogHeader>
          {editingCorte && (
            <EditCorteForm
              corte={editingCorte}
              onSave={(data) => updateMutation.mutate({ id: editingCorte.id, data })}
              onCancel={() => setEditingCorte(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
