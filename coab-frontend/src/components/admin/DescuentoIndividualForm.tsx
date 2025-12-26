import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, User, Percent, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import adminApi from '@/lib/adminApi';
import { formatearPesos } from '@coab/utils';

interface Cliente {
  id: string;
  numeroCliente: string;
  nombre: string;
  rut: string;
}

interface DescuentoIndividualFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    clienteId: string;
    tipo: 'porcentaje' | 'monto_fijo';
    valor: number;
    motivo: string;
  }) => void;
  isSubmitting?: boolean;
}

export function DescuentoIndividualForm({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
}: DescuentoIndividualFormProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [tipo, setTipo] = useState<'porcentaje' | 'monto_fijo'>('monto_fijo');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setDebouncedSearch('');
      setSelectedCliente(null);
      setTipo('monto_fijo');
      setValor('');
      setMotivo('');
    }
  }, [open]);

  // Search clients
  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['cliente-search', debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.length < 2) return { data: [] };
      const res = await adminApi.get(`/admin/clientes?q=${encodeURIComponent(debouncedSearch)}&limit=10`);
      return res.data;
    },
    enabled: debouncedSearch.length >= 2 && !selectedCliente,
  });

  const handleSelectCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setSearchQuery('');
  };

  const handleClearCliente = () => {
    setSelectedCliente(null);
    setSearchQuery('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCliente || !valor || !motivo) return;

    onSubmit({
      clienteId: selectedCliente.id,
      tipo,
      valor: parseFloat(valor),
      motivo,
    });
  };

  const isValid = selectedCliente && valor && parseFloat(valor) > 0 && motivo.trim();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Descuento Individual
          </DialogTitle>
          <DialogDescription>
            Aplica un descuento único a un cliente específico. Este descuento se aplicará en su próxima boleta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cliente Search */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            {selectedCliente ? (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">{selectedCliente.nombre}</p>
                  <p className="text-sm text-slate-600">
                    #{selectedCliente.numeroCliente} • {selectedCliente.rut}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCliente}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por nombre, RUT o número de cliente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {searchResults?.data && searchResults.data.length > 0 && !selectedCliente && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {searchResults.data.map((cliente: Cliente) => (
                      <button
                        key={cliente.id}
                        type="button"
                        onClick={() => handleSelectCliente(cliente)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b last:border-b-0"
                      >
                        <p className="font-medium text-slate-900">{cliente.nombre}</p>
                        <p className="text-sm text-slate-600">
                          #{cliente.numeroCliente} • {cliente.rut}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tipo y Valor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Descuento</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'porcentaje' | 'monto_fijo')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monto_fijo">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Monto Fijo
                    </div>
                  </SelectItem>
                  <SelectItem value="porcentaje">
                    <div className="flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Porcentaje
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {tipo === 'porcentaje' ? '%' : '$'}
                </span>
                <Input
                  type="number"
                  min="0"
                  step={tipo === 'porcentaje' ? '0.1' : '1'}
                  max={tipo === 'porcentaje' ? '100' : undefined}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="pl-8"
                  placeholder={tipo === 'porcentaje' ? '10' : '5000'}
                />
              </div>
              {tipo === 'monto_fijo' && valor && (
                <p className="text-sm text-slate-500">
                  Descuento: {formatearPesos(parseFloat(valor) || 0)}
                </p>
              )}
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label>Motivo del Descuento</Label>
            <Textarea
              placeholder="Ej: Compensación por corte de agua no programado..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? 'Aplicando...' : 'Aplicar Descuento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

