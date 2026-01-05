import { Card, CardContent } from '@/components/ui/card';
import { formatearPesos, formatearFecha, FORMATOS_FECHA } from '@coab/utils';
import type { Customer } from '../types';

interface SaldoCardProps {
  customer: Customer;
}

export function SaldoCard({ customer }: SaldoCardProps) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="pt-6">
        <p className="text-sm text-slate-500 mb-1">Saldo Pendiente</p>
        <p
          className={`text-3xl font-bold ${
            customer.saldo > 0 ? 'text-red-600' : 'text-emerald-600'
          }`}
        >
          {formatearPesos(customer.saldo)}
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Último acceso:{' '}
          {customer.ultimoInicioSesion
            ? formatearFecha(customer.ultimoInicioSesion, FORMATOS_FECHA.CORTO_CON_HORA)
            : 'Nunca'}
        </p>
      </CardContent>
    </Card>
  );
}

