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
import { AdminLayout, DataTable, StatusBadge, ConfirmDialog, PermissionGate, useCanAccess } from '@/components/admin';

interface Multa {
  id: string;
  clienteId: string;
  monto: number;
  descripcion: string;
  fechaVencimiento: string | null;
  estado: string;
  fechaCreacion: string;
  cliente: { id: string; numeroCliente: string; nombre: string } | null;
}

interface MultasResponse {
  multas: Multa[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export default function MultasPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canCreate = useCanAccess('multas', 'create');
  const canEdit = useCanAccess('multas', 'edit');
  const canCancel = useCanAccess('multas', 'cancel');

  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingMulta, setEditingMulta] = useState<Multa | null>(null);
  const [cancelMulta, setCancelMulta] = useState<Multa | null>(null);

  const [clienteId, setClienteId] = useState('');
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');

  const { data, isLoading } = useQuery<MultasResponse>({
    queryKey: ['admin-multas', page],
    queryFn: async () => {
      const res = await adminApiClient.get<MultasResponse>(`/admin/multas?page=${page}&limit=20`);
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
    setDescripcion('');
    setFechaVencimiento('');
    setShowForm(true);
  };

  const handleOpenEdit = (m: Multa) => {
    setEditingMulta(m);
    setClienteId(m.clienteId);
    setMonto(m.monto.toString());
    setDescripcion(m.descripcion);
    setFechaVencimiento(m.fechaVencimiento || '');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      clienteId,
      monto: parseFloat(monto),
      descripcion,
      fechaVencimiento: fechaVencimiento || undefined,
    };
    if (editingMulta) {
      updateMutation.mutate({ id: editingMulta.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns = [
    {
      key: 'cliente',
      header: 'Cliente',
      render: (m: Multa) => (
        <div>
          <div className="font-medium text-slate-900 text-sm">{m.cliente?.nombre || '-'}</div>
          <div className="text-xs text-slate-500">{m.cliente?.numeroCliente}</div>
        </div>
      ),
    },
    { key: 'monto', header: 'Monto', className: 'text-right', headerClassName: 'text-right',
      render: (m: Multa) => <span className="font-medium text-red-600">{formatearPesos(m.monto)}</span> },
    { key: 'descripcion', header: 'Descripción', className: 'hidden md:table-cell', headerClassName: 'hidden md:table-cell',
      render: (m: Multa) => <span className="text-sm text-slate-600 truncate max-w-xs block">{m.descripcion}</span> },
    { key: 'estado', header: 'Estado', render: (m: Multa) => <StatusBadge status={m.estado} /> },
    { key: 'fecha', header: 'Fecha', className: 'hidden lg:table-cell', headerClassName: 'hidden lg:table-cell',
      render: (m: Multa) => <span className="text-sm text-slate-500">{format(new Date(m.fechaCreacion), 'dd/MM/yy', { locale: es })}</span> },
    {
      key: 'acciones', header: '', className: 'text-right', headerClassName: 'text-right',
      render: (m: Multa) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canEdit && m.estado !== 'cancelada' && (
            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(m)}><Pencil className="h-4 w-4" /></Button>
          )}
          {canCancel && m.estado !== 'cancelada' && (
            <Button variant="ghost" size="sm" onClick={() => setCancelMulta(m)} className="text-red-600"><XCircle className="h-4 w-4" /></Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout title="Multas" subtitle="Gestión de multas" icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
      actions={<PermissionGate entity="multas" action="create"><Button onClick={handleOpenCreate} className="bg-red-600 hover:bg-red-700"><Plus className="h-4 w-4 mr-2" />Nueva Multa</Button></PermissionGate>}>
      <DataTable columns={columns} data={data?.multas || []} keyExtractor={(m) => m.id} isLoading={isLoading}
        emptyMessage="No hay multas" emptyIcon={<AlertTriangle className="h-12 w-12 text-slate-300" />}
        pagination={data?.pagination && { page: data.pagination.page, totalPages: data.pagination.totalPages, total: data.pagination.total, onPageChange: setPage }} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingMulta ? 'Editar Multa' : 'Nueva Multa'}</DialogTitle></DialogHeader>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Descripción *</label>
              <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required rows={2} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Vencimiento</label>
              <Input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : editingMulta ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!cancelMulta} onOpenChange={(o) => !o && setCancelMulta(null)} title="¿Cancelar multa?"
        description={`¿Está seguro que desea cancelar la multa de ${formatearPesos(cancelMulta?.monto || 0)}?`}
        confirmText="Cancelar Multa" onConfirm={() => cancelMulta && cancelMutation.mutate(cancelMulta.id)} isLoading={cancelMutation.isPending} variant="destructive" />
    </AdminLayout>
  );
}


