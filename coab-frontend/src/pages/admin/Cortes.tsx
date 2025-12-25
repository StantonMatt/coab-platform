import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Scissors, Plus, RefreshCcw, Search } from 'lucide-react';
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
import {
  AdminLayout,
  DataTable,
  ConfirmDialog,
  PermissionGate,
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

export default function AdminCortesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canCreate = useCanAccess('cortes_servicio', 'create');
  const canReposicion = useCanAccess('cortes_servicio', 'authorize_reposicion');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CorteFormData>(emptyForm);
  const [page, setPage] = useState(1);
  const [estadoFilter, setEstadoFilter] = useState('');
  const [search, setSearch] = useState('');

  // Reposicion state
  const [reposingCorte, setReposingCorte] = useState<CorteServicio | null>(null);

  const { data, isLoading } = useQuery<CortesResponse>({
    queryKey: ['admin', 'cortes', page, estadoFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (estadoFilter) params.append('estado', estadoFilter);
      if (search) params.append('search', search);
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

  const getEstadoBadge = (estado: string) => {
    const styles: Record<string, string> = {
      cortado: 'bg-red-100 text-red-700',
      repuesto: 'bg-green-100 text-green-700',
      pendiente: 'bg-yellow-100 text-yellow-700',
    };
    const labels: Record<string, string> = {
      cortado: 'Cortado',
      repuesto: 'Repuesto',
      pendiente: 'Pendiente',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[estado] || 'bg-slate-100'}`}>
        {labels[estado] || estado}
      </span>
    );
  };

  const columns = [
    {
      key: 'cliente',
      header: 'Cliente',
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
      header: 'Fecha Corte',
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (c: CorteServicio) =>
        c.fechaCorte ? format(new Date(c.fechaCorte), 'dd/MM/yyyy', { locale: es }) : '-',
    },
    {
      key: 'motivoCorte',
      header: 'Motivo',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (c: CorteServicio) => (
        <span className="text-sm text-slate-600">{c.motivoCorte || '-'}</span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (c: CorteServicio) => getEstadoBadge(c.estado),
    },
    {
      key: 'fechaReposicion',
      header: 'Reposición',
      className: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
      render: (c: CorteServicio) =>
        c.fechaReposicion ? format(new Date(c.fechaReposicion), 'dd/MM/yyyy', { locale: es }) : '-',
    },
    {
      key: 'acciones',
      header: 'Acciones',
      className: 'text-right',
      headerClassName: 'text-right',
      render: (c: CorteServicio) => (
        <div className="flex justify-end gap-1">
          {c.estado === 'cortado' && canReposicion && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setReposingCorte(c);
              }}
              className="text-green-600 hover:text-green-700"
            >
              <RefreshCcw className="h-4 w-4 mr-1" />
              Reponer
            </Button>
          )}
        </div>
      ),
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
        pagination={
          data?.pagination && {
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            total: data.pagination.total,
            onPageChange: setPage,
          }
        }
      />

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
