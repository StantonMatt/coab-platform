import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AdminLayout, DataTable, StatusBadge, PermissionGate, SortableHeader, useSortState, useCanAccess } from '@/components/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import adminApi from '@/lib/adminApi';
import { Plus, Tag, Pencil, Trash2, Play } from 'lucide-react';
import { formatearPesos } from '@coab/utils';

interface Descuento {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipo: string; // porcentaje, monto_fijo
  valor: number;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  creado_en: string;
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

export default function AdminDescuentosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = useCanAccess('descuentos', 'edit');
  const canDelete = useCanAccess('descuentos', 'delete');
  const canApply = useCanAccess('descuentos', 'view');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<DescuentoFormData>(emptyForm);
  const [applyingToCliente, setApplyingToCliente] = useState<{ descuentoId: number; clienteId: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Descuento | null>(null);
  const [selectedDescuento, setSelectedDescuento] = useState<Descuento | null>(null);

  // Use the sort hook - much cleaner!
  const { sortBy, sortDirection, handleSort } = useSortState({
    defaultColumn: 'nombre',
    defaultDirection: 'asc',
  });

  const { data: descuentos, isLoading } = useQuery({
    queryKey: ['admin', 'descuentos', sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sortBy) params.append('sortBy', sortBy);
      params.append('sortDirection', sortDirection);
      const res = await adminApi.get(`/admin/descuentos?${params}`);
      return res.data.descuentos as Descuento[];
    },
  });

