import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { formatearPesos, formatearRUT } from '@coab/utils';
import { Printer } from 'lucide-react';

const paymentFormSchema = z.object({
  monto: z
    .number({ invalid_type_error: 'Ingrese un monto válido' })
    .positive('Monto debe ser mayor a 0')
    .int('Monto debe ser un número entero'),
  tipoPago: z.enum(['efectivo', 'transferencia', 'cheque']),
  numeroTransaccion: z.string().max(100).optional(),
  observaciones: z.string().max(500).optional(),
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

interface PaymentResult {
  pago: {
    id: string;
    monto: number;
    fechaPago: string;
    tipoPago: string;
    operador: string;
    referenciaExterna?: string;
    observaciones?: string;
  };
  cliente: {
    id: string;
    rut: string;
    nombre: string;
  };
  boletasAfectadas: Array<{
    boletaId: string;
    montoAplicado: number;
    tipo: 'completo' | 'parcial';
  }>;
  saldoRestante: number;
  saldoNuevo: number;
}

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNombre: string;
  clienteRut: string;
  clienteDireccion?: string;
  saldoActual: number;
  onSuccess?: (result: PaymentResult) => void;
}

export default function PaymentModal({
  open,
  onClose,
  clienteId,
  clienteNombre,
  clienteRut,
  clienteDireccion,
  saldoActual,
  onSuccess,
}: PaymentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showReceipt, setShowReceipt] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(
    null
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      tipoPago: 'efectivo',
    },
  });

  const tipoPago = watch('tipoPago');
  const monto = watch('monto');

  const paymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const response = await adminApiClient.post('/admin/pagos', {
        clienteId,
        ...data,
      });
      return response.data as PaymentResult;
    },
    onSuccess: (data) => {
      setPaymentResult(data);
      setShowReceipt(true);

      toast({
        title: 'Pago registrado exitosamente',
        description: `${data.boletasAfectadas.length} boleta(s) afectada(s). Nuevo saldo: ${formatearPesos(data.saldoNuevo)}`,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin-customer', clienteId] });
      queryClient.invalidateQueries({
        queryKey: ['admin-customer-payments', clienteId],
      });
      queryClient.invalidateQueries({
        queryKey: ['admin-customer-boletas', clienteId],
      });

      if (onSuccess) {
        onSuccess(data);
      }
    },
    onError: (error: any) => {
      const errorMessage =
        error.response?.data?.error?.message || 'Error al registrar pago';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    },
  });

  const onSubmit = (data: PaymentFormData) => {
    paymentMutation.mutate(data);
  };

  const handleClose = () => {
    reset();
    setShowReceipt(false);
    setPaymentResult(null);
    onClose();
  };

  const handlePrint = () => {
    window.print();
  };

  // Receipt View
  if (showReceipt && paymentResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl print:max-w-none print:shadow-none print:border-none">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .print-receipt, .print-receipt * { visibility: visible; }
              .print-receipt { position: absolute; left: 0; top: 0; width: 100%; }
              .no-print { display: none !important; }
            }
          `}</style>

          <div className="print-receipt">
            {/* Receipt Header */}
            <div className="text-center mb-6 pb-4 border-b-2 border-slate-300">
              <h1 className="text-2xl font-bold text-slate-800">
                COAB - Compañía de Agua
              </h1>
              <p className="text-slate-600">Comprobante de Pago</p>
            </div>

            {/* Payment Details */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-slate-500">Recibo N°</p>
                <p className="text-lg font-bold text-slate-800">
                  #{paymentResult.pago.id}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Fecha</p>
                <p className="text-lg text-slate-800">
                  {new Date(paymentResult.pago.fechaPago).toLocaleDateString(
                    'es-CL',
                    {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }
                  )}
                </p>
              </div>
            </div>

            {/* Customer Info */}
            <div className="mb-6 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500 mb-1">Cliente</p>
              <p className="font-medium text-slate-800">
                {paymentResult.cliente.nombre}
              </p>
              <p className="text-sm text-slate-600">
                RUT: {formatearRUT(paymentResult.cliente.rut)}
              </p>
              {clienteDireccion && (
                <p className="text-sm text-slate-600">{clienteDireccion}</p>
              )}
            </div>

            {/* Amount */}
            <div className="mb-6 p-6 bg-emerald-600 text-white rounded-lg text-center">
              <p className="text-sm opacity-90 mb-2">Monto Pagado</p>
              <p className="text-4xl font-bold">
                {formatearPesos(paymentResult.pago.monto)}
              </p>
            </div>

            {/* Payment Method */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-slate-500">Método de Pago</p>
                <p className="font-medium capitalize text-slate-800">
                  {paymentResult.pago.tipoPago}
                </p>
              </div>
              {paymentResult.pago.referenciaExterna && (
                <div>
                  <p className="text-sm text-slate-500">N° Transacción</p>
                  <p className="font-medium text-slate-800">
                    {paymentResult.pago.referenciaExterna}
                  </p>
                </div>
              )}
            </div>

            {/* Boletas Applied */}
            {paymentResult.boletasAfectadas.length > 0 && (
              <div className="mb-6">
                <p className="text-sm text-slate-500 mb-2">Boletas Aplicadas</p>
                <div className="space-y-1 bg-slate-50 p-3 rounded">
                  {paymentResult.boletasAfectadas.map((boleta, index) => (
                    <div
                      key={index}
                      className="flex justify-between text-sm text-slate-700"
                    >
                      <span>Boleta #{boleta.boletaId}</span>
                      <span>
                        {formatearPesos(boleta.montoAplicado)}
                        {boleta.tipo === 'parcial' && (
                          <span className="text-amber-600 ml-1">(parcial)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overpayment Warning */}
            {paymentResult.saldoRestante > 0 && (
              <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                <p className="font-medium">Saldo a Favor</p>
                <p className="text-sm">
                  {formatearPesos(paymentResult.saldoRestante)} quedará como
                  crédito
                </p>
              </div>
            )}

            {/* New Balance */}
            <div className="mb-6 p-4 bg-slate-100 rounded-lg text-center">
              <p className="text-sm text-slate-500">Nuevo Saldo Pendiente</p>
              <p className="text-2xl font-bold text-slate-800">
                {formatearPesos(paymentResult.saldoNuevo)}
              </p>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-200">
              <p>Operador: {paymentResult.pago.operador}</p>
              <p className="mt-2">
                Este documento es un comprobante de pago válido
              </p>
              <p>Conserve para sus registros</p>
            </div>
          </div>

          {/* Action Buttons (hidden in print) */}
          <div className="no-print flex gap-3 mt-6">
            <Button
              onClick={handlePrint}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir Comprobante
            </Button>
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Payment Form View
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-800">Registrar Pago</DialogTitle>
        </DialogHeader>

        {/* Customer Info */}
        <div className="p-3 bg-slate-50 rounded-lg mb-4">
          <p className="font-medium text-slate-800">{clienteNombre}</p>
          <p className="text-sm text-slate-600">
            RUT: {formatearRUT(clienteRut)}
          </p>
          <p className="text-sm text-slate-600">
            Saldo actual:{' '}
            <span className="font-medium">{formatearPesos(saldoActual)}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="monto" className="text-slate-700">
              Monto (CLP)
            </Label>
            <Input
              id="monto"
              type="number"
              step="1"
              min="1"
              placeholder="25000"
              {...register('monto', { valueAsNumber: true })}
              className={`h-11 text-lg ${errors.monto ? 'border-red-500' : ''}`}
            />
            {errors.monto && (
              <p className="text-sm text-red-500 mt-1">{errors.monto.message}</p>
            )}
            {monto && monto > saldoActual && saldoActual > 0 && (
              <p className="text-sm text-amber-600 mt-1">
                ⚠️ Monto excede el saldo. El excedente quedará a favor.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="tipoPago" className="text-slate-700">
              Tipo de Pago
            </Label>
            <Select
              value={tipoPago}
              onValueChange={(value) =>
                setValue('tipoPago', value as 'efectivo' | 'transferencia' | 'cheque')
              }
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoPago === 'transferencia' && (
            <div>
              <Label htmlFor="numeroTransaccion" className="text-slate-700">
                N° de Transacción
              </Label>
              <Input
                id="numeroTransaccion"
                placeholder="1234567890"
                {...register('numeroTransaccion')}
                className="h-11"
              />
            </div>
          )}

          <div>
            <Label htmlFor="observaciones" className="text-slate-700">
              Observaciones (opcional)
            </Label>
            <Textarea
              id="observaciones"
              placeholder="Notas adicionales..."
              rows={3}
              {...register('observaciones')}
              className={errors.observaciones ? 'border-red-500' : ''}
            />
            {errors.observaciones && (
              <p className="text-sm text-red-500 mt-1">
                {errors.observaciones.message}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 h-11"
              disabled={paymentMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700"
              disabled={paymentMutation.isPending}
            >
              {paymentMutation.isPending ? 'Procesando...' : 'Registrar Pago'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

