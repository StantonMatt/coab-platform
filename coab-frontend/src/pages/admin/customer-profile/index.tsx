import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import {
  Gauge,
  FileSearch,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import PaymentModal from '@/components/admin/PaymentModal';
import { ClienteEditModal } from '@/components/admin';

// Local imports
import { useCustomerQueries } from './hooks/useCustomerQueries';
import { useCustomerMutations } from './hooks/useCustomerMutations';
import {
  CustomerHeader,
  AccountWarnings,
  CustomerInfoCard,
  SaldoCard,
  BoletasTab,
  PagosTab,
  InfoTab,
  MedidoresTab,
  LecturasTab,
  MultasTab,
  RepactacionesTab,
} from './components';

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Custom hooks
  const {
    customer,
    isLoading,
    error,
    paymentsData,
    boletasData,
    medidoresData,
    lecturasData,
    multasData,
    repactacionesData,
  } = useCustomerQueries(id);

  const { unlockMutation, sendSetupMutation } = useCustomerMutations(id);

  // Download PDF function - opens PDF in new tab
  const handleDownloadPdf = async (boletaId: string) => {
    try {
      const res = await adminApiClient.get(`/admin/boletas/${boletaId}/pdf`);
      if (res.data?.url) {
        window.open(res.data.url, '_blank');
      } else {
        toast({
          variant: 'destructive',
          title: 'PDF no disponible',
          description: 'Este boleta aún no tiene un PDF generado',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al abrir PDF',
      });
    }
  };

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-600">
          <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Cargando...
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 bg-slate-50">
        <p className="text-red-600 font-medium">Cliente no encontrado</p>
        <Button
          onClick={() => navigate('/admin/clientes')}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Volver a búsqueda
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <CustomerHeader customer={customer} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Account Warnings */}
        <AccountWarnings
          customer={customer}
          onUnlock={() => unlockMutation.mutate()}
          isUnlocking={unlockMutation.isPending}
        />

        {/* Customer Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <CustomerInfoCard
            customer={customer}
            onOpenPaymentModal={() => setPaymentModalOpen(true)}
            onOpenEditModal={() => setEditModalOpen(true)}
            onSendSetupLink={() => sendSetupMutation.mutate()}
            isSendingSetup={sendSetupMutation.isPending}
          />

          {/* Saldo Card */}
          <SaldoCard customer={customer} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="boletas" className="w-full">
          <TabsList className="bg-white border border-slate-200 p-1">
            <TabsTrigger
              value="boletas"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900"
            >
              Boletas
            </TabsTrigger>
            <TabsTrigger
              value="pagos"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900"
            >
              Pagos
            </TabsTrigger>
            <TabsTrigger
              value="info"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900"
            >
              Más Info
            </TabsTrigger>
            <TabsTrigger
              value="medidores"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900"
            >
              <Gauge className="h-4 w-4 mr-1" />
              Medidores
            </TabsTrigger>
            <TabsTrigger
              value="lecturas"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900"
            >
              <FileSearch className="h-4 w-4 mr-1" />
              Lecturas
            </TabsTrigger>
            <TabsTrigger
              value="multas"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900"
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Multas
            </TabsTrigger>
            <TabsTrigger
              value="repactaciones"
              className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Repactaciones
            </TabsTrigger>
          </TabsList>

          <TabsContent value="boletas" className="mt-4">
            <BoletasTab
              boletas={boletasData?.data}
              onDownloadPdf={handleDownloadPdf}
            />
          </TabsContent>

          <TabsContent value="pagos" className="mt-4">
            <PagosTab pagos={paymentsData?.data} />
          </TabsContent>

          <TabsContent value="info" className="mt-4">
            <InfoTab customer={customer} />
          </TabsContent>

          <TabsContent value="medidores" className="mt-4">
            <MedidoresTab medidores={medidoresData?.medidores} />
          </TabsContent>

          <TabsContent value="lecturas" className="mt-4">
            <LecturasTab lecturas={lecturasData?.lecturas} />
          </TabsContent>

          <TabsContent value="multas" className="mt-4">
            <MultasTab multas={multasData?.multas} />
          </TabsContent>

          <TabsContent value="repactaciones" className="mt-4">
            <RepactacionesTab repactaciones={repactacionesData?.repactaciones} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Payment Modal */}
      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        clienteId={id!}
        clienteNombre={customer.nombre}
        clienteRut={customer.rut || ''}
        clienteDireccion={customer.direccion || undefined}
        saldoActual={customer.saldo}
      />

      {/* Edit Modal */}
      <ClienteEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        clienteId={id!}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-customer', id] });
          setEditModalOpen(false);
        }}
      />
    </div>
  );
}

