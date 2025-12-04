import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AdminUser {
  id: string;
  email: string;
  nombre: string;
  rol: string;
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    const user = localStorage.getItem('admin_user');

    if (!token) {
      navigate('/admin/login');
      return;
    }

    if (user) {
      try {
        setAdminUser(JSON.parse(user));
      } catch {
        navigate('/admin/login');
      }
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_user');
    navigate('/admin/login');
  };

  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
      </div>
    );
  }

  // Get role display name
  const getRoleName = (rol: string) => {
    const roles: Record<string, string> = {
      admin: 'Administrador',
      supervisor: 'Supervisor',
      billing_clerk: 'Ejecutivo de Cobranza',
    };
    return roles[rol] || rol;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-white">C</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-800">COAB Admin</h1>
              <p className="text-xs text-slate-500">
                {adminUser.nombre} • {getRoleName(adminUser.rol)}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            Cerrar Sesión
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Panel de Control
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Clientes - Active */}
          <Link to="/admin/clientes">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-200">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg text-slate-800">Clientes</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Buscar y gestionar clientes
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Pagos - Disabled (Iteration 6) */}
          <Card className="opacity-50 cursor-not-allowed">
            <CardHeader className="pb-2">
              <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg text-slate-400">Pagos</CardTitle>
              <p className="text-sm text-slate-400 mt-1">
                Iteración 6
              </p>
            </CardContent>
          </Card>

          {/* Reportes - Disabled (Phase 2) */}
          <Card className="opacity-50 cursor-not-allowed">
            <CardHeader className="pb-2">
              <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg text-slate-400">Reportes</CardTitle>
              <p className="text-sm text-slate-400 mt-1">
                Fase 2
              </p>
            </CardContent>
          </Card>

          {/* Configuración - Disabled (Phase 2) */}
          <Card className="opacity-50 cursor-not-allowed">
            <CardHeader className="pb-2">
              <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg text-slate-400">
                Configuración
              </CardTitle>
              <p className="text-sm text-slate-400 mt-1">
                Fase 2
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats - Placeholder for future */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-slate-700 mb-4">
            Información del Sistema
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-500">Usuario</p>
                  <p className="text-lg font-medium text-slate-800">
                    {adminUser.email}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-500">Rol</p>
                  <p className="text-lg font-medium text-slate-800">
                    {getRoleName(adminUser.rol)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-500">Versión</p>
                  <p className="text-lg font-medium text-slate-800">MVP 1.0</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}


