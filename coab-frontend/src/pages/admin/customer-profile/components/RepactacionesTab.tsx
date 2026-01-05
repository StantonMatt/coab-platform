import { Card } from '@/components/ui/card';
import { formatearPesos, formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import type { Repactacion } from '../types';

interface RepactacionesTabProps {
  repactaciones: Repactacion[] | undefined;
}

export function RepactacionesTab({ repactaciones }: RepactacionesTabProps) {
  if (!repactaciones?.length) {
    return (
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 text-center text-slate-500">
          No hay repactaciones registradas
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
                Fecha Inicio
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                Monto Original
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                Monto Total
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                Cuotas
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                Cuota Mensual
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {repactaciones.map((repactacion) => (
              <tr key={repactacion.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">
                  {formatearFechaSinHora(repactacion.fecha_inicio, FORMATOS_FECHA.CORTO)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {formatearPesos(repactacion.monto_original)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  {formatearPesos(repactacion.monto_total)}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">
                  {repactacion.cuotas_pagadas}/{repactacion.cuotas_total}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {formatearPesos(repactacion.monto_cuota)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    repactacion.estado === 'activa' ? 'bg-blue-100 text-blue-700' :
                    repactacion.estado === 'completada' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {repactacion.estado}
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

