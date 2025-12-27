import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, MapPin, UserCheck, Percent, DollarSign, ChevronRight, ChevronLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import adminApi from '@/lib/adminApi';
import { formatearPesos } from '@coab/utils';

interface Ruta {
  id: string;
  nombre: string;
  cantidadDirecciones: number;
}

interface Descuento {
  id: string;
  nombre: string;
  tipoDescuento: string;
  valor: number;
  activo: boolean;
}

interface Cliente {
  id: string;
  numeroCliente: string;
  nombre: string;
}

interface DescuentoMasivoWizardProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    descuentoId?: string;
    template?: {
      nombre: string;
      tipo: 'porcentaje' | 'monto_fijo';
      valor: number;
      descripcion?: string;
    };
    recipientFilter: 'todos' | 'ruta' | 'manual';
    rutaId?: string;
    clienteIds?: string[];
  }) => void;
  isSubmitting?: boolean;
}

export function DescuentoMasivoWizard({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
}: DescuentoMasivoWizardProps) {
  const [step, setStep] = useState(1);
  
  // Step 1: Template
  const [templateMode, setTemplateMode] = useState<'existing' | 'new'>('new');
  const [selectedDescuentoId, setSelectedDescuentoId] = useState('');
  const [templateNombre, setTemplateNombre] = useState('');
  const [templateTipo, setTemplateTipo] = useState<'porcentaje' | 'monto_fijo'>('porcentaje');
  const [templateValor, setTemplateValor] = useState('');
  const [templateDescripcion, setTemplateDescripcion] = useState('');

  // Step 2: Recipients
  const [recipientFilter, setRecipientFilter] = useState<'todos' | 'ruta' | 'manual'>('todos');
  const [selectedRutaId, setSelectedRutaId] = useState('');
  const [selectedClienteIds, setSelectedClienteIds] = useState<string[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [debouncedClienteSearch, setDebouncedClienteSearch] = useState('');

  // Debounce cliente search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedClienteSearch(clienteSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [clienteSearch]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setTemplateMode('new');
      setSelectedDescuentoId('');
      setTemplateNombre('');
      setTemplateTipo('porcentaje');
      setTemplateValor('');
      setTemplateDescripcion('');
      setRecipientFilter('todos');
      setSelectedRutaId('');
      setSelectedClienteIds([]);
      setClienteSearch('');
    }
  }, [open]);

  // Fetch existing templates
  const { data: descuentosData } = useQuery({
    queryKey: ['descuentos-templates'],
    queryFn: async () => {
      const res = await adminApi.get('/admin/descuentos?limit=100');
      return res.data;
    },
    enabled: open && templateMode === 'existing',
  });

  // Fetch rutas
  const { data: rutasData } = useQuery({
    queryKey: ['rutas-for-descuentos'],
    queryFn: async () => {
      const res = await adminApi.get('/admin/descuentos-aplicados/rutas');
      return res.data;
    },
    enabled: open && recipientFilter === 'ruta',
  });

  // Search clientes for manual selection
  const { data: clientesData, isLoading: searchingClientes } = useQuery({
    queryKey: ['clientes-search-masivo', debouncedClienteSearch],
    queryFn: async () => {
      if (debouncedClienteSearch.length < 2) return { data: [] };
      const res = await adminApi.get(`/admin/clientes?q=${encodeURIComponent(debouncedClienteSearch)}&limit=20`);
      return res.data;
    },
    enabled: open && recipientFilter === 'manual' && debouncedClienteSearch.length >= 2,
  });

  // Get preview count
  const { data: previewData } = useQuery({
    queryKey: ['descuento-preview', recipientFilter, selectedRutaId, selectedClienteIds],
    queryFn: async () => {
      const params = new URLSearchParams({ filter: recipientFilter });
      if (recipientFilter === 'ruta' && selectedRutaId) {
        params.append('rutaId', selectedRutaId);
      }
      if (recipientFilter === 'manual' && selectedClienteIds.length > 0) {
        params.append('clienteIds', selectedClienteIds.join(','));
      }
      const res = await adminApi.get(`/admin/descuentos-aplicados/preview-count?${params}`);
      return res.data;
    },
    enabled: open && step === 3,
  });

  const toggleCliente = (clienteId: string) => {
    setSelectedClienteIds((prev) =>
      prev.includes(clienteId)
        ? prev.filter((id) => id !== clienteId)
        : [...prev, clienteId]
    );
  };

  const handleSubmit = () => {
    const data: Parameters<typeof onSubmit>[0] = {
      recipientFilter,
    };

    if (templateMode === 'existing' && selectedDescuentoId) {
      data.descuentoId = selectedDescuentoId;
    } else {
      data.template = {
        nombre: templateNombre,
        tipo: templateTipo,
        valor: parseFloat(templateValor),
        descripcion: templateDescripcion || undefined,
      };
    }

    if (recipientFilter === 'ruta') {
      data.rutaId = selectedRutaId;
    } else if (recipientFilter === 'manual') {
      data.clienteIds = selectedClienteIds;
    }

    onSubmit(data);
  };

  const isStep1Valid = templateMode === 'existing'
    ? !!selectedDescuentoId
    : templateNombre && templateValor && parseFloat(templateValor) > 0;

  const isStep2Valid =
    recipientFilter === 'todos' ||
    (recipientFilter === 'ruta' && !!selectedRutaId) ||
    (recipientFilter === 'manual' && selectedClienteIds.length > 0);

  const selectedTemplate = templateMode === 'existing' && selectedDescuentoId
    ? descuentosData?.descuentos?.find((d: Descuento) => d.id === selectedDescuentoId)
    : null;

  const displayValor = templateMode === 'existing' && selectedTemplate
    ? selectedTemplate.valor
    : parseFloat(templateValor) || 0;

  const displayTipo = templateMode === 'existing' && selectedTemplate
    ? selectedTemplate.tipoDescuento
    : templateTipo;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Descuento Masivo
          </DialogTitle>
          <DialogDescription>
            Paso {step} de 3: {step === 1 ? 'Configurar descuento' : step === 2 ? 'Seleccionar destinatarios' : 'Confirmar y aplicar'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s === step
                  ? 'bg-blue-600 text-white'
                  : s < step
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {s}
            </div>
          ))}
        </div>

        <div className="min-h-[300px]">
          {/* Step 1: Template */}
          {step === 1 && (
            <div className="space-y-4">
              <RadioGroup value={templateMode} onValueChange={(v) => setTemplateMode(v as 'existing' | 'new')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="new-template" />
                  <Label htmlFor="new-template">Crear nueva plantilla</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="existing" id="existing-template" />
                  <Label htmlFor="existing-template">Usar plantilla existente</Label>
                </div>
              </RadioGroup>

              {templateMode === 'existing' ? (
                <div className="space-y-2">
                  <Label>Seleccionar Plantilla</Label>
                  <Select value={selectedDescuentoId} onValueChange={setSelectedDescuentoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione una plantilla..." />
                    </SelectTrigger>
                    <SelectContent>
                      {descuentosData?.descuentos?.filter((d: Descuento) => d.activo).map((d: Descuento) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nombre} ({d.tipoDescuento === 'porcentaje' ? `${d.valor}%` : formatearPesos(d.valor)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                  <div className="space-y-2">
                    <Label>Nombre del Descuento</Label>
                    <Input
                      placeholder="Ej: Compensación Corte Agua Diciembre 2024"
                      value={templateNombre}
                      onChange={(e) => setTemplateNombre(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={templateTipo} onValueChange={(v) => setTemplateTipo(v as 'porcentaje' | 'monto_fijo')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="porcentaje">
                            <div className="flex items-center gap-2">
                              <Percent className="h-4 w-4" />
                              Porcentaje
                            </div>
                          </SelectItem>
                          <SelectItem value="monto_fijo">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4" />
                              Monto Fijo
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Valor</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                          {templateTipo === 'porcentaje' ? '%' : '$'}
                        </span>
                        <Input
                          type="number"
                          min="0"
                          step={templateTipo === 'porcentaje' ? '0.1' : '1'}
                          max={templateTipo === 'porcentaje' ? '100' : undefined}
                          value={templateValor}
                          onChange={(e) => setTemplateValor(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Descripción (opcional)</Label>
                    <Textarea
                      placeholder="Descripción del motivo del descuento..."
                      value={templateDescripcion}
                      onChange={(e) => setTemplateDescripcion(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Recipients */}
          {step === 2 && (
            <div className="space-y-4">
              <RadioGroup value={recipientFilter} onValueChange={(v) => setRecipientFilter(v as 'todos' | 'ruta' | 'manual')}>
                <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-slate-50">
                  <RadioGroupItem value="todos" id="todos" />
                  <Label htmlFor="todos" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Users className="h-4 w-4 text-blue-600" />
                    Todos los clientes activos
                  </Label>
                </div>

                <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-slate-50">
                  <RadioGroupItem value="ruta" id="ruta" />
                  <Label htmlFor="ruta" className="flex items-center gap-2 cursor-pointer flex-1">
                    <MapPin className="h-4 w-4 text-green-600" />
                    Clientes de una ruta específica
                  </Label>
                </div>

                <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-slate-50">
                  <RadioGroupItem value="manual" id="manual" />
                  <Label htmlFor="manual" className="flex items-center gap-2 cursor-pointer flex-1">
                    <UserCheck className="h-4 w-4 text-purple-600" />
                    Selección manual de clientes
                  </Label>
                </div>
              </RadioGroup>

              {recipientFilter === 'ruta' && (
                <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                  <Label>Seleccionar Ruta</Label>
                  <Select value={selectedRutaId} onValueChange={setSelectedRutaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione una ruta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {rutasData?.rutas?.map((r: Ruta) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.nombre} ({r.cantidadDirecciones} direcciones)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {recipientFilter === 'manual' && (
                <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                  <Label>Buscar y Seleccionar Clientes</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Buscar por nombre, RUT o número..."
                      value={clienteSearch}
                      onChange={(e) => setClienteSearch(e.target.value)}
                      className="pl-9"
                    />
                    {searchingClientes && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  {clientesData?.data && clientesData.data.length > 0 && (
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {clientesData.data.map((c: Cliente) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-3 p-3 hover:bg-slate-100 cursor-pointer border-b last:border-b-0"
                        >
                          <Checkbox
                            checked={selectedClienteIds.includes(c.id)}
                            onCheckedChange={() => toggleCliente(c.id)}
                          />
                          <div>
                            <p className="font-medium text-sm">{c.nombre}</p>
                            <p className="text-xs text-slate-500">#{c.numeroCliente}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {selectedClienteIds.length > 0 && (
                    <p className="text-sm text-blue-600 font-medium">
                      {selectedClienteIds.length} cliente(s) seleccionado(s)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Resumen del Descuento</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-blue-700">Descuento:</dt>
                    <dd className="font-medium text-blue-900">
                      {templateMode === 'existing' && selectedTemplate
                        ? selectedTemplate.nombre
                        : templateNombre}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-blue-700">Tipo:</dt>
                    <dd className="font-medium text-blue-900">
                      {displayTipo === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-blue-700">Valor:</dt>
                    <dd className="font-medium text-blue-900">
                      {displayTipo === 'porcentaje'
                        ? `${displayValor}%`
                        : formatearPesos(displayValor)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-blue-700">Destinatarios:</dt>
                    <dd className="font-medium text-blue-900">
                      {recipientFilter === 'todos' && 'Todos los clientes activos'}
                      {recipientFilter === 'ruta' && `Clientes de ruta: ${rutasData?.rutas?.find((r: Ruta) => r.id === selectedRutaId)?.nombre}`}
                      {recipientFilter === 'manual' && `${selectedClienteIds.length} cliente(s) seleccionado(s)`}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-700">
                  {previewData?.count ?? '...'} cliente(s)
                </p>
                <p className="text-sm text-green-600">recibirán este descuento</p>
              </div>

              <p className="text-sm text-slate-600 text-center">
                El descuento se aplicará automáticamente en la próxima boleta de cada cliente.
              </p>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
            disabled={isSubmitting}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 1 ? 'Cancelar' : 'Anterior'}
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Aplicando...' : 'Aplicar Descuento'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}



