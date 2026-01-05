import { Button } from '@/components/ui/button';
import { AlertTriangle, Unlock } from 'lucide-react';
import { formatearFecha, FORMATOS_FECHA } from '@coab/utils';
import type { Customer } from '../types';

interface AccountWarningsProps {
  customer: Customer;
  onUnlock: () => void;
  isUnlocking: boolean;
}

export function AccountWarnings({ customer, onUnlock, isUnlocking }: AccountWarningsProps) {
  return (
    <>
      {customer.estaBloqueado && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-800">Cuenta Bloqueada</p>
            <p className="text-sm text-red-700">
              {customer.bloqueadoHasta
                ? `Bloqueada hasta: ${formatearFecha(customer.bloqueadoHasta, FORMATOS_FECHA.CON_HORA)}`
                : `Intentos fallidos: ${customer.intentosFallidos}`}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100"
            onClick={onUnlock}
            disabled={isUnlocking}
          >
            <Unlock className="h-4 w-4 mr-1" />
            {isUnlocking ? 'Desbloqueando...' : 'Desbloquear'}
          </Button>
        </div>
      )}

      {!customer.tieneContrasena && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">
              Sin contraseña configurada
            </p>
            <p className="text-sm text-amber-700">
              El cliente aún no ha configurado su contraseña de acceso
            </p>
          </div>
        </div>
      )}
    </>
  );
}

