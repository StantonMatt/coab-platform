import { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  variant?: 'default' | 'destructive';
}

/**
 * Reusable confirmation dialog component
 * 
 * @example
 * <ConfirmDialog
 *   open={showDeleteConfirm}
 *   onOpenChange={setShowDeleteConfirm}
 *   title="¿Eliminar registro?"
 *   description="Esta acción no se puede deshacer."
 *   onConfirm={handleDelete}
 *   variant="destructive"
 *   confirmText="Eliminar"
 * />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  isLoading = false,
  variant = 'default',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {variant === 'destructive' && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            )}
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold text-slate-900">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="mt-1 text-sm text-slate-600">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {children && <div className="py-4">{children}</div>}

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isLoading}
            className={variant === 'default' ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Simpler inline delete confirmation
 */
interface DeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
  isLoading,
}: DeleteConfirmProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Eliminar registro?"
      description={`¿Está seguro que desea eliminar "${itemName}"? Esta acción no se puede deshacer.`}
      confirmText="Eliminar"
      onConfirm={onConfirm}
      isLoading={isLoading}
      variant="destructive"
    />
  );
}


