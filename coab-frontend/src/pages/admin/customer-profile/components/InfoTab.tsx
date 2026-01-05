import { Card, CardContent } from '@/components/ui/card';
import { formatearFecha, FORMATOS_FECHA } from '@coab/utils';
import type { Customer } from '../types';

interface InfoTabProps {
  customer: Customer;
}

export function InfoTab({ customer }: InfoTabProps) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-slate-500">
              Contraseña Configurada
            </p>
            <p className="font-medium text-slate-900">
              {customer.tieneContrasena ? 'Sí' : 'No'}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Cliente Activo</p>
            <p className="font-medium text-slate-900">
              {customer.esClienteActual ? 'Sí' : 'No'}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">
              Último Inicio de Sesión
            </p>
            <p className="font-medium text-slate-900">
              {customer.ultimoInicioSesion
                ? formatearFecha(customer.ultimoInicioSesion, FORMATOS_FECHA.CON_HORA)
                : 'Nunca'}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Registrado</p>
            <p className="font-medium text-slate-900">
              {formatearFecha(customer.fechaCreacion, FORMATOS_FECHA.CORTO)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

