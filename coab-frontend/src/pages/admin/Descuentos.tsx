import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout, PageHeader, DataTable, ConfirmDialog, PermissionGate } from '@/components/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import adminApi from '@/lib/adminApi';
import { Plus, Pencil, Tag, Play } from 'lucide-react';
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<DescuentoFormData>(emptyForm);
  const [applyingToCliente, setApplyingToCliente] = useState<{ descuentoId: number; clienteId: string } | null>(null);

  const { data: descuentos, isLoading } = useQuery({
    queryKey: ['admin', 'descuentos'],
    queryFn: async () => {
      const res = await adminApi.get('/admin/descuentos');
      return res.data.descuentos as Descuento[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: DescuentoFormData) => {
      return adminApi.post('/admin/descuentos', {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        tipo: data.tipo,
        valor: parseFloat(data.valor),
        activo: data.activo,
        fecha_inicio: data.fecha_inicio || null,
        fecha_fin: data.fecha_fin || null,
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
        tipo: data.tipo,
        valor: parseFloat(data.valor),
        activo: data.activo,
        fecha_inicio: data.fecha_inicio || null,
        fecha_fin: data.fecha_fin || null,
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const columns = [
    { key: 'nombre', header: 'Nombre', sortable: true },
    {
      key: 'tipo',
      header: 'Tipo',
      render: (d: Descuento) => (
        <span className={`px-2 py-1 text-xs rounded-full ${d.tipo === 'porcentaje' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {d.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}
        </span>
      ),
    },
    {
      key: 'valor',
      header: 'Valor',
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
        <span className={`px-2 py-1 text-xs rounded-full ${d.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
          {d.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    { key: 'descripcion', header: 'Descripción' },
  ];

  const actions = (descuento: Descuento) => (
    <div className="flex gap-2">
      <PermissionGate entity="descuentos" action="apply">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setApplyingToCliente({ descuentoId: descuento.id, clienteId: '' })}
          disabled={!descuento.activo}
        >
          <Play className="h-4 w-4" />
        </Button>
      </PermissionGate>
      <PermissionGate entity="descuentos" action="update">
        <Button variant="outline" size="sm" onClick={() => openEdit(descuento)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </PermissionGate>
      <PermissionGate entity="descuentos" action="delete">
        <ConfirmDialog
          title="¿Eliminar descuento?"
          description={`Esta acción eliminará el descuento "${descuento.nombre}".`}
          onConfirm={() => deleteMutation.mutate(descuento.id)}
          variant="destructive"
        />
      </PermissionGate>
    </div>
  );

  return (
    <AdminLayout>
      <PageHeader
        title="Descuentos"
        description="Gestiona los descuentos disponibles para aplicar a clientes."
        icon={<Tag className="h-6 w-6" />}
        action={
          <PermissionGate entity="descuentos" action="create">
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Descuento
            </Button>
          </PermissionGate>
        }
      />

      <DataTable
        data={descuentos || []}
        columns={columns}
        isLoading={isLoading}
        keyExtractor={(d) => d.id.toString()}
        actions={actions}
        emptyMessage="No hay descuentos registrados."
      />

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
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
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


