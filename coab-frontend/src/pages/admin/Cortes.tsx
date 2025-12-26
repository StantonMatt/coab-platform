import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Scissors, Plus, Search, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { formatearPesos } from '@coab/utils';
import {
  AdminLayout,
  DataTable,
  StatusBadge,
  ConfirmDialog,
  PermissionGate,
  SortableHeader,
  useCanAccess,
} from '@/components/admin';

interface CorteServicio {
  id: string;
  clienteId: string;
  numeroCliente: string;
  fechaCorte: string | null;
  fechaReposicion: string | null;
  motivoCorte: string;
  estado: string;
  numeroReposicion: number | null;
  montoCobrado: number | null;
  afectoIva: boolean;
  autorizadoCortePor: string | null;
  autorizadoReposicionPor: string | null;
  observaciones: string | null;
  fechaCreacion: string;
  cliente: {
    id: string;
    numeroCliente: string;
    nombre: string;
  } | null;
}

interface CortesResponse {
  cortes: CorteServicio[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface CorteFormData {
  clienteId: string;
  fechaCorte: string;
  motivoCorte: string;
  observaciones: string;
  montoCobrado: string;
}

const emptyForm: CorteFormData = {
  clienteId: '',
  fechaCorte: new Date().toISOString().split('T')[0],
  motivoCorte: 'No pago',
  observaciones: '',
  montoCobrado: '',
};

const ESTADO_MAP: Record<string, { label: string; className: string }> = {
  cortado: { label: 'Cortado', className: 'bg-red-100 text-red-700' },
  repuesto: { label: 'Repuesto', className: 'bg-emerald-100 text-emerald-700' },
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700' },
};

export default function AdminCortesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canReposicion = useCanAccess('cortes_servicio', 'authorize_reposicion');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CorteFormData>(emptyForm);
  const [page, setPage] = useState(1);
  const [estadoFilter, setEstadoFilter] = useState('');
  const [search, setSearch] = useState('');

  // Sort state
  const [sortBy, setSortBy] = useState<string>('fechaCorte');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Detail modal state
  const [selectedCorte, setSelectedCorte] = useState<CorteServicio | null>(null);

  // Reposicion state
  const [reposingCorte, setReposingCorte] = useState<CorteServicio | null>(null);

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

  const { data, isLoading } = useQuery<CortesResponse>({
    queryKey: ['admin', 'cortes', page, estadoFilter, search, sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (estadoFilter) params.append('estado', estadoFilter);
      if (search) params.append('search', search);
      params.append('sortBy', sortBy);
      params.append('sortDirection', sortDirection);
      const res = await adminApiClient.get(`/admin/cortes?${params}`);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CorteFormData) => {
      return adminApiClient.post('/admin/cortes', {
        clienteId: data.clienteId,
        fechaCorte: data.fechaCorte,
        motivoCorte: data.motivoCorte,
        observaciones: data.observaciones || null,
        montoCobrado: data.montoCobrado ? parseFloat(data.montoCobrado) : null,
      });
    },
    onSuccess: () => {
      toast({ title: 'Corte registrado', description: 'El corte de servicio se ha registrado.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'cortes'] });
      closeModal();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo registrar el corte.',
        variant: 'destructive',
      });
    },
  });

  const reposicionMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminApiClient.post(`/admin/cortes/${id}/reposicion`);
    },
    onSuccess: () => {
      toast({ title: 'Servicio repuesto', description: 'El servicio ha sido repuesto exitosamente.' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'cortes'] });
      setReposingCorte(null);
      setSelectedCorte(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'No se pudo realizar la reposición.',
        variant: 'destructive',
      });
    },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const columns = [
    {
      key: 'cliente',
      header: (
        <SortableHeader
          column="cliente"
          label="Cliente"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (c: CorteServicio) => (
        <div>
          <p className="font-medium text-slate-900">
            {c.cliente?.nombre || `Cliente #${c.clienteId}`}
          </p>
          <p className="text-xs text-slate-500">{c.numeroCliente}</p>
        </div>
      ),
    },
    {
      key: 'fechaCorte',
      header: (
        <SortableHeader
          column="fechaCorte"
          label="Fecha Corte"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (c: CorteServicio) =>
        c.fechaCorte ? format(new Date(c.fechaCorte), 'dd/MM/yyyy', { locale: es }) : '-',
    },
    {
      key: 'motivoCorte',
      header: 'Motivo',
      render: (c: CorteServicio) => (
        <span className="text-sm text-slate-600">{c.motivoCorte || '-'}</span>
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
      render: (c: CorteServicio) => (
        <StatusBadge status={c.estado} statusMap={ESTADO_MAP} />
      ),
    },
    {
      key: 'fechaReposicion',
      header: (
        <SortableHeader
          column="fechaReposicion"
          label="Reposición"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      render: (c: CorteServicio) =>
        c.fechaReposicion ? format(new Date(c.fechaReposicion), 'dd/MM/yyyy', { locale: es }) : '-',
    },
  ];

  return (
    <AdminLayout
      title="Cortes de Servicio"
      subtitle="Gestiona los cortes y reposiciones de servicio"
      icon={<Scissors className="h-5 w-5 text-blue-600" />}
      actions={
        <PermissionGate entity="cortes_servicio" action="create">
          <Button onClick={() => setIsModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Corte
          </Button>
        </PermissionGate>
      }
    >
      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por cliente..."
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
            <SelectItem value="cortado">Cortado</SelectItem>
            <SelectItem value="repuesto">Repuesto</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.cortes || []}
        keyExtractor={(c) => c.id}
        isLoading={isLoading}
        emptyMessage="No hay cortes de servicio registrados"
        emptyIcon={<Scissors className="h-12 w-12 text-slate-300" />}
        onRowClick={(corte) => setSelectedCorte(corte)}
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
      <Dialog open={!!selectedCorte} onOpenChange={() => setSelectedCorte(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Corte</DialogTitle>
          </DialogHeader>
          {selectedCorte && (
            <div className="space-y-4">
              {/* Client Info */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900 block text-lg">
                    {selectedCorte.cliente?.nombre || `Cliente #${selectedCorte.clienteId}`}
                  </span>
                  <span className="text-sm text-slate-500">
                    N° Cliente: {selectedCorte.numeroCliente}
                  </span>
                </div>
                <StatusBadge status={selectedCorte.estado} statusMap={ESTADO_MAP} />
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-slate-500">Fecha de Corte</span>
                  <span className="font-medium">
                    {selectedCorte.fechaCorte
                      ? format(new Date(selectedCorte.fechaCorte), 'dd/MM/yyyy', { locale: es })
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500">Motivo</span>
                  <span className="font-medium">{selectedCorte.motivoCorte}</span>
                </div>
                {selectedCorte.fechaReposicion && (
                  <div>
                    <span className="block text-slate-500">Fecha de Reposición</span>
                    <span className="font-medium">
                      {format(new Date(selectedCorte.fechaReposicion), 'dd/MM/yyyy', { locale: es })}
                    </span>
                  </div>
                )}
                {selectedCorte.montoCobrado && (
                  <div>
                    <span className="block text-slate-500">Monto Cobrado</span>
                    <span className="font-medium">{formatearPesos(selectedCorte.montoCobrado)}</span>
                  </div>
                )}
                {selectedCorte.autorizadoCortePor && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Autorizado por</span>
                    <span className="font-medium">{selectedCorte.autorizadoCortePor}</span>
                  </div>
                )}
                {selectedCorte.autorizadoReposicionPor && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Reposición autorizada por</span>
                    <span className="font-medium">{selectedCorte.autorizadoReposicionPor}</span>
                  </div>
                )}
                {selectedCorte.observaciones && (
                  <div className="col-span-2">
                    <span className="block text-slate-500">Observaciones</span>
                    <span className="text-slate-700">{selectedCorte.observaciones}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {selectedCorte.estado === 'cortado' && canReposicion && (
                <div className="pt-4 border-t border-slate-200">
                  <Button
                    onClick={() => setReposingCorte(selectedCorte)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Reponer Servicio
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Corte de Servicio</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>ID del Cliente *</Label>
              <Input
                type="text"
                value={formData.clienteId}
                onChange={(e) => setFormData({ ...formData, clienteId: e.target.value })}
                required
                placeholder="Ingrese ID del cliente"
              />
            </div>
            <div>
              <Label>Fecha de Corte *</Label>
              <Input
                type="date"
                value={formData.fechaCorte}
                onChange={(e) => setFormData({ ...formData, fechaCorte: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Motivo *</Label>
              <Select
                value={formData.motivoCorte}
                onValueChange={(val) => setFormData({ ...formData, motivoCorte: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="No pago">No pago</SelectItem>
                  <SelectItem value="Fraude">Fraude</SelectItem>
                  <SelectItem value="Solicitud cliente">Solicitud del cliente</SelectItem>
                  <SelectItem value="Mantención">Mantención</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monto Cobrado (opcional)</Label>
              <Input
                type="number"
                value={formData.montoCobrado}
                onChange={(e) => setFormData({ ...formData, montoCobrado: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                placeholder="Observaciones opcionales"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createMutation.isPending ? 'Registrando...' : 'Registrar Corte'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reposicion Confirmation */}
      <ConfirmDialog
        open={!!reposingCorte}
        onOpenChange={(open) => !open && setReposingCorte(null)}
        title="¿Confirmar reposición de servicio?"
        description={`Se repondrá el servicio para ${reposingCorte?.cliente?.nombre || reposingCorte?.numeroCliente || 'el cliente'}.`}
        onConfirm={() => reposingCorte && reposicionMutation.mutate(reposingCorte.id)}
        isLoading={reposicionMutation.isPending}
        confirmText="Confirmar Reposición"
      />
    </AdminLayout>
  );
}
