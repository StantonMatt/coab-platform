import { Card } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { formatearPesos, formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import type { Boleta } from '../types';

interface BoletasTabProps {
  boletas: Boleta[] | undefined;
  onDownloadPdf: (boletaId: string) => void;
}

export function BoletasTab({ boletas, onDownloadPdf }: BoletasTabProps) {
  if (!boletas?.length) {
    return (
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 text-center text-slate-500">
          No hay boletas registradas
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Período
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Vencimiento
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                Consumo
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                Monto
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {boletas.map((boleta) => (
              <tr
                key={boleta.id}
                className={`hover:bg-slate-50 ${
                  boleta.tienePdf
                    ? 'cursor-pointer hover:bg-blue-50'
                    : ''
                }`}
                onClick={() => {
                  if (boleta.tienePdf) {
                    onDownloadPdf(boleta.id);
                  }
                }}
                title={boleta.tienePdf ? 'Click para ver PDF' : 'PDF no disponible'}
              >
                <td className="px-4 py-3 text-slate-900">
                  <div className="flex items-center gap-2">
                    {boleta.tienePdf && (
                      <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    )}
                    <span>
                      {formatearFechaSinHora(boleta.fechaEmision, FORMATOS_FECHA.MES_ANIO)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatearFechaSinHora(boleta.fechaVencimiento, FORMATOS_FECHA.CORTO)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {boleta.consumoM3 !== null
                    ? `${boleta.consumoM3} m³`
                    : '-'}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {boleta.parcialmentePagada ? (
                    <div className="flex flex-col items-end">
                      <span>{formatearPesos(boleta.montoAdeudado || 0)}</span>
                      <span className="text-xs text-slate-400 line-through">
                        {formatearPesos(boleta.montoTotal)}
                      </span>
                    </div>
                  ) : (
                    formatearPesos(boleta.montoTotal)
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      boleta.parcialmentePagada
                        ? 'bg-amber-100 text-amber-700'
                        : boleta.montoAdeudado && boleta.montoAdeudado > 0
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {boleta.parcialmentePagada
                      ? 'Parcial'
                      : boleta.montoAdeudado && boleta.montoAdeudado > 0
                      ? 'Pendiente'
                      : 'Pagada'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

