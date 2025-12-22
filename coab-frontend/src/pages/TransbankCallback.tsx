/**
 * Transbank Callback Page
 * Handles the redirect after card inscription at Transbank
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/api';
import { Loader2, CheckCircle2, XCircle, CreditCard } from 'lucide-react';

type CallbackStatus = 'processing' | 'success' | 'error' | 'cancelled';

interface ConfirmationResult {
  success: boolean;
  tarjetaId?: string;
  ultimosDigitos?: string;
  tipoTarjeta?: string;
  error?: string;
}

export default function TransbankCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [result, setResult] = useState<ConfirmationResult | null>(null);

  // Confirmation mutation
  const confirmMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await apiClient.post('/pagos/transbank/confirmar', { token });
      return res.data as ConfirmationResult;
    },
    onSuccess: (data) => {
      if (data.success) {
        setStatus('success');
        setResult(data);
        // Clear stored token
        sessionStorage.removeItem('tbk_inscription_token');
      } else {
        setStatus('error');
        setResult(data);
      }
    },
    onError: (error: any) => {
      setStatus('error');
      setResult({
        success: false,
        error: error.response?.data?.error?.message || 'Error al confirmar inscripción',
      });
    },
  });

  useEffect(() => {
    // Get token from URL params or session storage
    const tbkToken = searchParams.get('TBK_TOKEN');
    const tbkOrdenCompra = searchParams.get('TBK_ORDEN_COMPRA');
    // Note: TBK_ID_SESION is also returned but not used

    // Check if user cancelled
    if (tbkOrdenCompra && !tbkToken) {
      // Transbank returns TBK_ORDEN_COMPRA without TBK_TOKEN when cancelled
      setStatus('cancelled');
      sessionStorage.removeItem('tbk_inscription_token');
      return;
    }

    // Try to get token from URL or session storage
    const token = tbkToken || sessionStorage.getItem('tbk_inscription_token');

    if (!token) {
      setStatus('error');
      setResult({
        success: false,
        error: 'Token de inscripción no encontrado',
      });
      return;
    }

    // Confirm the inscription
    confirmMutation.mutate(token);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <CreditCard className="h-6 w-6 text-blue-600" />
            Inscripción de Tarjeta
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Processing */}
          {status === 'processing' && (
            <div className="py-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
              <p className="mt-4 text-lg font-medium text-slate-700">
                Procesando inscripción...
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Por favor espere mientras confirmamos su tarjeta
              </p>
            </div>
          )}

          {/* Success */}
          {status === 'success' && result && (
            <div className="py-8 text-center">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-900">
                ¡Tarjeta Registrada!
              </h3>
              <p className="mt-2 text-slate-600">
                Tu tarjeta ha sido registrada exitosamente
              </p>
              {result.ultimosDigitos && (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg inline-block">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-8 w-8 text-slate-400" />
                    <div className="text-left">
                      <p className="font-medium">
                        {result.tipoTarjeta?.toUpperCase() || 'Tarjeta'}
                      </p>
                      <p className="text-sm text-slate-500">
                        **** **** **** {result.ultimosDigitos}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <p className="mt-4 text-sm text-slate-500">
                Ahora puedes usar esta tarjeta para pagar con un solo click
              </p>
              <Button
                onClick={() => navigate('/dashboard')}
                className="mt-6 w-full bg-green-600 hover:bg-green-700"
              >
                Ir a Mi Cuenta
              </Button>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="py-8 text-center">
              <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-900">
                Error en la Inscripción
              </h3>
              <p className="mt-2 text-slate-600">
                {result?.error || 'No se pudo registrar la tarjeta'}
              </p>
              <div className="mt-6 space-y-3">
                <Button
                  onClick={() => navigate('/dashboard')}
                  variant="outline"
                  className="w-full"
                >
                  Volver a Mi Cuenta
                </Button>
              </div>
            </div>
          )}

          {/* Cancelled */}
          {status === 'cancelled' && (
            <div className="py-8 text-center">
              <div className="h-16 w-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="h-10 w-10 text-amber-600" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-900">
                Inscripción Cancelada
              </h3>
              <p className="mt-2 text-slate-600">
                La inscripción de la tarjeta fue cancelada
              </p>
              <Button
                onClick={() => navigate('/dashboard')}
                variant="outline"
                className="mt-6 w-full"
              >
                Volver a Mi Cuenta
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

