import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Plus, Pencil, XCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { formatearPesos } from '@coab/utils';
import { AdminLayout, DataTable, ConfirmDialog, PermissionGate, useCanAccess } from '@/components/admin';

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

  // Sort state - default to client number ascending
  const [sortBy, setSortBy] = useState<string>('numeroCliente');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [clienteId, setClienteId] = useState('');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const { data, isLoading } = useQuery<MultasResponse>({
    queryKey: ['admin-multas', page, sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        sortBy,
        sortDirection,
      });
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

  // Toggle sort on column click
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
    setPage(1); // Reset to first page on sort change
  };

  // Sortable header component
  const SortableHeader = ({ column, label }: { column: string; label: string }) => {
    const isActive = sortBy === column;
    return (
      <button
        onClick={() => handleSort(column)}
        className="flex items-center gap-1 hover:text-slate-900 transition-colors group"
      >
        {label}
        {isActive ? (
          sortDirection === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    );
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
      className: 'text-right',
      headerClassName: 'text-right',
      render: (m: Multa) => <span className="font-medium text-red-600">{formatearPesos(m.monto)}</span>,
    },
    {
      key: 'motivo',
      header: 'Motivo',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (m: Multa) => (
        <span className="text-sm text-slate-600 truncate max-w-xs block" title={m.motivo}>
          {m.motivo}
        </span>
      ),
    },
    {
      key: 'periodo',
      header: <SortableHeader column="periodo" label="Periodo" />,
      className: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
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
    {
      key: 'acciones',
      header: '',
      className: 'text-right',
      headerClassName: 'text-right',
      render: (m: Multa) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canEdit && m.estado !== 'cancelada' && (
            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(m)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canCancel && m.estado !== 'cancelada' && (
            <Button variant="ghost" size="sm" onClick={() => setCancelMulta(m)} className="text-red-600">
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
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
        pagination={
          data?.pagination && {
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            total: data.pagination.total,
            onPageChange: setPage,
          }
        }
      />

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
