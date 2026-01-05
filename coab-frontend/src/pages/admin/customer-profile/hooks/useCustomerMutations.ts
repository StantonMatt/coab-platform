import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';

export function useCustomerMutations(customerId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Unlock account mutation
  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApiClient.post(`/admin/clientes/${customerId}/desbloquear`);
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: 'Cuenta desbloqueada',
        description: 'El cliente puede iniciar sesión nuevamente',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-customer', customerId] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error.response?.data?.error?.message || 'Error al desbloquear cuenta',
      });
    },
  });

  // Send setup link mutation
  const sendSetupMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApiClient.post(`/admin/clientes/${customerId}/enviar-setup`);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.whatsapp?.success) {
        toast({
          title: 'Enlace enviado',
          description: 'Mensaje de WhatsApp enviado exitosamente',
        });
      } else {
        // WhatsApp failed but URL generated - show copy option
        toast({
          title: 'Enlace generado',
          description: data.whatsapp?.error || 'Copie el enlace para compartir manualmente',
        });
        // Copy URL to clipboard
        navigator.clipboard.writeText(data.setupUrl);
        toast({
          title: 'Enlace copiado',
          description: 'El enlace ha sido copiado al portapapeles',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-customer', customerId] });
    },
    onError: (error: any) => {
      const errorData = error.response?.data?.error;

      if (errorData?.code === 'NO_PHONE') {
        // Customer has no phone - show URL for manual sharing
        navigator.clipboard.writeText(errorData.setupUrl);
        toast({
          title: 'Sin teléfono registrado',
          description: 'Enlace copiado al portapapeles para compartir manualmente',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: errorData?.message || 'Error al enviar enlace',
        });
      }
    },
  });

  return {
    unlockMutation,
    sendSetupMutation,
  };
}

