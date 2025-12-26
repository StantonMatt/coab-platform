// Admin shared components - re-export for easy imports

export { AdminLayout, PageHeader, useAdminUser } from './AdminLayout';
export { ClienteEditModal } from './ClienteEditModal';
export { ConfirmDialog, DeleteConfirmDialog } from './ConfirmDialog';
export { DataTable, StatusBadge } from './DataTable';
export { 
  SortableHeader, 
  useSortState, 
  SortProvider, 
  useSortContext,
  type SortState,
  type UseSortStateOptions,
  type UseSortStateReturn,
} from './SortableHeader';
export {
  useAdminTable,
  type UseAdminTableOptions,
  type UseAdminTableReturn,
  type Pagination,
} from './useAdminTable';
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
export { DescuentoIndividualForm } from './DescuentoIndividualForm';
export { DescuentoMasivoWizard } from './DescuentoMasivoWizard';
