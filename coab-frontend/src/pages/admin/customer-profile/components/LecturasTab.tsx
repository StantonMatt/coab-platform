import { Card } from '@/components/ui/card';
import { formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import type { Lectura } from '../types';

interface LecturasTabProps {
  lecturas: Lectura[] | undefined;
}

export function LecturasTab({ lecturas }: LecturasTabProps) {
  if (!lecturas?.length) {
    return (
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 text-center text-slate-500">
          No hay lecturas registradas
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
                Fecha
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                Lectura
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Observaciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lecturas.map((lectura) => (
              <tr key={lectura.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900 font-medium">
                  {lectura.periodoMes}/{lectura.periodoAno}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatearFechaSinHora(lectura.fechaLectura, FORMATOS_FECHA.CORTO)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {lectura.tieneCorreccion ? (
                    <div className="flex flex-col items-end">
                      <span className="text-slate-900 font-medium">{lectura.valorCorregido}</span>
                      <span className="text-xs text-slate-400 line-through">{lectura.valorLectura}</span>
                    </div>
                  ) : (
                    <span className="text-slate-900">{lectura.valorLectura}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {lectura.confirmada ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                      Confirmada
                    </span>
                  ) : lectura.advertencia ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                      Advertencia
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 text-sm">
                  {lectura.observaciones || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

