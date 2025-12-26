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
  useSortState,
  useCanAccess,
  useAdminTable,
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
  const canEdit = useCanAccess('subsidios', 'edit');
  const canDelete = useCanAccess('subsidios', 'delete');

  // Use the admin table hook for subsidios
  const {
    data: subsidios,
    tableProps: subsidiosTableProps,
    refetch: refetchSubsidios,
  } = useAdminTable<Subsidio>({
    endpoint: '/admin/subsidios',
    queryKey: 'admin-subsidios',
    dataKey: 'subsidios',
    defaultSort: { column: 'porcentaje', direction: 'desc' },
  });

  const [activeTab, setActiveTab] = useState('tipos');
  const [historialPage, setHistorialPage] = useState(1);
  const [historialSearch, setHistorialSearch] = useState('');
  const [historialFilter, setHistorialFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSubsidio, setEditingSubsidio] = useState<Subsidio | null>(null);
  const [deleteSubsidio, setDeleteSubsidio] = useState<Subsidio | null>(null);
  const [formData, setFormData] = useState<SubsidioFormData>(initialFormData);
  const [selectedSubsidio, setSelectedSubsidio] = useState<Subsidio | null>(null);
  const [selectedHistorial, setSelectedHistorial] = useState<HistorialEntry | null>(null);

  // Use the sort hook for historial (keeping separate as it has different state)
  const {
    sortBy: historialSortBy,
    sortDirection: historialSortDirection,
    handleSort: handleHistorialSort,
  } = useSortState({
    defaultColumn: 'fechaCambio',
    defaultDirection: 'desc',
    onSortChange: () => setHistorialPage(1),
  });

  // Assign modal state
  const [showAssign, setShowAssign] = useState(false);
  const [assignClienteId, setAssignClienteId] = useState('');
  const [assignSubsidioId, setAssignSubsidioId] = useState('');

  // Remove modal state
  const [showRemove, setShowRemove] = useState(false);
  const [removeEntry, setRemoveEntry] = useState<HistorialEntry | null>(null);
  const [removeMotivo, setRemoveMotivo] = useState('');

  // Subsidios data now managed by useAdminTable hook above

  // Fetch historial (client assignments)
  const { data: historialData, isLoading: loadingHistorial } = useQuery<HistorialResponse>({
    queryKey: ['admin-subsidio-historial', historialPage, historialSearch, historialFilter, historialSortBy, historialSortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', historialPage.toString());
      params.append('limit', '20');
      if (historialSearch) params.append('search', historialSearch);
      if (historialFilter) params.append('tipoCambio', historialFilter);
      if (historialSortBy) params.append('sortBy', historialSortBy);
      params.append('sortDirection', historialSortDirection);
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
      refetchSubsidios();
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
      refetchSubsidios();
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
      refetchSubsidios();
      setDeleteSubsidio(null);
      setSelectedSubsidio(null);
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
      refetchSubsidios();
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
      refetchSubsidios();
      setShowRemove(false);
      setRemoveEntry(null);
      setRemoveMotivo('');
      setSelectedHistorial(null);
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
    setSelectedSubsidio(null);
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

  // Columns use SortableHeader with just column and label - context provides the rest!
  const subsidiosColumns = [
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

  // Historial columns - these need explicit props since they're in a different table with different sort state
  const historialColumns = [
    {
      key: 'cliente',
      header: (
        <SortableHeader
          column="cliente"
          label="Cliente"
          sortBy={historialSortBy}
          sortDirection={historialSortDirection}
          onSort={handleHistorialSort}
        />
      ),
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
      header: (
        <SortableHeader
          column="subsidio"
          label="Subsidio"
          sortBy={historialSortBy}
          sortDirection={historialSortDirection}
          onSort={handleHistorialSort}
        />
      ),
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
        <StatusBadge
          status={entry.tipoCambio}
          statusMap={{
            alta: { label: 'Alta', className: 'bg-emerald-100 text-emerald-700' },
            baja: { label: 'Baja', className: 'bg-red-100 text-red-700' },
          }}
        />
      ),
    },
    {
      key: 'fechaCambio',
      header: (
        <SortableHeader
          column="fechaCambio"
          label="Fecha"
          sortBy={historialSortBy}
          sortDirection={historialSortDirection}
          onSort={handleHistorialSort}
        />
      ),
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (entry: HistorialEntry) =>
        entry.fechaCambio
          ? format(new Date(entry.fechaCambio), 'dd/MM/yyyy', { locale: es })
          : '-',
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
            data={subsidios}
            keyExtractor={(subsidio) => subsidio.id}
            emptyMessage="No hay subsidios registrados"
            emptyIcon={<Percent className="h-12 w-12 text-slate-300" />}
            onRowClick={(subsidio) => setSelectedSubsidio(subsidio)}
            {...subsidiosTableProps}
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
            onRowClick={(entry) => setSelectedHistorial(entry)}
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

      {/* Subsidio Detail Modal */}
      <Dialog open={!!selectedSubsidio && !showForm} onOpenChange={(open) => !open && setSelectedSubsidio(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de Subsidio</DialogTitle>
          </DialogHeader>
          {selectedSubsidio && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">ID</span>
                  <p className="font-medium">{selectedSubsidio.id}</p>
                </div>
                <div>
                  <span className="text-slate-500">Porcentaje</span>
                  <p className="font-medium text-emerald-600">{selectedSubsidio.porcentaje}%</p>
                </div>
                <div>
                  <span className="text-slate-500">Límite m³</span>
                  <p className="font-medium">{selectedSubsidio.limiteM3} m³</p>
                </div>
                <div>
                  <span className="text-slate-500">Estado</span>
                  <p><StatusBadge status={selectedSubsidio.estado} /></p>
                </div>
                <div>
                  <span className="text-slate-500">Fecha Inicio</span>
                  <p className="font-medium">
                    {format(new Date(selectedSubsidio.fechaInicio), 'dd/MM/yyyy', { locale: es })}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Fecha Término</span>
                  <p className="font-medium">
                    {selectedSubsidio.fechaTermino
                      ? format(new Date(selectedSubsidio.fechaTermino), 'dd/MM/yyyy', { locale: es })
                      : 'Sin fecha fin'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Clientes Asignados</span>
                  <p className="font-medium">{selectedSubsidio.cantidadHistorial}</p>
                </div>
                {selectedSubsidio.numeroDecreto && (
                  <div>
                    <span className="text-slate-500">Número de Decreto</span>
                    <p className="font-medium">{selectedSubsidio.numeroDecreto}</p>
                  </div>
                )}
                {selectedSubsidio.observaciones && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Observaciones</span>
                    <p className="font-medium">{selectedSubsidio.observaciones}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                {canDelete && selectedSubsidio.cantidadHistorial === 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setDeleteSubsidio(selectedSubsidio)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                )}
                {canEdit && (
                  <Button onClick={() => handleOpenEdit(selectedSubsidio)} className="bg-blue-600 hover:bg-blue-700">
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Historial Entry Detail Modal */}
      <Dialog open={!!selectedHistorial} onOpenChange={(open) => !open && setSelectedHistorial(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de Asignación</DialogTitle>
          </DialogHeader>
          {selectedHistorial && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Cliente</span>
                  <p className="font-medium">{selectedHistorial.cliente?.nombre || selectedHistorial.numeroCliente}</p>
                </div>
                <div>
                  <span className="text-slate-500">N° Cliente</span>
                  <p className="font-medium">{selectedHistorial.numeroCliente}</p>
                </div>
                <div>
                  <span className="text-slate-500">Subsidio</span>
                  <p className="font-medium text-emerald-600">
                    {selectedHistorial.subsidio ? `${selectedHistorial.subsidio.porcentaje}% (${selectedHistorial.subsidio.limiteM3} m³)` : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Tipo</span>
                  <p>
                    <StatusBadge
                      status={selectedHistorial.tipoCambio}
                      statusMap={{
                        alta: { label: 'Alta', className: 'bg-emerald-100 text-emerald-700' },
                        baja: { label: 'Baja', className: 'bg-red-100 text-red-700' },
                      }}
                    />
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Fecha</span>
                  <p className="font-medium">
                    {selectedHistorial.fechaCambio
                      ? format(new Date(selectedHistorial.fechaCambio), 'dd/MM/yyyy', { locale: es })
                      : '-'}
                  </p>
                </div>
                {selectedHistorial.detalles && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Detalles</span>
                    <p className="font-medium">{selectedHistorial.detalles}</p>
                  </div>
                )}
              </div>
              {canDelete && selectedHistorial.tipoCambio === 'alta' && selectedHistorial.subsidio && (
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRemoveEntry(selectedHistorial);
                      setShowRemove(true);
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    <UserMinus className="h-4 w-4 mr-2" />
                    Dar de Baja
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
