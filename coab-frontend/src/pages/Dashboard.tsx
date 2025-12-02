import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import apiClient from '@/lib/api';

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
  estado: string;
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

export default function DashboardPage() {
  const navigate = useNavigate();

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

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
          <Button variant="outline" onClick={handleLogout} className="h-11">
            Cerrar Sesión
          </Button>
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
          </div>
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
                          {formatearPesos(boleta.montoTotal)}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          boleta.estado === 'pendiente'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {boleta.estado === 'pendiente' ? 'Pendiente' : 'Pagada'}
                      </span>
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
    </div>
  );
}
