import { ReactNode, useMemo } from 'react';

/**
 * Admin role types - must match backend
 */
export type AdminRole = 'billing_clerk' | 'supervisor' | 'admin';

/**
 * Permission actions available - must match backend
 */
export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'edit_contact'
  | 'edit_all'
  | 'delete'
  | 'cancel'
  | 'approve_request'
  | 'edit_before_boleta'
  | 'create_correction'
  | 'authorize_reposicion';

/**
 * Entities managed by admin - must match backend
 */
export type PermissionEntity =
  | 'clientes'
  | 'medidores'
  | 'lecturas'
  | 'repactaciones'
  | 'solicitudes_repactacion'
  | 'subsidios'
  | 'multas'
  | 'descuentos'
  | 'tarifas'
  | 'rutas'
  | 'cortes_servicio';

// All roles for convenience
const ALL_ROLES: AdminRole[] = ['billing_clerk', 'supervisor', 'admin'];
const SUPERVISOR_UP: AdminRole[] = ['supervisor', 'admin'];
const ADMIN_ONLY: AdminRole[] = ['admin'];

/**
 * Frontend mirror of backend permissions
 * Keep in sync with coab-backend/src/config/permissions.ts
 */
export const PERMISSIONS: Record<PermissionEntity, Partial<Record<PermissionAction, AdminRole[]>>> = {
  clientes: {
    view: ALL_ROLES,
    edit_contact: ALL_ROLES,
    edit_all: SUPERVISOR_UP,
    delete: ADMIN_ONLY,
  },
  medidores: {
    view: ALL_ROLES,
    create: SUPERVISOR_UP,
    edit: SUPERVISOR_UP,
    delete: ADMIN_ONLY,
  },
  lecturas: {
    view: ALL_ROLES,
    edit_before_boleta: ALL_ROLES,
    create_correction: ALL_ROLES,
    delete: ADMIN_ONLY,
  },
  repactaciones: {
    view: ALL_ROLES,
    create: SUPERVISOR_UP,
    edit: SUPERVISOR_UP,
    cancel: ADMIN_ONLY,
  },
  solicitudes_repactacion: {
    view: ALL_ROLES,
    approve_request: SUPERVISOR_UP,
  },
  subsidios: {
    view: ALL_ROLES,
    create: ADMIN_ONLY,
    edit: ADMIN_ONLY,
    delete: ADMIN_ONLY,
  },
  multas: {
    view: ALL_ROLES,
    create: ALL_ROLES,
    edit: SUPERVISOR_UP,
    cancel: ADMIN_ONLY,
    delete: ADMIN_ONLY,
  },
  descuentos: {
    view: ALL_ROLES,
    create: ADMIN_ONLY,
    edit: ADMIN_ONLY,
    delete: ADMIN_ONLY,
  },
  tarifas: {
    view: ALL_ROLES,
    create: ADMIN_ONLY,
    edit: ADMIN_ONLY,
    delete: ADMIN_ONLY,
  },
  rutas: {
    view: ALL_ROLES,
    create: ADMIN_ONLY,
    edit: ADMIN_ONLY,
    delete: ADMIN_ONLY,
  },
  cortes_servicio: {
    view: ALL_ROLES,
    create: ALL_ROLES,
    edit: SUPERVISOR_UP,
    authorize_reposicion: SUPERVISOR_UP,
    delete: ADMIN_ONLY,
  },
};

/**
 * Check if a role has permission for an action on an entity
 */
export function hasPermission(
  role: string,
  entity: PermissionEntity,
  action: PermissionAction
): boolean {
  const entityPermissions = PERMISSIONS[entity];
  if (!entityPermissions) return false;

  const allowedRoles = entityPermissions[action];
  if (!allowedRoles) return false;

  return allowedRoles.includes(role as AdminRole);
}

/**
 * Get current admin user from localStorage
 */
export function getCurrentAdminUser(): { id: string; email: string; nombre: string; rol: AdminRole } | null {
  const userStr = localStorage.getItem('admin_user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * Get current admin role from localStorage
 */
export function getCurrentRole(): AdminRole {
  const user = getCurrentAdminUser();
  return (user?.rol as AdminRole) || 'billing_clerk';
}

interface PermissionGateProps {
  entity: PermissionEntity;
  action: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Component to conditionally render children based on permissions
 * 
 * @example
 * <PermissionGate entity="repactaciones" action="create">
 *   <Button>Crear Repactación</Button>
 * </PermissionGate>
 */
export function PermissionGate({ entity, action, children, fallback = null }: PermissionGateProps) {
  const canAccess = useMemo(() => {
    const role = getCurrentRole();
    return hasPermission(role, entity, action);
  }, [entity, action]);

  return canAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hook to check if current user can perform an action
 * 
 * @example
 * const canCreateRepactacion = useCanAccess('repactaciones', 'create');
 */
export function useCanAccess(entity: PermissionEntity, action: PermissionAction): boolean {
  return useMemo(() => {
    const role = getCurrentRole();
    return hasPermission(role, entity, action);
  }, [entity, action]);
}

/**
 * Hook to get all permissions for current user
 */
export function usePermissions(): Record<PermissionEntity, PermissionAction[]> {
  return useMemo(() => {
    const role = getCurrentRole();
    const result: Partial<Record<PermissionEntity, PermissionAction[]>> = {};

    for (const [entity, actions] of Object.entries(PERMISSIONS)) {
      const allowedActions: PermissionAction[] = [];

      for (const [action, roles] of Object.entries(actions)) {
        if (roles?.includes(role)) {
          allowedActions.push(action as PermissionAction);
        }
      }

      if (allowedActions.length > 0) {
        result[entity as PermissionEntity] = allowedActions;
      }
    }

    return result as Record<PermissionEntity, PermissionAction[]>;
  }, []);
}


