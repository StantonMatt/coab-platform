import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { useCanAccess } from './PermissionGate';

interface ClienteData {
  id: string;
  numeroCliente: string;
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
  rut: string | null;
  telefono: string | null;
  correo: string | null;
  recibeFactura: boolean;
  nombrePagante: string | null;
  excluirCargoFijo: boolean;
  esClienteActual: boolean;
  direccion: {
    id: string;
    direccion: string;
    ciudad: string | null;
    comuna: string | null;
    region: string | null;
  } | null;
}

interface ClienteEditModalProps {
  clienteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ClienteEditModal({
  clienteId,
  open,
  onOpenChange,
  onSuccess,
}: ClienteEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEditAll = useCanAccess('clientes', 'edit_all');

  // Form state for contact info
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');

  // Form state for address
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [comuna, setComuna] = useState('');
  const [region, setRegion] = useState('');

  // Form state for full edit (supervisor+)
  const [primerNombre, setPrimerNombre] = useState('');
  const [segundoNombre, setSegundoNombre] = useState('');
  const [primerApellido, setPrimerApellido] = useState('');
  const [segundoApellido, setSegundoApellido] = useState('');
  const [rut, setRut] = useState('');
  const [recibeFactura, setRecibeFactura] = useState(false);
  const [nombrePagante, setNombrePagante] = useState('');
  const [excluirCargoFijo, setExcluirCargoFijo] = useState(false);
  const [esClienteActual, setEsClienteActual] = useState(true);

  // Fetch client data for editing
  const { data, isLoading, error } = useQuery<ClienteData>({
    queryKey: ['admin-cliente-edit', clienteId],
    queryFn: async () => {
      const res = await adminApiClient.get<ClienteData>(`/admin/clientes/${clienteId}/editar`);
      return res.data;
    },
    enabled: open,
  });

  // Populate form when data loads
  useEffect(() => {
    if (data) {
      setTelefono(data.telefono || '');
      setCorreo(data.correo || '');
      setDireccion(data.direccion?.direccion || '');
      setCiudad(data.direccion?.ciudad || '');
      setComuna(data.direccion?.comuna || '');
      setRegion(data.direccion?.region || '');
      setPrimerNombre(data.primerNombre || '');
      setSegundoNombre(data.segundoNombre || '');
      setPrimerApellido(data.primerApellido || '');
      setSegundoApellido(data.segundoApellido || '');
      setRut(data.rut || '');
      setRecibeFactura(data.recibeFactura);
      setNombrePagante(data.nombrePagante || '');
      setExcluirCargoFijo(data.excluirCargoFijo);
      setEsClienteActual(data.esClienteActual);
    }
  }, [data]);

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async (contactData: { telefono?: string | null; correo?: string | null }) => {
      const res = await adminApiClient.patch(`/admin/clientes/${clienteId}/contacto`, contactData);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Actualizado', description: 'Información de contacto guardada' });
      queryClient.invalidateQueries({ queryKey: ['admin-cliente'] });
      onSuccess?.();
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error?.message || 'Error al actualizar',
      });
    },
  });

  // Update address mutation
  const updateAddressMutation = useMutation({
    mutationFn: async (addressData: { direccion: string; ciudad?: string | null; comuna?: string | null; region?: string | null }) => {
      const res = await adminApiClient.patch(`/admin/clientes/${clienteId}/direccion`, addressData);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Actualizado', description: 'Dirección guardada' });
      queryClient.invalidateQueries({ queryKey: ['admin-cliente'] });
      onSuccess?.();
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error?.message || 'Error al actualizar',
      });
    },
  });

  // Full update mutation (supervisor+)
  const updateFullMutation = useMutation({
    mutationFn: async (fullData: Record<string, unknown>) => {
      const res = await adminApiClient.patch(`/admin/clientes/${clienteId}`, fullData);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Actualizado', description: 'Información del cliente guardada' });
      queryClient.invalidateQueries({ queryKey: ['admin-cliente'] });
      onSuccess?.();
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error?.message || 'Error al actualizar',
      });
    },
  });

  const handleSaveContact = () => {
    updateContactMutation.mutate({
      telefono: telefono || null,
      correo: correo || null,
    });
  };

  const handleSaveAddress = () => {
    if (!direccion.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'La dirección es requerida' });
      return;
    }
    updateAddressMutation.mutate({
      direccion: direccion.trim(),
      ciudad: ciudad || null,
      comuna: comuna || null,
      region: region || null,
    });
  };

  const handleSaveFull = () => {
    updateFullMutation.mutate({
      primerNombre: primerNombre.trim(),
      segundoNombre: segundoNombre.trim() || null,
      primerApellido: primerApellido.trim(),
      segundoApellido: segundoApellido.trim() || null,
      rut: rut.trim() || null,
      recibeFactura,
      nombrePagante: nombrePagante.trim() || null,
      excluirCargoFijo,
      esClienteActual,
    });
  };

  const isSaving =
    updateContactMutation.isPending ||
    updateAddressMutation.isPending ||
    updateFullMutation.isPending;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <div className="text-center py-8 text-red-600">
            Error al cargar datos del cliente
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar Cliente - {data?.numeroCliente}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="contacto" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="contacto">Contacto</TabsTrigger>
            <TabsTrigger value="direccion">Dirección</TabsTrigger>
            {canEditAll && <TabsTrigger value="datos">Datos</TabsTrigger>}
          </TabsList>

          {/* Contact Tab */}
          <TabsContent value="contacto" className="space-y-4 pt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+56 9 1234 5678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Correo</label>
              <Input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="correo@ejemplo.cl"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button
                onClick={handleSaveContact}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateContactMutation.isPending ? 'Guardando...' : 'Guardar Contacto'}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Address Tab */}
          <TabsContent value="direccion" className="space-y-4 pt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dirección *</label>
              <Input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Av. Principal 123"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
                <Input
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value)}
                  placeholder="Santiago"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Comuna</label>
                <Input
                  value={comuna}
                  onChange={(e) => setComuna(e.target.value)}
                  placeholder="Providencia"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Región</label>
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Metropolitana"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button
                onClick={handleSaveAddress}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateAddressMutation.isPending ? 'Guardando...' : 'Guardar Dirección'}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Full Data Tab (supervisor+) */}
          {canEditAll && (
            <TabsContent value="datos" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Primer Nombre *
                  </label>
                  <Input
                    value={primerNombre}
                    onChange={(e) => setPrimerNombre(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Segundo Nombre
                  </label>
                  <Input
                    value={segundoNombre}
                    onChange={(e) => setSegundoNombre(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Primer Apellido *
                  </label>
                  <Input
                    value={primerApellido}
                    onChange={(e) => setPrimerApellido(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Segundo Apellido
                  </label>
                  <Input
                    value={segundoApellido}
                    onChange={(e) => setSegundoApellido(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RUT</label>
                <Input
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  placeholder="12.345.678-9"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre Pagante
                </label>
                <Input
                  value={nombrePagante}
                  onChange={(e) => setNombrePagante(e.target.value)}
                  placeholder="Nombre si es diferente al cliente"
                />
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Recibe Factura</label>
                  <Switch checked={recibeFactura} onCheckedChange={setRecibeFactura} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Excluir Cargo Fijo</label>
                  <Switch checked={excluirCargoFijo} onCheckedChange={setExcluirCargoFijo} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Cliente Activo</label>
                  <Switch checked={esClienteActual} onCheckedChange={setEsClienteActual} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cerrar
                </Button>
                <Button
                  onClick={handleSaveFull}
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {updateFullMutation.isPending ? 'Guardando...' : 'Guardar Datos'}
                </Button>
              </DialogFooter>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}


