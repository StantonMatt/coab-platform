import { Card } from '@/components/ui/card';
import { formatearPesos, formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import type { Multa } from '../types';

interface MultasTabProps {
  multas: Multa[] | undefined;
}

export function MultasTab({ multas }: MultasTabProps) {
  if (!multas?.length) {
    return (
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 text-center text-slate-500">
          No hay multas registradas
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
                Fecha
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Tipo
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                Monto
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Descripción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {multas.map((multa) => (
              <tr key={multa.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">
                  {formatearFechaSinHora(multa.fecha_multa, FORMATOS_FECHA.CORTO)}
                </td>
                <td className="px-4 py-3 text-slate-600 capitalize">
                  {multa.tipo}
                </td>
                <td className="px-4 py-3 text-right font-medium text-red-600">
                  {formatearPesos(multa.monto)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    multa.estado === 'activa' ? 'bg-red-100 text-red-700' :
                    multa.estado === 'pagada' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {multa.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-sm">
                  {multa.descripcion || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

