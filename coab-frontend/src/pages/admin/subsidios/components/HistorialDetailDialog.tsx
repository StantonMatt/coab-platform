import { Pencil, Trash2, UserMinus } from 'lucide-react';
import { formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin';
import type { HistorialEntry } from '../types';

interface HistorialDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: HistorialEntry | null;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (entry: HistorialEntry) => void;
  onDelete: (entry: HistorialEntry) => void;
  onRemove: (entry: HistorialEntry) => void;
}

export function HistorialDetailDialog({
  open,
  onOpenChange,
  entry,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onRemove,
}: HistorialDetailDialogProps) {
  const isRemovable =
    entry &&
    (entry.tipoCambio === 'alta' || entry.tipoCambio === 'agregado') &&
    entry.subsidio;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detalle de Asignación</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Cliente</span>
                <p className="font-medium">
                  {entry.cliente?.nombre || entry.numeroCliente}
                </p>
              </div>
              <div>
                <span className="text-slate-500">N° Cliente</span>
                <p className="font-medium">{entry.numeroCliente}</p>
              </div>
              <div>
                <span className="text-slate-500">Subsidio</span>
                <p className="font-medium text-emerald-600">
                  {entry.subsidio
                    ? `${entry.subsidio.porcentaje}% (${entry.subsidio.limiteM3} m³)`
                    : '-'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Tipo</span>
                <p>
                  <StatusBadge
                    status={entry.tipoCambio}
                    statusMap={{
                      alta: { label: 'Agregado', className: 'bg-emerald-100 text-emerald-700' },
                      baja: { label: 'Eliminado', className: 'bg-red-100 text-red-700' },
                      agregado: { label: 'Agregado', className: 'bg-emerald-100 text-emerald-700' },
                      eliminado: { label: 'Eliminado', className: 'bg-red-100 text-red-700' },
                    }}
                  />
                </p>
              </div>
              <div>
                <span className="text-slate-500">Fecha</span>
                <p className="font-medium">
                  {entry.fechaCambio
                    ? formatearFechaSinHora(entry.fechaCambio, FORMATOS_FECHA.CORTO)
                    : '-'}
                </p>
              </div>
              {entry.detalles && (
                <div className="col-span-2">
                  <span className="text-slate-500">Detalles</span>
                  <p className="font-medium">{entry.detalles}</p>
                </div>
              )}
            </div>

            {/* Actions section */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              {/* Info message for already dado de baja entries */}
              {(entry.tipoCambio === 'eliminado' || entry.tipoCambio === 'baja') && (
                <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg">
                  <p className="text-sm text-slate-700">
                    <strong>Este registro indica que el cliente ya fue dado de baja</strong> de
                    este subsidio en la fecha indicada.
                  </p>
                </div>
              )}

              {/* Dar de Baja - only for active/agregado entries */}
              {canDelete && isRemovable && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 mb-2">
                    <strong>Dar de Baja:</strong> Crea un nuevo registro indicando que el cliente
                    dejó de recibir este subsidio.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => onRemove(entry)}
                    className="text-amber-700 border-amber-300 hover:bg-amber-100"
                  >
                    <UserMinus className="h-4 w-4 mr-2" />
                    Dar de Baja
                  </Button>
                </div>
              )}

              {/* Edit and Delete - for correcting mistakes */}
              {(canEdit || canDelete) && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-2">
                    <strong>Corregir registro:</strong> Modifica o elimina este registro específico
                    (para corregir errores de entrada).
                  </p>
                  <div className="flex gap-2">
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => onEdit(entry)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(entry)}
                        className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar Registro
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

