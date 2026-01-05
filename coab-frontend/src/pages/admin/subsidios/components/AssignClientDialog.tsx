import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import adminApiClient from '@/lib/adminApi';
import type { Subsidio, ClienteSearchResult } from '../types';

interface AssignClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSubsidios: Subsidio[] | undefined;
  onAssign: (params: {
    clienteId: string;
    subsidioId: number;
    fechaCambio: string;
    selectedCliente: { id: string; numeroCliente: string; nombre: string };
    assignSubsidioId: string;
  }) => void;
  isLoading: boolean;
}

export function AssignClientDialog({
  open,
  onOpenChange,
  activeSubsidios,
  onAssign,
  isLoading,
}: AssignClientDialogProps) {
  const [clienteSearch, setClienteSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<{
    id: string;
    numeroCliente: string;
    nombre: string;
  } | null>(null);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [assignSubsidioId, setAssignSubsidioId] = useState('');
  const [assignMonth, setAssignMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const clienteSearchRef = useRef<HTMLDivElement>(null);

  // Search clients by numeroCliente for autocomplete
  const { data: clienteResults, isLoading: searchingClientes } = useQuery<{
    data: ClienteSearchResult[];
  }>({
    queryKey: ['admin-clientes-search', clienteSearch],
    queryFn: async () => {
      const res = await adminApiClient.get(
        `/admin/clientes?q=${encodeURIComponent(clienteSearch)}&limit=10`
      );
      return res.data;
    },
    enabled: clienteSearch.length >= 2 && !selectedCliente,
    staleTime: 300000, // 5 minutes
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clienteSearchRef.current && !clienteSearchRef.current.contains(event.target as Node)) {
        setShowClienteDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedCliente(null);
      setClienteSearch('');
      setAssignSubsidioId('');
      setShowClienteDropdown(false);
      const now = new Date();
      setAssignMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
  }, [open]);

  const handleAssign = () => {
    if (selectedCliente && assignSubsidioId) {
      const [year, month] = assignMonth.split('-');
      const fechaCambio = `${year}-${month}-01`;
      onAssign({
        clienteId: selectedCliente.id,
        subsidioId: parseInt(assignSubsidioId),
        fechaCambio,
        selectedCliente,
        assignSubsidioId,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar Cliente a Subsidio</DialogTitle>
          <DialogDescription>
            Busque el cliente por número de cliente y seleccione el subsidio a asignar
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Cliente search with autocomplete */}
          <div ref={clienteSearchRef}>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Número de Cliente *
            </label>
            {selectedCliente ? (
              // Locked in client display
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <div className="font-medium text-slate-900">{selectedCliente.numeroCliente}</div>
                  <div className="text-sm text-slate-600">{selectedCliente.nombre}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCliente(null);
                    setClienteSearch('');
                  }}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              // Search input with dropdown
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={clienteSearch}
                  onChange={(e) => {
                    setClienteSearch(e.target.value);
                    setShowClienteDropdown(true);
                  }}
                  onFocus={() => setShowClienteDropdown(true)}
                  placeholder="Escriba al menos 2 caracteres..."
                  className="pl-9"
                  autoComplete="off"
                />
                {/* Dropdown results */}
                {showClienteDropdown && clienteSearch.length >= 2 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {searchingClientes ? (
                      <div className="p-3 text-center text-slate-500 text-sm">Buscando...</div>
                    ) : clienteResults?.data && clienteResults.data.length > 0 ? (
                      clienteResults.data.map((cliente) => (
                        <button
                          key={cliente.id}
                          type="button"
                          onClick={() => {
                            setSelectedCliente({
                              id: cliente.id,
                              numeroCliente: cliente.numeroCliente,
                              nombre: cliente.nombre,
                            });
                            setShowClienteDropdown(false);
                            setClienteSearch('');
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors"
                        >
                          <div className="font-medium text-slate-900">{cliente.numeroCliente}</div>
                          <div className="text-sm text-slate-600">{cliente.nombre}</div>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-center text-slate-500 text-sm">
                        No se encontraron clientes
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subsidio selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subsidio *</label>
            <Select value={assignSubsidioId} onValueChange={setAssignSubsidioId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un subsidio" />
              </SelectTrigger>
              <SelectContent>
                {activeSubsidios?.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.porcentaje}% - {s.limiteM3}m³
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mes de Aplicación *
            </label>
            <SimpleMonthYearPicker value={assignMonth} onChange={setAssignMonth} />
            <p className="text-xs text-slate-500 mt-1">
              La fecha de asignación será el primer día del mes seleccionado
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedCliente || !assignSubsidioId || !assignMonth || isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? 'Asignando...' : 'Asignar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

