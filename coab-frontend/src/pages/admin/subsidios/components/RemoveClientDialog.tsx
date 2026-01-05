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

interface RemoveClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: HistorialEntry | null;
  onConfirm: (params: {
    clienteId: string;
    subsidioId: number;
    motivo: string;
    fechaCambio: string;
  }) => void;
  isLoading: boolean;
}

export function RemoveClientDialog({
  open,
  onOpenChange,
  entry,
  onConfirm,
  isLoading,
}: RemoveClientDialogProps) {
  const [motivo, setMotivo] = useState('');
  const [removeMonth, setRemoveMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setMotivo('');
      const now = new Date();
      setRemoveMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
  }, [open]);

  const handleConfirm = () => {
    if (entry && entry.subsidio) {
      // Calculate last day of selected month
      const [year, month] = removeMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const fechaCambio = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      onConfirm({
        clienteId: entry.clienteId,
        subsidioId: entry.subsidio.id,
        motivo,
        fechaCambio,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remover Subsidio de Cliente</DialogTitle>
          <DialogDescription>
            ¿Está seguro que desea remover el subsidio de{' '}
            {entry?.cliente?.nombre || entry?.numeroCliente}?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Month selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Último mes con subsidio *
            </label>
            <SimpleMonthYearPicker value={removeMonth} onChange={setRemoveMonth} />
            <p className="text-xs text-slate-500 mt-1">
              Seleccione el <strong>último mes</strong> en que el cliente recibió el subsidio.
              A partir del mes siguiente, ya no lo recibirá.
            </p>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo (opcional)
            </label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ingrese el motivo de la baja"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || !removeMonth}
          >
            {isLoading ? 'Removiendo...' : 'Remover Subsidio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

