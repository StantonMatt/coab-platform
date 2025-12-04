import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import apiClient from '@/lib/api';

interface BoletaDetail {
  id: string;
  numeroFolio: string | null;
  periodoDesde: string;
  periodoHasta: string;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  // Amounts
  montoNeto: number;
  montoIva: number;
  montoSubsidio: number;
  montoDescuento: number;
  montoInteres: number;
  montoTotal: number;
  montoSaldoAnterior: number;
  // Breakdown
  consumoM3: number | null;
  costoAgua: number | null;
  costoAlcantarillado: number | null;
  costoTratamiento: number | null;
  costoCargoFijo: number | null;
  // Other
  diasVencido: number | null;
  observaciones: string | null;
}

export default function BoletaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  const {
    data: boleta,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['boleta', id],
    queryFn: async () => {
      const res = await apiClient.get(`/clientes/me/boletas/${id}`);
      return res.data as BoletaDetail;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando boleta...</p>
        </div>
      </div>
    );
  }

  if (error || !boleta) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 bg-gray-50">
        <div className="text-center">
          <p className="text-6xl mb-4">📄</p>
          <p className="text-xl text-gray-700 font-medium">Boleta no encontrada</p>
          <p className="text-gray-500 mt-2">
            La boleta que buscas no existe o no tienes acceso a ella.
          </p>
        </div>
        <Button onClick={() => navigate('/dashboard')} className="mt-4">
          Volver al Dashboard
        </Button>
      </div>
    );
  }

  // Format period
  const periodo = format(new Date(boleta.fechaEmision), 'MMMM yyyy', {
    locale: es,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="h-10 w-10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Button>
          <h1 className="text-xl font-bold">Detalle Boleta</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl capitalize">{periodo}</CardTitle>
                {boleta.numeroFolio && (
                  <p className="text-sm text-gray-500 mt-1">
                    Folio: {boleta.numeroFolio}
                  </p>
                )}
              </div>
              <span
                className={`text-sm px-3 py-1 rounded-full font-medium ${
                  boleta.estado === 'pendiente'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-green-100 text-green-800'
                }`}
              >
                {boleta.estado === 'pendiente' ? 'Pendiente' : 'Pagada'}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Dates */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">Fecha Emisión</p>
                <p className="font-medium">
                  {format(new Date(boleta.fechaEmision), 'dd/MM/yyyy')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Vencimiento</p>
                <p className="font-medium">
                  {format(new Date(boleta.fechaVencimiento), 'dd/MM/yyyy')}
                </p>
              </div>
            </div>

            {/* Consumption */}
            {boleta.consumoM3 !== null && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-blue-700">Consumo del Período</span>
                  <span className="text-2xl font-bold text-blue-700">
                    {boleta.consumoM3.toFixed(1)} m³
                  </span>
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-700 border-b pb-2">
                Detalle de Cargos
              </h3>

              {boleta.costoAgua !== null && boleta.costoAgua > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Consumo de Agua</span>
                  <span>{formatearPesos(boleta.costoAgua)}</span>
                </div>
              )}

              {boleta.costoAlcantarillado !== null &&
                boleta.costoAlcantarillado > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Alcantarillado</span>
                    <span>{formatearPesos(boleta.costoAlcantarillado)}</span>
                  </div>
                )}

              {boleta.costoTratamiento !== null && boleta.costoTratamiento > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Tratamiento</span>
                  <span>{formatearPesos(boleta.costoTratamiento)}</span>
                </div>
              )}

              {boleta.costoCargoFijo !== null && boleta.costoCargoFijo > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Cargo Fijo</span>
                  <span>{formatearPesos(boleta.costoCargoFijo)}</span>
                </div>
              )}

              {/* Subtotal / Neto */}
              {boleta.montoNeto > 0 && (
                <div className="flex justify-between text-gray-500 pt-2 border-t">
                  <span>Subtotal Neto</span>
                  <span>{formatearPesos(boleta.montoNeto)}</span>
                </div>
              )}

              {/* IVA */}
              {boleta.montoIva > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>IVA (19%)</span>
                  <span>{formatearPesos(boleta.montoIva)}</span>
                </div>
              )}

              {/* Subsidio */}
              {boleta.montoSubsidio > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Subsidio</span>
                  <span>-{formatearPesos(boleta.montoSubsidio)}</span>
                </div>
              )}

              {/* Descuento */}
              {boleta.montoDescuento > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento</span>
                  <span>-{formatearPesos(boleta.montoDescuento)}</span>
                </div>
              )}

              {/* Saldo Anterior */}
              {boleta.montoSaldoAnterior > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Saldo Anterior</span>
                  <span>+{formatearPesos(boleta.montoSaldoAnterior)}</span>
                </div>
              )}

              {/* Interés */}
              {boleta.montoInteres > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Interés por Mora</span>
                  <span>+{formatearPesos(boleta.montoInteres)}</span>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between text-xl font-bold pt-3 border-t-2 mt-3">
                <span>Total a Pagar</span>
                <span className="text-blue-600">
                  {formatearPesos(boleta.montoTotal)}
                </span>
              </div>
            </div>

            {/* Days overdue warning */}
            {boleta.estado === 'pendiente' &&
              boleta.diasVencido !== null &&
              boleta.diasVencido > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-amber-800 font-medium">
                    ⚠️ Esta boleta tiene {boleta.diasVencido} días de atraso
                  </p>
                </div>
              )}

            {/* Observaciones */}
            {boleta.observaciones && (
              <div className="p-4 bg-gray-100 rounded-lg">
                <p className="text-sm text-gray-600 font-medium">Observaciones:</p>
                <p className="text-sm mt-1">{boleta.observaciones}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            ← Volver al Dashboard
          </Button>
        </div>
      </main>
    </div>
  );
}


