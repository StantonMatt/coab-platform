import { Pencil, Trash2 } from 'lucide-react';
import { formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin';
import type { Subsidio } from '../types';

interface SubsidioDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subsidio: Subsidio | null;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (subsidio: Subsidio) => void;
  onDelete: (subsidio: Subsidio) => void;
}

export function SubsidioDetailDialog({
  open,
  onOpenChange,
  subsidio,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: SubsidioDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detalle de Subsidio</DialogTitle>
        </DialogHeader>
        {subsidio && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">ID</span>
                <p className="font-medium">{subsidio.id}</p>
              </div>
              <div>
                <span className="text-slate-500">Porcentaje</span>
                <p className="font-medium text-emerald-600">{subsidio.porcentaje}%</p>
              </div>
              <div>
                <span className="text-slate-500">Límite m³</span>
                <p className="font-medium">{subsidio.limiteM3} m³</p>
              </div>
              <div>
                <span className="text-slate-500">Estado</span>
                <p>
                  <StatusBadge status={subsidio.estado} />
                </p>
              </div>
              <div>
                <span className="text-slate-500">Fecha Inicio</span>
                <p className="font-medium">
                  {formatearFechaSinHora(subsidio.fechaInicio, FORMATOS_FECHA.CORTO)}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Fecha Término</span>
                <p className="font-medium">
                  {subsidio.fechaTermino
                    ? formatearFechaSinHora(subsidio.fechaTermino, FORMATOS_FECHA.CORTO)
                    : 'Sin fecha fin'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Clientes Asignados</span>
                <p className="font-medium">{subsidio.cantidadHistorial}</p>
              </div>
              {subsidio.numeroDecreto && (
                <div>
                  <span className="text-slate-500">Número de Decreto</span>
                  <p className="font-medium">{subsidio.numeroDecreto}</p>
                </div>
              )}
              {subsidio.observaciones && (
                <div className="col-span-2">
                  <span className="text-slate-500">Observaciones</span>
                  <p className="font-medium">{subsidio.observaciones}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              {canDelete && subsidio.cantidadHistorial === 0 && (
                <Button
                  variant="outline"
                  onClick={() => onDelete(subsidio)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              )}
              {canEdit && (
                <Button
                  onClick={() => onEdit(subsidio)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

