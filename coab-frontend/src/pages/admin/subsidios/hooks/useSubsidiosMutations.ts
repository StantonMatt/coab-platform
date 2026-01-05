import { useMutation } from '@tanstack/react-query';
import adminApiClient from '@/lib/adminApi';

interface ToastFn {
  (options: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive';
  }): void;
}

interface MutationCallbacks {
  toast: ToastFn;
  refetchSubsidios: () => void;
  refetchHistorial: () => void;
  onCreateSuccess?: () => void;
  onUpdateSuccess?: () => void;
  onDeleteSuccess?: () => void;
  onAssignSuccess?: () => void;
  onReassignSuccess?: () => void;
  onRemoveSuccess?: () => void;
  onEditHistorialSuccess?: () => void;
  onDeleteHistorialSuccess?: () => void;
  onAssignError?: (error: any) => void;
}

export function useSubsidiosMutations(callbacks: MutationCallbacks) {
  const { toast, refetchSubsidios, refetchHistorial } = callbacks;

  // Create subsidio mutation
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await adminApiClient.post('/admin/subsidios', data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio creado', description: 'El subsidio se creó correctamente' });
      refetchSubsidios();
      callbacks.onCreateSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al crear subsidio',
      });
    },
  });

  // Update subsidio mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await adminApiClient.patch(`/admin/subsidios/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio actualizado', description: 'Los cambios se guardaron' });
      refetchSubsidios();
      callbacks.onUpdateSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al actualizar subsidio',
      });
    },
  });

  // Delete subsidio mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await adminApiClient.delete(`/admin/subsidios/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio eliminado', description: 'El subsidio se eliminó correctamente' });
      refetchSubsidios();
      callbacks.onDeleteSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al eliminar subsidio',
      });
    },
  });

  // Assign client to subsidio mutation
  const assignMutation = useMutation({
    mutationFn: async ({
      clienteId,
      subsidioId,
      fechaCambio,
    }: {
      clienteId: string;
      subsidioId: number;
      fechaCambio: string;
    }) => {
      const res = await adminApiClient.post('/admin/subsidio-historial/asignar', {
        clienteId,
        subsidioId,
        fechaCambio,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio asignado', description: 'El cliente fue asignado al subsidio' });
      refetchHistorial();
      refetchSubsidios();
      callbacks.onAssignSuccess?.();
    },
    onError: (error: any) => {
      // Let parent handle special cases like CLIENTE_YA_TIENE_SUBSIDIO
      callbacks.onAssignError?.(error);
    },
  });

  // Reassign client to different subsidio mutation
  const reassignMutation = useMutation({
    mutationFn: async ({
      clienteId,
      newSubsidioId,
      fechaCambio,
    }: {
      clienteId: string;
      newSubsidioId: number;
      fechaCambio: string;
    }) => {
      const res = await adminApiClient.post('/admin/subsidio-historial/reasignar', {
        clienteId,
        newSubsidioId,
        fechaCambio,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio reasignado', description: 'El cliente fue reasignado correctamente' });
      refetchHistorial();
      refetchSubsidios();
      callbacks.onReassignSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al reasignar subsidio',
      });
    },
  });

  // Remove client from subsidio mutation
  const removeMutation = useMutation({
    mutationFn: async ({
      clienteId,
      subsidioId,
      motivo,
      fechaCambio,
    }: {
      clienteId: string;
      subsidioId: number;
      motivo: string;
      fechaCambio: string;
    }) => {
      const res = await adminApiClient.post('/admin/subsidio-historial/remover', {
        clienteId,
        subsidioId,
        motivo,
        fechaCambio,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Subsidio removido', description: 'El cliente fue removido del subsidio' });
      refetchHistorial();
      refetchSubsidios();
      callbacks.onRemoveSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al remover subsidio',
      });
    },
  });

  // Edit historial entry mutation
  const editHistorialMutation = useMutation({
    mutationFn: async ({
      id,
      fechaCambio,
      detalles,
    }: {
      id: string;
      fechaCambio?: string;
      detalles?: string;
    }) => {
      const res = await adminApiClient.patch(`/admin/subsidio-historial/${id}`, {
        fechaCambio,
        detalles,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Registro actualizado', description: 'El registro fue modificado correctamente' });
      refetchHistorial();
      callbacks.onEditHistorialSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al editar registro',
      });
    },
  });

  // Delete historial entry mutation
  const deleteHistorialMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminApiClient.delete(`/admin/subsidio-historial/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Registro eliminado', description: 'El registro fue eliminado correctamente' });
      refetchHistorial();
      refetchSubsidios();
      callbacks.onDeleteHistorialSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al eliminar registro',
      });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    assignMutation,
    reassignMutation,
    removeMutation,
    editHistorialMutation,
    deleteHistorialMutation,
  };
}

