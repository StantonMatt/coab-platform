import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Percent, Plus, Pencil, Trash2, Check, Search, UserPlus, UserMinus, X } from 'lucide-react';
import { formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
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
import SimpleMonthYearPicker from '@/components/SimpleMonthYearPicker';
import {
  AdminLayout,
  DataTable,
  StatusBadge,
  DeleteConfirmDialog,
  PermissionGate,
  SortableHeader,
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
  esActivo: boolean;
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

interface HistorialFilters extends Record<string, unknown> {
  search: string;
  tipoCambio: string;
  esActivo: string;
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
    dataStaleTime: 30000, // Cache for 30 seconds
  });

  const [activeTab, setActiveTab] = useState('tipos');
  const [showForm, setShowForm] = useState(false);
  const [editingSubsidio, setEditingSubsidio] = useState<Subsidio | null>(null);
  const [deleteSubsidio, setDeleteSubsidio] = useState<Subsidio | null>(null);
  const [formData, setFormData] = useState<SubsidioFormData>(initialFormData);
  const [selectedSubsidio, setSelectedSubsidio] = useState<Subsidio | null>(null);
  const [selectedHistorial, setSelectedHistorial] = useState<HistorialEntry | null>(null);

  // Use the admin table hook for historial (second tab)
  const {
    data: historialEntries,
    tableProps: historialTableProps,
    filters: historialFilters,
    setFilter: setHistorialFilter,
    refetch: refetchHistorial,
  } = useAdminTable<HistorialEntry, HistorialFilters>({
    endpoint: '/admin/subsidio-historial',
    queryKey: 'admin-subsidio-historial',
    dataKey: 'historial',
    defaultSort: { column: 'fechaCambio', direction: 'desc' },
    defaultFilters: { search: '', tipoCambio: '', esActivo: '' },
    enabled: activeTab === 'clientes',
    debouncedFilterKeys: ['search'], // Debounce search input
    debounceMs: 300,
    dataStaleTime: 30000, // Cache for 30 seconds
  });

  // Assign modal state
  const [showAssign, setShowAssign] = useState(false);
  const [assignClienteId, setAssignClienteId] = useState('');
  const [assignSubsidioId, setAssignSubsidioId] = useState('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<{
    id: string;
    numeroCliente: string;
    nombre: string;
  } | null>(null);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [assignMonth, setAssignMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const clienteSearchRef = useRef<HTMLDivElement>(null);

  // Remove modal state
  const [showRemove, setShowRemove] = useState(false);
  const [removeEntry, setRemoveEntry] = useState<HistorialEntry | null>(null);
  const [removeMotivo, setRemoveMotivo] = useState('');
  const [removeMonth, setRemoveMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Edit historial entry modal state
  const [showEditHistorial, setShowEditHistorial] = useState(false);
  const [editHistorialEntry, setEditHistorialEntry] = useState<HistorialEntry | null>(null);
  const [editHistorialMonth, setEditHistorialMonth] = useState('');
  const [editHistorialDetalles, setEditHistorialDetalles] = useState('');

  // Delete historial entry confirmation state
  const [showDeleteHistorial, setShowDeleteHistorial] = useState(false);
  const [deleteHistorialEntry, setDeleteHistorialEntry] = useState<HistorialEntry | null>(null);

  // Reassign modal state (when client already has a subsidy)
  const [showReassign, setShowReassign] = useState(false);
  const [reassignClienteInfo, setReassignClienteInfo] = useState<{
    clienteId: string;
    clienteName: string;
    clienteNumero: string;
    currentSubsidio: { id: number; porcentaje: number; limiteM3: number };
  } | null>(null);
  const [reassignNewSubsidioId, setReassignNewSubsidioId] = useState('');
  const [reassignMonth, setReassignMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Both subsidios and historial data now managed by useAdminTable hooks above

  // Fetch active subsidios for the assign dropdown
  const { data: activeSubsidios } = useQuery<Subsidio[]>({
    queryKey: ['admin-subsidios-activos'],
    queryFn: async () => {
      const res = await adminApiClient.get('/admin/subsidios/activos');
      return res.data.subsidios;
    },
  });

  // Search clients by numeroCliente for autocomplete
  const { data: clienteResults, isLoading: searchingClientes } = useQuery<{
    data: Array<{
      id: string;
      numeroCliente: string;
      nombre: string;
      rut: string;
    }>;
  }>({
    queryKey: ['admin-clientes-search', clienteSearch],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes?q=${encodeURIComponent(clienteSearch)}&limit=10`);
      return res.data;
    },
    enabled: clienteSearch.length >= 2 && !selectedCliente, // Backend requires min 2 chars
    staleTime: 300000, // 5 minutes
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clienteSearchRef.current && !clienteSearchRef.current.contains(event.target as Node)) {
        setShowClienteDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    mutationFn: async ({ clienteId, subsidioId, fechaCambio }: { clienteId: string; subsidioId: number; fechaCambio: string }) => {
      const res = await adminApiClient.post('/admin/subsidio-historial/asignar', {
        clienteId,
        subsidioId,
        fechaCambio,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio asignado', description: 'El cliente fue asignado al subsidio' });
      refetchHistorial();
      refetchSubsidios();
      setShowAssign(false);
      setAssignClienteId('');
      setAssignSubsidioId('');
      setSelectedCliente(null);
      setClienteSearch('');
      // Reset month to current
      const now = new Date();
      setAssignMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    },
    onError: (error: any) => {
      const errorCode = error.response?.data?.error?.code;
      if (errorCode === 'CLIENTE_YA_TIENE_SUBSIDIO' && selectedCliente) {
        // Client already has a subsidy - offer to reassign
        const currentSubsidio = error.response?.data?.error?.currentSubsidio?.subsidio;
        if (currentSubsidio) {
          setReassignClienteInfo({
            clienteId: selectedCliente.id,
            clienteName: selectedCliente.nombre,
            clienteNumero: selectedCliente.numeroCliente,
            currentSubsidio,
          });
          setReassignNewSubsidioId(assignSubsidioId);
          setShowAssign(false);
          setShowReassign(true);
        }
      } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al asignar subsidio',
        });
      }
    },
  });

  // Reassign mutation
  const reassignMutation = useMutation({
    mutationFn: async ({
      clienteId,
      newSubsidioId,
      fechaCambio,
    }: {
      clienteId: string;
      newSubsidioId: number;
      fechaCambio: string;
    }) => {
      const res = await adminApiClient.post('/admin/subsidio-historial/reasignar', {
        clienteId,
        newSubsidioId,
        fechaCambio,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio reasignado', description: 'El cliente fue reasignado correctamente' });
      refetchHistorial();
      refetchSubsidios();
      setShowReassign(false);
      setReassignClienteInfo(null);
      setReassignNewSubsidioId('');
      setSelectedCliente(null);
      setAssignClienteId('');
      setClienteSearch('');
      // Reset month to current
      const now = new Date();
      setReassignMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al reasignar subsidio',
      });
    },
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: async ({
      clienteId,
      subsidioId,
      motivo,
      fechaCambio,
    }: {
      clienteId: string;
      subsidioId: number;
      motivo: string;
      fechaCambio: string;
    }) => {
      const res = await adminApiClient.post('/admin/subsidio-historial/remover', {
        clienteId,
        subsidioId,
        motivo,
        fechaCambio,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio removido', description: 'El cliente fue removido del subsidio' });
      refetchHistorial();
      refetchSubsidios();
      setShowRemove(false);
      setRemoveEntry(null);
      setRemoveMotivo('');
      setSelectedHistorial(null);
      // Reset month to current
      const now = new Date();
      setRemoveMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al remover subsidio',
      });
    },
  });

  // Edit historial entry mutation
  const editHistorialMutation = useMutation({
    mutationFn: async ({
      id,
      fechaCambio,
      detalles,
    }: {
      id: string;
      fechaCambio?: string;
      detalles?: string;
    }) => {
      const res = await adminApiClient.patch(`/admin/subsidio-historial/${id}`, {
        fechaCambio,
        detalles,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Registro actualizado', description: 'El registro fue modificado correctamente' });
      refetchHistorial();
      setShowEditHistorial(false);
      setEditHistorialEntry(null);
      setSelectedHistorial(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al editar registro',
      });
    },
  });

  // Delete historial entry mutation
  const deleteHistorialMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminApiClient.delete(`/admin/subsidio-historial/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Registro eliminado', description: 'El registro fue eliminado correctamente' });
      refetchHistorial();
      refetchSubsidios();
      setShowDeleteHistorial(false);
      setDeleteHistorialEntry(null);
      setSelectedHistorial(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al eliminar registro',
      });
    },
  });

  // Handler to open edit historial modal
  const handleOpenEditHistorial = (entry: HistorialEntry) => {
    setEditHistorialEntry(entry);
    // Parse date to get month-year
    if (entry.fechaCambio) {
      const date = new Date(entry.fechaCambio);
      setEditHistorialMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    } else {
      const now = new Date();
      setEditHistorialMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
    setEditHistorialDetalles(entry.detalles || '');
    setShowEditHistorial(true);
    setSelectedHistorial(null);
  };

  // Handler to open delete historial confirmation
  const handleOpenDeleteHistorial = (entry: HistorialEntry) => {
    setDeleteHistorialEntry(entry);
    setShowDeleteHistorial(true);
    setSelectedHistorial(null);
  };

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
          label="N° Cliente"
          sortBy={historialTableProps.sorting.sortBy}
          sortDirection={historialTableProps.sorting.sortDirection}
          onSort={historialTableProps.sorting.onSort}
        />
      ),
      render: (entry: HistorialEntry) => (
        <div>
          <span className="font-medium text-slate-900">
            {entry.numeroCliente}
          </span>
          {entry.cliente?.nombre && (
            <div className="text-xs text-slate-500">{entry.cliente.nombre}</div>
          )}
        </div>
      ),
    },
    {
      key: 'subsidio',
      header: (
        <SortableHeader
          column="subsidio"
          label="Subsidio"
          sortBy={historialTableProps.sorting.sortBy}
          sortDirection={historialTableProps.sorting.sortDirection}
          onSort={historialTableProps.sorting.onSort}
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
            alta: { label: 'Agregado', className: 'bg-emerald-100 text-emerald-700' },
            baja: { label: 'Eliminado', className: 'bg-red-100 text-red-700' },
            agregado: { label: 'Agregado', className: 'bg-emerald-100 text-emerald-700' },
            eliminado: { label: 'Eliminado', className: 'bg-red-100 text-red-700' },
          }}
        />
      ),
    },
    {
      key: 'esActivo',
      header: 'Estado Actual',
      render: (entry: HistorialEntry) => (
        <StatusBadge
          status={entry.esActivo ? 'activo' : 'inactivo'}
          statusMap={{
            activo: { label: 'Activo', className: 'bg-blue-100 text-blue-700' },
            inactivo: { label: 'Inactivo', className: 'bg-slate-100 text-slate-600' },
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
          sortBy={historialTableProps.sorting.sortBy}
          sortDirection={historialTableProps.sorting.sortDirection}
          onSort={historialTableProps.sorting.onSort}
        />
      ),
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (entry: HistorialEntry) =>
        entry.fechaCambio
          ? formatearFechaSinHora(entry.fechaCambio, FORMATOS_FECHA.CORTO)
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
                value={historialFilters.search}
                onChange={(e) => setHistorialFilter('search', e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={historialFilters.tipoCambio || 'all'}
              onValueChange={(val) => setHistorialFilter('tipoCambio', val === 'all' ? '' : val)}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="agregado">Agregados</SelectItem>
                <SelectItem value="eliminado">Eliminados</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={historialFilters.esActivo || 'all'}
              onValueChange={(val) => setHistorialFilter('esActivo', val === 'all' ? '' : val)}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Estados</SelectItem>
                <SelectItem value="activo">Solo Activos</SelectItem>
                <SelectItem value="inactivo">Solo Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={historialColumns}
            data={historialEntries}
            keyExtractor={(entry) => entry.id}
            emptyMessage="No hay registros de subsidios"
            emptyIcon={<Percent className="h-12 w-12 text-slate-300" />}
            onRowClick={(entry) => setSelectedHistorial(entry)}
            {...historialTableProps}
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
                    {formatearFechaSinHora(selectedSubsidio.fechaInicio, FORMATOS_FECHA.CORTO)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Fecha Término</span>
                  <p className="font-medium">
                    {selectedSubsidio.fechaTermino
                      ? formatearFechaSinHora(selectedSubsidio.fechaTermino, FORMATOS_FECHA.CORTO)
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
                        alta: { label: 'Agregado', className: 'bg-emerald-100 text-emerald-700' },
                        baja: { label: 'Eliminado', className: 'bg-red-100 text-red-700' },
                        agregado: { label: 'Agregado', className: 'bg-emerald-100 text-emerald-700' },
                        eliminado: { label: 'Eliminado', className: 'bg-red-100 text-red-700' },
                      }}
                    />
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Fecha</span>
                  <p className="font-medium">
                    {selectedHistorial.fechaCambio
                      ? formatearFechaSinHora(selectedHistorial.fechaCambio, FORMATOS_FECHA.CORTO)
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
              {/* Actions section */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                {/* Info message for already dado de baja entries */}
                {(selectedHistorial.tipoCambio === 'eliminado' || selectedHistorial.tipoCambio === 'baja') && (
                  <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg">
                    <p className="text-sm text-slate-700">
                      <strong>Este registro indica que el cliente ya fue dado de baja</strong> de este subsidio en la fecha indicada.
                    </p>
                  </div>
                )}

                {/* Dar de Baja - only for active/agregado entries */}
                {canDelete && (selectedHistorial.tipoCambio === 'alta' || selectedHistorial.tipoCambio === 'agregado') && selectedHistorial.subsidio && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 mb-2">
                      <strong>Dar de Baja:</strong> Crea un nuevo registro indicando que el cliente dejó de recibir este subsidio.
                    </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRemoveEntry(selectedHistorial);
                      setShowRemove(true);
                    }}
                      className="text-amber-700 border-amber-300 hover:bg-amber-100"
                  >
                    <UserMinus className="h-4 w-4 mr-2" />
                    Dar de Baja
                  </Button>
                </div>
              )}

                {/* Edit and Delete - for correcting mistakes */}
                {(canEdit || canDelete) && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-sm text-slate-600 mb-2">
                      <strong>Corregir registro:</strong> Modifica o elimina este registro específico (para corregir errores de entrada).
                    </p>
                    <div className="flex gap-2">
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditHistorial(selectedHistorial)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDeleteHistorial(selectedHistorial)}
                          className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar Registro
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
      <Dialog open={showAssign} onOpenChange={(open) => {
        setShowAssign(open);
        if (!open) {
          setSelectedCliente(null);
          setClienteSearch('');
          setAssignSubsidioId('');
          setShowClienteDropdown(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar Cliente a Subsidio</DialogTitle>
            <DialogDescription>
              Busque el cliente por número de cliente y seleccione el subsidio a asignar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Cliente search with autocomplete */}
            <div ref={clienteSearchRef}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Número de Cliente *
              </label>
              {selectedCliente ? (
                // Locked in client display
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div>
                    <div className="font-medium text-slate-900">{selectedCliente.numeroCliente}</div>
                    <div className="text-sm text-slate-600">{selectedCliente.nombre}</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCliente(null);
                      setAssignClienteId('');
                      setClienteSearch('');
                    }}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                // Search input with dropdown
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                    value={clienteSearch}
                    onChange={(e) => {
                      setClienteSearch(e.target.value);
                      setShowClienteDropdown(true);
                    }}
                    onFocus={() => setShowClienteDropdown(true)}
                    placeholder="Escriba al menos 2 caracteres..."
                    className="pl-9"
                    autoComplete="off"
                  />
                  {/* Dropdown results */}
                  {showClienteDropdown && clienteSearch.length >= 2 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {searchingClientes ? (
                        <div className="p-3 text-center text-slate-500 text-sm">
                          Buscando...
            </div>
                      ) : clienteResults?.data && clienteResults.data.length > 0 ? (
                        clienteResults.data.map((cliente) => (
                          <button
                            key={cliente.id}
                            type="button"
                            onClick={() => {
                              setSelectedCliente({
                                id: cliente.id,
                                numeroCliente: cliente.numeroCliente,
                                nombre: cliente.nombre,
                              });
                              setAssignClienteId(cliente.id);
                              setShowClienteDropdown(false);
                              setClienteSearch('');
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors"
                          >
                            <div className="font-medium text-slate-900">{cliente.numeroCliente}</div>
                            <div className="text-sm text-slate-600">{cliente.nombre}</div>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-slate-500 text-sm">
                          No se encontraron clientes
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subsidio selection */}
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

            {/* Month selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mes de Aplicación *
              </label>
              <SimpleMonthYearPicker
                value={assignMonth}
                onChange={setAssignMonth}
              />
              <p className="text-xs text-slate-500 mt-1">
                La fecha de asignación será el primer día del mes seleccionado
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                // Convert month to first day of month in ISO format
                const [year, month] = assignMonth.split('-');
                const fechaCambio = `${year}-${month}-01`;
                assignMutation.mutate({
                  clienteId: assignClienteId,
                  subsidioId: parseInt(assignSubsidioId),
                  fechaCambio,
                });
              }}
              disabled={!assignClienteId || !assignSubsidioId || !assignMonth || assignMutation.isPending}
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
          <div className="space-y-4 py-4">
            {/* Month selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Último mes con subsidio *
              </label>
              <SimpleMonthYearPicker
                value={removeMonth}
                onChange={setRemoveMonth}
              />
              <p className="text-xs text-slate-500 mt-1">
                Seleccione el <strong>último mes</strong> en que el cliente recibió el subsidio.
                A partir del mes siguiente, ya no lo recibirá.
              </p>
            </div>

            {/* Motivo */}
            <div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemove(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removeEntry && removeEntry.subsidio) {
                  // Calculate last day of selected month
                  const [year, month] = removeMonth.split('-').map(Number);
                  const lastDay = new Date(year, month, 0).getDate();
                  const fechaCambio = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                  
                removeMutation.mutate({
                  clienteId: removeEntry.clienteId,
                  subsidioId: removeEntry.subsidio.id,
                  motivo: removeMotivo,
                    fechaCambio,
                  });
              }
              }}
              disabled={removeMutation.isPending || !removeMonth}
            >
              {removeMutation.isPending ? 'Removiendo...' : 'Remover Subsidio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Historial Entry Dialog */}
      <Dialog open={showEditHistorial} onOpenChange={setShowEditHistorial}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Registro de Subsidio</DialogTitle>
            <DialogDescription>
              Corrija los datos de este registro. Use esto solo para corregir errores de entrada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editHistorialEntry && (
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-medium">{editHistorialEntry.cliente?.nombre || editHistorialEntry.numeroCliente}</span>
                  <span className="text-slate-500">Tipo:</span>
                  <span className="font-medium capitalize">{editHistorialEntry.tipoCambio}</span>
                </div>
              </div>
            )}
            
            {/* Month selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mes del Cambio *
              </label>
              <SimpleMonthYearPicker
                value={editHistorialMonth}
                onChange={setEditHistorialMonth}
              />
              <p className="text-xs text-slate-500 mt-1">
                {editHistorialEntry?.tipoCambio === 'agregado' || editHistorialEntry?.tipoCambio === 'alta'
                  ? 'El primer mes en que el cliente recibió el subsidio.'
                  : 'El último mes en que el cliente recibió el subsidio.'}
              </p>
            </div>

            {/* Detalles */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Detalles / Observaciones
              </label>
              <Textarea
                value={editHistorialDetalles}
                onChange={(e) => setEditHistorialDetalles(e.target.value)}
                placeholder="Detalles adicionales del registro"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditHistorial(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editHistorialEntry) {
                  // For alta/agregado: first day of month
                  // For baja/eliminado: last day of month
                  const [year, month] = editHistorialMonth.split('-').map(Number);
                  const isAlta = editHistorialEntry.tipoCambio === 'alta' || editHistorialEntry.tipoCambio === 'agregado';
                  const fechaCambio = isAlta
                    ? `${year}-${String(month).padStart(2, '0')}-01`
                    : `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
                  
                  editHistorialMutation.mutate({
                    id: editHistorialEntry.id,
                    fechaCambio,
                    detalles: editHistorialDetalles || undefined,
                  });
                }
              }}
              disabled={editHistorialMutation.isPending || !editHistorialMonth}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editHistorialMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Historial Entry Confirmation Dialog */}
      <Dialog open={showDeleteHistorial} onOpenChange={setShowDeleteHistorial}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Registro de Subsidio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Warning */}
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium mb-2">⚠️ Atención: Esta acción elimina el registro permanentemente</p>
              <p className="text-sm text-red-700">
                Use esta opción <strong>solo para corregir errores de entrada</strong>. 
                Si desea terminar el subsidio de un cliente, use la opción "Dar de Baja" en su lugar.
              </p>
            </div>

            {deleteHistorialEntry && (
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                <p className="font-medium mb-2">Registro a eliminar:</p>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-medium">{deleteHistorialEntry.cliente?.nombre || deleteHistorialEntry.numeroCliente}</span>
                  <span className="text-slate-500">N° Cliente:</span>
                  <span className="font-medium">{deleteHistorialEntry.numeroCliente}</span>
                  <span className="text-slate-500">Tipo:</span>
                  <span className="font-medium capitalize">{deleteHistorialEntry.tipoCambio}</span>
                  <span className="text-slate-500">Fecha:</span>
                  <span className="font-medium">
                    {deleteHistorialEntry.fechaCambio
                      ? formatearFechaSinHora(deleteHistorialEntry.fechaCambio, FORMATOS_FECHA.CORTO)
                      : '-'}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteHistorial(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteHistorialEntry) {
                  deleteHistorialMutation.mutate(deleteHistorialEntry.id);
                }
              }}
              disabled={deleteHistorialMutation.isPending}
            >
              {deleteHistorialMutation.isPending ? 'Eliminando...' : 'Eliminar Registro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Client Dialog */}
      <Dialog open={showReassign} onOpenChange={(open) => {
        setShowReassign(open);
        if (!open) {
          setReassignClienteInfo(null);
          setReassignNewSubsidioId('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reasignar Subsidio</DialogTitle>
            <DialogDescription>
              El cliente ya tiene un subsidio activo. ¿Desea reasignarlo a otro subsidio?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {reassignClienteInfo && (
              <>
                {/* Current info */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800 mb-2">Cliente con subsidio activo:</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-amber-700">Cliente:</span>
                    <span className="font-medium">{reassignClienteInfo.clienteName}</span>
                    <span className="text-amber-700">N° Cliente:</span>
                    <span className="font-medium">{reassignClienteInfo.clienteNumero}</span>
                    <span className="text-amber-700">Subsidio Actual:</span>
                    <span className="font-medium text-amber-800">
                      {reassignClienteInfo.currentSubsidio.porcentaje}% ({reassignClienteInfo.currentSubsidio.limiteM3} m³)
                    </span>
                  </div>
                </div>

                {/* New subsidy selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nuevo Subsidio *
                  </label>
                  <Select value={reassignNewSubsidioId} onValueChange={setReassignNewSubsidioId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione el nuevo subsidio" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeSubsidios
                        ?.filter((s) => s.id !== reassignClienteInfo.currentSubsidio.id)
                        .map((subsidio) => (
                          <SelectItem key={subsidio.id} value={subsidio.id.toString()}>
                            {subsidio.porcentaje}% - Límite {subsidio.limiteM3} m³
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Month selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Último mes con subsidio actual *
                  </label>
                  <SimpleMonthYearPicker
                    value={reassignMonth}
                    onChange={setReassignMonth}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    El subsidio actual ({reassignClienteInfo.currentSubsidio.porcentaje}%) terminará el último día del mes seleccionado.
                    El nuevo subsidio comenzará el primer día del mes siguiente.
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReassign(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (reassignClienteInfo && reassignNewSubsidioId) {
                  // Use the first day of the selected month for the service to calculate dates
                  const [year, month] = reassignMonth.split('-').map(Number);
                  const fechaCambio = `${year}-${String(month).padStart(2, '0')}-01`;
                  
                  reassignMutation.mutate({
                    clienteId: reassignClienteInfo.clienteId,
                    newSubsidioId: parseInt(reassignNewSubsidioId),
                    fechaCambio,
                  });
                }
              }}
              disabled={reassignMutation.isPending || !reassignNewSubsidioId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {reassignMutation.isPending ? 'Reasignando...' : 'Reasignar Subsidio'}
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
