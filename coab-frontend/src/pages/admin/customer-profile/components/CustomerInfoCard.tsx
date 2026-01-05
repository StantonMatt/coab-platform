import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/components/admin';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CreditCard,
  Send,
  Pencil,
} from 'lucide-react';
import { formatearFecha, FORMATOS_FECHA } from '@coab/utils';
import type { Customer } from '../types';

interface CustomerInfoCardProps {
  customer: Customer;
  onOpenPaymentModal: () => void;
  onOpenEditModal: () => void;
  onSendSetupLink: () => void;
  isSendingSetup: boolean;
}

export function CustomerInfoCard({
  customer,
  onOpenPaymentModal,
  onOpenEditModal,
  onSendSetupLink,
  isSendingSetup,
}: CustomerInfoCardProps) {
  return (
    <Card className="lg:col-span-2 border-slate-200 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold text-slate-900">
          Información del Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <User className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">N° Cliente</p>
              <p className="font-medium text-slate-900">
                {customer.numeroCliente}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Phone className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Teléfono</p>
              <p className="font-medium text-slate-900">
                {customer.telefono || '-'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Mail className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Email</p>
              <p className="font-medium text-slate-900">
                {customer.email || '-'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Calendar className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Cliente desde</p>
              <p className="font-medium text-slate-900">
                {formatearFecha(customer.fechaCreacion, FORMATOS_FECHA.CORTO)}
              </p>
            </div>
          </div>
        </div>

        {customer.direccion && (
          <div className="flex items-start gap-3 pt-2 border-t border-slate-100">
            <div className="p-2 bg-slate-100 rounded-lg">
              <MapPin className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Dirección</p>
              <p className="font-medium text-slate-900">
                {customer.direccion}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={onOpenPaymentModal}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Registrar Pago
          </Button>

          <PermissionGate entity="clientes" action="edit_contact">
            <Button
              variant="outline"
              onClick={onOpenEditModal}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar Cliente
            </Button>
          </PermissionGate>

          {!customer.tieneContrasena && (
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={onSendSetupLink}
              disabled={isSendingSetup}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSendingSetup
                ? 'Enviando...'
                : 'Enviar Link Configuración'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

