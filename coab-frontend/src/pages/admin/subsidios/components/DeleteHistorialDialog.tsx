import { formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { HistorialEntry } from '../types';

interface DeleteHistorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: HistorialEntry | null;
  onConfirm: (id: string) => void;
  isLoading: boolean;
}

export function DeleteHistorialDialog({
  open,
  onOpenChange,
  entry,
  onConfirm,
  isLoading,
}: DeleteHistorialDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Eliminar Registro de Subsidio</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Warning */}
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium mb-2">
              ⚠️ Atención: Esta acción elimina el registro permanentemente
            </p>
            <p className="text-sm text-red-700">
              Use esta opción <strong>solo para corregir errores de entrada</strong>.
              Si desea terminar el subsidio de un cliente, use la opción "Dar de Baja" en su lugar.
            </p>
          </div>

          {entry && (
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <p className="font-medium mb-2">Registro a eliminar:</p>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-slate-500">Cliente:</span>
                <span className="font-medium">
                  {entry.cliente?.nombre || entry.numeroCliente}
                </span>
                <span className="text-slate-500">N° Cliente:</span>
                <span className="font-medium">{entry.numeroCliente}</span>
                <span className="text-slate-500">Tipo:</span>
                <span className="font-medium capitalize">{entry.tipoCambio}</span>
                <span className="text-slate-500">Fecha:</span>
                <span className="font-medium">
                  {entry.fechaCambio
                    ? formatearFechaSinHora(entry.fechaCambio, FORMATOS_FECHA.CORTO)
                    : '-'}
                </span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => entry && onConfirm(entry.id)}
            disabled={isLoading}
          >
            {isLoading ? 'Eliminando...' : 'Eliminar Registro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

