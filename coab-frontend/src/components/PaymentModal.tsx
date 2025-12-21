/**
 * PaymentModal Component
 * Embedded payment modal using Mercado Pago Card Payment Brick
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';
import { formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Boleta {
  id: string;
  numeroFolio: string | null;
  periodoDesde: string;
  periodoHasta: string;
  fechaEmision: string;
  fechaVencimiento: string;
  montoTotal: number; // Monthly charge for this period
  montoAdeudado: number; // What's actually still owed
  parcialmentePagada: boolean; // Is this boleta partially paid?
}

interface PaymentConfig {
  publicKey: string;
  enabled: boolean;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  saldo: number;
  onPaymentSuccess?: () => void;
}

type PaymentOption = 'total' | 'boletas' | 'custom';

export default function PaymentModal({
  isOpen,
  onClose,
  saldo,
  onPaymentSuccess,
}: PaymentModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<'select' | 'payment' | 'processing' | 'result'>('select');
  const [paymentOption, setPaymentOption] = useState<PaymentOption>('total');
  const [customAmount, setCustomAmount] = useState('');
  const [selectedBoletas, setSelectedBoletas] = useState<Set<string>>(new Set());
  const [mpInitialized, setMpInitialized] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    success: boolean;
    message: string;
    transaccionId?: string;
  } | null>(null);

  // Fetch payment configuration
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['payment-config'],
    queryFn: async () => {
      const res = await apiClient.get('/pagos/config');
      return res.data as PaymentConfig;
    },
    enabled: isOpen,
    retry: false,
  });

  // Fetch pending boletas
  const { data: boletasData, isLoading: boletasLoading } = useQuery({
    queryKey: ['pending-boletas'],
    queryFn: async () => {
      const res = await apiClient.get('/pagos/boletas-pendientes');
      return res.data as { boletas: Boleta[]; total: number };
    },
    enabled: isOpen,
  });

  // Initialize Mercado Pago when config is available
  useEffect(() => {
    if (configData?.publicKey && !mpInitialized) {
      initMercadoPago(configData.publicKey, { locale: 'es-CL' });
      setMpInitialized(true);
    }
  }, [configData?.publicKey, mpInitialized]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('select');
      setPaymentOption('total');
      setCustomAmount('');
      setSelectedBoletas(new Set());
      setPaymentResult(null);
    }
  }, [isOpen]);

  // Payment mutation
  const paymentMutation = useMutation({
    mutationFn: async (cardPaymentData: any) => {
      const amount = calculateAmount();
      const boletaIds = paymentOption === 'boletas' ? Array.from(selectedBoletas) : undefined;

      const res = await apiClient.post('/pagos/mercadopago', {
        monto: amount,
        descripcion: 'Pago de servicios COAB',
        boletaIds,
        cardPaymentData,
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        setPaymentResult({
          success: true,
          message: data.mensaje || 'Pago aprobado exitosamente',
          transaccionId: data.transaccionId,
        });
        setStep('result');
        onPaymentSuccess?.();
      } else {
        setPaymentResult({
          success: false,
          message: data.mensaje || 'El pago no fue aprobado',
          transaccionId: data.transaccionId,
        });
        setStep('result');
      }
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Error al procesar el pago';
      setPaymentResult({
        success: false,
        message,
      });
      setStep('result');
    },
  });

  // Calculate the payment amount based on selection
  const calculateAmount = (): number => {
    switch (paymentOption) {
      case 'total':
        return boletasData?.total || saldo;
      case 'boletas':
        return (
          boletasData?.boletas
            .filter((b) => selectedBoletas.has(b.id))
            .reduce((sum, b) => sum + b.montoAdeudado, 0) || 0
        );
      case 'custom':
        return parseFloat(customAmount.replace(/\D/g, '')) || 0;
      default:
        return 0;
    }
  };

  // Handle card payment submission from Mercado Pago Brick
  const handlePaymentSubmit = async (cardPaymentData: any) => {
    setStep('processing');
    await paymentMutation.mutateAsync(cardPaymentData);
  };

  // Continue to payment step
  const handleContinue = () => {
    const amount = calculateAmount();
    if (amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Monto inválido',
        description: 'Por favor selecciona un monto válido para pagar',
      });
      return;
    }
    setStep('payment');
  };

  // Format currency input
  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setCustomAmount(value);
  };

  const amount = calculateAmount();
  const isLoading = configLoading || boletasLoading;

  // If MP not available
  if (isOpen && !configLoading && !configData?.enabled) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Pagos en línea no disponibles
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600">
              Los pagos en línea no están disponibles en este momento.
              Por favor intente más tarde o contacte a COAB para otras formas de pago.
            </p>
          </div>
          <Button onClick={onClose} variant="outline" className="w-full">
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            {step === 'select' && 'Pagar Cuenta'}
            {step === 'payment' && 'Información de Pago'}
            {step === 'processing' && 'Procesando Pago...'}
            {step === 'result' && (paymentResult?.success ? 'Pago Exitoso' : 'Pago No Aprobado')}
          </DialogTitle>
          {step === 'select' && (
            <DialogDescription>
              Selecciona cuánto deseas pagar
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
            <p className="mt-2 text-slate-500">Cargando...</p>
          </div>
        )}

        {/* Step 1: Select Amount */}
        {!isLoading && step === 'select' && (
          <div className="space-y-6 py-4">
            <RadioGroup
              value={paymentOption}
              onValueChange={(v) => setPaymentOption(v as PaymentOption)}
              className="space-y-3"
            >
              {/* Pay Total */}
              <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value="total" id="total" />
                <Label htmlFor="total" className="flex-1 cursor-pointer">
                  <div className="font-medium">Pagar saldo total</div>
                  <div className="text-sm text-slate-500">
                    {formatearPesos(boletasData?.total || saldo)}
                  </div>
                </Label>
              </div>

              {/* Pay Specific Boletas */}
              {boletasData && boletasData.boletas.length > 1 && (
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center space-x-3 mb-3">
                    <RadioGroupItem value="boletas" id="boletas" />
                    <Label htmlFor="boletas" className="cursor-pointer">
                      <div className="font-medium">Seleccionar boletas</div>
                    </Label>
                  </div>

                  {paymentOption === 'boletas' && (
                    <div className="space-y-2 ml-7 mt-3">
                      <p className="text-xs text-slate-500 mb-2">
                        Los pagos se aplican en orden (más antiguo primero)
                      </p>
                      {boletasData.boletas
                        .filter((b) => b.montoAdeudado > 0) // Only show boletas with amount owed
                        .map((boleta, index, filteredBoletas) => {
                          // FIFO enforcement: can only select if all previous boletas are selected
                          const previousBoletas = filteredBoletas.slice(0, index);
                          const allPreviousSelected = previousBoletas.every((b) =>
                            selectedBoletas.has(b.id)
                          );
                          const isDisabled = !allPreviousSelected && !selectedBoletas.has(boleta.id);

                          return (
                            <div
                              key={boleta.id}
                              className={`flex items-center space-x-3 p-2 rounded ${
                                isDisabled ? 'opacity-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <Checkbox
                                id={`boleta-${boleta.id}`}
                                checked={selectedBoletas.has(boleta.id)}
                                disabled={isDisabled}
                                onCheckedChange={() => {
                                  if (isDisabled) return;
                                  // When unchecking, also uncheck all newer boletas
                                  if (selectedBoletas.has(boleta.id)) {
                                    const newerBoletas = filteredBoletas.slice(index);
                                    const newSelected = new Set(selectedBoletas);
                                    newerBoletas.forEach((b) => newSelected.delete(b.id));
                                    setSelectedBoletas(newSelected);
                                  } else {
                                    // When checking, also check all older boletas
                                    const olderBoletas = filteredBoletas.slice(0, index + 1);
                                    const newSelected = new Set(selectedBoletas);
                                    olderBoletas.forEach((b) => newSelected.add(b.id));
                                    setSelectedBoletas(newSelected);
                                  }
                                }}
                              />
                              <Label
                                htmlFor={`boleta-${boleta.id}`}
                                className={`flex-1 text-sm ${isDisabled ? '' : 'cursor-pointer'}`}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="flex items-center gap-2">
                                    {format(new Date(boleta.fechaEmision), 'MMMM yyyy', {
                                      locale: es,
                                    })}
                                    {boleta.parcialmentePagada && (
                                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                        parcial
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium">
                                    {boleta.parcialmentePagada ? (
                                      <span className="flex flex-col items-end">
                                        <span>{formatearPesos(boleta.montoAdeudado)}</span>
                                        <span className="text-xs text-slate-400 line-through">
                                          {formatearPesos(boleta.montoTotal)}
                                        </span>
                                      </span>
                                    ) : (
                                      formatearPesos(boleta.montoAdeudado)
                                    )}
                                  </span>
                                </div>
                              </Label>
                            </div>
                          );
                        })}
                      {selectedBoletas.size > 0 && (
                        <div className="pt-2 border-t mt-2 text-sm text-right font-medium">
                          Total seleccionado:{' '}
                          {formatearPesos(
                            boletasData.boletas
                              .filter((b) => selectedBoletas.has(b.id))
                              .reduce((sum, b) => sum + b.montoAdeudado, 0)
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Pay Custom Amount */}
              <div className="p-4 border rounded-lg">
                <div className="flex items-center space-x-3 mb-3">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom" className="cursor-pointer">
                    <div className="font-medium">Monto personalizado</div>
                  </Label>
                </div>

                {paymentOption === 'custom' && (
                  <div className="ml-7 mt-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        $
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={customAmount ? Number(customAmount).toLocaleString('es-CL') : ''}
                        onChange={handleCustomAmountChange}
                        className="pl-8 text-lg"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Máximo: {formatearPesos(Math.ceil((boletasData?.total || saldo) * 1.5))}
                    </p>
                  </div>
                )}
              </div>
            </RadioGroup>

            {/* Summary */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-blue-900 font-medium">Total a pagar:</span>
                <span className="text-2xl font-bold text-blue-600">
                  {formatearPesos(amount)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleContinue}
                disabled={amount <= 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Continuar al Pago
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Card Payment Brick */}
        {!isLoading && step === 'payment' && mpInitialized && (
          <div className="py-4">
            <div className="bg-slate-50 p-3 rounded-lg mb-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Monto a pagar:</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatearPesos(amount)}
                </span>
              </div>
            </div>

            <CardPayment
              initialization={{ amount }}
              onSubmit={handlePaymentSubmit}
              onReady={() => {
                console.log('CardPayment Brick ready');
              }}
              onError={(error) => {
                console.error('CardPayment error:', error);
                toast({
                  variant: 'destructive',
                  title: 'Error',
                  description: 'Error al cargar el formulario de pago',
                });
              }}
              customization={{
                paymentMethods: {
                  maxInstallments: 6,
                },
                visual: {
                  style: {
                    theme: 'default',
                  },
                },
              }}
            />

            <Button
              variant="ghost"
              onClick={() => setStep('select')}
              className="w-full mt-4"
            >
              ← Volver
            </Button>
          </div>
        )}

        {/* Step 3: Processing */}
        {step === 'processing' && (
          <div className="py-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
            <p className="mt-4 text-lg font-medium text-slate-700">
              Procesando tu pago...
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Por favor no cierres esta ventana
            </p>
          </div>
        )}

        {/* Step 4: Result */}
        {step === 'result' && paymentResult && (
          <div className="py-8 text-center">
            {paymentResult.success ? (
              <>
                <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-slate-900">
                  ¡Pago Exitoso!
                </h3>
                <p className="mt-2 text-slate-600">{paymentResult.message}</p>
                {paymentResult.transaccionId && (
                  <p className="mt-2 text-sm text-slate-500">
                    N° Transacción: {paymentResult.transaccionId}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="h-10 w-10 text-red-600" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-slate-900">
                  Pago No Aprobado
                </h3>
                <p className="mt-2 text-slate-600">{paymentResult.message}</p>
              </>
            )}

            <div className="mt-6 flex gap-3">
              {!paymentResult.success && (
                <Button
                  variant="outline"
                  onClick={() => setStep('payment')}
                  className="flex-1"
                >
                  Reintentar
                </Button>
              )}
              <Button
                onClick={() => {
                  onClose();
                  if (paymentResult.success) {
                    navigate('/dashboard');
                  }
                }}
                className={`flex-1 ${paymentResult.success ? 'bg-green-600 hover:bg-green-700' : ''}`}
              >
                {paymentResult.success ? 'Ver Mi Cuenta' : 'Cerrar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

