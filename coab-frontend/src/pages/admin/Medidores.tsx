import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Gauge, Plus, Pencil, Trash2, Search, MapPin, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Switch } from '@/components/ui/switch';
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

interface DireccionSearchResult {
  id: string;
  direccion: string;
  poblacion: string;
  clienteId: string;
  clienteNombre: string | null;
  clienteNumero: string | null;
  rutaNombre: string | null;
}

interface Medidor {
  id: string;
  direccionId: string;
  numeroSerie: string | null;
  marca: string | null;
  modelo: string | null;
  fechaInstalacion: string | null;
  fechaRetiro: string | null;
  estado: string;
  lecturaInicial: number;
  mostrarEnRuta: boolean;
  direccion: {
    id: string;
    direccion: string;
    poblacion: string;
    numeroCliente: string | null;
    clienteNombre: string | null;
  } | null;
  ultimaLectura: {
    id: string;
    lectura: number;
    fecha: string;
  } | null;
}

interface MedidoresResponse {
  medidores: Medidor[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface MedidorFormData {
  direccionId: string;
  numeroSerie: string;
  marca: string;
  modelo: string;
  fechaInstalacion: string;
  lecturaInicial: string;
  mostrarEnRuta: boolean;
  estado: string;
}

const initialFormData: MedidorFormData = {
  direccionId: '',
  numeroSerie: '',
  marca: '',
  modelo: '',
  fechaInstalacion: '',
  lecturaInicial: '0',
  mostrarEnRuta: true,
  estado: 'activo',
};

export default function MedidoresPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const _canCreate = useCanAccess('medidores', 'create');
  void _canCreate; // For future use
  const canEdit = useCanAccess('medidores', 'edit');
  const canDelete = useCanAccess('medidores', 'delete');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingMedidor, setEditingMedidor] = useState<Medidor | null>(null);
  const [deleteMedidor, setDeleteMedidor] = useState<Medidor | null>(null);
  const [formData, setFormData] = useState<MedidorFormData>(initialFormData);

  // Sort state
  const [sortBy, setSortBy] = useState<string>('fechaInstalacion');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Detail modal state
  const [selectedMedidor, setSelectedMedidor] = useState<Medidor | null>(null);

  // Address search state
  const [addressSearch, setAddressSearch] = useState('');
  const [debouncedAddressSearch, setDebouncedAddressSearch] = useState('');
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<DireccionSearchResult | null>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  // Debounce address search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAddressSearch(addressSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [addressSearch]);

  // Reset address selection when form opens for create
  useEffect(() => {
    if (showForm && !editingMedidor) {
      setAddressSearch('');
      setSelectedAddress(null);
    }
  }, [showForm, editingMedidor]);

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

  // Search addresses query
  const { data: addressResults, isLoading: searchingAddresses } = useQuery<{
    direcciones: DireccionSearchResult[];
  }>({
    queryKey: ['admin-direcciones-search', debouncedAddressSearch],
    queryFn: async () => {
      const res = await adminApiClient.get(
        `/admin/direcciones/search?q=${encodeURIComponent(debouncedAddressSearch)}&limit=10`
      );
      return res.data;
    },
    enabled: debouncedAddressSearch.length >= 2 && !selectedAddress,
  });

