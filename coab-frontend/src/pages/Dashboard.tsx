import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import apiClient from '@/lib/api';
import PaymentModal from '@/components/PaymentModal';
import { CreditCard, Clock, CheckCircle, XCircle, AlertCircle, Download, Loader2 } from 'lucide-react';

// Types
interface Notification {
  id: string;
  mensaje: string;
  tipo: 'info' | 'warning' | 'critical';
  desde: string;
  hasta: string;
}

interface Saldo {
  saldo: number;
  saldoFormateado: string;
  fechaVencimiento: string | null;
  estadoCuenta: 'MOROSO' | 'AL_DIA';
}

interface Pago {
  id: string;
  monto: number;
  fechaPago: string;
  tipoPago: string;
  estado: string;
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

interface User {
  id: string;
  rut: string;
  numeroCliente: string;
  nombre: string;
  email?: string;
  telefono?: string;
  estadoCuenta: string;
}

interface AutoPayStatus {
  activo: boolean;
  tarjetaId: string | null;
  tarjetaUltimosDigitos: string | null;
  tarjetaTipo: string | null;
  ultimoIntento: {
    fecha: string;
    estado: string;
    monto: number;
    error: string | null;
  } | null;
  historial: Array<{
    id: string;
    fecha: string;
    monto: number;
    estado: string;
    intentoNumero: number;
    errorMensaje: string | null;
  }>;
}

interface SavedCard {
  id: string;
  ultimosDigitos: string | null;
  tipoTarjeta: string | null;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  // Handle successful payment - refresh data
  const handlePaymentSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['saldo'] });
    queryClient.invalidateQueries({ queryKey: ['pagos'] });
    queryClient.invalidateQueries({ queryKey: ['boletas'] });
    queryClient.invalidateQueries({ queryKey: ['pending-boletas'] });
  };

  // Get user from localStorage
  const user: User | null = (() => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  })();

  // Fetch active notifications (public - no auth needed)
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/notificaciones');
      return res.data as { data: Notification[] };
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Fetch balance
  const { data: saldo, isLoading: saldoLoading } = useQuery({
    queryKey: ['saldo'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/saldo');
      return res.data as Saldo;
    },
    enabled: !!localStorage.getItem('access_token'),
  });

  // Fetch recent payments
  const { data: pagosData, isLoading: pagosLoading } = useQuery({
    queryKey: ['pagos'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/pagos?limit=5');
      return res.data as { data: Pago[]; pagination: { hasNextPage: boolean } };
    },
    enabled: !!localStorage.getItem('access_token'),
  });

  // Fetch recent boletas
  const { data: boletasData, isLoading: boletasLoading } = useQuery({
    queryKey: ['boletas'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/boletas?limit=5');
      return res.data as { data: Boleta[]; pagination: { hasNextPage: boolean } };
    },
    enabled: !!localStorage.getItem('access_token'),
  });

  // Fetch auto-pay status
  const { data: autopagoData, isLoading: autopagoLoading, refetch: refetchAutopago } = useQuery({
    queryKey: ['autopago'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/autopago');
      return res.data as { data: AutoPayStatus };
    },
    enabled: !!localStorage.getItem('access_token'),
  });

  // Fetch saved cards for auto-pay
  const { data: cardsData } = useQuery({
    queryKey: ['saved-cards'],
    queryFn: async () => {
      const res = await apiClient.get('/pagos/config');
      // API returns tarjetas, map to our SavedCard interface
      const tarjetas = res.data?.transbank?.tarjetas || [];
      return tarjetas.map((t: { id: string; ultimosDigitos: string | null; tipoTarjeta: string | null }) => ({
        id: t.id,
        ultimosDigitos: t.ultimosDigitos,
        tipoTarjeta: t.tipoTarjeta,
      })) as SavedCard[];
    },
    enabled: !!localStorage.getItem('access_token'),
  });

  // Mutations for auto-pay
  const activarAutopagoMutation = useMutation({
    mutationFn: async (tarjetaId: string) => {
      await apiClient.post('/clientes/me/autopago/activar', { tarjetaId });
    },
    onSuccess: () => {
      refetchAutopago();
    },
  });

  const desactivarAutopagoMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/clientes/me/autopago/desactivar');
    },
    onSuccess: () => {
      refetchAutopago();
    },
  });

  const [selectedCardForAutopay, setSelectedCardForAutopay] = useState<string>('');
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  // Download PDF mutation
  const handleDownloadPdf = async (boletaId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation to boleta detail
    setDownloadingPdfId(boletaId);
    try {
      const res = await apiClient.get(`/clientes/me/boletas/${boletaId}/pdf`);
      if (res.data?.url) {
        // Open the signed URL in a new tab
        window.open(res.data.url, '_blank');
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      // Could add toast notification here
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    try {
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore logout errors
    }
    localStorage.clear();
    navigate('/login');
  };

  // Get notification style based on type
  const getNotificationStyle = (tipo: string) => {
    switch (tipo) {
      case 'critical':
        return 'bg-red-50 border-l-4 border-red-500 text-red-900';
      case 'warning':
        return 'bg-amber-50 border-l-4 border-amber-500 text-amber-900';
      default:
        return 'bg-blue-50 border-l-4 border-blue-500 text-blue-900';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-white">C</span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">COAB</h1>
              <p className="text-xs text-gray-500">
                N° Cliente: {user?.numeroCliente || '-'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => navigate('/perfil')}
              className="h-11"
            >
              Mi Perfil
            </Button>
            <Button variant="outline" onClick={handleLogout} className="h-11">
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Service Notifications */}
        {notificationsData?.data && notificationsData.data.length > 0 && (
          <div className="space-y-3">
            {notificationsData.data.map((notif) => (
              <div key={notif.id} className={`p-4 rounded-lg ${getNotificationStyle(notif.tipo)}`}>
                <p className="font-medium">{notif.mensaje}</p>
                <p className="text-sm mt-1 opacity-75">
                  Hasta:{' '}
                  {format(new Date(notif.hasta), "d 'de' MMMM 'a las' HH:mm", {
                    locale: es,
                  })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Welcome */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Hola, {user?.nombre?.split(' ')[0] || 'Cliente'}
          </h2>
          <p className="text-gray-600 mt-1">Bienvenido al Portal de Clientes</p>
        </div>

        {/* Balance Card */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
            <div className="text-center">
              <p className="text-sm opacity-90 mb-1">Saldo Actual</p>
              <p className="text-4xl font-bold">
                {saldoLoading ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  formatearPesos(saldo?.saldo || 0)
                )}
              </p>
              {saldo?.fechaVencimiento && (
                <p className="text-sm mt-3 opacity-90">
                  Vence: {format(new Date(saldo.fechaVencimiento), 'dd/MM/yyyy')}
                </p>
              )}
              <p className="text-sm mt-1 opacity-75">
                {saldo?.estadoCuenta === 'MOROSO' ? (
                  <span className="text-amber-200">⚠ Pendiente de pago</span>
                ) : (
                  <span>✓ Al día</span>
                )}
              </p>
            </div>
            
            {/* Pay Now Button */}
            {saldo && saldo.saldo > 0 && (
              <div className="mt-4 px-2">
                <Button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="w-full h-12 bg-white text-blue-600 hover:bg-blue-50 font-semibold text-base shadow-lg"
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Pagar Ahora
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Auto-Pay Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" /> Pago Automático
            </CardTitle>
          </CardHeader>
          <CardContent>
            {autopagoLoading ? (
              <div className="py-4 text-center text-gray-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Toggle and Card Selection */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={autopagoData?.data?.activo || false}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          // If enabling, need to select a card first
                          const cardId = selectedCardForAutopay || autopagoData?.data?.tarjetaId;
                          if (cardId) {
                            activarAutopagoMutation.mutate(cardId);
                          }
                        } else {
                          desactivarAutopagoMutation.mutate();
                        }
                      }}
                      disabled={
                        activarAutopagoMutation.isPending ||
                        desactivarAutopagoMutation.isPending ||
                        (!autopagoData?.data?.activo && !selectedCardForAutopay && !autopagoData?.data?.tarjetaId && (!cardsData || cardsData.length === 0))
                      }
                    />
                    <div>
                      <p className="font-medium">
                        {autopagoData?.data?.activo ? 'Activo' : 'Inactivo'}
                      </p>
                      <p className="text-sm text-gray-500">
                        Cobra automáticamente cada mes
                      </p>
                    </div>
                  </div>

                  {/* Card Selector */}
                  {cardsData && cardsData.length > 0 ? (
                    <Select
                      value={selectedCardForAutopay || autopagoData?.data?.tarjetaId || ''}
                      onValueChange={(value) => {
                        setSelectedCardForAutopay(value);
                        if (autopagoData?.data?.activo) {
                          // If already active, update the card
                          activarAutopagoMutation.mutate(value);
                        }
                      }}
                      disabled={activarAutopagoMutation.isPending || desactivarAutopagoMutation.isPending}
                    >
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Seleccionar tarjeta" />
                      </SelectTrigger>
                      <SelectContent>
                        {cardsData.map((card) => (
                          <SelectItem key={card.id} value={card.id}>
                            {card.tipoTarjeta?.toUpperCase() || 'Tarjeta'} ****
                            {card.ultimosDigitos}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Guarda una tarjeta para activar
                    </p>
                  )}
                </div>

                {/* Current card info when active */}
                {autopagoData?.data?.activo && autopagoData?.data?.tarjetaUltimosDigitos && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                    <CreditCard className="w-4 h-4" />
                    <span>
                      Usando {autopagoData.data.tarjetaTipo?.toUpperCase() || 'Tarjeta'} terminada en{' '}
                      ****{autopagoData.data.tarjetaUltimosDigitos}
                    </span>
                  </div>
                )}

                {/* Last attempt status */}
                {autopagoData?.data?.ultimoIntento && (
                  <div
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      autopagoData.data.ultimoIntento.estado === 'exitoso'
                        ? 'bg-green-50 text-green-800'
                        : autopagoData.data.ultimoIntento.estado === 'fallido'
                        ? 'bg-red-50 text-red-800'
                        : 'bg-gray-50 text-gray-800'
                    }`}
                  >
                    {autopagoData.data.ultimoIntento.estado === 'exitoso' ? (
                      <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    ) : autopagoData.data.ultimoIntento.estado === 'fallido' ? (
                      <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">
                        {autopagoData.data.ultimoIntento.estado === 'exitoso'
                          ? 'Último pago exitoso'
                          : autopagoData.data.ultimoIntento.estado === 'fallido'
                          ? 'Último intento fallido'
                          : 'Último intento'}
                      </p>
                      <p className="text-sm">
                        {formatearPesos(autopagoData.data.ultimoIntento.monto)} -{' '}
                        {format(
                          new Date(autopagoData.data.ultimoIntento.fecha),
                          'dd/MM/yyyy HH:mm'
                        )}
                      </p>
                      {autopagoData.data.ultimoIntento.error && (
                        <p className="text-sm mt-1">
                          {autopagoData.data.ultimoIntento.error}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent history */}
                {autopagoData?.data?.historial && autopagoData.data.historial.length > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Historial de pagos automáticos
                    </p>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {autopagoData.data.historial.slice(0, 5).map((intento) => (
                        <div
                          key={intento.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                intento.estado === 'exitoso'
                                  ? 'bg-green-500'
                                  : intento.estado === 'fallido'
                                  ? 'bg-red-500'
                                  : 'bg-gray-400'
                              }`}
                            />
                            <span className="text-gray-600">
                              {format(new Date(intento.fecha), 'dd/MM/yy')}
                            </span>
                          </div>
                          <span className="font-medium">
                            {formatearPesos(intento.monto)}
                          </span>
                          <span
                            className={`text-xs ${
                              intento.estado === 'exitoso'
                                ? 'text-green-600'
                                : intento.estado === 'fallido'
                                ? 'text-red-600'
                                : 'text-gray-500'
                            }`}
                          >
                            {intento.estado === 'exitoso'
                              ? '✓'
                              : intento.estado === 'fallido'
                              ? '✗'
                              : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two Column Layout for Desktop */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Payment History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <span>💳</span> Últimos Pagos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pagosLoading ? (
                <div className="py-8 text-center text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2">Cargando...</p>
                </div>
              ) : pagosData?.data?.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No hay pagos registrados
                </p>
              ) : (
                <div className="space-y-3">
                  {pagosData?.data?.map((pago) => (
                    <div
                      key={pago.id}
                      className="flex justify-between items-center py-2 border-b last:border-0"
                    >
                      <div>
                        <p className="font-medium text-green-600">
                          {formatearPesos(pago.monto)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {format(new Date(pago.fechaPago), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 capitalize bg-gray-100 px-2 py-1 rounded">
                        {pago.tipoPago?.replace('_', ' ') || 'Pago'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Boletas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <span>📄</span> Mis Boletas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {boletasLoading ? (
                <div className="py-8 text-center text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2">Cargando...</p>
                </div>
              ) : boletasData?.data?.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No hay boletas
                </p>
              ) : (
                <div className="space-y-3">
                  {boletasData?.data?.map((boleta) => (
                    <div
                      key={boleta.id}
                      className="flex justify-between items-center py-2 border-b last:border-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
                      onClick={() => navigate(`/boletas/${boleta.id}`)}
                    >
                      <div>
                        <p className="font-medium">
                          {format(new Date(boleta.fechaEmision), 'MMMM yyyy', {
                            locale: es,
                          })}
                        </p>
                        <p className="text-sm text-gray-600">
                          {boleta.parcialmentePagada ? (
                            <span className="flex items-center gap-2">
                              <span>{formatearPesos(boleta.montoAdeudado || 0)}</span>
                              <span className="text-gray-400 line-through text-xs">
                                {formatearPesos(boleta.montoTotal)}
                              </span>
                            </span>
                          ) : (
                            formatearPesos(boleta.montoTotal)
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => handleDownloadPdf(boleta.id, e)}
                          disabled={downloadingPdfId === boleta.id}
                          title="Descargar PDF"
                        >
                          {downloadingPdfId === boleta.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            boleta.parcialmentePagada
                              ? 'bg-amber-100 text-amber-700'
                              : boleta.estado === 'pendiente'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {boleta.parcialmentePagada
                            ? 'Parcial'
                            : boleta.estado === 'pendiente'
                            ? 'Pendiente'
                            : 'Pagada'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Account Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Información de Cuenta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">RUT</span>
                  <span className="font-medium">{user?.rut || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">N° Cliente</span>
                  <span className="font-medium">{user?.numeroCliente || '-'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span className="font-medium">{user?.email || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Teléfono</span>
                  <span className="font-medium">{user?.telefono || '-'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        saldo={saldo?.saldo || 0}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
