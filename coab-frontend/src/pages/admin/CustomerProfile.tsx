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
  FileText,
  Gauge,
  FileSearch,
  RefreshCw,
  Pencil,
} from 'lucide-react';
import PaymentModal from '@/components/admin/PaymentModal';
import { ClienteEditModal, PermissionGate } from '@/components/admin';

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
  tienePdf: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

interface Medidor {
  id: number;
  numero_medidor: string;
  marca: string | null;
  modelo: string | null;
  estado: string;
  fecha_instalacion: string | null;
}

interface Lectura {
  id: number;
  medidor_id: number;
  lectura_anterior: number;
  lectura_actual: number;
  consumo_m3: number;
  fecha_lectura: string;
  observaciones: string | null;
}

interface Multa {
  id: number;
  monto: number;
  tipo: string;
  descripcion: string | null;
  estado: string;
  fecha_multa: string;
}

interface Descuento {
  id: number;
  nombre: string;
  tipo: string;
  valor: number;
  fecha_aplicacion: string;
  monto_aplicado: number | null;
}

interface CorteServicio {
  id: number;
  fecha_corte: string;
  motivo: string;
  estado: string;
  fecha_reposicion: string | null;
}

interface Repactacion {
  id: number;
  monto_original: number;
  monto_total: number;
  cuotas_total: number;
  cuotas_pagadas: number;
  monto_cuota: number;
  estado: string;
  fecha_inicio: string;
}

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

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

  // Fetch medidores
  const { data: medidoresData } = useQuery<{ medidores: Medidor[] }>({
    queryKey: ['admin-customer-medidores', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}/medidores`);
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch lecturas
  const { data: lecturasData } = useQuery<{ lecturas: Lectura[] }>({
    queryKey: ['admin-customer-lecturas', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}/lecturas?limit=20`);
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch multas
  const { data: multasData } = useQuery<{ multas: Multa[] }>({
    queryKey: ['admin-customer-multas', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}/multas`);
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch descuentos aplicados (for future use)
  const { data: _descuentosData } = useQuery<{ descuentos: Descuento[] }>({
    queryKey: ['admin-customer-descuentos', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}/descuentos`);
      return res.data;
    },
    enabled: !!id,
  });
  void _descuentosData; // Suppress unused warning

  // Fetch cortes (for future use)
  const { data: _cortesData } = useQuery<{ cortes: CorteServicio[] }>({
    queryKey: ['admin-customer-cortes', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}/cortes`);
      return res.data;
    },
    enabled: !!id,
  });
  void _cortesData; // Suppress unused warning

  // Fetch repactaciones
  const { data: repactacionesData } = useQuery<{ repactaciones: Repactacion[] }>({
    queryKey: ['admin-customer-repactaciones', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}/repactaciones`);
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
              onClick={() => navigate(-1)}
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

                <PermissionGate entity="clientes" action="edit_contact">
                  <Button
                    variant="outline"
                    onClick={() => setEditModalOpen(true)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar Cliente
                  </Button>
                </PermissionGate>

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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {boletasData.data.map((boleta: Boleta) => (
                        <tr
                          key={boleta.id}
                          className={`hover:bg-slate-50 ${
                            boleta.tienePdf
                              ? 'cursor-pointer hover:bg-blue-50'
                              : ''
                          }`}
                          onClick={() => {
                            if (boleta.tienePdf) {
                              handleDownloadPdf(boleta.id);
                            }
                          }}
                          title={boleta.tienePdf ? 'Click para ver PDF' : 'PDF no disponible'}
                        >
                          <td className="px-4 py-3 text-slate-900">
                            <div className="flex items-center gap-2">
                              {boleta.tienePdf && (
                                <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                              )}
                              <span>
                                {format(
                                  new Date(boleta.fechaEmision),
                                  'MMMM yyyy',
                                  { locale: es }
                                )}
                              </span>
                            </div>
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

          {/* Medidores Tab */}
          <TabsContent value="medidores" className="mt-4">
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              {!medidoresData?.medidores?.length ? (
                <div className="p-8 text-center text-slate-500">
                  No hay medidores registrados
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          N° Medidor
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Marca / Modelo
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Instalación
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {medidoresData.medidores.map((medidor: Medidor) => (
                        <tr key={medidor.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-slate-900">
                            {medidor.numero_medidor}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {medidor.marca || '-'} {medidor.modelo ? `/ ${medidor.modelo}` : ''}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              medidor.estado === 'activo' ? 'bg-emerald-100 text-emerald-700' :
                              medidor.estado === 'inactivo' ? 'bg-slate-100 text-slate-600' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {medidor.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {medidor.fecha_instalacion 
                              ? format(new Date(medidor.fecha_instalacion), 'dd/MM/yyyy')
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Lecturas Tab */}
          <TabsContent value="lecturas" className="mt-4">
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              {!lecturasData?.lecturas?.length ? (
                <div className="p-8 text-center text-slate-500">
                  No hay lecturas registradas
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Anterior
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Actual
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Consumo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Observaciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lecturasData.lecturas.map((lectura: Lectura) => (
                        <tr key={lectura.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900">
                            {format(new Date(lectura.fecha_lectura), 'dd/MM/yyyy')}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {lectura.lectura_anterior}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {lectura.lectura_actual}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {lectura.consumo_m3} m³
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-sm">
                            {lectura.observaciones || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Multas Tab */}
          <TabsContent value="multas" className="mt-4">
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              {!multasData?.multas?.length ? (
                <div className="p-8 text-center text-slate-500">
                  No hay multas registradas
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
                          Tipo
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Monto
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Descripción
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {multasData.multas.map((multa: Multa) => (
                        <tr key={multa.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900">
                            {format(new Date(multa.fecha_multa), 'dd/MM/yyyy')}
                          </td>
                          <td className="px-4 py-3 text-slate-600 capitalize">
                            {multa.tipo}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-red-600">
                            {formatearPesos(multa.monto)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              multa.estado === 'activa' ? 'bg-red-100 text-red-700' :
                              multa.estado === 'pagada' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {multa.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-sm">
                            {multa.descripcion || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Repactaciones Tab */}
          <TabsContent value="repactaciones" className="mt-4">
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              {!repactacionesData?.repactaciones?.length ? (
                <div className="p-8 text-center text-slate-500">
                  No hay repactaciones registradas
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Fecha Inicio
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Monto Original
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Monto Total
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          Cuotas
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                          Cuota Mensual
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {repactacionesData.repactaciones.map((repactacion: Repactacion) => (
                        <tr key={repactacion.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900">
                            {format(new Date(repactacion.fecha_inicio), 'dd/MM/yyyy')}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {formatearPesos(repactacion.monto_original)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {formatearPesos(repactacion.monto_total)}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600">
                            {repactacion.cuotas_pagadas}/{repactacion.cuotas_total}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {formatearPesos(repactacion.monto_cuota)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              repactacion.estado === 'activa' ? 'bg-blue-100 text-blue-700' :
                              repactacion.estado === 'completada' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {repactacion.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
