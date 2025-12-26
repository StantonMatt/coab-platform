import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Plus, Pencil, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { formatearPesos } from '@coab/utils';
import { AdminLayout, DataTable, ConfirmDialog, PermissionGate, useCanAccess, SortableHeader, useSortState } from '@/components/admin';

interface Multa {
  id: string;
  clienteId: string;
  monto: number;
  motivo: string;
  descripcion: string | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
  estado: 'pendiente' | 'aplicada' | 'cancelada';
  boletaAplicadaId: string | null;
  fechaCreacion: string;
  cliente: { id: string; numeroCliente: string; nombre: string } | null;
}

interface MultasResponse {
  multas: Multa[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

// Status badge mapping
const estadoStyles: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
  aplicada: { label: 'Aplicada', className: 'bg-emerald-100 text-emerald-700' },
  cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
};

export default function MultasPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const _canCreate = useCanAccess('multas', 'create');
  void _canCreate; // For future use
  const canEdit = useCanAccess('multas', 'edit');
  const canCancel = useCanAccess('multas', 'cancel');

  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingMulta, setEditingMulta] = useState<Multa | null>(null);
  const [cancelMulta, setCancelMulta] = useState<Multa | null>(null);
  const [selectedMulta, setSelectedMulta] = useState<Multa | null>(null);

  // Use the sort hook
  const { sortBy, sortDirection, handleSort } = useSortState({
    defaultColumn: 'numeroCliente',
    defaultDirection: 'asc',
    onSortChange: () => setPage(1),
  });

  const [clienteId, setClienteId] = useState('');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const { data, isLoading } = useQuery<MultasResponse>({
    queryKey: ['admin-multas', page, sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (sortBy) params.append('sortBy', sortBy);
      params.append('sortDirection', sortDirection);
      const res = await adminApiClient.get<MultasResponse>(`/admin/multas?${params}`);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => (await adminApiClient.post('/admin/multas', data)).data,
    onSuccess: () => {
      toast({ title: 'Multa creada' });
      queryClient.invalidateQueries({ queryKey: ['admin-multas'] });
      setShowForm(false);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.response?.data?.error?.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => (await adminApiClient.patch(`/admin/multas/${id}`, data)).data,
    onSuccess: () => {
      toast({ title: 'Multa actualizada' });
      queryClient.invalidateQueries({ queryKey: ['admin-multas'] });
      setShowForm(false);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.response?.data?.error?.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => (await adminApiClient.post(`/admin/multas/${id}/cancelar`)).data,
    onSuccess: () => {
      toast({ title: 'Multa cancelada' });
      queryClient.invalidateQueries({ queryKey: ['admin-multas'] });
      setCancelMulta(null);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.response?.data?.error?.message }),
  });

  const handleOpenCreate = () => {
    setEditingMulta(null);
    setClienteId('');
    setMonto('');
    setMotivo('');
    setDescripcion('');
    setShowForm(true);
  };

  const handleOpenEdit = (m: Multa) => {
    setEditingMulta(m);
    setClienteId(m.clienteId);
    setMonto(m.monto.toString());
    setMotivo(m.motivo);
    setDescripcion(m.descripcion || '');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      clienteId,
      monto: parseFloat(monto),
      motivo,
      descripcion: descripcion || undefined,
    };
    if (editingMulta) {
      updateMutation.mutate({ id: editingMulta.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Format periodo as month name and year
  const formatPeriodo = (periodoDesde: string | null) => {
    if (!periodoDesde) return '-';
    try {
      const date = new Date(periodoDesde);
      return format(date, 'MMMM yyyy', { locale: es });
    } catch {
      return '-';
    }
  };

  const columns = [
    {
      key: 'cliente',
      header: <SortableHeader column="numeroCliente" label="Cliente" />,
      render: (m: Multa) => (
        <div>
          <div className="font-medium text-slate-900 text-sm">{m.cliente?.nombre || '-'}</div>
          <div className="text-xs text-slate-500">{m.cliente?.numeroCliente}</div>
        </div>
      ),
    },
    {
      key: 'monto',
      header: <SortableHeader column="monto" label="Monto" />,
      render: (m: Multa) => <span className="font-medium text-red-600">{formatearPesos(m.monto)}</span>,
    },
    {
      key: 'motivo',
      header: 'Motivo',
      render: (m: Multa) => (
        <span className="text-sm text-slate-600 truncate max-w-xs block" title={m.motivo}>
          {m.motivo}
        </span>
      ),
    },
    {
      key: 'periodo',
      header: <SortableHeader column="periodo" label="Periodo" />,
      render: (m: Multa) => (
        <span className="text-sm text-slate-600 capitalize">
          {formatPeriodo(m.periodoDesde)}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (m: Multa) => {
        const style = estadoStyles[m.estado] || estadoStyles.pendiente;
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.className}`}>
            {style.label}
          </span>
        );
      },
    },
  ];

  return (
    <AdminLayout
      title="Multas"
      subtitle="Gestión de multas"
      icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
      actions={
        <PermissionGate entity="multas" action="create">
          <Button onClick={handleOpenCreate} className="bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Multa
          </Button>
        </PermissionGate>
      }
    >
      <DataTable
        columns={columns}
        data={data?.multas || []}
        keyExtractor={(m) => m.id}
        isLoading={isLoading}
        emptyMessage="No hay multas"
        emptyIcon={<AlertTriangle className="h-12 w-12 text-slate-300" />}
        onRowClick={(multa) => setSelectedMulta(multa)}
        pagination={
          data?.pagination && {
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            total: data.pagination.total,
            onPageChange: setPage,
          }
        }
        sorting={{ sortBy, sortDirection, onSort: handleSort }}
      />

      {/* Detail Modal */}
      <Dialog open={!!selectedMulta} onOpenChange={() => setSelectedMulta(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de Multa</DialogTitle>
          </DialogHeader>
          {selectedMulta && (
            <div className="space-y-4">
              {/* Amount and Status */}
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-red-600">
                  {formatearPesos(selectedMulta.monto)}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${estadoStyles[selectedMulta.estado]?.className}`}>
                  {estadoStyles[selectedMulta.estado]?.label}
                </span>
              </div>

              {/* Client Info */}
              {selectedMulta.cliente && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="font-medium text-slate-900">{selectedMulta.cliente.nombre}</p>
                  <p className="text-sm text-slate-500">N° Cliente: {selectedMulta.cliente.numeroCliente}</p>
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-slate-500">Motivo</span>
                  <span className="font-medium">{selectedMulta.motivo}</span>
                </div>
                {selectedMulta.periodoDesde && (
                  <div>
                    <span className="block text-slate-500">Período</span>
                    <span className="font-medium capitalize">{formatPeriodo(selectedMulta.periodoDesde)}</span>
                  </div>
                )}
                {selectedMulta.descripcion && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Descripción</span>
                    <span className="text-slate-700">{selectedMulta.descripcion}</span>
                  </div>
                )}
                <div>
                  <span className="block text-slate-500">Fecha Creación</span>
                  <span className="font-medium">
                    {format(new Date(selectedMulta.fechaCreacion), 'dd/MM/yyyy', { locale: es })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              {selectedMulta.estado !== 'cancelada' && (canEdit || canCancel) && (
                <div className="pt-4 border-t border-slate-200 flex gap-2">
                  {canEdit && (
                    <Button
                      onClick={() => {
                        handleOpenEdit(selectedMulta);
                        setSelectedMulta(null);
                      }}
                      className="flex-1"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setCancelMulta(selectedMulta);
                        setSelectedMulta(null);
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMulta ? 'Editar Multa' : 'Nueva Multa'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingMulta && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ID Cliente *</label>
                <Input value={clienteId} onChange={(e) => setClienteId(e.target.value)} required />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
              <Input type="number" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Motivo *</label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} required placeholder="Ej: Corte y reposición" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (opcional)</label>
              <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Detalles adicionales..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : editingMulta ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelMulta}
        onOpenChange={(o) => !o && setCancelMulta(null)}
        title="¿Cancelar multa?"
        description={`¿Está seguro que desea cancelar la multa de ${formatearPesos(cancelMulta?.monto || 0)}?`}
        confirmText="Cancelar Multa"
        onConfirm={() => cancelMulta && cancelMutation.mutate(cancelMulta.id)}
        isLoading={cancelMutation.isPending}
        variant="destructive"
      />
    </AdminLayout>
  );
}
