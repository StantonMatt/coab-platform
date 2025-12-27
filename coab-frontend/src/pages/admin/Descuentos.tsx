import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AdminLayout,
  DataTable,
  StatusBadge,
  PermissionGate,
  SortableHeader,
  useCanAccess,
  useAdminTable,
  DescuentoIndividualForm,
  DescuentoMasivoWizard,
} from '@/components/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import adminApi from '@/lib/adminApi';
import {
  Plus,
  Tag,
  Pencil,
  Trash2,
  User,
  Users,
  FileText,
  Search,
  Filter,
} from 'lucide-react';
import { formatearPesos, formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';

// ============================================================================
// Types
// ============================================================================

interface DescuentoAplicado {
  id: string;
  clienteId: string | null;
  clienteNombre: string | null;
  clienteNumero: string | null;
  boletaId: string | null;
  boletaPeriodo: string | null;
  descuentoId: string | null;
  descuentoNombre: string | null;
  tipoDescuento: string;
  valorDescuento: number | null;
  montoAplicado: number;
  motivoAdhoc: string | null;
  fechaAplicacion: string | null;
  estado: 'pendiente' | 'aplicado';
  esAdhoc: boolean;
}

interface DescuentoAplicadoFilters extends Record<string, unknown> {
  search: string;
  estado: string;
  tipo: string;
}

interface Descuento {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipoDescuento: string;
  valor: number;
  activo: boolean;
  fechaInicio: string | null;
  fechaFin: string | null;
  fechaCreacion: string;
  esVigente: boolean;
}

interface DescuentoFormData {
  nombre: string;
  descripcion: string;
  tipo: 'porcentaje' | 'monto_fijo';
  valor: string;
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string;
}

const emptyForm: DescuentoFormData = {
  nombre: '',
  descripcion: '',
  tipo: 'porcentaje',
  valor: '',
  activo: true,
  fecha_inicio: '',
  fecha_fin: '',
};

// ============================================================================
// Component
// ============================================================================

export default function AdminDescuentosPage() {
  const { toast } = useToast();
  const canEdit = useCanAccess('descuentos', 'edit');
  const canDelete = useCanAccess('descuentos', 'delete');

  // Tab state
  const [activeTab, setActiveTab] = useState<'aplicados' | 'plantillas'>('aplicados');

  // Creation modal state
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showIndividualForm, setShowIndividualForm] = useState(false);
  const [showMasivoWizard, setShowMasivoWizard] = useState(false);

  // Detail modal state
  const [selectedAplicado, setSelectedAplicado] = useState<DescuentoAplicado | null>(null);
  const [selectedPlantilla, setSelectedPlantilla] = useState<Descuento | null>(null);

  // Plantilla form state
  const [isPlantillaModalOpen, setIsPlantillaModalOpen] = useState(false);
  const [editingPlantillaId, setEditingPlantillaId] = useState<string | null>(null);
  const [plantillaFormData, setPlantillaFormData] = useState<DescuentoFormData>(emptyForm);
  const [deletePlantillaConfirm, setDeletePlantillaConfirm] = useState<Descuento | null>(null);

  // ============================================================================
  // Descuentos Aplicados Table
  // ============================================================================

  const {
    data: aplicados,
    tableProps: aplicadosTableProps,
    filters,
    setFilter,
    refetch: refetchAplicados,
  } = useAdminTable<DescuentoAplicado, DescuentoAplicadoFilters>({
    endpoint: '/admin/descuentos-aplicados',
    queryKey: 'admin-descuentos-aplicados',
    dataKey: 'descuentosAplicados',
    defaultSort: { column: 'fecha', direction: 'desc' },
    defaultFilters: { search: '', estado: '', tipo: '' },
    enabled: activeTab === 'aplicados',
    debouncedFilterKeys: ['search'], // Debounce search input
    debounceMs: 300,
    dataStaleTime: 30000, // Cache for 30 seconds
  });

  // ============================================================================
  // Plantillas Table
  // ============================================================================

  const {
    data: plantillas,
    tableProps: plantillasTableProps,
    refetch: refetchPlantillas,
  } = useAdminTable<Descuento>({
    endpoint: '/admin/descuentos',
    queryKey: 'admin-descuentos-plantillas',
    dataKey: 'descuentos',
    defaultSort: { column: 'nombre', direction: 'asc' },
    enabled: activeTab === 'plantillas',
    dataStaleTime: 30000, // Cache for 30 seconds
  });

  // ============================================================================
  // Mutations
  // ============================================================================

  const createIndividualMutation = useMutation({
    mutationFn: async (data: {
      clienteId: string;
      tipo: 'porcentaje' | 'monto_fijo';
      valor: number;
      motivo: string;
    }) => {
      return adminApi.post('/admin/descuentos-aplicados/individual', data);
    },
    onSuccess: () => {
      toast({ title: 'Descuento aplicado', description: 'El descuento se ha aplicado al cliente.' });
      setShowIndividualForm(false);
      refetchAplicados();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo aplicar el descuento.',
        variant: 'destructive',
      });
    },
  });

  const createMasivoMutation = useMutation({
    mutationFn: async (data: {
      descuentoId?: string;
      template?: {
        nombre: string;
        tipo: 'porcentaje' | 'monto_fijo';
        valor: number;
        descripcion?: string;
      };
      recipientFilter: 'todos' | 'ruta' | 'manual';
      rutaId?: string;
      clienteIds?: string[];
    }) => {
      return adminApi.post('/admin/descuentos-aplicados/masivo', data);
    },
    onSuccess: (response) => {
      const data = response.data;
      toast({
        title: 'Descuento masivo aplicado',
        description: data.mensaje || `Descuento aplicado a ${data.clientesAplicados} cliente(s).`,
      });
      setShowMasivoWizard(false);
      refetchAplicados();
      refetchPlantillas();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo aplicar el descuento masivo.',
        variant: 'destructive',
      });
    },
  });

  const deleteAplicadoMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApi.delete(`/admin/descuentos-aplicados/${id}`);
    },
    onSuccess: () => {
      toast({ title: 'Descuento eliminado', description: 'El descuento pendiente ha sido eliminado.' });
      setSelectedAplicado(null);
      refetchAplicados();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo eliminar el descuento.',
        variant: 'destructive',
      });
    },
  });

  const createPlantillaMutation = useMutation({
    mutationFn: async (data: DescuentoFormData) => {
      return adminApi.post('/admin/descuentos', {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        tipoDescuento: data.tipo,
        valor: parseFloat(data.valor),
        activo: data.activo,
        fechaInicio: data.fecha_inicio || new Date().toISOString().split('T')[0],
        fechaFin: data.fecha_fin || null,
      });
    },
    onSuccess: () => {
      toast({ title: 'Plantilla creada', description: 'La plantilla de descuento se ha creado exitosamente.' });
      setIsPlantillaModalOpen(false);
      setPlantillaFormData(emptyForm);
      refetchPlantillas();
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo crear la plantilla.', variant: 'destructive' });
    },
  });

  const updatePlantillaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: DescuentoFormData }) => {
      return adminApi.patch(`/admin/descuentos/${id}`, {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        tipoDescuento: data.tipo,
        valor: parseFloat(data.valor),
        activo: data.activo,
        fechaInicio: data.fecha_inicio || undefined,
        fechaFin: data.fecha_fin || null,
      });
    },
    onSuccess: () => {
      toast({ title: 'Plantilla actualizada', description: 'La plantilla de descuento se ha actualizado.' });
      setIsPlantillaModalOpen(false);
      setEditingPlantillaId(null);
      setPlantillaFormData(emptyForm);
      refetchPlantillas();
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo actualizar la plantilla.', variant: 'destructive' });
    },
  });

  const deletePlantillaMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApi.delete(`/admin/descuentos/${id}`);
    },
    onSuccess: () => {
      toast({ title: 'Plantilla eliminada', description: 'La plantilla de descuento se ha eliminado.' });
      setDeletePlantillaConfirm(null);
      setSelectedPlantilla(null);
      refetchPlantillas();
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo eliminar la plantilla.', variant: 'destructive' });
    },
  });

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleNuevoDescuento = () => {
    setShowTypeSelector(true);
  };

  const handleSelectType = (type: 'individual' | 'masivo') => {
    setShowTypeSelector(false);
    if (type === 'individual') {
      setShowIndividualForm(true);
    } else {
      setShowMasivoWizard(true);
    }
  };

  const openEditPlantilla = (plantilla: Descuento) => {
    setPlantillaFormData({
      nombre: plantilla.nombre,
      descripcion: plantilla.descripcion || '',
      tipo: plantilla.tipoDescuento as 'porcentaje' | 'monto_fijo',
      valor: plantilla.valor.toString(),
      activo: plantilla.activo,
      fecha_inicio: plantilla.fechaInicio ? plantilla.fechaInicio.split('T')[0] : '',
      fecha_fin: plantilla.fechaFin ? plantilla.fechaFin.split('T')[0] : '',
    });
    setEditingPlantillaId(plantilla.id);
    setIsPlantillaModalOpen(true);
    setSelectedPlantilla(null);
  };

  const handlePlantillaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPlantillaId) {
      updatePlantillaMutation.mutate({ id: editingPlantillaId, data: plantillaFormData });
    } else {
      createPlantillaMutation.mutate(plantillaFormData);
    }
  };

  // ============================================================================
  // Column Definitions
  // ============================================================================

  const aplicadosColumns = [
    {
      key: 'cliente',
      header: <SortableHeader column="cliente" label="Cliente" />,
      render: (da: DescuentoAplicado) => (
        <div>
          <p className="font-medium text-slate-900">{da.clienteNombre || 'N/A'}</p>
          <p className="text-sm text-slate-500">#{da.clienteNumero}</p>
        </div>
      ),
    },
    {
      key: 'descuento',
      header: 'Descuento',
      render: (da: DescuentoAplicado) => (
        <div>
          <p className="font-medium text-slate-900">
            {da.esAdhoc ? 'Ad-hoc' : da.descuentoNombre || 'N/A'}
          </p>
          <p className="text-sm text-slate-500">
            {da.tipoDescuento === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}
          </p>
        </div>
      ),
    },
    {
      key: 'monto',
      header: <SortableHeader column="monto" label="Monto" />,
      render: (da: DescuentoAplicado) => (
        <span className="font-medium text-emerald-600">
          -{formatearPesos(da.montoAplicado)}
        </span>
      ),
    },
    {
      key: 'estado',
      header: <SortableHeader column="estado" label="Estado" />,
      render: (da: DescuentoAplicado) => (
        <StatusBadge
          status={da.estado}
          statusMap={{
            pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
            aplicado: { label: 'Aplicado', className: 'bg-emerald-100 text-emerald-700' },
          }}
        />
      ),
    },
    {
      key: 'fecha',
      header: <SortableHeader column="fecha" label="Fecha" />,
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (da: DescuentoAplicado) => (
        <span className="text-sm text-slate-600">
          {da.fechaAplicacion
            ? formatearFechaSinHora(da.fechaAplicacion, FORMATOS_FECHA.CORTO)
            : '-'}
        </span>
      ),
    },
  ];

  const plantillasColumns = [
    {
      key: 'nombre',
      header: <SortableHeader column="nombre" label="Nombre" />,
      render: (d: Descuento) => <span className="font-medium text-slate-900">{d.nombre}</span>,
    },
    {
      key: 'tipo',
      header: <SortableHeader column="tipo" label="Tipo" />,
      render: (d: Descuento) => (
        <span
          className={`px-2 py-1 text-xs rounded-full ${
            d.tipoDescuento === 'porcentaje'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {d.tipoDescuento === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}
        </span>
      ),
    },
    {
      key: 'valor',
      header: <SortableHeader column="valor" label="Valor" />,
      render: (d: Descuento) => (
        <span className="font-medium">
          {d.tipoDescuento === 'porcentaje' ? `${d.valor}%` : formatearPesos(d.valor)}
        </span>
      ),
    },
    {
      key: 'activo',
      header: 'Estado',
      render: (d: Descuento) => (
        <StatusBadge
          status={d.activo ? 'activo' : 'inactivo'}
          statusMap={{
            activo: { label: 'Activo', className: 'bg-emerald-100 text-emerald-700' },
            inactivo: { label: 'Inactivo', className: 'bg-slate-100 text-slate-600' },
          }}
        />
      ),
    },
    {
      key: 'vigencia',
      header: 'Vigencia',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (d: Descuento) => (
        <span className="text-sm text-slate-600">
          {d.fechaInicio ? formatearFechaSinHora(d.fechaInicio, FORMATOS_FECHA.CORTO) : '-'}
          {d.fechaFin && ` - ${formatearFechaSinHora(d.fechaFin, FORMATOS_FECHA.CORTO)}`}
        </span>
      ),
    },
  ];

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <AdminLayout
      title="Descuentos"
      subtitle="Gestiona los descuentos aplicados y plantillas de descuento."
      icon={<Tag className="h-5 w-5 text-blue-600" />}
      actions={
        <PermissionGate entity="descuentos" action="create">
          <Button onClick={handleNuevoDescuento} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Descuento
          </Button>
        </PermissionGate>
      }
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'aplicados' | 'plantillas')}>
        <TabsList className="mb-4">
          <TabsTrigger value="aplicados" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Descuentos Aplicados
          </TabsTrigger>
          <TabsTrigger value="plantillas" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Plantillas
          </TabsTrigger>
        </TabsList>

        {/* Tab: Descuentos Aplicados */}
        <TabsContent value="aplicados">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente..."
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select
              value={filters.estado || 'all'}
              onValueChange={(v) => setFilter('estado', v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="aplicado">Aplicados</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.tipo || 'all'}
              onValueChange={(v) => setFilter('tipo', v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="plantilla">Con Plantilla</SelectItem>
                <SelectItem value="adhoc">Ad-hoc</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            data={aplicados || []}
            columns={aplicadosColumns}
            keyExtractor={(da) => da.id}
            emptyMessage="No hay descuentos aplicados."
            emptyIcon={<FileText className="h-12 w-12 text-slate-300" />}
            onRowClick={(da) => setSelectedAplicado(da)}
            {...aplicadosTableProps}
          />
        </TabsContent>

        {/* Tab: Plantillas */}
        <TabsContent value="plantillas">
          <div className="flex justify-end mb-4">
            <PermissionGate entity="descuentos" action="create">
              <Button
                variant="outline"
                onClick={() => {
                  setPlantillaFormData(emptyForm);
                  setEditingPlantillaId(null);
                  setIsPlantillaModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Plantilla
              </Button>
            </PermissionGate>
          </div>

          <DataTable
            data={plantillas || []}
            columns={plantillasColumns}
            keyExtractor={(d) => d.id}
            emptyMessage="No hay plantillas de descuento registradas."
            emptyIcon={<Tag className="h-12 w-12 text-slate-300" />}
            onRowClick={(d) => setSelectedPlantilla(d)}
            {...plantillasTableProps}
          />
        </TabsContent>
      </Tabs>

      {/* Type Selector Modal */}
      <Dialog open={showTypeSelector} onOpenChange={setShowTypeSelector}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Qué tipo de descuento desea aplicar?</DialogTitle>
            <DialogDescription>
              Seleccione si desea aplicar un descuento a un cliente individual o a múltiples clientes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              onClick={() => handleSelectType('individual')}
              className="flex flex-col items-center gap-3 p-6 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <User className="h-10 w-10 text-blue-600" />
              <div className="text-center">
                <p className="font-semibold text-slate-900">Individual</p>
                <p className="text-sm text-slate-500">Descuento único para un cliente</p>
              </div>
            </button>
            <button
              onClick={() => handleSelectType('masivo')}
              className="flex flex-col items-center gap-3 p-6 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Users className="h-10 w-10 text-blue-600" />
              <div className="text-center">
                <p className="font-semibold text-slate-900">Masivo</p>
                <p className="text-sm text-slate-500">Aplicar a múltiples clientes</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Individual Form */}
      <DescuentoIndividualForm
        open={showIndividualForm}
        onClose={() => setShowIndividualForm(false)}
        onSubmit={(data) => createIndividualMutation.mutate(data)}
        isSubmitting={createIndividualMutation.isPending}
      />

      {/* Masivo Wizard */}
      <DescuentoMasivoWizard
        open={showMasivoWizard}
        onClose={() => setShowMasivoWizard(false)}
        onSubmit={(data) => createMasivoMutation.mutate(data)}
        isSubmitting={createMasivoMutation.isPending}
      />

      {/* Applied Discount Detail Modal */}
      <Dialog open={!!selectedAplicado} onOpenChange={(open) => !open && setSelectedAplicado(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de Descuento Aplicado</DialogTitle>
          </DialogHeader>
          {selectedAplicado && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Cliente</span>
                  <p className="font-medium">{selectedAplicado.clienteNombre}</p>
                  <p className="text-sm text-slate-500">#{selectedAplicado.clienteNumero}</p>
                </div>
                <div>
                  <span className="text-slate-500">Estado</span>
                  <p>
                    <StatusBadge
                      status={selectedAplicado.estado}
                      statusMap={{
                        pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
                        aplicado: { label: 'Aplicado', className: 'bg-emerald-100 text-emerald-700' },
                      }}
                    />
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Tipo</span>
                  <p className="font-medium">
                    {selectedAplicado.esAdhoc ? 'Ad-hoc' : 'Plantilla'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Monto</span>
                  <p className="font-medium text-emerald-600">
                    -{formatearPesos(selectedAplicado.montoAplicado)}
                  </p>
                </div>
                {selectedAplicado.descuentoNombre && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Plantilla</span>
                    <p className="font-medium">{selectedAplicado.descuentoNombre}</p>
                  </div>
                )}
                {selectedAplicado.boletaPeriodo && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Boleta</span>
                    <p className="font-medium">Periodo: {selectedAplicado.boletaPeriodo}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-slate-500">Fecha de Aplicación</span>
                  <p className="font-medium">
                    {selectedAplicado.fechaAplicacion
                      ? formatearFechaSinHora(selectedAplicado.fechaAplicacion, FORMATOS_FECHA.LARGO)
                      : '-'}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                {selectedAplicado.estado === 'pendiente' && canDelete && (
                  <Button
                    variant="destructive"
                    onClick={() => deleteAplicadoMutation.mutate(selectedAplicado.id)}
                    disabled={deleteAplicadoMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Plantilla Detail Modal */}
      <Dialog
        open={!!selectedPlantilla && !isPlantillaModalOpen}
        onOpenChange={(open) => !open && setSelectedPlantilla(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de Plantilla</DialogTitle>
          </DialogHeader>
          {selectedPlantilla && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Nombre</span>
                  <p className="font-medium">{selectedPlantilla.nombre}</p>
                </div>
                <div>
                  <span className="text-slate-500">Tipo</span>
                  <p className="font-medium">
                    {selectedPlantilla.tipoDescuento === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Valor</span>
                  <p className="font-medium text-emerald-600">
                    {selectedPlantilla.tipoDescuento === 'porcentaje'
                      ? `${selectedPlantilla.valor}%`
                      : formatearPesos(selectedPlantilla.valor)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Estado</span>
                  <p>
                    <StatusBadge
                      status={selectedPlantilla.activo ? 'activo' : 'inactivo'}
                      statusMap={{
                        activo: { label: 'Activo', className: 'bg-emerald-100 text-emerald-700' },
                        inactivo: { label: 'Inactivo', className: 'bg-slate-100 text-slate-600' },
                      }}
                    />
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Fecha Inicio</span>
                  <p className="font-medium">
                    {selectedPlantilla.fechaInicio
                      ? formatearFechaSinHora(selectedPlantilla.fechaInicio, FORMATOS_FECHA.CORTO)
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Fecha Fin</span>
                  <p className="font-medium">
                    {selectedPlantilla.fechaFin
                      ? formatearFechaSinHora(selectedPlantilla.fechaFin, FORMATOS_FECHA.CORTO)
                      : 'Sin fecha fin'}
                  </p>
                </div>
                {selectedPlantilla.descripcion && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Descripción</span>
                    <p className="font-medium">{selectedPlantilla.descripcion}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                {canDelete && (
                  <Button
                    variant="outline"
                    onClick={() => setDeletePlantillaConfirm(selectedPlantilla)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                )}
                {canEdit && (
                  <Button
                    onClick={() => openEditPlantilla(selectedPlantilla)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Plantilla Confirmation */}
      <Dialog open={!!deletePlantillaConfirm} onOpenChange={() => setDeletePlantillaConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar plantilla?</DialogTitle>
            <DialogDescription>
              Esta acción eliminará la plantilla &quot;{deletePlantillaConfirm?.nombre}&quot;. Los
              descuentos ya aplicados no se verán afectados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlantillaConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deletePlantillaConfirm && deletePlantillaMutation.mutate(deletePlantillaConfirm.id)
              }
              disabled={deletePlantillaMutation.isPending}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Plantilla Modal */}
      <Dialog open={isPlantillaModalOpen} onOpenChange={setIsPlantillaModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPlantillaId ? 'Editar Plantilla' : 'Nueva Plantilla de Descuento'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePlantillaSubmit} className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={plantillaFormData.nombre}
                onChange={(e) =>
                  setPlantillaFormData({ ...plantillaFormData, nombre: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={plantillaFormData.descripcion}
                onChange={(e) =>
                  setPlantillaFormData({ ...plantillaFormData, descripcion: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo *</Label>
                <Select
                  value={plantillaFormData.tipo}
                  onValueChange={(v) =>
                    setPlantillaFormData({
                      ...plantillaFormData,
                      tipo: v as 'porcentaje' | 'monto_fijo',
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="porcentaje">Porcentaje</SelectItem>
                    <SelectItem value="monto_fijo">Monto Fijo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor *</Label>
                <Input
                  type="number"
                  step={plantillaFormData.tipo === 'porcentaje' ? '0.01' : '1'}
                  min="0"
                  value={plantillaFormData.valor}
                  onChange={(e) =>
                    setPlantillaFormData({ ...plantillaFormData, valor: e.target.value })
                  }
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha Inicio</Label>
                <Input
                  type="date"
                  value={plantillaFormData.fecha_inicio}
                  onChange={(e) =>
                    setPlantillaFormData({ ...plantillaFormData, fecha_inicio: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Fecha Fin</Label>
                <Input
                  type="date"
                  value={plantillaFormData.fecha_fin}
                  onChange={(e) =>
                    setPlantillaFormData({ ...plantillaFormData, fecha_fin: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={plantillaFormData.activo}
                onCheckedChange={(checked) =>
                  setPlantillaFormData({ ...plantillaFormData, activo: checked })
                }
              />
              <Label>Activo</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsPlantillaModalOpen(false);
                  setEditingPlantillaId(null);
                  setPlantillaFormData(emptyForm);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createPlantillaMutation.isPending || updatePlantillaMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {editingPlantillaId ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
