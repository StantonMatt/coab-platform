import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Percent, Plus, Pencil, Trash2, Check, Search, UserPlus, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import {
  AdminLayout,
  DataTable,
  StatusBadge,
  DeleteConfirmDialog,
  PermissionGate,
  SortableHeader,
  useCanAccess,
} from '@/components/admin';

interface Subsidio {
  id: number;
  limiteM3: number;
  porcentaje: number;
  fechaInicio: string;
  fechaTermino: string | null;
  numeroDecreto: string | null;
  observaciones: string | null;
  estado: string;
  cantidadHistorial: number;
  esVigente: boolean;
}

interface HistorialEntry {
  id: string;
  clienteId: string;
  numeroCliente: string;
  subsidioId: number | null;
  fechaCambio: string | null;
  tipoCambio: string;
  detalles: string | null;
  cliente: {
    id: string;
    numeroCliente: string;
    nombre: string;
  } | null;
  subsidio: {
    id: number;
    porcentaje: number;
    limiteM3: number;
  } | null;
}

interface SubsidiosResponse {
  subsidios: Subsidio[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface HistorialResponse {
  historial: HistorialEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface SubsidioFormData {
  id: string;
  limiteM3: string;
  porcentaje: string;
  fechaInicio: string;
  fechaTermino: string;
  numeroDecreto: string;
  observaciones: string;
  estado: string;
}

const initialFormData: SubsidioFormData = {
  id: '',
  limiteM3: '',
  porcentaje: '',
  fechaInicio: new Date().toISOString().split('T')[0],
  fechaTermino: '',
  numeroDecreto: '',
  observaciones: '',
  estado: 'activo',
};

export default function SubsidiosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const _canCreate = useCanAccess('subsidios', 'create');
  void _canCreate; // For future use
  const canEdit = useCanAccess('subsidios', 'edit');
  const canDelete = useCanAccess('subsidios', 'delete');

  const [activeTab, setActiveTab] = useState('tipos');
  const [page, setPage] = useState(1);
  const [historialPage, setHistorialPage] = useState(1);
  const [historialSearch, setHistorialSearch] = useState('');
  const [historialFilter, setHistorialFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSubsidio, setEditingSubsidio] = useState<Subsidio | null>(null);
  const [deleteSubsidio, setDeleteSubsidio] = useState<Subsidio | null>(null);
  const [formData, setFormData] = useState<SubsidioFormData>(initialFormData);

  // Sort state
  const [sortBy, setSortBy] = useState<string>('fechaInicio');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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

  // Assign modal state
  const [showAssign, setShowAssign] = useState(false);
  const [assignClienteId, setAssignClienteId] = useState('');
  const [assignSubsidioId, setAssignSubsidioId] = useState('');

  // Remove modal state
  const [showRemove, setShowRemove] = useState(false);
  const [removeEntry, setRemoveEntry] = useState<HistorialEntry | null>(null);
  const [removeMotivo, setRemoveMotivo] = useState('');

  // Fetch subsidios (types)
  const { data: subsidiosData, isLoading: loadingSubsidios } = useQuery<SubsidiosResponse>({
    queryKey: ['admin-subsidios', page, sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      params.append('sortBy', sortBy);
      params.append('sortDirection', sortDirection);
      const res = await adminApiClient.get<SubsidiosResponse>(`/admin/subsidios?${params}`);
      return res.data;
    },
    enabled: activeTab === 'tipos',
  });

  // Fetch historial (client assignments)
  const { data: historialData, isLoading: loadingHistorial } = useQuery<HistorialResponse>({
    queryKey: ['admin-subsidio-historial', historialPage, historialSearch, historialFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', historialPage.toString());
      params.append('limit', '20');
      if (historialSearch) params.append('search', historialSearch);
      if (historialFilter) params.append('tipoCambio', historialFilter);
      const res = await adminApiClient.get<HistorialResponse>(`/admin/subsidio-historial?${params}`);
      return res.data;
    },
    enabled: activeTab === 'clientes',
  });

  // Fetch active subsidios for the assign dropdown
  const { data: activeSubsidios } = useQuery<Subsidio[]>({
    queryKey: ['admin-subsidios-activos'],
    queryFn: async () => {
      const res = await adminApiClient.get('/admin/subsidios/activos');
      return res.data;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await adminApiClient.post('/admin/subsidios', data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio creado', description: 'El subsidio se creó correctamente' });
      queryClient.invalidateQueries({ queryKey: ['admin-subsidios'] });
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al crear subsidio',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await adminApiClient.patch(`/admin/subsidios/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio actualizado', description: 'Los cambios se guardaron' });
      queryClient.invalidateQueries({ queryKey: ['admin-subsidios'] });
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al actualizar subsidio',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await adminApiClient.delete(`/admin/subsidios/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio eliminado', description: 'El subsidio se eliminó correctamente' });
      queryClient.invalidateQueries({ queryKey: ['admin-subsidios'] });
      setDeleteSubsidio(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al eliminar subsidio',
      });
    },
  });

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async ({ clienteId, subsidioId }: { clienteId: string; subsidioId: number }) => {
      const res = await adminApiClient.post('/admin/subsidio-historial/asignar', {
        clienteId,
        subsidioId,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio asignado', description: 'El cliente fue asignado al subsidio' });
      queryClient.invalidateQueries({ queryKey: ['admin-subsidio-historial'] });
      queryClient.invalidateQueries({ queryKey: ['admin-subsidios'] });
      setShowAssign(false);
      setAssignClienteId('');
      setAssignSubsidioId('');
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al asignar subsidio',
      });
    },
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: async ({
      clienteId,
      subsidioId,
      motivo,
    }: {
      clienteId: string;
      subsidioId: number;
      motivo: string;
    }) => {
      const res = await adminApiClient.post('/admin/subsidio-historial/remover', {
        clienteId,
        subsidioId,
        motivo,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio removido', description: 'El cliente fue removido del subsidio' });
      queryClient.invalidateQueries({ queryKey: ['admin-subsidio-historial'] });
      queryClient.invalidateQueries({ queryKey: ['admin-subsidios'] });
      setShowRemove(false);
      setRemoveEntry(null);
      setRemoveMotivo('');
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al remover subsidio',
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingSubsidio(null);
    setFormData(initialFormData);
    setShowForm(true);
  };

  const handleOpenEdit = (subsidio: Subsidio) => {
    setEditingSubsidio(subsidio);
    setFormData({
      id: subsidio.id.toString(),
      limiteM3: subsidio.limiteM3.toString(),
      porcentaje: subsidio.porcentaje.toString(),
      fechaInicio: subsidio.fechaInicio,
      fechaTermino: subsidio.fechaTermino || '',
      numeroDecreto: subsidio.numeroDecreto || '',
      observaciones: subsidio.observaciones || '',
      estado: subsidio.estado,
    });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSubsidio(null);
    setFormData(initialFormData);
  };

  const handleInputChange = (field: keyof SubsidioFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingSubsidio) {
      updateMutation.mutate({
        id: editingSubsidio.id,
        data: {
          limiteM3: parseInt(formData.limiteM3) || 0,
          porcentaje: parseFloat(formData.porcentaje) || 0,
          fechaInicio: formData.fechaInicio,
          fechaTermino: formData.fechaTermino || null,
          numeroDecreto: formData.numeroDecreto || null,
          observaciones: formData.observaciones || null,
          estado: formData.estado,
        },
      });
    } else {
      createMutation.mutate({
        id: parseInt(formData.id),
        limiteM3: parseInt(formData.limiteM3) || 0,
        porcentaje: parseFloat(formData.porcentaje) || 0,
        fechaInicio: formData.fechaInicio,
        fechaTermino: formData.fechaTermino || null,
        numeroDecreto: formData.numeroDecreto || null,
        observaciones: formData.observaciones || null,
      });
    }
  };

  const subsidiosColumns = [
    {
      key: 'id',
      header: 'ID',
      render: (subsidio: Subsidio) => (
        <span className="font-medium text-slate-900">{subsidio.id}</span>
      ),
    },
    {
      key: 'porcentaje',
      header: 'Descuento',
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
      header: 'Límite m³',
      className: 'text-center',
      headerClassName: 'text-center',
      render: (subsidio: Subsidio) => (
        <span className="text-slate-700">{subsidio.limiteM3} m³</span>
      ),
    },
    {
      key: 'historial',
      header: 'Clientes',
      className: 'text-center hidden sm:table-cell',
      headerClassName: 'text-center hidden sm:table-cell',
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
    {
      key: 'acciones',
      header: 'Acciones',
      className: 'text-right',
      headerClassName: 'text-right',
      render: (subsidio: Subsidio) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenEdit(subsidio)}
              className="text-slate-600 hover:text-blue-600"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && subsidio.cantidadHistorial === 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteSubsidio(subsidio)}
              className="text-slate-600 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const historialColumns = [
    {
      key: 'cliente',
      header: 'Cliente',
      render: (entry: HistorialEntry) => (
        <div>
          <span className="font-medium text-slate-900">
            {entry.cliente?.nombre || entry.numeroCliente}
          </span>
          <div className="text-xs text-slate-500">{entry.numeroCliente}</div>
        </div>
      ),
    },
    {
      key: 'subsidio',
      header: 'Subsidio',
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
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            entry.tipoCambio === 'alta'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {entry.tipoCambio === 'alta' ? 'Alta' : 'Baja'}
        </span>
      ),
    },
    {
      key: 'fechaCambio',
      header: 'Fecha',
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (entry: HistorialEntry) =>
        entry.fechaCambio
          ? format(new Date(entry.fechaCambio), 'dd/MM/yyyy', { locale: es })
          : '-',
    },
    {
      key: 'acciones',
      header: 'Acciones',
      className: 'text-right',
      headerClassName: 'text-right',
      render: (entry: HistorialEntry) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canDelete && entry.tipoCambio === 'alta' && entry.subsidio && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRemoveEntry(entry);
                setShowRemove(true);
              }}
              className="text-slate-600 hover:text-red-600"
              title="Dar de baja"
            >
              <UserMinus className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Subsidios"
      subtitle="Gestión de subsidios de agua potable"
      icon={<Percent className="h-5 w-5 text-blue-600" />}
      actions={
        activeTab === 'tipos' ? (
          <PermissionGate entity="subsidios" action="create">
            <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Subsidio
            </Button>
          </PermissionGate>
        ) : (
          <PermissionGate entity="subsidios" action="create">
            <Button onClick={() => setShowAssign(true)} className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="h-4 w-4 mr-2" />
              Asignar Cliente
            </Button>
          </PermissionGate>
        )
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="tipos">Tipos de Subsidio</TabsTrigger>
          <TabsTrigger value="clientes">Clientes con Subsidio</TabsTrigger>
        </TabsList>

        <TabsContent value="tipos">
          <DataTable
            columns={subsidiosColumns}
            data={subsidiosData?.subsidios || []}
            keyExtractor={(subsidio) => subsidio.id}
            isLoading={loadingSubsidios}
            emptyMessage="No hay subsidios registrados"
            emptyIcon={<Percent className="h-12 w-12 text-slate-300" />}
            pagination={
              subsidiosData?.pagination && {
                page: subsidiosData.pagination.page,
                totalPages: subsidiosData.pagination.totalPages,
                total: subsidiosData.pagination.total,
                onPageChange: setPage,
              }
            }
          />
        </TabsContent>

        <TabsContent value="clientes">
          {/* Filters */}
          <div className="mb-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente..."
                value={historialSearch}
                onChange={(e) => {
                  setHistorialSearch(e.target.value);
                  setHistorialPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select
              value={historialFilter || 'all'}
              onValueChange={(val) => {
                setHistorialFilter(val === 'all' ? '' : val);
                setHistorialPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="alta">Altas</SelectItem>
                <SelectItem value="baja">Bajas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={historialColumns}
            data={historialData?.historial || []}
            keyExtractor={(entry) => entry.id}
            isLoading={loadingHistorial}
            emptyMessage="No hay registros de subsidios"
            emptyIcon={<Percent className="h-12 w-12 text-slate-300" />}
            pagination={
              historialData?.pagination && {
                page: historialData.pagination.page,
                totalPages: historialData.pagination.totalPages,
                total: historialData.pagination.total,
                onPageChange: setHistorialPage,
              }
            }
          />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Subsidio Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSubsidio ? 'Editar Subsidio' : 'Nuevo Subsidio'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ID Subsidio *
                </label>
                <Input
                  type="number"
                  value={formData.id}
                  onChange={(e) => handleInputChange('id', e.target.value)}
                  placeholder="1"
                  required
                  disabled={!!editingSubsidio}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Porcentaje *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.porcentaje}
                  onChange={(e) => handleInputChange('porcentaje', e.target.value)}
                  placeholder="50"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Límite m³ *
              </label>
              <Input
                type="number"
                value={formData.limiteM3}
                onChange={(e) => handleInputChange('limiteM3', e.target.value)}
                placeholder="15"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha Inicio *
                </label>
                <Input
                  type="date"
                  value={formData.fechaInicio}
                  onChange={(e) => handleInputChange('fechaInicio', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha Término
                </label>
                <Input
                  type="date"
                  value={formData.fechaTermino}
                  onChange={(e) => handleInputChange('fechaTermino', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Número de Decreto
              </label>
              <Input
                value={formData.numeroDecreto}
                onChange={(e) => handleInputChange('numeroDecreto', e.target.value)}
                placeholder="Ej: D.S. 195"
              />
            </div>

            {editingSubsidio && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Estado
                </label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) => handleInputChange('estado', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Observaciones
              </label>
              <Textarea
                value={formData.observaciones}
                onChange={(e) => handleInputChange('observaciones', e.target.value)}
                placeholder="Observaciones opcionales"
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Guardando...'
                  : editingSubsidio
                  ? 'Guardar Cambios'
                  : 'Crear Subsidio'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Client Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar Cliente a Subsidio</DialogTitle>
            <DialogDescription>
              Ingrese el ID del cliente y seleccione el subsidio a asignar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                ID del Cliente *
              </label>
              <Input
                value={assignClienteId}
                onChange={(e) => setAssignClienteId(e.target.value)}
                placeholder="Ingrese ID del cliente"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Subsidio *
              </label>
              <Select value={assignSubsidioId} onValueChange={setAssignSubsidioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un subsidio" />
                </SelectTrigger>
                <SelectContent>
                  {activeSubsidios?.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.porcentaje}% - {s.limiteM3}m³
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                assignMutation.mutate({
                  clienteId: assignClienteId,
                  subsidioId: parseInt(assignSubsidioId),
                })
              }
              disabled={!assignClienteId || !assignSubsidioId || assignMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {assignMutation.isPending ? 'Asignando...' : 'Asignar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Client Dialog */}
      <Dialog open={showRemove} onOpenChange={setShowRemove}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover Subsidio de Cliente</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea remover el subsidio de{' '}
              {removeEntry?.cliente?.nombre || removeEntry?.numeroCliente}?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo (opcional)
            </label>
            <Textarea
              value={removeMotivo}
              onChange={(e) => setRemoveMotivo(e.target.value)}
              placeholder="Ingrese el motivo de la baja"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemove(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                removeEntry &&
                removeEntry.subsidio &&
                removeMutation.mutate({
                  clienteId: removeEntry.clienteId,
                  subsidioId: removeEntry.subsidio.id,
                  motivo: removeMotivo,
                })
              }
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? 'Removiendo...' : 'Remover Subsidio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Subsidio Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteSubsidio}
        onOpenChange={(open) => !open && setDeleteSubsidio(null)}
        itemName={`Subsidio ${deleteSubsidio?.id || ''} (${deleteSubsidio?.porcentaje || 0}%)`}
        onConfirm={() => deleteSubsidio && deleteMutation.mutate(deleteSubsidio.id)}
        isLoading={deleteMutation.isPending}
      />
    </AdminLayout>
  );
}
