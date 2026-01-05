import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Subsidio, SubsidioFormData } from '../types';

interface SubsidioFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSubsidio: Subsidio | null;
  formData: SubsidioFormData;
  onInputChange: (field: keyof SubsidioFormData, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}

export function SubsidioFormDialog({
  open,
  onOpenChange,
  editingSubsidio,
  formData,
  onInputChange,
  onSubmit,
  isLoading,
}: SubsidioFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingSubsidio ? 'Editar Subsidio' : 'Nuevo Subsidio'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                ID Subsidio *
              </label>
              <Input
                type="number"
                value={formData.id}
                onChange={(e) => onInputChange('id', e.target.value)}
                placeholder="1"
                required
                disabled={!!editingSubsidio}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Porcentaje *
              </label>
              <Input
                type="number"
                step="0.01"
                value={formData.porcentaje}
                onChange={(e) => onInputChange('porcentaje', e.target.value)}
                placeholder="50"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Límite m³ *
            </label>
            <Input
              type="number"
              value={formData.limiteM3}
              onChange={(e) => onInputChange('limiteM3', e.target.value)}
              placeholder="15"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fecha Inicio *
              </label>
              <Input
                type="date"
                value={formData.fechaInicio}
                onChange={(e) => onInputChange('fechaInicio', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fecha Término
              </label>
              <Input
                type="date"
                value={formData.fechaTermino}
                onChange={(e) => onInputChange('fechaTermino', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Número de Decreto
            </label>
            <Input
              value={formData.numeroDecreto}
              onChange={(e) => onInputChange('numeroDecreto', e.target.value)}
              placeholder="Ej: D.S. 195"
            />
          </div>

          {editingSubsidio && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Estado
              </label>
              <Select
                value={formData.estado}
                onValueChange={(value) => onInputChange('estado', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Observaciones
            </label>
            <Textarea
              value={formData.observaciones}
              onChange={(e) => onInputChange('observaciones', e.target.value)}
              placeholder="Observaciones opcionales"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading
                ? 'Guardando...'
                : editingSubsidio
                ? 'Guardar Cambios'
                : 'Crear Subsidio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

