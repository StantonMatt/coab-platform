import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SimpleMonthYearPicker from '@/components/SimpleMonthYearPicker';
import type { Subsidio, ReassignClienteInfo } from '../types';

interface ReassignClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteInfo: ReassignClienteInfo | null;
  activeSubsidios: Subsidio[] | undefined;
  onReassign: (params: {
    clienteId: string;
    newSubsidioId: number;
    fechaCambio: string;
  }) => void;
  isLoading: boolean;
}

export function ReassignClientDialog({
  open,
  onOpenChange,
  clienteInfo,
  activeSubsidios,
  onReassign,
  isLoading,
}: ReassignClientDialogProps) {
  const [newSubsidioId, setNewSubsidioId] = useState('');
  const [reassignMonth, setReassignMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setNewSubsidioId('');
      const now = new Date();
      setReassignMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
  }, [open]);

  const handleReassign = () => {
    if (clienteInfo && newSubsidioId) {
      const [year, month] = reassignMonth.split('-').map(Number);
      const fechaCambio = `${year}-${String(month).padStart(2, '0')}-01`;

      onReassign({
        clienteId: clienteInfo.clienteId,
        newSubsidioId: parseInt(newSubsidioId),
        fechaCambio,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reasignar Subsidio</DialogTitle>
          <DialogDescription>
            El cliente ya tiene un subsidio activo. ¿Desea reasignarlo a otro subsidio?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {clienteInfo && (
            <>
              {/* Current info */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  Cliente con subsidio activo:
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-amber-700">Cliente:</span>
                  <span className="font-medium">{clienteInfo.clienteName}</span>
                  <span className="text-amber-700">N° Cliente:</span>
                  <span className="font-medium">{clienteInfo.clienteNumero}</span>
                  <span className="text-amber-700">Subsidio Actual:</span>
                  <span className="font-medium text-amber-800">
                    {clienteInfo.currentSubsidio.porcentaje}% (
                    {clienteInfo.currentSubsidio.limiteM3} m³)
                  </span>
                </div>
              </div>

              {/* New subsidy selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nuevo Subsidio *
                </label>
                <Select value={newSubsidioId} onValueChange={setNewSubsidioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione el nuevo subsidio" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSubsidios
                      ?.filter((s) => s.id !== clienteInfo.currentSubsidio.id)
                      .map((subsidio) => (
                        <SelectItem key={subsidio.id} value={subsidio.id.toString()}>
                          {subsidio.porcentaje}% - Límite {subsidio.limiteM3} m³
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Month selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Último mes con subsidio actual *
                </label>
                <SimpleMonthYearPicker value={reassignMonth} onChange={setReassignMonth} />
                <p className="text-xs text-slate-500 mt-1">
                  El subsidio actual ({clienteInfo.currentSubsidio.porcentaje}%) terminará el
                  último día del mes seleccionado. El nuevo subsidio comenzará el primer día del
                  mes siguiente.
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleReassign}
            disabled={isLoading || !newSubsidioId}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? 'Reasignando...' : 'Reasignar Subsidio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

