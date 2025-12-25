// Admin shared components - re-export for easy imports

export { AdminLayout, PageHeader, useAdminUser } from './AdminLayout';
export { ClienteEditModal } from './ClienteEditModal';
export { ConfirmDialog, DeleteConfirmDialog } from './ConfirmDialog';
export { DataTable, StatusBadge } from './DataTable';
export {
  PermissionGate,
  useCanAccess,
  usePermissions,
  hasPermission,
  getCurrentAdminUser,
  getCurrentRole,
  PERMISSIONS,
  type AdminRole,
  type PermissionAction,
  type PermissionEntity,
} from './PermissionGate';

