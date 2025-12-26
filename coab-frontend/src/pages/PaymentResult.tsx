/**
 * PaymentResult Page
 * Shows payment confirmation or error details
 * Used when returning from external payment flow (if needed)
 */

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/api';
import { formatearPesos, formatearFecha, FORMATOS_FECHA } from '@coab/utils';
import { CheckCircle2, XCircle, Clock, Loader2, ArrowLeft } from 'lucide-react';

interface TransactionDetail {
  id: string;
  proveedor: string;
  referenciaExterna: string;
  monto: number;
  estado: string;
  estadoDetalle: string | null;
  metodoPago: string | null;
  cuotas: number;
  creadoEn: string;
  actualizadoEn: string;
}

export default function PaymentResultPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const transaccionId = searchParams.get('id');

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  // Fetch transaction details
  const { data: transaction, isLoading, error } = useQuery({
    queryKey: ['transaction', transaccionId],
    queryFn: async () => {
      if (!transaccionId) return null;
      const res = await apiClient.get(`/pagos/${transaccionId}`);
      return res.data as TransactionDetail;
    },
    enabled: !!transaccionId,
  });

  // No transaction ID in URL
  if (!transaccionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="h-10 w-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Transacción no encontrada
            </h2>
            <p className="text-slate-600">
              No se proporcionó un ID de transacción válido.
            </p>
            <Button onClick={() => navigate('/dashboard')} className="w-full h-12">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
            <p className="mt-4 text-slate-600">Cargando detalles del pago...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error or not found
  if (error || !transaction) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="h-10 w-10 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Error</h2>
            <p className="text-slate-600">
              No se pudo cargar la información del pago.
            </p>
            <Button onClick={() => navigate('/dashboard')} className="w-full h-12">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine status display
  const getStatusConfig = (estado: string) => {
    switch (estado) {
      case 'approved':
        return {
          icon: <CheckCircle2 className="h-10 w-10 text-green-600" />,
          bgColor: 'bg-green-100',
          title: '¡Pago Exitoso!',
          subtitle: 'Tu pago ha sido procesado correctamente',
        };
      case 'pending':
      case 'in_process':
        return {
          icon: <Clock className="h-10 w-10 text-amber-600" />,
          bgColor: 'bg-amber-100',
          title: 'Pago en Proceso',
          subtitle: 'Tu pago está siendo procesado',
        };
      case 'rejected':
        return {
          icon: <XCircle className="h-10 w-10 text-red-600" />,
          bgColor: 'bg-red-100',
          title: 'Pago Rechazado',
          subtitle: transaction.estadoDetalle || 'El pago no fue aprobado',
        };
      default:
        return {
          icon: <Clock className="h-10 w-10 text-slate-600" />,
          bgColor: 'bg-slate-100',
          title: 'Estado del Pago',
          subtitle: `Estado: ${estado}`,
        };
    }
  };

  const statusConfig = getStatusConfig(transaction.estado);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 space-y-6">
          {/* Status Icon */}
          <div className="text-center">
            <div
              className={`h-16 w-16 ${statusConfig.bgColor} rounded-full flex items-center justify-center mx-auto`}
            >
              {statusConfig.icon}
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">
              {statusConfig.title}
            </h2>
            <p className="mt-1 text-slate-600">{statusConfig.subtitle}</p>
          </div>

          {/* Transaction Details */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Monto</span>
              <span className="font-bold text-lg">{formatearPesos(transaction.monto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">N° Transacción</span>
              <span className="font-medium">{transaction.id}</span>
            </div>
            {transaction.referenciaExterna !== 'pending' && (
              <div className="flex justify-between">
                <span className="text-slate-500">Ref. Mercado Pago</span>
                <span className="font-medium text-sm">{transaction.referenciaExterna}</span>
              </div>
            )}
            {transaction.metodoPago && (
              <div className="flex justify-between">
                <span className="text-slate-500">Método de Pago</span>
                <span className="font-medium capitalize">{transaction.metodoPago}</span>
              </div>
            )}
            {transaction.cuotas > 1 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Cuotas</span>
                <span className="font-medium">{transaction.cuotas}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Fecha</span>
              <span className="font-medium">
                {formatearFecha(transaction.creadoEn, FORMATOS_FECHA.CON_HORA)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={() => navigate('/dashboard')}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700"
            >
              Volver a Mi Cuenta
            </Button>
            {transaction.estado === 'rejected' && (
              <Button
                onClick={() => navigate('/dashboard')}
                variant="outline"
                className="w-full h-12"
              >
                Intentar Otro Pago
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

