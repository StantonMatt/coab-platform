/**
 * PaymentModal Component
 * Multi-provider payment modal supporting Mercado Pago and Transbank OneClick
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { formatearPesos, formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import {
  Loader2,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react';

interface Boleta {
  id: string;
  numeroFolio: string | null;
  periodoDesde: string;
  periodoHasta: string;
  fechaEmision: string;
  fechaVencimiento: string;
  montoTotal: number;
  montoAdeudado: number;
  parcialmentePagada: boolean;
}

interface SavedCard {
  id: string;
  ultimosDigitos: string | null;
  tipoTarjeta: string | null;
  creadoEn: string;
}

interface PaymentConfig {
  mercadopago: {
    enabled: boolean;
    publicKey: string | null;
  };
  transbank: {
    enabled: boolean;
    isProduction: boolean;
    hasCards: boolean;
    tarjetas: SavedCard[];
  };
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  saldo: number;
  onPaymentSuccess?: () => void;
}

type PaymentProvider = 'mercadopago' | 'transbank';
type AmountOption = 'total' | 'boletas' | 'custom';
type Step = 'provider' | 'amount' | 'payment' | 'processing' | 'result';

export default function PaymentModal({
  isOpen,
  onClose,
  saldo,
  onPaymentSuccess,
}: PaymentModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [step, setStep] = useState<Step>('provider');
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('mercadopago');
  const [amountOption, setAmountOption] = useState<AmountOption>('total');
  const [customAmount, setCustomAmount] = useState('');
  const [selectedBoletas, setSelectedBoletas] = useState<Set<string>>(new Set());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
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
    if (configData?.mercadopago?.publicKey && !mpInitialized) {
      initMercadoPago(configData.mercadopago.publicKey, { locale: 'es-CL' });
      setMpInitialized(true);
    }
  }, [configData?.mercadopago?.publicKey, mpInitialized]);

  // Auto-select first card if available
  useEffect(() => {
    if (configData?.transbank?.tarjetas?.length && !selectedCardId) {
      setSelectedCardId(configData.transbank.tarjetas[0].id);
    }
  }, [configData?.transbank?.tarjetas, selectedCardId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('provider');
      setPaymentProvider('mercadopago');
      setAmountOption('total');
      setCustomAmount('');
      setSelectedBoletas(new Set());
      setPaymentResult(null);
    }
  }, [isOpen]);

  // Mercado Pago payment mutation
  const mpPaymentMutation = useMutation({
    mutationFn: async (cardPaymentData: any) => {
      const amount = calculateAmount();
      const boletaIds = amountOption === 'boletas' ? Array.from(selectedBoletas) : undefined;

      const res = await apiClient.post('/pagos/mercadopago', {
        monto: amount,
        descripcion: 'Pago de servicios COAB',
        boletaIds,
        cardPaymentData,
      });
      return res.data;
    },
    onSuccess: handlePaymentSuccess,
    onError: handlePaymentError,
  });

  // Transbank payment mutation
  const tbkPaymentMutation = useMutation({
    mutationFn: async () => {
      const amount = calculateAmount();
      const res = await apiClient.post('/pagos/transbank/autorizar', {
        tarjetaId: selectedCardId,
        monto: amount,
        descripcion: 'Pago de servicios COAB',
      });
      return res.data;
    },
    onSuccess: handlePaymentSuccess,
    onError: handlePaymentError,
  });

  // Transbank card registration mutation
  const tbkInscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/pagos/transbank/inscribir');
      return res.data as { success: boolean; urlWebpay: string; token: string };
    },
    onSuccess: (data) => {
      if (data.success && data.urlWebpay && data.token) {
        // Store token for later confirmation
        sessionStorage.setItem('tbk_inscription_token', data.token);
        
        // Transbank requires POST form submission with TBK_TOKEN
        // Create a hidden form and submit it
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.urlWebpay;
        
        const tokenInput = document.createElement('input');
        tokenInput.type = 'hidden';
        tokenInput.name = 'TBK_TOKEN';
        tokenInput.value = data.token;
        form.appendChild(tokenInput);
        
        document.body.appendChild(form);
        form.submit();
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al registrar tarjeta',
      });
    },
  });

  // Transbank card deletion mutation
  const tbkDeleteCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      const res = await apiClient.delete(`/pagos/transbank/eliminar/${cardId}`);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Tarjeta eliminada', description: 'La tarjeta fue eliminada exitosamente' });
      queryClient.invalidateQueries({ queryKey: ['payment-config'] });
      setSelectedCardId(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al eliminar tarjeta',
      });
    },
  });

  function handlePaymentSuccess(data: any) {
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
  }

  function handlePaymentError(error: any) {
    const message = error.response?.data?.error?.message || 'Error al procesar el pago';
    setPaymentResult({
      success: false,
      message,
    });
    setStep('result');
  }

  // Calculate the payment amount based on selection
  const calculateAmount = (): number => {
    switch (amountOption) {
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

  // Handle Mercado Pago card submission
  const handleMPPaymentSubmit = async (cardPaymentData: any) => {
    setStep('processing');
    await mpPaymentMutation.mutateAsync(cardPaymentData);
  };

  // Handle Transbank OneClick payment
  const handleTransbankPayment = async () => {
    if (!selectedCardId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Selecciona una tarjeta guardada',
      });
      return;
    }
    setStep('processing');
    await tbkPaymentMutation.mutateAsync();
  };

  // Continue to next step
  const handleContinueToAmount = () => {
    setStep('amount');
  };

  const handleContinueToPayment = () => {
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

  // Check if any payment method is available
  const hasAnyProvider =
    configData?.mercadopago?.enabled || configData?.transbank?.enabled;

  // If no providers available
  if (isOpen && !configLoading && !hasAnyProvider) {
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
            {step === 'provider' && 'Método de Pago'}
            {step === 'amount' && 'Seleccionar Monto'}
            {step === 'payment' && 'Información de Pago'}
            {step === 'processing' && 'Procesando Pago...'}
            {step === 'result' && (paymentResult?.success ? 'Pago Exitoso' : 'Pago No Aprobado')}
          </DialogTitle>
          {step === 'provider' && (
            <DialogDescription>Elige cómo deseas pagar</DialogDescription>
          )}
          {step === 'amount' && (
            <DialogDescription>Selecciona cuánto deseas pagar</DialogDescription>
          )}
        </DialogHeader>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
            <p className="mt-2 text-slate-500">Cargando...</p>
          </div>
        )}

        {/* Step 1: Select Payment Provider */}
        {!isLoading && step === 'provider' && (
          <div className="space-y-4 py-4">
            <RadioGroup
              value={paymentProvider}
              onValueChange={(v) => setPaymentProvider(v as PaymentProvider)}
              className="space-y-3"
            >
              {/* Mercado Pago Option */}
              {configData?.mercadopago?.enabled && (
                <div
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    paymentProvider === 'mercadopago'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => setPaymentProvider('mercadopago')}
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value="mercadopago" id="mercadopago" />
                    <Label htmlFor="mercadopago" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Mercado Pago</span>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Recomendado
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        Paga con tarjeta de crédito o débito
                      </p>
                    </Label>
                  </div>
                </div>
              )}

              {/* Transbank OneClick Option */}
              {configData?.transbank?.enabled && (
                <div
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    paymentProvider === 'transbank'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => setPaymentProvider('transbank')}
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value="transbank" id="transbank" />
                    <Label htmlFor="transbank" className="flex-1 cursor-pointer">
                      <div className="font-medium">Transbank OneClick</div>
                      <p className="text-sm text-slate-500 mt-1">
                        {configData.transbank.hasCards
                          ? 'Paga con un click usando tu tarjeta guardada'
                          : 'Registra tu tarjeta para pagos rápidos'}
                      </p>
                    </Label>
                  </div>

                  {/* Saved Cards */}
                  {paymentProvider === 'transbank' && configData.transbank.tarjetas.length > 0 && (
                    <div className="mt-4 ml-7 space-y-2">
                      <p className="text-xs text-slate-500 font-medium">Tarjetas guardadas:</p>
                      {configData.transbank.tarjetas.map((card) => (
                        <div
                          key={card.id}
                          className={`flex items-center justify-between p-2 rounded border ${
                            selectedCardId === card.id
                              ? 'border-blue-400 bg-blue-50'
                              : 'border-slate-200'
                          }`}
                        >
                          <button
                            type="button"
                            className="flex items-center gap-2 flex-1 text-left"
                            onClick={() => setSelectedCardId(card.id)}
                          >
                            <CreditCard className="h-4 w-4 text-slate-500" />
                            <span className="text-sm">
                              {card.tipoTarjeta?.toUpperCase() || 'Tarjeta'} ****{' '}
                              {card.ultimosDigitos || '****'}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-red-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('¿Eliminar esta tarjeta?')) {
                                tbkDeleteCardMutation.mutate(card.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add New Card Button */}
                  {paymentProvider === 'transbank' && (
                    <div className="mt-3 ml-7">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => tbkInscriptionMutation.mutate()}
                        disabled={tbkInscriptionMutation.isPending}
                      >
                        {tbkInscriptionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        Agregar Nueva Tarjeta
                      </Button>
                      <p className="text-xs text-slate-400 mt-1 text-center">
                        Serás redirigido a Transbank para registrar tu tarjeta
                      </p>
                    </div>
                  )}
                </div>
              )}
            </RadioGroup>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={handleContinueToAmount}
                disabled={
                  paymentProvider === 'transbank' &&
                  !configData?.transbank?.hasCards
                }
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Select Amount */}
        {!isLoading && step === 'amount' && (
          <div className="space-y-6 py-4">
            <RadioGroup
              value={amountOption}
              onValueChange={(v) => setAmountOption(v as AmountOption)}
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

                  {amountOption === 'boletas' && (
                    <div className="space-y-2 ml-7 mt-3">
                      <p className="text-xs text-slate-500 mb-2">
                        Los pagos se aplican en orden (más antiguo primero)
                      </p>
                      {boletasData.boletas
                        .filter((b) => b.montoAdeudado > 0)
                        .map((boleta, index, filteredBoletas) => {
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
                                  if (selectedBoletas.has(boleta.id)) {
                                    const newerBoletas = filteredBoletas.slice(index);
                                    const newSelected = new Set(selectedBoletas);
                                    newerBoletas.forEach((b) => newSelected.delete(b.id));
                                    setSelectedBoletas(newSelected);
                                  } else {
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
                                    {formatearFechaSinHora(boleta.fechaEmision, FORMATOS_FECHA.MES_ANIO)}
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

                {amountOption === 'custom' && (
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
              <Button variant="outline" onClick={() => setStep('provider')} className="flex-1">
                ← Volver
              </Button>
              <Button
                onClick={handleContinueToPayment}
                disabled={amount <= 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Payment */}
        {!isLoading && step === 'payment' && (
          <div className="py-4">
            <div className="bg-slate-50 p-3 rounded-lg mb-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Monto a pagar:</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatearPesos(amount)}
                </span>
              </div>
            </div>

            {/* Mercado Pago Card Payment */}
            {paymentProvider === 'mercadopago' && mpInitialized && (
              <>
                <CardPayment
                  initialization={{ amount }}
                  onSubmit={handleMPPaymentSubmit}
                  onReady={() => console.log('CardPayment Brick ready')}
                  onError={(error) => {
                    console.error('CardPayment error:', error);
                    toast({
                      variant: 'destructive',
                      title: 'Error',
                      description: 'Error al cargar el formulario de pago',
                    });
                  }}
                  customization={{
                    paymentMethods: { maxInstallments: 6 },
                    visual: { style: { theme: 'default' } },
                  }}
                />
              </>
            )}

            {/* Transbank OneClick Payment */}
            {paymentProvider === 'transbank' && (
              <div className="space-y-4">
                {configData?.transbank?.tarjetas && selectedCardId && (
                  <div className="p-4 border rounded-lg bg-slate-50">
                    <p className="text-sm text-slate-600 mb-2">Tarjeta seleccionada:</p>
                    {(() => {
                      const card = configData.transbank.tarjetas.find(
                        (c) => c.id === selectedCardId
                      );
                      return card ? (
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-8 w-8 text-slate-400" />
                          <div>
                            <p className="font-medium">
                              {card.tipoTarjeta?.toUpperCase() || 'Tarjeta'} ****{' '}
                              {card.ultimosDigitos || '****'}
                            </p>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                <Button
                  onClick={handleTransbankPayment}
                  className="w-full bg-blue-600 hover:bg-blue-700 h-12"
                  disabled={tbkPaymentMutation.isPending}
                >
                  {tbkPaymentMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-5 w-5 mr-2" />
                  )}
                  Pagar {formatearPesos(amount)}
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              onClick={() => setStep('amount')}
              className="w-full mt-4"
            >
              ← Volver
            </Button>
          </div>
        )}

        {/* Step 4: Processing */}
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

        {/* Step 5: Result */}
        {step === 'result' && paymentResult && (
          <div className="py-8 text-center">
            {paymentResult.success ? (
              <>
                <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-slate-900">¡Pago Exitoso!</h3>
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
                <h3 className="mt-4 text-xl font-bold text-slate-900">Pago No Aprobado</h3>
                <p className="mt-2 text-slate-600">{paymentResult.message}</p>
              </>
            )}

            <div className="mt-6 flex gap-3">
              {!paymentResult.success && (
                <Button variant="outline" onClick={() => setStep('payment')} className="flex-1">
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
