import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { formatearRUT, formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  Lock,
  Unlock,
  CreditCard,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  AlertTriangle,
  Send,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import PaymentModal from '@/components/admin/PaymentModal';

interface Customer {
  id: string;
  rut: string | null;
  numeroCliente: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  saldo: number;
  estadoCuenta: string;
  estaBloqueado: boolean;
  bloqueadoHasta: string | null;
  intentosFallidos: number;
  tieneContrasena: boolean;
  ultimoInicioSesion: string | null;
  fechaCreacion: string;
  esClienteActual: boolean;
}

interface Pago {
  id: string;
  monto: number;
  fechaPago: string;
  tipoPago: string;
  estado: string;
  numeroTransaccion: string | null;
  operador: string | null;
  observaciones: string | null;
}

interface Boleta {
  id: string;
  numeroFolio: string | null;
  periodoDesde: string;
  periodoHasta: string;
  fechaEmision: string;
  fechaVencimiento: string;
  montoTotal: number;
  montoAdeudado?: number;
  estado: string;
  parcialmentePagada?: boolean;
  consumoM3: number | null;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [regeneratingPdfId, setRegeneratingPdfId] = useState<string | null>(null);

  // Download PDF function
  const handleDownloadPdf = async (boletaId: string) => {
    setDownloadingPdfId(boletaId);
    try {
      const res = await adminApiClient.get(`/admin/boletas/${boletaId}/pdf`);
      if (res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al descargar PDF',
      });
    } finally {
      setDownloadingPdfId(null);
    }
  };

  // Regenerate PDF function
  const handleRegeneratePdf = async (boletaId: string) => {
    setRegeneratingPdfId(boletaId);
    try {
      await adminApiClient.post(`/admin/boletas/${boletaId}/regenerar-pdf`);
      toast({
        title: 'PDF regenerado',
        description: 'El PDF ha sido regenerado correctamente',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al regenerar PDF',
      });
    } finally {
      setRegeneratingPdfId(null);
    }
  };

  // Check admin auth
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Fetch customer profile
  const {
    data: customer,
    isLoading,
    error,
  } = useQuery<Customer>({
    queryKey: ['admin-customer', id],
    queryFn: async () => {
      const res = await adminApiClient.get<Customer>(`/admin/clientes/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch payments
  const { data: paymentsData } = useQuery<PaginatedResponse<Pago>>({
    queryKey: ['admin-customer-payments', id],
    queryFn: async () => {
      const res = await adminApiClient.get<PaginatedResponse<Pago>>(
        `/admin/clientes/${id}/pagos?limit=20`
      );
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch boletas
  const { data: boletasData } = useQuery<PaginatedResponse<Boleta>>({
    queryKey: ['admin-customer-boletas', id],
    queryFn: async () => {
      const res = await adminApiClient.get<PaginatedResponse<Boleta>>(
        `/admin/clientes/${id}/boletas?limit=20`
      );
      return res.data;
    },
    enabled: !!id,
  });

  // Unlock account mutation
  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApiClient.post(`/admin/clientes/${id}/desbloquear`);
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: 'Cuenta desbloqueada',
        description: 'El cliente puede iniciar sesión nuevamente',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-customer', id] });
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
      const res = await adminApiClient.post(`/admin/clientes/${id}/enviar-setup`);
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
      queryClient.invalidateQueries({ queryKey: ['admin-customer', id] });
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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/admin/clientes')}
              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-slate-900">
                  {customer.nombre}
                </h1>
                {customer.estaBloqueado && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    <Lock className="h-3 w-3" />
                    Bloqueado
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 font-mono">
                {customer.rut ? formatearRUT(customer.rut) : 'Sin RUT'} ·{' '}
                N° {customer.numeroCliente}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                customer.estadoCuenta === 'AL_DIA'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {customer.estadoCuenta === 'AL_DIA' ? 'Al día' : 'Moroso'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Account Warnings */}
        {customer.estaBloqueado && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-800">Cuenta Bloqueada</p>
              <p className="text-sm text-red-700">
                {customer.bloqueadoHasta
                  ? `Bloqueada hasta: ${format(new Date(customer.bloqueadoHasta), "d 'de' MMMM 'a las' HH:mm", { locale: es })}`
                  : `Intentos fallidos: ${customer.intentosFallidos}`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100"
              onClick={() => unlockMutation.mutate()}
              disabled={unlockMutation.isPending}
            >
              <Unlock className="h-4 w-4 mr-1" />
              {unlockMutation.isPending ? 'Desbloqueando...' : 'Desbloquear'}
            </Button>
          </div>
        )}

        {!customer.tieneContrasena && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">
                Sin contraseña configurada
              </p>
              <p className="text-sm text-amber-700">
                El cliente aún no ha configurado su contraseña de acceso
              </p>
            </div>
          </div>
        )}

        {/* Customer Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <Card className="lg:col-span-2 border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">
                Información del Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <User className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">N° Cliente</p>
                    <p className="font-medium text-slate-900">
                      {customer.numeroCliente}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Phone className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Teléfono</p>
                    <p className="font-medium text-slate-900">
                      {customer.telefono || '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Mail className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="font-medium text-slate-900">
                      {customer.email || '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Calendar className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Cliente desde</p>
                    <p className="font-medium text-slate-900">
                      {format(new Date(customer.fechaCreacion), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>
              </div>

              {customer.direccion && (
                <div className="flex items-start gap-3 pt-2 border-t border-slate-100">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <MapPin className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Dirección</p>
                    <p className="font-medium text-slate-900">
                      {customer.direccion}
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setPaymentModalOpen(true)}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Registrar Pago
                </Button>

                {!customer.tieneContrasena && (
                  <Button
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => sendSetupMutation.mutate()}
                    disabled={sendSetupMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {sendSetupMutation.isPending
                      ? 'Enviando...'
                      : 'Enviar Link Configuración'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Saldo Card */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500 mb-1">Saldo Pendiente</p>
              <p
                className={`text-3xl font-bold ${
                  customer.saldo > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {formatearPesos(customer.saldo)}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Último acceso:{' '}
                {customer.ultimoInicioSesion
                  ? format(
                      new Date(customer.ultimoInicioSesion),
                      "d MMM yyyy, HH:mm",
                      { locale: es }
                    )
                  : 'Nunca'}
              </p>
            </CardContent>
          </Card>
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
          </TabsList>

          <TabsContent value="boletas" className="mt-4">
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              {!boletasData?.data?.length ? (
                <div className="p-8 text-center text-slate-500">
                  No hay boletas registradas
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Período
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Vencimiento
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Consumo
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Monto
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          PDF
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {boletasData.data.map((boleta: Boleta) => (
                        <tr key={boleta.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900">
                            {format(
                              new Date(boleta.fechaEmision),
                              'MMMM yyyy',
                              { locale: es }
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {format(
                              new Date(boleta.fechaVencimiento),
                              'dd/MM/yyyy'
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {boleta.consumoM3 !== null
                              ? `${boleta.consumoM3} m³`
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {boleta.parcialmentePagada ? (
                              <div className="flex flex-col items-end">
                                <span>{formatearPesos(boleta.montoAdeudado || 0)}</span>
                                <span className="text-xs text-slate-400 line-through">
                                  {formatearPesos(boleta.montoTotal)}
                                </span>
                              </div>
                            ) : (
                              formatearPesos(boleta.montoTotal)
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                boleta.parcialmentePagada
                                  ? 'bg-amber-100 text-amber-700'
                                  : boleta.estado === 'pendiente'
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {boleta.parcialmentePagada
                                ? 'Parcial'
                                : boleta.estado === 'pendiente'
                                ? 'Pendiente'
                                : 'Pagada'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleDownloadPdf(boleta.id)}
                                disabled={downloadingPdfId === boleta.id}
                                title="Descargar PDF"
                              >
                                {downloadingPdfId === boleta.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleRegeneratePdf(boleta.id)}
                                disabled={regeneratingPdfId === boleta.id}
                                title="Regenerar PDF"
                              >
                                {regeneratingPdfId === boleta.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="pagos" className="mt-4">
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              {!paymentsData?.data?.length ? (
                <div className="p-8 text-center text-slate-500">
                  No hay pagos registrados
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Método
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Monto
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase hidden md:table-cell">
                          Operador
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paymentsData.data.map((pago: Pago) => (
                        <tr key={pago.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900">
                            {format(
                              new Date(pago.fechaPago),
                              'dd/MM/yyyy HH:mm'
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 capitalize">
                            {pago.tipoPago}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                            {formatearPesos(pago.monto)}
                          </td>
                          <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                            {pago.operador || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="info" className="mt-4">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-slate-500">
                      Contraseña Configurada
                    </p>
                    <p className="font-medium text-slate-900">
                      {customer.tieneContrasena ? 'Sí' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Cliente Activo</p>
                    <p className="font-medium text-slate-900">
                      {customer.esClienteActual ? 'Sí' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">
                      Último Inicio de Sesión
                    </p>
                    <p className="font-medium text-slate-900">
                      {customer.ultimoInicioSesion
                        ? format(
                            new Date(customer.ultimoInicioSesion),
                            "d 'de' MMMM 'a las' HH:mm",
                            { locale: es }
                          )
                        : 'Nunca'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Registrado</p>
                    <p className="font-medium text-slate-900">
                      {format(new Date(customer.fechaCreacion), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
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
    </div>
  );
}
