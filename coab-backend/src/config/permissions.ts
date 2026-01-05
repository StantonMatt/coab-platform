/**
 * Centralized Permissions Configuration
 * 
 * Single source of truth for role-based access control (RBAC).
 * Easy to modify - just update the arrays to change who can do what.
 * 
 * Role Hierarchy:
 *   billing_clerk (1) < supervisor (2) < admin (3)
 */

// Available admin roles in the system
export type AdminRole = 'billing_clerk' | 'supervisor' | 'admin';

// All roles for convenience
const ALL_ROLES: AdminRole[] = ['billing_clerk', 'supervisor', 'admin'];
const SUPERVISOR_UP: AdminRole[] = ['supervisor', 'admin'];
const ADMIN_ONLY: AdminRole[] = ['admin'];

/**
 * Permission actions available for entities
 */
export type PermissionAction = 
  | 'view'
  | 'create'
  | 'edit'
  | 'edit_contact'  // For clientes - limited edit
  | 'edit_all'      // For clientes - full edit
  | 'delete'
  | 'cancel'
  | 'approve_request'
  | 'edit_before_boleta'
  | 'create_correction'
  | 'authorize_reposicion';

/**
 * Entities managed by the admin system
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
  | 'cortes_servicio'
  | 'boletas';

/**
 * Permission matrix - defines which roles can perform which actions on each entity
 * 
 * To modify permissions: simply add/remove roles from the arrays.
 * Empty array = no one can do it
 * ALL_ROLES = everyone can do it
 * SUPERVISOR_UP = supervisor and admin only
 * ADMIN_ONLY = only admin
 */
export const PERMISSIONS: Record<PermissionEntity, Partial<Record<PermissionAction, AdminRole[]>>> = {
  clientes: {
    view: ALL_ROLES,
    edit_contact: ALL_ROLES,        // Phone, email, address
    edit_all: SUPERVISOR_UP,        // All fields including RUT, names
    delete: ADMIN_ONLY,             // Deactivate client
  },
  
  medidores: {
    view: ALL_ROLES,
    create: SUPERVISOR_UP,
    edit: SUPERVISOR_UP,
    delete: ADMIN_ONLY,
  },
  
  lecturas: {
    view: ALL_ROLES,
    edit_before_boleta: ALL_ROLES,  // Direct edit before boleta generation
    create_correction: ALL_ROLES,   // Create lectura_correcciones entry
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
    create: ALL_ROLES,              // billing_clerk can create fines
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
    create: ALL_ROLES,              // billing_clerk can initiate cortes
    edit: SUPERVISOR_UP,
    authorize_reposicion: SUPERVISOR_UP,
    delete: ADMIN_ONLY,
  },
  
  boletas: {
    view: ALL_ROLES,
    create: SUPERVISOR_UP,          // Generate and import boletas
    edit: ADMIN_ONLY,
    delete: ADMIN_ONLY,
  },
};

/**
 * Check if a role has permission for an action on an entity
 * 
 * @param role - The user's role
 * @param entity - The entity being accessed
 * @param action - The action being performed
 * @returns true if allowed, false otherwise
 */
export function hasPermission(
  role: AdminRole | string,
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
 * Get display name for a role in Spanish
 */
export function getRoleDisplayName(role: string): string {
  const names: Record<string, string> = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    billing_clerk: 'Ejecutivo de Cobranza',
  };
  return names[role] || role;
}

/**
 * Get all permissions for a role
 * Useful for frontend to know what to show/hide
 */
export function getRolePermissions(role: AdminRole): Record<PermissionEntity, PermissionAction[]> {
  const result: Record<string, PermissionAction[]> = {};
  
  for (const [entity, actions] of Object.entries(PERMISSIONS)) {
    const allowedActions: PermissionAction[] = [];
    
    for (const [action, roles] of Object.entries(actions)) {
      if (roles?.includes(role)) {
        allowedActions.push(action as PermissionAction);
      }
    }
    
    if (allowedActions.length > 0) {
      result[entity] = allowedActions;
    }
  }
  
  return result as Record<PermissionEntity, PermissionAction[]>;
}


