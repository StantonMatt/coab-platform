import { Card } from '@/components/ui/card';
import { formatearPesos, formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import type { Pago } from '../types';

interface PagosTabProps {
  pagos: Pago[] | undefined;
}

export function PagosTab({ pagos }: PagosTabProps) {
  if (!pagos?.length) {
    return (
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 text-center text-slate-500">
          No hay pagos registrados
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
                Método
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">
                Monto
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase hidden md:table-cell">
                Operador
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagos.map((pago) => (
              <tr key={pago.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">
                  {formatearFechaSinHora(pago.fechaPago, FORMATOS_FECHA.CORTO)}
                </td>
                <td className="px-4 py-3 text-slate-600 capitalize">
                  {pago.tipoPago}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                  {formatearPesos(pago.monto)}
                </td>
                <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                  {pago.operador || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

