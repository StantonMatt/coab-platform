import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock } from 'lucide-react';
import { formatearRUT } from '@coab/utils';
import type { Customer } from '../types';

interface CustomerHeaderProps {
  customer: Customer;
}

export function CustomerHeader({ customer }: CustomerHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-slate-900">
                {customer.nombre}
              </h1>
              {customer.estaBloqueado && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  <Lock className="h-3 w-3" />
                  Bloqueado
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 font-mono">
              {customer.rut ? formatearRUT(customer.rut) : 'Sin RUT'} ·{' '}
              N° {customer.numeroCliente}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              customer.estadoCuenta === 'AL_DIA'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {customer.estadoCuenta === 'AL_DIA' ? 'Al día' : 'Moroso'}
          </span>
        </div>
      </div>
    </header>
  );
}