  // Fetch medidores
  const { data, isLoading } = useQuery<MedidoresResponse>({
    queryKey: ['admin-medidores', page, search, estadoFilter, sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (search) params.append('search', search);
      if (estadoFilter) params.append('estado', estadoFilter);
      params.append('sortBy', sortBy);
      params.append('sortDirection', sortDirection);
      
      const res = await adminApiClient.get<MedidoresResponse>(`/admin/medidores?${params}`);
      return res.data;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await adminApiClient.post('/admin/medidores', data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Medidor creado', description: 'El medidor se creó correctamente' });
      queryClient.invalidateQueries({ queryKey: ['admin-medidores'] });
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al crear medidor',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await adminApiClient.patch(`/admin/medidores/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Medidor actualizado', description: 'Los cambios se guardaron' });
      queryClient.invalidateQueries({ queryKey: ['admin-medidores'] });
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al actualizar medidor',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminApiClient.delete(`/admin/medidores/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Medidor eliminado', description: 'El medidor se eliminó correctamente' });
      queryClient.invalidateQueries({ queryKey: ['admin-medidores'] });
      setDeleteMedidor(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al eliminar medidor',
      });
    },
  });

  // Toggle mostrarEnRuta mutation
  const toggleRutaMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminApiClient.patch(`/admin/medidores/${id}/toggle-ruta`);
      return res.data;
    },
    onSuccess: (data) => {
      toast({
        title: data.mostrarEnRuta ? 'Agregado a ruta' : 'Removido de ruta',
        description: `El medidor ${data.mostrarEnRuta ? 'se mostrará' : 'no se mostrará'} en la ruta de lectura.`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-medidores'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al actualizar medidor',
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingMedidor(null);
    setFormData(initialFormData);
    setShowForm(true);
  };

  const handleOpenEdit = (medidor: Medidor) => {
    setEditingMedidor(medidor);
    setFormData({
      direccionId: medidor.direccionId,
      numeroSerie: medidor.numeroSerie || '',
      marca: medidor.marca || '',
      modelo: medidor.modelo || '',
      fechaInstalacion: medidor.fechaInstalacion || '',
      lecturaInicial: medidor.lecturaInicial.toString(),
      mostrarEnRuta: medidor.mostrarEnRuta,
      estado: medidor.estado,
    });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingMedidor(null);
    setFormData(initialFormData);
  };

  const handleInputChange = (field: keyof MedidorFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const medidorData = {
      numeroSerie: formData.numeroSerie || null,
      marca: formData.marca || null,
      modelo: formData.modelo || null,
      fechaInstalacion: formData.fechaInstalacion || null,
      estado: formData.estado,
      mostrarEnRuta: formData.mostrarEnRuta,
      lecturaInicial: parseInt(formData.lecturaInicial) || 0,
    };

    if (editingMedidor) {
      updateMutation.mutate({
        id: editingMedidor.id,
        data: medidorData,
      });
    } else {
      // Creating new medidor - direccionId is required
      if (!selectedAddress) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Debe seleccionar una dirección',
        });
        return;
      }
      createMutation.mutate({
        ...medidorData,
        direccionId: selectedAddress.id,
      });
    }
  };

  const columns = [
    {
      key: 'numeroSerie',
      header: (
        <SortableHeader
          column="numeroSerie"
          label="Serie / Info"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (medidor: Medidor) => (
        <div>
          <span className="font-medium text-slate-900">
            {medidor.numeroSerie || 'Sin serie'}
          </span>
          {(medidor.marca || medidor.modelo) && (
            <div className="text-xs text-slate-500">
              {[medidor.marca, medidor.modelo].filter(Boolean).join(' - ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'direccion',
      header: (
        <SortableHeader
          column="cliente"
          label="Cliente / Dirección"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (medidor: Medidor) => (
        <div className="text-sm">
          {medidor.direccion?.clienteNombre && (
            <div className="font-medium text-slate-700">
              {medidor.direccion.clienteNombre}
            </div>
          )}
          <div className="text-slate-500 text-xs">
            {medidor.direccion?.numeroCliente} - {medidor.direccion?.direccion}
          </div>
        </div>
      ),
    },
    {
      key: 'ultimaLectura',
      header: 'Última Lectura',
      className: 'text-center hidden md:table-cell',
      headerClassName: 'text-center hidden md:table-cell',
      render: (medidor: Medidor) =>
        medidor.ultimaLectura ? (
          <div className="text-center">
            <span className="font-medium text-slate-900">
              {medidor.ultimaLectura.lectura.toLocaleString()}
            </span>
            <div className="text-xs text-slate-500">
              {format(new Date(medidor.ultimaLectura.fecha), 'dd/MM/yy', { locale: es })}
            </div>
          </div>
        ) : (
          <span className="text-slate-400 text-sm">-</span>
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
      render: (medidor: Medidor) => {
        const estadoMap: Record<string, { label: string; className: string }> = {
          activo: { label: 'Funcionando', className: 'bg-emerald-100 text-emerald-700' },
          funcionando: { label: 'Funcionando', className: 'bg-emerald-100 text-emerald-700' },
          inactivo: { label: 'Inactivo', className: 'bg-slate-100 text-slate-600' },
          averiado: { label: 'Averiado', className: 'bg-red-100 text-red-700' },
        };
        const isRetirado = !!medidor.fechaRetiro;
        
        return (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={medidor.estado} statusMap={estadoMap} />
            {isRetirado && (
              <span className="px-2 py-1 text-xs rounded-full font-medium bg-amber-100 text-amber-700">
                Retirado
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'mostrarEnRuta',
      header: 'En Ruta',
      render: (medidor: Medidor) => (
        <div className="flex" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={medidor.mostrarEnRuta}
            onCheckedChange={() => toggleRutaMutation.mutate(medidor.id)}
            disabled={toggleRutaMutation.isPending}
            className="data-[state=checked]:bg-blue-600"
          />
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Medidores"
      subtitle="Gestión de medidores de agua"
      icon={<Gauge className="h-5 w-5 text-blue-600" />}
      actions={
        <PermissionGate entity="medidores" action="create">
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Medidor
          </Button>
        </PermissionGate>
      }
    >
      {/* Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por serie, cliente o dirección..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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
            <SelectItem value="activo">Funcionando</SelectItem>
            <SelectItem value="averiado">Averiado</SelectItem>
            <SelectItem value="retirado">Retirado</SelectItem>
            <SelectItem value="en_servicio">En Servicio</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.medidores || []}
        keyExtractor={(medidor) => medidor.id}
        isLoading={isLoading}
        emptyMessage="No hay medidores registrados"
        emptyIcon={<Gauge className="h-12 w-12 text-slate-300" />}
        onRowClick={(medidor) => setSelectedMedidor(medidor)}
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
      <Dialog open={!!selectedMedidor} onOpenChange={() => setSelectedMedidor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Medidor</DialogTitle>
          </DialogHeader>
          {selectedMedidor && (
            <div className="space-y-4">
              {/* Serie and Status */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900 text-lg">
                    {selectedMedidor.numeroSerie || 'Sin serie'}
                  </span>
                  {(selectedMedidor.marca || selectedMedidor.modelo) && (
                    <p className="text-sm text-slate-500">
                      {[selectedMedidor.marca, selectedMedidor.modelo].filter(Boolean).join(' - ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <StatusBadge
                    status={selectedMedidor.estado}
                    statusMap={{
                      activo: { label: 'Funcionando', className: 'bg-emerald-100 text-emerald-700' },
                      averiado: { label: 'Averiado', className: 'bg-red-100 text-red-700' },
                    }}
                  />
                  {selectedMedidor.fechaRetiro && (
                    <span className="px-2 py-1 text-xs rounded-full font-medium bg-amber-100 text-amber-700">
                      Retirado
                    </span>
                  )}
                </div>
              </div>

              {/* Client/Address Info */}
              {selectedMedidor.direccion && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="font-medium text-slate-900">
                    {selectedMedidor.direccion.clienteNombre}
                  </p>
                  <p className="text-sm text-slate-500">
                    N° {selectedMedidor.direccion.numeroCliente} • {selectedMedidor.direccion.direccion}
                  </p>
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {selectedMedidor.fechaInstalacion && (
                  <div>
                    <span className="block text-slate-500">Fecha Instalación</span>
                    <span className="font-medium">
                      {format(new Date(selectedMedidor.fechaInstalacion), 'dd/MM/yyyy', { locale: es })}
                    </span>
                  </div>
                )}
                {selectedMedidor.fechaRetiro && (
                  <div>
                    <span className="block text-slate-500">Fecha Retiro</span>
                    <span className="font-medium">
                      {format(new Date(selectedMedidor.fechaRetiro), 'dd/MM/yyyy', { locale: es })}
                    </span>
                  </div>
                )}
                <div>
                  <span className="block text-slate-500">Lectura Inicial</span>
                  <span className="font-medium">{selectedMedidor.lecturaInicial.toLocaleString()}</span>
                </div>
                {selectedMedidor.ultimaLectura && (
                  <div>
                    <span className="block text-slate-500">Última Lectura</span>
                    <span className="font-medium">
                      {selectedMedidor.ultimaLectura.lectura.toLocaleString()}
                      <span className="text-xs text-slate-400 ml-1">
                        ({format(new Date(selectedMedidor.ultimaLectura.fecha), 'dd/MM/yy', { locale: es })})
                      </span>
                    </span>
                  </div>
                )}
                <div>
                  <span className="block text-slate-500">Mostrar en Ruta</span>
                  <span className="font-medium">{selectedMedidor.mostrarEnRuta ? 'Sí' : 'No'}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-200 flex gap-2">
                {canEdit && (
                  <Button
                    onClick={() => {
                      handleOpenEdit(selectedMedidor);
                      setSelectedMedidor(null);
                    }}
                    className="flex-1"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                )}
                {canDelete && !selectedMedidor.ultimaLectura && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleteMedidor(selectedMedidor);
                      setSelectedMedidor(null);
                    }}
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

      {/* Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMedidor ? 'Editar Medidor' : 'Nuevo Medidor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Dirección Search - only for new medidores */}
            {!editingMedidor && (
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Dirección *
                </label>
                {selectedAddress ? (
                  // Selected address display
                  <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <div>
                        <p className="font-medium text-slate-900">
                          {selectedAddress.direccion}, {selectedAddress.poblacion}
                        </p>
                        <p className="text-xs text-slate-500">
                          {selectedAddress.clienteNombre} ({selectedAddress.clienteNumero})
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedAddress(null);
                        setAddressSearch('');
                      }}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  // Search input
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      ref={addressInputRef}
                      type="text"
                      value={addressSearch}
                      onChange={(e) => {
                        setAddressSearch(e.target.value);
                        setShowAddressDropdown(true);
                      }}
                      onFocus={() => setShowAddressDropdown(true)}
                      placeholder="Buscar por dirección, cliente o N° cliente..."
                      className="pl-9"
                    />
                    {/* Dropdown results */}
                    {showAddressDropdown && debouncedAddressSearch.length >= 2 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {searchingAddresses ? (
                          <div className="p-3 text-center text-slate-500 text-sm">
                            Buscando...
                          </div>
                        ) : addressResults?.direcciones.length === 0 ? (
                          <div className="p-3 text-center text-slate-500 text-sm">
                            No se encontraron direcciones
                          </div>
                        ) : (
                          addressResults?.direcciones.map((dir) => (
                            <button
                              key={dir.id}
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 border-b last:border-b-0"
                              onClick={() => {
                                setSelectedAddress(dir);
                                setShowAddressDropdown(false);
                                setAddressSearch('');
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="font-medium text-slate-900 text-sm">
                                    {dir.direccion}, {dir.poblacion}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {dir.clienteNombre} ({dir.clienteNumero})
                                    {dir.rutaNombre && ` • Ruta: ${dir.rutaNombre}`}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {addressSearch.length > 0 && addressSearch.length < 2 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Ingrese al menos 2 caracteres para buscar
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Número de Serie
                </label>
                <Input
                  value={formData.numeroSerie}
                  onChange={(e) => handleInputChange('numeroSerie', e.target.value)}
                  placeholder="ABC123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                <Select
                  value={formData.estado}
                  onValueChange={(val) => handleInputChange('estado', val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Funcionando</SelectItem>
                    <SelectItem value="averiado">Averiado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Marca</label>
                <Input
                  value={formData.marca}
                  onChange={(e) => handleInputChange('marca', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Modelo</label>
                <Input
                  value={formData.modelo}
                  onChange={(e) => handleInputChange('modelo', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha Instalación
                </label>
                <Input
                  type="date"
                  value={formData.fechaInstalacion}
                  onChange={(e) => handleInputChange('fechaInstalacion', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Lectura Inicial
                </label>
                <Input
                  type="number"
                  value={formData.lecturaInicial}
                  onChange={(e) => handleInputChange('lecturaInicial', e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <label className="text-sm font-medium text-slate-700">Mostrar en Ruta</label>
              <Switch
                checked={formData.mostrarEnRuta}
                onCheckedChange={(checked) => handleInputChange('mostrarEnRuta', checked)}
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
                {(createMutation.isPending || updateMutation.isPending)
                  ? 'Guardando...'
                  : editingMedidor
                  ? 'Guardar Cambios'
                  : 'Crear Medidor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteMedidor}
        onOpenChange={(open) => !open && setDeleteMedidor(null)}
        itemName={deleteMedidor?.numeroSerie || 'Medidor'}
        onConfirm={() => deleteMedidor && deleteMutation.mutate(deleteMedidor.id)}
        isLoading={deleteMutation.isPending}
      />
    </AdminLayout>
  );
}


