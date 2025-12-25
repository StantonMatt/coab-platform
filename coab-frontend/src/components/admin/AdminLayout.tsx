import { useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LogOut } from 'lucide-react';
import { getCurrentAdminUser, type AdminRole } from './PermissionGate';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  backTo?: string;
  showLogout?: boolean;
  actions?: ReactNode;
}

/**
 * Get role display name in Spanish
 */
function getRoleName(rol: string): string {
  const roles: Record<string, string> = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    billing_clerk: 'Ejecutivo de Cobranza',
  };
  return roles[rol] || rol;
}

/**
 * Shared admin layout component with consistent header
 * Handles auth check and provides navigation
 * 
 * @example
 * <AdminLayout
 *   title="Tarifas"
 *   subtitle="Gestión de tarifas de servicio"
 *   icon={<DollarSign className="h-5 w-5 text-blue-600" />}
 *   backTo="/admin/dashboard"
 *   actions={<Button>Nueva Tarifa</Button>}
 * >
 *   <TarifasContent />
 * </AdminLayout>
 */
export function AdminLayout({
  children,
  title,
  subtitle,
  icon,
  backTo = '/admin/dashboard',
  showLogout = false,
  actions,
}: AdminLayoutProps) {
  const navigate = useNavigate();
  const user = getCurrentAdminUser();

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (!token) {
      navigate('/admin/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_user');
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Back button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(backTo)}
              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            {/* Icon and title */}
            <div className="flex items-center gap-3 flex-1">
              {icon && (
                <div className="p-2 bg-blue-50 rounded-lg">
                  {icon}
                </div>
              )}
              <div>
                <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
                {subtitle && (
                  <p className="text-sm text-slate-500">{subtitle}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {actions}
              
              {/* User info (when showLogout is true) */}
              {showLogout && user && (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium text-slate-700">{user.nombre}</p>
                    <p className="text-xs text-slate-500">{getRoleName(user.rol)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="text-slate-600"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Salir
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}

/**
 * Simple page header for use within AdminLayout or standalone
 */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Hook to get current admin user with redirect if not authenticated
 */
export function useAdminUser(): { 
  id: string; 
  email: string; 
  nombre: string; 
  rol: AdminRole;
} | null {
  const navigate = useNavigate();
  const user = getCurrentAdminUser();

  useEffect(() => {
    if (!user) {
      navigate('/admin/login');
    }
  }, [user, navigate]);

  return user;
}


