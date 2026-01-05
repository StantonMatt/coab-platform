import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users, CreditCard, FileText, Map, DollarSign, Percent, Gauge, FileSearch,
  AlertTriangle, Tag, Scissors, RefreshCw, LogOut, FileSpreadsheet
} from 'lucide-react';
import { getCurrentAdminUser, hasPermission, type AdminRole, type PermissionEntity } from '@/components/admin';

interface DashboardCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  entity?: PermissionEntity;
}

interface DashboardSection {
  title: string;
  color: string;
  cards: DashboardCard[];
  minRole?: AdminRole;
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<{ id: string; email: string; nombre: string; rol: AdminRole } | null>(null);

  useEffect(() => {
    const user = getCurrentAdminUser();
    const token = localStorage.getItem('admin_access_token');

    if (!token || !user) {
      navigate('/admin/login');
      return;
    }
    setAdminUser(user);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_user');
    navigate('/admin/login');
  };

  const getRoleName = (rol: string) => {
    const roles: Record<string, string> = {
      admin: 'Administrador',
      supervisor: 'Supervisor',
      billing_clerk: 'Ejecutivo de Cobranza',
    };
    return roles[rol] || rol;
  };

  const sections: DashboardSection[] = [
    {
      title: 'Operaciones',
      color: 'blue',
      cards: [
        { title: 'Clientes', description: 'Buscar y gestionar clientes', icon: <Users className="h-6 w-6" />, href: '/admin/clientes', color: 'blue', entity: 'clientes' },
        { title: 'Pagos', description: 'Historial de pagos', icon: <CreditCard className="h-6 w-6" />, href: '/admin/pagos', color: 'blue' },
        { title: 'Cortes de Servicio', description: 'Gestionar cortes y reposiciones', icon: <Scissors className="h-6 w-6" />, href: '/admin/cortes', color: 'blue', entity: 'cortes_servicio' },
      ],
    },
    {
      title: 'Lecturas y Medidores',
      color: 'emerald',
      cards: [
        { title: 'Medidores', description: 'Gestión de medidores', icon: <Gauge className="h-6 w-6" />, href: '/admin/medidores', color: 'emerald', entity: 'medidores' },
        { title: 'Lecturas', description: 'Ver y corregir lecturas', icon: <FileSearch className="h-6 w-6" />, href: '/admin/lecturas', color: 'emerald', entity: 'lecturas' },
      ],
    },
    {
      title: 'Finanzas',
      color: 'amber',
      cards: [
        { title: 'Repactaciones', description: 'Convenios de pago', icon: <RefreshCw className="h-6 w-6" />, href: '/admin/repactaciones', color: 'amber', entity: 'repactaciones' },
        { title: 'Multas', description: 'Gestión de multas', icon: <AlertTriangle className="h-6 w-6" />, href: '/admin/multas', color: 'amber', entity: 'multas' },
        { title: 'Descuentos', description: 'Descuentos disponibles', icon: <Tag className="h-6 w-6" />, href: '/admin/descuentos', color: 'amber', entity: 'descuentos' },
      ],
    },
    {
      title: 'Configuración',
      color: 'purple',
      minRole: 'admin',
      cards: [
        { title: 'Tarifas', description: 'Tarifas de servicio', icon: <DollarSign className="h-6 w-6" />, href: '/admin/tarifas', color: 'purple', entity: 'tarifas' },
        { title: 'Rutas', description: 'Rutas de lectura', icon: <Map className="h-6 w-6" />, href: '/admin/rutas', color: 'purple', entity: 'rutas' },
        { title: 'Subsidios', description: 'Subsidios de agua', icon: <Percent className="h-6 w-6" />, href: '/admin/subsidios', color: 'purple', entity: 'subsidios' },
      ],
    },
    {
      title: 'Herramientas',
      color: 'slate',
      cards: [
        { title: 'Generar Boletas', description: 'Calcular e importar', icon: <FileSpreadsheet className="h-6 w-6" />, href: '/admin/boletas/calcular', color: 'slate' },
        { title: 'Generar PDFs', description: 'Boletas en lote', icon: <FileText className="h-6 w-6" />, href: '/admin/boletas/generar', color: 'slate' },
      ],
    },
  ];

  // Custom color mapping for Tailwind (since dynamic classes don't work well)
  const colorMap: Record<string, { bg: string; text: string; border: string; section: string }> = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'hover:border-blue-200', section: 'text-blue-700 border-blue-200' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'hover:border-emerald-200', section: 'text-emerald-700 border-emerald-200' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-600', border: 'hover:border-amber-200', section: 'text-amber-700 border-amber-200' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'hover:border-purple-200', section: 'text-purple-700 border-purple-200' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'hover:border-slate-200', section: 'text-slate-700 border-slate-200' },
  };

  const roleHierarchy: Record<AdminRole, number> = { billing_clerk: 1, supervisor: 2, admin: 3 };

  const canAccessSection = (section: DashboardSection) => {
    if (!section.minRole) return true;
    const userLevel = roleHierarchy[adminUser?.rol || 'billing_clerk'];
    const requiredLevel = roleHierarchy[section.minRole];
    return userLevel >= requiredLevel;
  };

  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
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
          <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Panel de Control</h2>

        <div className="space-y-8">
          {sections.map((section) => {
            if (!canAccessSection(section)) return null;
            const colors = colorMap[section.color];

            return (
              <div key={section.title}>
                <div className={`flex items-center gap-2 mb-4 pb-2 border-b ${colors.section}`}>
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  {section.minRole === 'admin' && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {section.cards.map((card) => {
                    // Check if user can view this entity
                    if (card.entity && !hasPermission(adminUser.rol, card.entity, 'view')) {
                      return null;
                    }

                    return (
                      <Link to={card.href} key={card.title}>
                        <Card className={`hover:shadow-md transition-all cursor-pointer border-2 border-transparent ${colors.border} h-full`}>
                          <CardHeader className="pb-2">
                            <div className={`w-12 h-12 ${colors.bg} rounded-lg flex items-center justify-center ${colors.text}`}>
                              {card.icon}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <CardTitle className="text-lg text-slate-800">{card.title}</CardTitle>
                            <p className="text-sm text-slate-600 mt-1">{card.description}</p>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* System Info */}
        <div className="mt-10">
          <h3 className="text-lg font-semibold text-slate-700 mb-4">Información del Sistema</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-500">Usuario</p>
                  <p className="text-lg font-medium text-slate-800">{adminUser.email}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-500">Rol</p>
                  <p className="text-lg font-medium text-slate-800">{getRoleName(adminUser.rol)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-500">Versión</p>
                  <p className="text-lg font-medium text-slate-800">MVP 2.0</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
