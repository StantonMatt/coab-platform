import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DollarSign, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { formatearPesos } from '@coab/utils';
import {
  AdminLayout,
  DataTable,
  DeleteConfirmDialog,
  PermissionGate,
  SortableHeader,
  useCanAccess,
  useAdminTable,
} from '@/components/admin';

interface Tarifa {
  id: string;
  costoDespacho: number;
  costoReposicion1: number;
  costoReposicion2: number;
  costoM3Agua: number;
  costoM3Alcantarillado: number | null;
  costoM3Tratamiento: number | null;
  costoM3AlcantarilladoTratamiento: number | null;
  cargoFijo: number;
  tasaIva: number;
  fechaInicio: string;
  fechaFin: string | null;
  tasaInteresMensual: number;
  diasGraciaInteres: number;
  esVigente: boolean;
}

interface TarifasResponse {
  tarifas: Tarifa[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface TarifaFormData {
  costoDespacho: string;
  costoReposicion1: string;
  costoReposicion2: string;
  costoM3Agua: string;
  costoM3Alcantarillado: string;
  costoM3Tratamiento: string;
  costoM3AlcantarilladoTratamiento: string;
  cargoFijo: string;
  tasaIva: string;
  fechaInicio: string;
  fechaFin: string;
  tasaInteresMensual: string;
  diasGraciaInteres: string;
}

const initialFormData: TarifaFormData = {
  costoDespacho: '',
  costoReposicion1: '',
  costoReposicion2: '',
  costoM3Agua: '',
  costoM3Alcantarillado: '',
  costoM3Tratamiento: '',
  costoM3AlcantarilladoTratamiento: '',
  cargoFijo: '',
  tasaIva: '0.19',
  fechaInicio: new Date().toISOString().split('T')[0],
  fechaFin: '',
  tasaInteresMensual: '0.015',
  diasGraciaInteres: '30',
};

export default function TarifasPage() {
  const { toast } = useToast();
  const canEdit = useCanAccess('tarifas', 'edit');
  const canDelete = useCanAccess('tarifas', 'delete');

  // Use the admin table hook
  const {
    data: tarifas,
    tableProps,
    refetch,
  } = useAdminTable<Tarifa>({
    endpoint: '/admin/tarifas',
    queryKey: 'admin-tarifas',
    dataKey: 'tarifas',
    defaultSort: { column: 'fechaInicio', direction: 'desc' },
  });

  const [showForm, setShowForm] = useState(false);
  const [selectedTarifa, setSelectedTarifa] = useState<Tarifa | null>(null);
  const [editingTarifa, setEditingTarifa] = useState<Tarifa | null>(null);
  const [deleteTarifa, setDeleteTarifa] = useState<Tarifa | null>(null);
  const [formData, setFormData] = useState<TarifaFormData>(initialFormData);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await adminApiClient.post('/admin/tarifas', data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Tarifa creada', description: 'La tarifa se creó correctamente' });
      refetch();
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al crear tarifa',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await adminApiClient.patch(`/admin/tarifas/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Tarifa actualizada', description: 'Los cambios se guardaron' });
      refetch();
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al actualizar tarifa',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminApiClient.delete(`/admin/tarifas/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Tarifa eliminada', description: 'La tarifa se eliminó correctamente' });
      refetch();
      setDeleteTarifa(null);
      setSelectedTarifa(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al eliminar tarifa',
      });
    },
  });

  const handleOpenCreate = () => {
    setEditingTarifa(null);
    setFormData(initialFormData);
    setShowForm(true);
  };

  const handleOpenEdit = (tarifa: Tarifa) => {
    setEditingTarifa(tarifa);
    setFormData({
      costoDespacho: tarifa.costoDespacho.toString(),
      costoReposicion1: tarifa.costoReposicion1.toString(),
      costoReposicion2: tarifa.costoReposicion2.toString(),
      costoM3Agua: tarifa.costoM3Agua.toString(),
      costoM3Alcantarillado: tarifa.costoM3Alcantarillado?.toString() || '',
      costoM3Tratamiento: tarifa.costoM3Tratamiento?.toString() || '',
      costoM3AlcantarilladoTratamiento:
        tarifa.costoM3AlcantarilladoTratamiento?.toString() || '',
      cargoFijo: tarifa.cargoFijo.toString(),
      tasaIva: tarifa.tasaIva.toString(),
      fechaInicio: tarifa.fechaInicio,
      fechaFin: tarifa.fechaFin || '',
      tasaInteresMensual: tarifa.tasaInteresMensual.toString(),
      diasGraciaInteres: tarifa.diasGraciaInteres.toString(),
    });
    setShowForm(true);
    setSelectedTarifa(null);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTarifa(null);
    setFormData(initialFormData);
  };

  const handleInputChange = (field: keyof TarifaFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      costoDespacho: parseFloat(formData.costoDespacho) || 0,
      costoReposicion1: parseFloat(formData.costoReposicion1) || 0,
      costoReposicion2: parseFloat(formData.costoReposicion2) || 0,
      costoM3Agua: parseFloat(formData.costoM3Agua) || 0,
      costoM3Alcantarillado: formData.costoM3Alcantarillado
        ? parseFloat(formData.costoM3Alcantarillado)
        : null,
      costoM3Tratamiento: formData.costoM3Tratamiento
        ? parseFloat(formData.costoM3Tratamiento)
        : null,
      costoM3AlcantarilladoTratamiento: formData.costoM3AlcantarilladoTratamiento
        ? parseFloat(formData.costoM3AlcantarilladoTratamiento)
        : null,
      cargoFijo: parseFloat(formData.cargoFijo) || 0,
      tasaIva: parseFloat(formData.tasaIva) || 0.19,
      fechaInicio: formData.fechaInicio,
      fechaFin: formData.fechaFin || null,
      tasaInteresMensual: parseFloat(formData.tasaInteresMensual) || 0,
      diasGraciaInteres: parseInt(formData.diasGraciaInteres) || 30,
    };

    if (editingTarifa) {
      updateMutation.mutate({ id: editingTarifa.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Columns use SortableHeader with just column and label - context provides the rest!
  const columns = [
    {
      key: 'fechas',
      header: <SortableHeader column="fechaInicio" label="Vigencia" />,
      render: (tarifa: Tarifa) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">
              {format(new Date(tarifa.fechaInicio), 'dd/MM/yyyy', { locale: es })}
            </span>
            {tarifa.esVigente && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                <Check className="h-3 w-3 mr-1" />
                Vigente
              </span>
            )}
          </div>
          {tarifa.fechaFin && (
            <span className="text-xs text-slate-500">
              hasta {format(new Date(tarifa.fechaFin), 'dd/MM/yyyy', { locale: es })}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'costoM3Agua',
      header: <SortableHeader column="costoM3Agua" label="Agua/m³" />,
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (tarifa: Tarifa) => (
        <span className="font-medium text-slate-900">
          {formatearPesos(tarifa.costoM3Agua)}
        </span>
      ),
    },
    {
      key: 'costoM3Alcantarillado',
      header: 'Alcant./m³',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (tarifa: Tarifa) => (
        <span className="text-slate-700">
          {tarifa.costoM3Alcantarillado ? formatearPesos(tarifa.costoM3Alcantarillado) : '-'}
        </span>
      ),
    },
    {
      key: 'cargoFijo',
      header: <SortableHeader column="cargoFijo" label="Cargo Fijo" />,
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (tarifa: Tarifa) => (
        <span className="text-slate-700">{formatearPesos(tarifa.cargoFijo)}</span>
      ),
    },
    {
      key: 'tasaIva',
      header: 'IVA',
      className: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
      render: (tarifa: Tarifa) => (
        <span className="text-sm text-slate-600">{(tarifa.tasaIva * 100).toFixed(0)}%</span>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Tarifas"
      subtitle="Gestión de tarifas de servicio"
      icon={<DollarSign className="h-5 w-5 text-blue-600" />}
      actions={
        <PermissionGate entity="tarifas" action="create">
          <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Tarifa
          </Button>
        </PermissionGate>
      }
    >
      <DataTable
        columns={columns}
        data={tarifas}
        keyExtractor={(tarifa) => tarifa.id}
        emptyMessage="No hay tarifas registradas"
        emptyIcon={<DollarSign className="h-12 w-12 text-slate-300" />}
        onRowClick={(tarifa) => setSelectedTarifa(tarifa)}
        {...tableProps}
      />

      {/* Detail Modal */}
      <Dialog open={!!selectedTarifa && !showForm} onOpenChange={(open) => !open && setSelectedTarifa(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de Tarifa</DialogTitle>
          </DialogHeader>
          {selectedTarifa && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-slate-500">
                  Vigente desde {format(new Date(selectedTarifa.fechaInicio), 'dd/MM/yyyy', { locale: es })}
                  {selectedTarifa.fechaFin && ` hasta ${format(new Date(selectedTarifa.fechaFin), 'dd/MM/yyyy', { locale: es })}`}
                </span>
                {selectedTarifa.esVigente && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                    <Check className="h-3 w-3 mr-1" />
                    Vigente
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Costo Agua/m³</span>
                  <p className="font-medium">{formatearPesos(selectedTarifa.costoM3Agua)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Costo Alcantarillado/m³</span>
                  <p className="font-medium">
                    {selectedTarifa.costoM3Alcantarillado
                      ? formatearPesos(selectedTarifa.costoM3Alcantarillado)
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Costo Tratamiento/m³</span>
                  <p className="font-medium">
                    {selectedTarifa.costoM3Tratamiento
                      ? formatearPesos(selectedTarifa.costoM3Tratamiento)
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Alcant. + Trat./m³</span>
                  <p className="font-medium">
                    {selectedTarifa.costoM3AlcantarilladoTratamiento
                      ? formatearPesos(selectedTarifa.costoM3AlcantarilladoTratamiento)
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Cargo Fijo</span>
                  <p className="font-medium">{formatearPesos(selectedTarifa.cargoFijo)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Costo Despacho</span>
                  <p className="font-medium">{formatearPesos(selectedTarifa.costoDespacho)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Reposición 1</span>
                  <p className="font-medium">{formatearPesos(selectedTarifa.costoReposicion1)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Reposición 2</span>
                  <p className="font-medium">{formatearPesos(selectedTarifa.costoReposicion2)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Tasa IVA</span>
                  <p className="font-medium">{(selectedTarifa.tasaIva * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <span className="text-slate-500">Interés Mensual</span>
                  <p className="font-medium">
                    {(selectedTarifa.tasaInteresMensual * 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Días de Gracia</span>
                  <p className="font-medium">{selectedTarifa.diasGraciaInteres} días</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                {canDelete && !selectedTarifa.esVigente && (
                  <Button
                    variant="outline"
                    onClick={() => setDeleteTarifa(selectedTarifa)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                )}
                {canEdit && (
                  <Button onClick={() => handleOpenEdit(selectedTarifa)} className="bg-blue-600 hover:bg-blue-700">
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTarifa ? 'Editar Tarifa' : 'Nueva Tarifa'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  Fecha Fin
                </label>
                <Input
                  type="date"
                  value={formData.fechaFin}
                  onChange={(e) => handleInputChange('fechaFin', e.target.value)}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Costos por m³</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Agua *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costoM3Agua}
                    onChange={(e) => handleInputChange('costoM3Agua', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Alcantarillado</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costoM3Alcantarillado}
                    onChange={(e) => handleInputChange('costoM3Alcantarillado', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Tratamiento</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costoM3Tratamiento}
                    onChange={(e) => handleInputChange('costoM3Tratamiento', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Alcant. + Trat.</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costoM3AlcantarilladoTratamiento}
                    onChange={(e) =>
                      handleInputChange('costoM3AlcantarilladoTratamiento', e.target.value)
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Cargos</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Cargo Fijo *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.cargoFijo}
                    onChange={(e) => handleInputChange('cargoFijo', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Costo Despacho *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costoDespacho}
                    onChange={(e) => handleInputChange('costoDespacho', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Reposición de Servicio</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Reposición 1 *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costoReposicion1}
                    onChange={(e) => handleInputChange('costoReposicion1', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Reposición 2 *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costoReposicion2}
                    onChange={(e) => handleInputChange('costoReposicion2', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Impuestos e Intereses</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Tasa IVA *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.tasaIva}
                    onChange={(e) => handleInputChange('tasaIva', e.target.value)}
                    placeholder="0.19"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Interés Mensual</label>
                  <Input
                    type="number"
                    step="0.001"
                    value={formData.tasaInteresMensual}
                    onChange={(e) => handleInputChange('tasaInteresMensual', e.target.value)}
                    placeholder="0.015"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Días Gracia</label>
                  <Input
                    type="number"
                    value={formData.diasGraciaInteres}
                    onChange={(e) => handleInputChange('diasGraciaInteres', e.target.value)}
                    placeholder="30"
                  />
                </div>
              </div>
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
                  : editingTarifa
                  ? 'Guardar Cambios'
                  : 'Crear Tarifa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteTarifa}
        onOpenChange={(open) => !open && setDeleteTarifa(null)}
        itemName={`Tarifa desde ${deleteTarifa?.fechaInicio || ''}`}
        onConfirm={() => deleteTarifa && deleteMutation.mutate(deleteTarifa.id)}
        isLoading={deleteMutation.isPending}
      />
    </AdminLayout>
  );
}
