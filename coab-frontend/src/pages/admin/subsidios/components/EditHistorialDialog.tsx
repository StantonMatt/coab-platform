import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import SimpleMonthYearPicker from '@/components/SimpleMonthYearPicker';
import type { HistorialEntry } from '../types';

interface EditHistorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: HistorialEntry | null;
  onConfirm: (params: { id: string; fechaCambio?: string; detalles?: string }) => void;
  isLoading: boolean;
}

export function EditHistorialDialog({
  open,
  onOpenChange,
  entry,
  onConfirm,
  isLoading,
}: EditHistorialDialogProps) {
  const [editMonth, setEditMonth] = useState('');
  const [detalles, setDetalles] = useState('');

  // Initialize state when entry changes
  useEffect(() => {
    if (entry) {
      // Parse date to get month-year
      if (entry.fechaCambio) {
        const date = new Date(entry.fechaCambio);
        setEditMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      } else {
        const now = new Date();
        setEditMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      }
      setDetalles(entry.detalles || '');
    }
  }, [entry]);

  const handleConfirm = () => {
    if (entry) {
      // For alta/agregado: first day of month
      // For baja/eliminado: last day of month
      const [year, month] = editMonth.split('-').map(Number);
      const isAlta = entry.tipoCambio === 'alta' || entry.tipoCambio === 'agregado';
      const fechaCambio = isAlta
        ? `${year}-${String(month).padStart(2, '0')}-01`
        : `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

      onConfirm({
        id: entry.id,
        fechaCambio,
        detalles: detalles || undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Registro de Subsidio</DialogTitle>
          <DialogDescription>
            Corrija los datos de este registro. Use esto solo para corregir errores de entrada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {entry && (
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-slate-500">Cliente:</span>
                <span className="font-medium">
                  {entry.cliente?.nombre || entry.numeroCliente}
                </span>
                <span className="text-slate-500">Tipo:</span>
                <span className="font-medium capitalize">{entry.tipoCambio}</span>
              </div>
            </div>
          )}

          {/* Month selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mes del Cambio *
            </label>
            <SimpleMonthYearPicker value={editMonth} onChange={setEditMonth} />
            <p className="text-xs text-slate-500 mt-1">
              {entry?.tipoCambio === 'agregado' || entry?.tipoCambio === 'alta'
                ? 'El primer mes en que el cliente recibió el subsidio.'
                : 'El último mes en que el cliente recibió el subsidio.'}
            </p>
          </div>

          {/* Detalles */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Detalles / Observaciones
            </label>
            <Textarea
              value={detalles}
              onChange={(e) => setDetalles(e.target.value)}
              placeholder="Detalles adicionales del registro"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !editMonth}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

