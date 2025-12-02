import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatearPesos } from '@coab/utils';
import apiClient from '@/lib/api';

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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const userData = localStorage.getItem('user');

    if (!token) {
      navigate('/login');
      return;
    }

    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch {
        navigate('/login');
        return;
      }
    }

    setIsLoading(false);
  }, [navigate]);

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');

    try {
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore logout errors
    }

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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
              <p className="text-xs text-gray-500">N° Cliente: {user.numeroCliente}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="h-11"
          >
            Cerrar Sesión
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Welcome */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Hola, {user.nombre?.split(' ')[0]}
          </h2>
          <p className="text-gray-600 mt-1">
            Bienvenido al Portal de Clientes
          </p>
        </div>

        {/* Balance Card */}
        <Card className="mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
            <p className="text-sm opacity-90 mb-1">Estado de Cuenta</p>
            <p className="text-4xl font-bold">
              {formatearPesos(0)}
            </p>
            <p className="text-sm mt-2 opacity-90">
              Al día ✓
            </p>
          </div>
        </Card>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Información de Cuenta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">RUT</span>
                <span className="font-medium">{user.rut}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">N° Cliente</span>
                <span className="font-medium">{user.numeroCliente}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estado</span>
                <span className="font-medium capitalize text-green-600">
                  {user.estadoCuenta}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium">{user.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Teléfono</span>
                <span className="font-medium">{user.telefono || '-'}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Success Message */}
        <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
          <p className="text-green-800">
            ✅ <strong>Login exitoso!</strong> El dashboard completo viene en Iteración 3.
          </p>
          <p className="text-green-700 text-sm mt-2">
            Próximamente: Historial de boletas, pagos, y más.
          </p>
        </div>
      </main>
    </div>
  );
}