  const createMutation = useMutation({
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
      toast({ title: 'Descuento creado', description: 'El descuento se ha creado exitosamente.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'descuentos'] });
      closeModal();
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo crear el descuento.', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: DescuentoFormData }) => {
      return adminApi.put(`/admin/descuentos/${id}`, {
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
      toast({ title: 'Descuento actualizado', description: 'El descuento se ha actualizado.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'descuentos'] });
      closeModal();
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo actualizar el descuento.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return adminApi.delete(`/admin/descuentos/${id}`);
    },
    onSuccess: () => {
      toast({ title: 'Descuento eliminado', description: 'El descuento se ha eliminado.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'descuentos'] });
      setDeleteConfirm(null);
      setSelectedDescuento(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo eliminar el descuento.', variant: 'destructive' });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ descuentoId, clienteId }: { descuentoId: number; clienteId: string }) => {
      return adminApi.post(`/admin/descuentos/${descuentoId}/aplicar`, { cliente_id: parseInt(clienteId) });
    },
    onSuccess: () => {
      toast({ title: 'Descuento aplicado', description: 'El descuento se ha aplicado al cliente.' });
      setApplyingToCliente(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo aplicar el descuento.', variant: 'destructive' });
    },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const openCreate = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (descuento: Descuento) => {
    setFormData({
      nombre: descuento.nombre,
      descripcion: descuento.descripcion || '',
      tipo: descuento.tipo as 'porcentaje' | 'monto_fijo',
      valor: descuento.valor.toString(),
      activo: descuento.activo,
      fecha_inicio: descuento.fecha_inicio ? descuento.fecha_inicio.split('T')[0] : '',
      fecha_fin: descuento.fecha_fin ? descuento.fecha_fin.split('T')[0] : '',
    });
    setEditingId(descuento.id);
    setIsModalOpen(true);
    setSelectedDescuento(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Columns use SortableHeader with just column and label - context provides the rest!
  const columns = [
    {
      key: 'nombre',
      header: <SortableHeader column="nombre" label="Nombre" />,
      render: (d: Descuento) => <span className="font-medium text-slate-900">{d.nombre}</span>,
    },
    {
      key: 'tipo',
      header: <SortableHeader column="tipo" label="Tipo" />,
      render: (d: Descuento) => (
        <span className={`px-2 py-1 text-xs rounded-full ${d.tipo === 'porcentaje' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {d.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}
        </span>
      ),
    },
    {
      key: 'valor',
      header: <SortableHeader column="valor" label="Valor" />,
      render: (d: Descuento) => (
        <span className="font-medium">
          {d.tipo === 'porcentaje' ? `${d.valor}%` : formatearPesos(d.valor)}
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
      key: 'fechaInicio',
      header: 'Vigencia',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (d: Descuento) => (
        <span className="text-sm text-slate-600">
          {d.fecha_inicio ? format(new Date(d.fecha_inicio), 'dd/MM/yyyy', { locale: es }) : '-'}
          {d.fecha_fin && ` - ${format(new Date(d.fecha_fin), 'dd/MM/yyyy', { locale: es })}`}
        </span>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Descuentos"
      subtitle="Gestiona los descuentos disponibles para aplicar a clientes."
      icon={<Tag className="h-5 w-5 text-blue-600" />}
      actions={
        <PermissionGate entity="descuentos" action="create">
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Descuento
          </Button>
        </PermissionGate>
      }
    >
      {/* DataTable with sorting prop - provides context to SortableHeader */}
      <DataTable
        data={descuentos || []}
        columns={columns}
        isLoading={isLoading}
        keyExtractor={(d) => d.id.toString()}
        emptyMessage="No hay descuentos registrados."
        emptyIcon={<Tag className="h-12 w-12 text-slate-300" />}
        onRowClick={(d) => setSelectedDescuento(d)}
        sorting={{ sortBy, sortDirection, onSort: handleSort }}
      />

      {/* Detail Modal */}
      <Dialog open={!!selectedDescuento && !isModalOpen} onOpenChange={(open) => !open && setSelectedDescuento(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de Descuento</DialogTitle>
          </DialogHeader>
          {selectedDescuento && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Nombre</span>
                  <p className="font-medium">{selectedDescuento.nombre}</p>
                </div>
                <div>
                  <span className="text-slate-500">Tipo</span>
                  <p className="font-medium">
                    {selectedDescuento.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Valor</span>
                  <p className="font-medium text-emerald-600">
                    {selectedDescuento.tipo === 'porcentaje'
                      ? `${selectedDescuento.valor}%`
                      : formatearPesos(selectedDescuento.valor)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Estado</span>
                  <p>
                    <StatusBadge
                      status={selectedDescuento.activo ? 'activo' : 'inactivo'}
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
                    {selectedDescuento.fecha_inicio
                      ? format(new Date(selectedDescuento.fecha_inicio), 'dd/MM/yyyy', { locale: es })
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Fecha Fin</span>
                  <p className="font-medium">
                    {selectedDescuento.fecha_fin
                      ? format(new Date(selectedDescuento.fecha_fin), 'dd/MM/yyyy', { locale: es })
                      : 'Sin fecha fin'}
                  </p>
                </div>
                {selectedDescuento.descripcion && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Descripción</span>
                    <p className="font-medium">{selectedDescuento.descripcion}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                {canApply && selectedDescuento.activo && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setApplyingToCliente({ descuentoId: selectedDescuento.id, clienteId: '' });
                      setSelectedDescuento(null);
                    }}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Aplicar a Cliente
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="outline"
                    onClick={() => setDeleteConfirm(selectedDescuento)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                )}
                {canEdit && (
                  <Button onClick={() => openEdit(selectedDescuento)} className="bg-blue-600 hover:bg-blue-700">
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar descuento?</DialogTitle>
            <DialogDescription>
              Esta acción eliminará el descuento &quot;{deleteConfirm?.nombre}&quot;. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Descuento' : 'Nuevo Descuento'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo *</Label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'porcentaje' | 'monto_fijo' })}
                >
                  <option value="porcentaje">Porcentaje</option>
                  <option value="monto_fijo">Monto Fijo</option>
                </select>
              </div>
              <div>
                <Label>Valor *</Label>
                <Input
                  type="number"
                  step={formData.tipo === 'porcentaje' ? '0.01' : '1'}
                  min="0"
                  value={formData.valor}
                  onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha Inicio</Label>
                <Input
                  type="date"
                  value={formData.fecha_inicio}
                  onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                />
              </div>
              <div>
                <Label>Fecha Fin</Label>
                <Input
                  type="date"
                  value={formData.fecha_fin}
                  onChange={(e) => setFormData({ ...formData, fecha_fin: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
              />
              <Label>Activo</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {editingId ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Apply to Client Modal */}
      <Dialog open={!!applyingToCliente} onOpenChange={() => setApplyingToCliente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar Descuento a Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ID del Cliente *</Label>
              <Input
                type="number"
                placeholder="Ingrese el ID del cliente"
                value={applyingToCliente?.clienteId || ''}
                onChange={(e) =>
                  setApplyingToCliente((prev) =>
                    prev ? { ...prev, clienteId: e.target.value } : null
                  )
                }
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setApplyingToCliente(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (applyingToCliente?.clienteId) {
                    applyMutation.mutate(applyingToCliente);
                  }
                }}
                disabled={!applyingToCliente?.clienteId || applyMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Aplicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
