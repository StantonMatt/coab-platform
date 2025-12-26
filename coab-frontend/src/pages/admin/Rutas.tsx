import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Map, Plus, Pencil, Trash2, ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import {
  AdminLayout,
  DataTable,
  DeleteConfirmDialog,
  PermissionGate,
  SortableHeader,
  useCanAccess,
  useAdminTable,
} from '@/components/admin';

interface Ruta {
  id: string;
  nombre: string;
  descripcion: string | null;
  cantidadDirecciones: number;
  fechaCreacion: string;
  fechaActualizacion: string;
}

interface Direccion {
  id: string;
  clienteId: string;
  clienteNumero: string;
  clienteNombre: string;
  direccion: string;
  poblacion: string;
  comuna: string;
  ordenRuta: number;
  tienesMedidores: number;
}

interface DireccionesResponse {
  direcciones: Direccion[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function RutasPage() {
  const { toast } = useToast();
  const canEdit = useCanAccess('rutas', 'edit');
  const canDelete = useCanAccess('rutas', 'delete');

  // Use the admin table hook
  const {
    data: rutas,
    tableProps,
    refetch,
  } = useAdminTable<Ruta>({
    endpoint: '/admin/rutas',
    queryKey: 'admin-rutas',
    dataKey: 'rutas',
    defaultSort: { column: 'nombre', direction: 'asc' },
  });

  const [showForm, setShowForm] = useState(false);
  const [editingRuta, setEditingRuta] = useState<Ruta | null>(null);
  const [deleteRuta, setDeleteRuta] = useState<Ruta | null>(null);
  const [selectedRuta, setSelectedRuta] = useState<Ruta | null>(null);

  // Form state
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');

  // Direcciones modal state
  const [direccionesPage, setDireccionesPage] = useState(1);
  const [selectedDirecciones, setSelectedDirecciones] = useState<string[]>([]);
  const [showReassign, setShowReassign] = useState(false);
  const [targetRutaId, setTargetRutaId] = useState('');

  // Fetch direcciones for selected ruta
  const { data: direccionesData, isLoading: loadingDirecciones } = useQuery<DireccionesResponse>({
    queryKey: ['admin-ruta-direcciones', selectedRuta?.id, direccionesPage],
    queryFn: async () => {
      const res = await adminApiClient.get<DireccionesResponse>(
        `/admin/rutas/${selectedRuta!.id}/direcciones?page=${direccionesPage}&limit=30`
      );
      return res.data;
    },
    enabled: !!selectedRuta,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: { nombre: string; descripcion?: string }) => {
      const res = await adminApiClient.post('/admin/rutas', data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Ruta creada', description: 'La ruta se creó correctamente' });
      refetch();
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al crear ruta',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { nombre?: string; descripcion?: string | null };
    }) => {
      const res = await adminApiClient.patch(`/admin/rutas/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Ruta actualizada', description: 'Los cambios se guardaron' });
      refetch();
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al actualizar ruta',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminApiClient.delete(`/admin/rutas/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Ruta eliminada', description: 'La ruta se eliminó correctamente' });
      refetch();
      setDeleteRuta(null);
      setSelectedRuta(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al eliminar ruta',
      });
    },
  });

  // Reassign mutation
  const reassignMutation = useMutation({
    mutationFn: async ({ rutaId, direccionIds }: { rutaId: string; direccionIds: string[] }) => {
      const res = await adminApiClient.post(`/admin/rutas/${rutaId}/direcciones/reasignar`, {
        direccionIds,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast({ title: 'Direcciones reasignadas', description: data.message });
      refetch();
      // Direcciones will refetch when modal reopens;
      setShowReassign(false);
      setSelectedDirecciones([]);
      setTargetRutaId('');
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al reasignar direcciones',
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingRuta(null);
    setNombre('');
    setDescripcion('');
    setShowForm(true);
  };

  const handleOpenEdit = (ruta: Ruta) => {
    setEditingRuta(ruta);
    setNombre(ruta.nombre);
    setDescripcion(ruta.descripcion || '');
    setShowForm(true);
    setSelectedRuta(null);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingRuta(null);
    setNombre('');
    setDescripcion('');
  };

  const handleRowClick = (ruta: Ruta) => {
    setSelectedRuta(ruta);
    setDireccionesPage(1);
    setSelectedDirecciones([]);
  };

  const handleCloseDetail = () => {
    setSelectedRuta(null);
    setSelectedDirecciones([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    if (editingRuta) {
      updateMutation.mutate({
        id: editingRuta.id,
        data: {
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
      });
    }
  };

  const handleToggleDireccion = (id: string) => {
    setSelectedDirecciones((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (!direccionesData) return;
    const allIds = direccionesData.direcciones.map((d) => d.id);
    if (selectedDirecciones.length === allIds.length) {
      setSelectedDirecciones([]);
    } else {
      setSelectedDirecciones(allIds);
    }
  };

  const handleReassign = () => {
    if (!targetRutaId || selectedDirecciones.length === 0) return;
    reassignMutation.mutate({
      rutaId: targetRutaId,
      direccionIds: selectedDirecciones,
    });
  };

  // Columns use SortableHeader with just column and label - context provides the rest!
  const columns = [
    {
      key: 'nombre',
      header: <SortableHeader column="nombre" label="Nombre" />,
      render: (ruta: Ruta) => (
        <span className="font-medium text-slate-900">{ruta.nombre}</span>
      ),
    },
    {
      key: 'descripcion',
      header: 'Descripción',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (ruta: Ruta) => (
        <span className="text-slate-600 text-sm">
          {ruta.descripcion || '-'}
        </span>
      ),
    },
    {
      key: 'cantidadDirecciones',
      header: <SortableHeader column="cantidadDirecciones" label="Direcciones" />,
      render: (ruta: Ruta) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          {ruta.cantidadDirecciones}
        </span>
      ),
    },
    {
      key: 'fechaActualizacion',
      header: <SortableHeader column="fechaActualizacion" label="Última Actualización" />,
      className: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
      render: (ruta: Ruta) => (
        <span className="text-sm text-slate-500">
          {format(new Date(ruta.fechaActualizacion), 'dd/MM/yyyy', { locale: es })}
        </span>
      ),
    },
  ];

  // Filter out current ruta from dropdown
  const otherRutas = rutas.filter((r: Ruta) => r.id !== selectedRuta?.id);

  return (
    <AdminLayout
      title="Rutas"
      subtitle="Gestión de rutas de lectura"
      icon={<Map className="h-5 w-5 text-blue-600" />}
      actions={
        <PermissionGate entity="rutas" action="create">
          <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Ruta
          </Button>
        </PermissionGate>
      }
    >
      <DataTable
        columns={columns}
        data={rutas}
        keyExtractor={(ruta) => ruta.id}
        emptyMessage="No hay rutas registradas"
        emptyIcon={<Map className="h-12 w-12 text-slate-300" />}
        onRowClick={handleRowClick}
        {...tableProps}
      />

      {/* Detail/Direcciones Modal */}
      <Dialog open={!!selectedRuta && !showForm} onOpenChange={(open) => !open && handleCloseDetail()}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Ruta: {selectedRuta?.nombre}</DialogTitle>
            <DialogDescription>
              {selectedRuta?.descripcion || 'Sin descripción'} • {direccionesData?.pagination.total || 0} direcciones
            </DialogDescription>
          </DialogHeader>

          {/* Actions bar */}
          <div className="flex items-center justify-between py-2">
            <div className="flex gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => selectedRuta && handleOpenEdit(selectedRuta)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar Ruta
                </Button>
              )}
              {canDelete && selectedRuta?.cantidadDirecciones === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteRuta(selectedRuta)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              )}
            </div>
            {canEdit && selectedDirecciones.length > 0 && (
              <div className="flex items-center gap-4 py-2 px-3 bg-blue-50 rounded-lg">
                <span className="text-sm font-medium text-blue-700">
                  {selectedDirecciones.length} seleccionadas
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowReassign(true)}
                  className="text-blue-700 border-blue-300"
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Mover a otra ruta
                </Button>
              </div>
            )}
          </div>

          {/* Direcciones list */}
          <div className="flex-1 overflow-auto">
            {loadingDirecciones ? (
              <div className="text-center py-8">
                <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : direccionesData?.direcciones.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No hay direcciones en esta ruta
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {canEdit && (
                      <th className="px-3 py-2 text-left w-10">
                        <Checkbox
                          checked={
                            direccionesData?.direcciones.length === selectedDirecciones.length &&
                            selectedDirecciones.length > 0
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                    )}
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">
                      Orden
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">
                      Cliente
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">
                      Dirección
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">
                      Medidores
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {direccionesData?.direcciones.map((dir) => (
                    <tr
                      key={dir.id}
                      className={`hover:bg-slate-50 ${
                        selectedDirecciones.includes(dir.id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      {canEdit && (
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={selectedDirecciones.includes(dir.id)}
                            onCheckedChange={() => handleToggleDireccion(dir.id)}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-sm text-slate-500">{dir.ordenRuta}</td>
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-slate-900">
                          {dir.clienteNombre}
                        </div>
                        <div className="text-xs text-slate-500">{dir.clienteNumero}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm text-slate-700">{dir.direccion}</div>
                        <div className="text-xs text-slate-500">{dir.poblacion}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {dir.tienesMedidores}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {direccionesData && direccionesData.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-sm text-slate-500">
                Página {direccionesData.pagination.page} de {direccionesData.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={direccionesPage <= 1}
                  onClick={() => setDireccionesPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={direccionesPage >= direccionesData.pagination.totalPages}
                  onClick={() => setDireccionesPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRuta ? 'Editar Ruta' : 'Nueva Ruta'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nombre *
              </label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Portal Primavera"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Descripción
              </label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Descripción opcional de la ruta"
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
                  : editingRuta
                  ? 'Guardar Cambios'
                  : 'Crear Ruta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reassign Dialog */}
      <Dialog open={showReassign} onOpenChange={setShowReassign}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mover direcciones a otra ruta</DialogTitle>
            <DialogDescription>
              Se moverán {selectedDirecciones.length} direcciones a la ruta seleccionada
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Ruta destino
              </label>
              <Select value={targetRutaId} onValueChange={setTargetRutaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione una ruta" />
                </SelectTrigger>
                <SelectContent>
                  {otherRutas.map((ruta) => (
                    <SelectItem key={ruta.id} value={ruta.id}>
                      {ruta.nombre} ({ruta.cantidadDirecciones} dir.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReassign(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleReassign}
              disabled={!targetRutaId || reassignMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {reassignMutation.isPending ? 'Moviendo...' : 'Mover Direcciones'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteRuta}
        onOpenChange={(open) => !open && setDeleteRuta(null)}
        itemName={deleteRuta?.nombre || ''}
        onConfirm={() => deleteRuta && deleteMutation.mutate(deleteRuta.id)}
        isLoading={deleteMutation.isPending}
      />
    </AdminLayout>
  );
}
