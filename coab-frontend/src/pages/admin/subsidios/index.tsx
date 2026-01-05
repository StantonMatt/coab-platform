import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Percent, Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import {
  AdminLayout,
  DeleteConfirmDialog,
  PermissionGate,
  useCanAccess,
  useAdminTable,
} from '@/components/admin';

// Types
import type {
  Subsidio,
  HistorialEntry,
  HistorialFilters,
  SubsidioFormData,
  ReassignClienteInfo,
} from './types';
import { initialFormData } from './types';

// Hook
import { useSubsidiosMutations } from './hooks/useSubsidiosMutations';

// Components
import {
  SubsidiosTable,
  HistorialTable,
  SubsidioDetailDialog,
  HistorialDetailDialog,
  SubsidioFormDialog,
  AssignClientDialog,
  ReassignClientDialog,
  RemoveClientDialog,
  EditHistorialDialog,
  DeleteHistorialDialog,
} from './components';

export default function SubsidiosPage() {
  const { toast } = useToast();
  const canEdit = useCanAccess('subsidios', 'edit');
  const canDelete = useCanAccess('subsidios', 'delete');

  // Tab state
  const [activeTab, setActiveTab] = useState('tipos');

  // Use the admin table hook for subsidios
  const {
    data: subsidios,
    tableProps: subsidiosTableProps,
    refetch: refetchSubsidios,
  } = useAdminTable<Subsidio>({
    endpoint: '/admin/subsidios',
    queryKey: 'admin-subsidios',
    dataKey: 'subsidios',
    defaultSort: { column: 'porcentaje', direction: 'desc' },
    dataStaleTime: 30000,
  });

  // Use the admin table hook for historial (second tab)
  const {
    data: historialEntries,
    tableProps: historialTableProps,
    filters: historialFilters,
    setFilter: setHistorialFilter,
    refetch: refetchHistorial,
  } = useAdminTable<HistorialEntry, HistorialFilters>({
    endpoint: '/admin/subsidio-historial',
    queryKey: 'admin-subsidio-historial',
    dataKey: 'historial',
    defaultSort: { column: 'fechaCambio', direction: 'desc' },
    defaultFilters: { search: '', tipoCambio: '', esActivo: '' },
    enabled: activeTab === 'clientes',
    debouncedFilterKeys: ['search'],
    debounceMs: 300,
    dataStaleTime: 30000,
  });

  // Fetch active subsidios for the assign/reassign dropdowns
  const { data: activeSubsidios } = useQuery<Subsidio[]>({
    queryKey: ['admin-subsidios-activos'],
    queryFn: async () => {
      const res = await adminApiClient.get('/admin/subsidios/activos');
      return res.data.subsidios;
    },
  });

  // =====================================================================
  // Modal states
  // =====================================================================

  // Subsidio form modal
  const [showForm, setShowForm] = useState(false);
  const [editingSubsidio, setEditingSubsidio] = useState<Subsidio | null>(null);
  const [formData, setFormData] = useState<SubsidioFormData>(initialFormData);

  // Subsidio detail/delete modals
  const [selectedSubsidio, setSelectedSubsidio] = useState<Subsidio | null>(null);
  const [deleteSubsidio, setDeleteSubsidio] = useState<Subsidio | null>(null);

  // Historial detail modal
  const [selectedHistorial, setSelectedHistorial] = useState<HistorialEntry | null>(null);

  // Assign client modal
  const [showAssign, setShowAssign] = useState(false);

  // Remove client modal
  const [showRemove, setShowRemove] = useState(false);
  const [removeEntry, setRemoveEntry] = useState<HistorialEntry | null>(null);

  // Edit historial modal
  const [showEditHistorial, setShowEditHistorial] = useState(false);
  const [editHistorialEntry, setEditHistorialEntry] = useState<HistorialEntry | null>(null);

  // Delete historial modal
  const [showDeleteHistorial, setShowDeleteHistorial] = useState(false);
  const [deleteHistorialEntry, setDeleteHistorialEntry] = useState<HistorialEntry | null>(null);

  // Reassign modal
  const [showReassign, setShowReassign] = useState(false);
  const [reassignClienteInfo, setReassignClienteInfo] = useState<ReassignClienteInfo | null>(null);

  // =====================================================================
  // Mutations
  // =====================================================================

  const mutations = useSubsidiosMutations({
    toast,
    refetchSubsidios,
    refetchHistorial,
    onCreateSuccess: () => handleCloseForm(),
    onUpdateSuccess: () => handleCloseForm(),
    onDeleteSuccess: () => {
      setDeleteSubsidio(null);
      setSelectedSubsidio(null);
    },
    onAssignSuccess: () => {
      setShowAssign(false);
    },
    onAssignError: (error: any) => {
      const errorCode = error.response?.data?.error?.code;
      if (errorCode === 'CLIENTE_YA_TIENE_SUBSIDIO') {
        const currentSubsidio = error.response?.data?.error?.currentSubsidio?.subsidio;
        // We need to get the client info from the error or previous state
        // Since AssignClientDialog passes the full context, we handle this there
        const clienteInfo = error.response?.data?.error?.currentSubsidio?.cliente;
        if (currentSubsidio && clienteInfo) {
          setReassignClienteInfo({
            clienteId: clienteInfo.id,
            clienteName: clienteInfo.nombre,
            clienteNumero: clienteInfo.numeroCliente,
            currentSubsidio,
          });
          setShowAssign(false);
          setShowReassign(true);
        } else {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: error.response?.data?.error?.message || 'Error al asignar subsidio',
          });
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error.response?.data?.error?.message || 'Error al asignar subsidio',
        });
      }
    },
    onReassignSuccess: () => {
      setShowReassign(false);
      setReassignClienteInfo(null);
    },
    onRemoveSuccess: () => {
      setShowRemove(false);
      setRemoveEntry(null);
      setSelectedHistorial(null);
    },
    onEditHistorialSuccess: () => {
      setShowEditHistorial(false);
      setEditHistorialEntry(null);
      setSelectedHistorial(null);
    },
    onDeleteHistorialSuccess: () => {
      setShowDeleteHistorial(false);
      setDeleteHistorialEntry(null);
      setSelectedHistorial(null);
    },
  });

  // =====================================================================
  // Handlers
  // =====================================================================

  const handleOpenCreate = () => {
    setEditingSubsidio(null);
    setFormData(initialFormData);
    setShowForm(true);
  };

  const handleOpenEdit = (subsidio: Subsidio) => {
    setEditingSubsidio(subsidio);
    setFormData({
      id: subsidio.id.toString(),
      limiteM3: subsidio.limiteM3.toString(),
      porcentaje: subsidio.porcentaje.toString(),
      fechaInicio: subsidio.fechaInicio,
      fechaTermino: subsidio.fechaTermino || '',
      numeroDecreto: subsidio.numeroDecreto || '',
      observaciones: subsidio.observaciones || '',
      estado: subsidio.estado,
    });
    setShowForm(true);
    setSelectedSubsidio(null);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSubsidio(null);
    setFormData(initialFormData);
  };

  const handleInputChange = (field: keyof SubsidioFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingSubsidio) {
      mutations.updateMutation.mutate({
        id: editingSubsidio.id,
        data: {
          limiteM3: parseInt(formData.limiteM3) || 0,
          porcentaje: parseFloat(formData.porcentaje) || 0,
          fechaInicio: formData.fechaInicio,
          fechaTermino: formData.fechaTermino || null,
          numeroDecreto: formData.numeroDecreto || null,
          observaciones: formData.observaciones || null,
          estado: formData.estado,
        },
      });
    } else {
      mutations.createMutation.mutate({
        id: parseInt(formData.id),
        limiteM3: parseInt(formData.limiteM3) || 0,
        porcentaje: parseFloat(formData.porcentaje) || 0,
        fechaInicio: formData.fechaInicio,
        fechaTermino: formData.fechaTermino || null,
        numeroDecreto: formData.numeroDecreto || null,
        observaciones: formData.observaciones || null,
      });
    }
  };

  const handleOpenEditHistorial = (entry: HistorialEntry) => {
    setEditHistorialEntry(entry);
    setShowEditHistorial(true);
    setSelectedHistorial(null);
  };

  const handleOpenDeleteHistorial = (entry: HistorialEntry) => {
    setDeleteHistorialEntry(entry);
    setShowDeleteHistorial(true);
    setSelectedHistorial(null);
  };

  const handleOpenRemove = (entry: HistorialEntry) => {
    setRemoveEntry(entry);
    setShowRemove(true);
    setSelectedHistorial(null);
  };

  // =====================================================================
  // Render
  // =====================================================================

  return (
    <AdminLayout
      title="Subsidios"
      subtitle="Gestión de subsidios de agua potable"
      icon={<Percent className="h-5 w-5 text-blue-600" />}
      actions={
        activeTab === 'tipos' ? (
          <PermissionGate entity="subsidios" action="create">
            <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Subsidio
            </Button>
          </PermissionGate>
        ) : (
          <PermissionGate entity="subsidios" action="create">
            <Button onClick={() => setShowAssign(true)} className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="h-4 w-4 mr-2" />
              Asignar Cliente
            </Button>
          </PermissionGate>
        )
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="tipos">Tipos de Subsidio</TabsTrigger>
          <TabsTrigger value="clientes">Clientes con Subsidio</TabsTrigger>
        </TabsList>

        <TabsContent value="tipos">
          <SubsidiosTable
            subsidios={subsidios}
            tableProps={subsidiosTableProps}
            onRowClick={(subsidio) => setSelectedSubsidio(subsidio)}
          />
        </TabsContent>

        <TabsContent value="clientes">
          <HistorialTable
            historialEntries={historialEntries}
            tableProps={historialTableProps}
            filters={historialFilters}
            setFilter={setHistorialFilter}
            onRowClick={(entry) => setSelectedHistorial(entry)}
          />
        </TabsContent>
      </Tabs>

      {/* Subsidio Detail Modal */}
      <SubsidioDetailDialog
        open={!!selectedSubsidio && !showForm}
        onOpenChange={(open) => !open && setSelectedSubsidio(null)}
        subsidio={selectedSubsidio}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={handleOpenEdit}
        onDelete={(subsidio) => setDeleteSubsidio(subsidio)}
      />

      {/* Historial Detail Modal */}
      <HistorialDetailDialog
        open={!!selectedHistorial}
        onOpenChange={(open) => !open && setSelectedHistorial(null)}
        entry={selectedHistorial}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={handleOpenEditHistorial}
        onDelete={handleOpenDeleteHistorial}
        onRemove={handleOpenRemove}
      />

      {/* Create/Edit Subsidio Dialog */}
      <SubsidioFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        editingSubsidio={editingSubsidio}
        formData={formData}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        isLoading={mutations.createMutation.isPending || mutations.updateMutation.isPending}
      />

      {/* Assign Client Dialog */}
      <AssignClientDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        activeSubsidios={activeSubsidios}
        onAssign={(params) => {
          // Store client info for potential reassign error handling
          mutations.assignMutation.mutate({
            clienteId: params.clienteId,
            subsidioId: params.subsidioId,
            fechaCambio: params.fechaCambio,
          });
        }}
        isLoading={mutations.assignMutation.isPending}
      />

      {/* Remove Client Dialog */}
      <RemoveClientDialog
        open={showRemove}
        onOpenChange={setShowRemove}
        entry={removeEntry}
        onConfirm={(params) => mutations.removeMutation.mutate(params)}
        isLoading={mutations.removeMutation.isPending}
      />

      {/* Edit Historial Dialog */}
      <EditHistorialDialog
        open={showEditHistorial}
        onOpenChange={setShowEditHistorial}
        entry={editHistorialEntry}
        onConfirm={(params) => mutations.editHistorialMutation.mutate(params)}
        isLoading={mutations.editHistorialMutation.isPending}
      />

      {/* Delete Historial Dialog */}
      <DeleteHistorialDialog
        open={showDeleteHistorial}
        onOpenChange={setShowDeleteHistorial}
        entry={deleteHistorialEntry}
        onConfirm={(id) => mutations.deleteHistorialMutation.mutate(id)}
        isLoading={mutations.deleteHistorialMutation.isPending}
      />

      {/* Reassign Client Dialog */}
      <ReassignClientDialog
        open={showReassign}
        onOpenChange={(open) => {
          setShowReassign(open);
          if (!open) setReassignClienteInfo(null);
        }}
        clienteInfo={reassignClienteInfo}
        activeSubsidios={activeSubsidios}
        onReassign={(params) => mutations.reassignMutation.mutate(params)}
        isLoading={mutations.reassignMutation.isPending}
      />

      {/* Delete Subsidio Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteSubsidio}
        onOpenChange={(open) => !open && setDeleteSubsidio(null)}
        itemName={`Subsidio ${deleteSubsidio?.id || ''} (${deleteSubsidio?.porcentaje || 0}%)`}
        onConfirm={() => deleteSubsidio && mutations.deleteMutation.mutate(deleteSubsidio.id)}
        isLoading={mutations.deleteMutation.isPending}
      />
    </AdminLayout>
  );
}

