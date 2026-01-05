import { Card } from '@/components/ui/card';
import { formatearFechaSinHora, FORMATOS_FECHA } from '@coab/utils';
import type { Medidor } from '../types';

interface MedidoresTabProps {
  medidores: Medidor[] | undefined;
}

export function MedidoresTab({ medidores }: MedidoresTabProps) {
  if (!medidores?.length) {
    return (
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 text-center text-slate-500">
          No hay medidores registrados
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
                N° Medidor
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Marca / Modelo
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Instalación
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {medidores.map((medidor) => (
              <tr key={medidor.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-900">
                  {medidor.numero_medidor}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {medidor.marca || '-'} {medidor.modelo ? `/ ${medidor.modelo}` : ''}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    medidor.estado === 'activo' ? 'bg-emerald-100 text-emerald-700' :
                    medidor.estado === 'inactivo' ? 'bg-slate-100 text-slate-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {medidor.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {medidor.fecha_instalacion 
                    ? formatearFechaSinHora(medidor.fecha_instalacion, FORMATOS_FECHA.CORTO)
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

