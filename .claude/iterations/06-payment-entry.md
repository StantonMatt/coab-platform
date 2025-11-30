# ITERATION 6: Payment Entry (Manual)

**Goal:** Admin can register manual payments with proper validation, FIFO application, audit logging, and instant receipt printing

**You'll Be Able To:** Enter payments, print receipts, and see complete audit trail

**Prerequisites:**
- Iteration 1 complete (`TransaccionPago`, `LogAuditoria`, `Boleta` tables with `notas` field defined)
- Iteration 5 complete (admin can view customer profiles)

---

## Backend Tasks

### Task 6.1: Payment Creation API with FIFO Application

**CRITICAL:** Payment application logic is core business function. Complex transactions require:
- Database transaction with proper isolation
- FIFO order (oldest boleta first)
- Audit logging for compliance
- Error recovery with rollback

**Create:** `src/schemas/payment.schema.ts`

```typescript
// src/schemas/payment.schema.ts
import { z } from 'zod';

export const paymentSchema = z.object({
  clienteId: z.string().regex(/^\d+$/, 'ID de cliente inválido'),
  monto: z.number().positive('Monto debe ser mayor a 0').int('Monto debe ser entero'),
  tipoPago: z.enum(['efectivo', 'transferencia', 'cheque'], {
    errorMap: () => ({ message: 'Tipo de pago inválido' })
  }),
  numeroTransaccion: z.string().max(100).optional(),
  observaciones: z.string().max(500).optional()
});

export type PaymentInput = z.infer<typeof paymentSchema>;
```

**Update:** `src/services/admin.service.ts`

Add `registrarPago()` method with FIFO boleta application, transaction isolation, and audit logging:

```typescript
// src/services/admin.service.ts
import { PrismaClient, Prisma } from '@prisma/client';
import { PaymentInput } from '../schemas/payment.schema.js';

const prisma = new PrismaClient();

/**
 * Register a manual payment with FIFO application to boletas
 * Uses database transaction with row-level locking for concurrent safety
 */
export async function registrarPago(
  data: PaymentInput,
  operadorEmail: string,
  ipAddress: string,
  userAgent: string,
  logger: any
) {
  const clienteId = BigInt(data.clienteId);

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Verify customer exists
      const cliente = await tx.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true, rut: true, nombre_completo: true, saldo_actual: true }
      });

      if (!cliente) {
        throw new Error('Cliente no encontrado');
      }

      const saldoAnterior = cliente.saldo_actual;

      // 2. Create payment record
      const pago = await tx.transaccionPago.create({
        data: {
          cliente_id: clienteId,
          monto: data.monto,
          fecha_pago: new Date(),
          metodo_pago: data.tipoPago,
          estado_transaccion: 'completado',
          referencia_externa: data.numeroTransaccion || null,
          observaciones: data.observaciones || null,
          operador: operadorEmail
        }
      });

      // 3. Get pending boletas with row-level lock (FOR UPDATE)
      // This prevents concurrent payments from applying to same boletas
      const boletasPendientes = await tx.$queryRaw<Array<{
        id: bigint;
        monto_total: number;
        fecha_emision: Date;
        notas: string | null;
      }>>`
        SELECT id, monto_total, fecha_emision, notas
        FROM boletas
        WHERE cliente_id = ${clienteId} AND estado = 'pendiente'
        ORDER BY fecha_emision ASC
        FOR UPDATE
      `;

      // 4. Apply payment to boletas (FIFO - oldest first)
      let montoRestante = data.monto;
      const boletasAfectadas: Array<{
        boletaId: string;
        montoAplicado: number;
        tipo: 'completo' | 'parcial';
      }> = [];

      for (const boleta of boletasPendientes) {
        if (montoRestante <= 0) break;

        const montoBoleta = Number(boleta.monto_total);

        if (montoRestante >= montoBoleta) {
          // Full payment
          await tx.boleta.update({
            where: { id: boleta.id },
            data: {
              estado: 'pagada',
              fecha_pago: new Date()
            }
          });

          boletasAfectadas.push({
            boletaId: boleta.id.toString(),
            montoAplicado: montoBoleta,
            tipo: 'completo'
          });

          montoRestante -= montoBoleta;
        } else {
          // Partial payment - add note
          const notaActual = boleta.notas || '';
          const fechaHoy = new Date().toLocaleDateString('es-CL');
          const nuevaNota = `${notaActual}\n[${fechaHoy}] Pago parcial: $${montoRestante.toLocaleString('es-CL')} - Ref: ${pago.id}`.trim();

          await tx.boleta.update({
            where: { id: boleta.id },
            data: { notas: nuevaNota }
          });

          boletasAfectadas.push({
            boletaId: boleta.id.toString(),
            montoAplicado: montoRestante,
            tipo: 'parcial'
          });

          montoRestante = 0;
        }
      }

      // 5. If money left over (overpayment), note it
      let observacionesFinal = data.observaciones || '';
      if (montoRestante > 0) {
        observacionesFinal = `${observacionesFinal}\n[Saldo a favor: $${montoRestante.toLocaleString('es-CL')}]`.trim();
        
        await tx.transaccionPago.update({
          where: { id: pago.id },
          data: { observaciones: observacionesFinal }
        });
      }

      // 6. Recalculate and update customer balance
      const nuevoSaldo = await tx.boleta.aggregate({
        where: {
          cliente_id: clienteId,
          estado: 'pendiente'
        },
        _sum: {
          monto_total: true
        }
      });

      const saldoNuevo = Number(nuevoSaldo._sum.monto_total || 0);

      await tx.cliente.update({
        where: { id: clienteId },
        data: {
          saldo_actual: saldoNuevo,
          estado_cuenta: saldoNuevo > 0 ? 'MOROSO' : 'AL_DIA'
        }
      });

      // 7. Create audit log entry
      await tx.logAuditoria.create({
        data: {
          accion: 'REGISTRO_PAGO',
          entidad: 'transaccion_pago',
          entidad_id: pago.id,
          usuario_tipo: 'admin',
          usuario_email: operadorEmail,
          datos_anteriores: {
            saldoAnterior: saldoAnterior
          },
          datos_nuevos: {
            pagoId: pago.id.toString(),
            monto: data.monto,
            metodoPago: data.tipoPago,
            boletasAfectadas: boletasAfectadas.length,
            saldoNuevo: saldoNuevo,
            saldoAFavor: montoRestante > 0 ? montoRestante : 0
          },
          ip_address: ipAddress,
          user_agent: userAgent
        }
      });

      logger.info('Payment successfully applied', {
        clienteId: clienteId.toString(),
        clienteRut: cliente.rut,
        monto: data.monto,
        boletasAfectadas: boletasAfectadas.length,
        saldoRestante: montoRestante,
        operador: operadorEmail
      });

      return {
        pago: {
          id: pago.id.toString(),
          monto: pago.monto,
          fecha_pago: pago.fecha_pago,
          metodo_pago: pago.metodo_pago,
          referencia_externa: pago.referencia_externa,
          observaciones: pago.observaciones,
          operador: pago.operador
        },
        cliente: {
          id: cliente.id.toString(),
          rut: cliente.rut,
          nombre: cliente.nombre_completo
        },
        boletasAfectadas,
        saldoRestante: montoRestante,
        saldoNuevo
      };
    }, {
      // Transaction options for better isolation
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000, // 5 seconds max wait
      timeout: 10000 // 10 seconds timeout
    });
  } catch (error: any) {
    logger.error('Payment application failed - transaction rolled back', {
      clienteId: data.clienteId,
      monto: data.monto,
      tipoPago: data.tipoPago,
      operador: operadorEmail,
      error: error.message,
      stack: error.stack
    });

    // Re-throw with user-friendly message
    if (error.message === 'Cliente no encontrado') {
      throw error;
    }

    throw new Error(
      `Error al procesar pago. No se realizaron cambios. Por favor intente nuevamente.`
    );
  }
}
```

**Update:** `src/routes/admin.routes.ts`

Add payment registration endpoint:

```typescript
// Add to src/routes/admin.routes.ts
import { paymentSchema } from '../schemas/payment.schema.js';

// POST /admin/pagos
fastify.post('/pagos', async (request, reply) => {
  try {
    // Validate input with Zod
    const validatedData = paymentSchema.parse(request.body);

    const result = await adminService.registrarPago(
      validatedData,
      request.user!.email!,
      request.ip,
      request.headers['user-agent'] || 'unknown',
      fastify.log
    );

    return reply.code(201).send(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos de pago inválidos',
          details: error.errors
        }
      });
    }

    if (error.message === 'Cliente no encontrado') {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: error.message }
      });
    }

    fastify.log.error('Payment registration error', error);

    return reply.code(500).send({
      error: {
        code: 'PAYMENT_ERROR',
        message: error.message
      }
    });
  }
});
```

**Test Edge Cases:**

```bash
# Test 1: Normal payment
curl -X POST http://localhost:3000/api/v1/admin/pagos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "123",
    "monto": 25000,
    "tipoPago": "efectivo",
    "observaciones": "Pago en oficina"
  }'

# Expected: 201 Created with boletasAfectadas array

# Test 2: Overpayment (saldo a favor)
curl -X POST http://localhost:3000/api/v1/admin/pagos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "123",
    "monto": 100000,
    "tipoPago": "transferencia"
  }'

# Expected: 201 Created with saldoRestante > 0

# Test 3: Invalid monto (should fail validation)
curl -X POST http://localhost:3000/api/v1/admin/pagos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "123",
    "monto": -500,
    "tipoPago": "efectivo"
  }'

# Expected: 400 with Zod validation error

# Test 4: Invalid tipoPago (should fail validation)
curl -X POST http://localhost:3000/api/v1/admin/pagos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "123",
    "monto": 5000,
    "tipoPago": "bitcoin"
  }'

# Expected: 400 with Zod validation error
```

**Why Audit Logging Matters:**

The `logs_auditoria` table provides a **permanent, immutable record** of all admin actions. This is critical for:

1. **Compliance**: Auditors need to trace who did what, when, and why
2. **Dispute Resolution**: "Customer says they paid $50k, but there's no record" → Audit trail shows who registered it
3. **Fraud Prevention**: Detect rogue admin registering fake payments to embezzle money
4. **Data Integrity**: Pino logs are only retained for 7 days on Railway; audit table is permanent

**Audit Trail Queries (for investigations):**

```sql
-- Who registered payments for this customer?
SELECT
  usuario_email,
  datos_nuevos->>'monto' AS monto,
  datos_nuevos->>'metodoPago' AS metodo,
  ip_address,
  creado_en
FROM logs_auditoria
WHERE accion = 'REGISTRO_PAGO'
  AND (datos_nuevos->>'clienteId')::bigint = 123
ORDER BY creado_en DESC;

-- What did this admin do today?
SELECT
  accion,
  entidad,
  datos_nuevos,
  creado_en
FROM logs_auditoria
WHERE usuario_email = 'admin@coab.cl'
  AND creado_en >= CURRENT_DATE
ORDER BY creado_en DESC;
```

**Acceptance Criteria:**
- [ ] Creates payment in `transacciones_pago` table
- [ ] Applies payment to boletas in FIFO order (oldest first)
- [ ] Uses `FOR UPDATE` row locking for concurrent safety
- [ ] Marks boletas as 'pagada' when fully paid
- [ ] Adds partial payment notes to boletas
- [ ] Handles overpayment (saldo a favor noted in observaciones)
- [ ] Uses database transaction with Serializable isolation
- [ ] Returns detailed breakdown of applied amounts
- [ ] Records admin email in `operador` field
- [ ] Input validation with Zod (rejects invalid data)
- [ ] Error recovery with transaction rollback
- [ ] Updates denormalized `saldo_actual` on customer record
- [ ] Audit trail created in `logs_auditoria` table
- [ ] Audit record includes: accion, usuario_email, ip_address, user_agent, datos_anteriores, datos_nuevos

---

## Frontend Tasks

### Task 6.2: Payment Entry Modal

**Create:** `src/components/admin/PaymentEntryModal.tsx`

```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { formatearPesos } from '@coab/utils';

const paymentFormSchema = z.object({
  monto: z.number().positive('Monto debe ser mayor a 0').int('Monto debe ser entero'),
  tipoPago: z.enum(['efectivo', 'transferencia', 'cheque']),
  numeroTransaccion: z.string().max(100).optional(),
  observaciones: z.string().max(500).optional()
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

interface PaymentResult {
  pago: {
    id: string;
    monto: number;
    fecha_pago: string;
    metodo_pago: string;
    operador: string;
    referencia_externa?: string;
    observaciones?: string;
  };
  cliente: {
    id: string;
    rut: string;
    nombre: string;
  };
  boletasAfectadas: Array<{
    boletaId: string;
    montoAplicado: number;
    tipo: 'completo' | 'parcial';
  }>;
  saldoRestante: number;
  saldoNuevo: number;
}

interface PaymentEntryModalProps {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNombre: string;
  clienteRut: string;
  clienteDireccion?: string;
  saldoActual: number;
  onSuccess?: (result: PaymentResult) => void;
}

export default function PaymentEntryModal({
  open,
  onClose,
  clienteId,
  clienteNombre,
  clienteRut,
  clienteDireccion,
  saldoActual,
  onSuccess
}: PaymentEntryModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showReceipt, setShowReceipt] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors }
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      tipoPago: 'efectivo'
    }
  });

  const tipoPago = watch('tipoPago');
  const monto = watch('monto');

  const paymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const response = await adminApiClient.post('/admin/pagos', {
        clienteId,
        ...data
      });
      return response.data as PaymentResult;
    },
    onSuccess: (data) => {
      setPaymentResult(data);
      setShowReceipt(true);

      toast({
        title: 'Pago registrado exitosamente',
        description: `${data.boletasAfectadas.length} boleta(s) afectada(s). Nuevo saldo: ${formatearPesos(data.saldoNuevo)}`
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin-customer', clienteId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-payments', clienteId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-boletas', clienteId] });

      if (onSuccess) {
        onSuccess(data);
      }
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error?.message || 'Error al registrar pago';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage
      });
    }
  });

  const onSubmit = (data: PaymentFormData) => {
    paymentMutation.mutate(data);
  };

  const handleClose = () => {
    reset();
    setShowReceipt(false);
    setPaymentResult(null);
    onClose();
  };

  const handlePrint = () => {
    window.print();
  };

  // Receipt View
  if (showReceipt && paymentResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl print:max-w-none print:shadow-none">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .print-receipt, .print-receipt * { visibility: visible; }
              .print-receipt { position: absolute; left: 0; top: 0; width: 100%; }
              .no-print { display: none !important; }
            }
          `}</style>

          <div className="print-receipt">
            {/* Receipt Header */}
            <div className="text-center mb-6 pb-4 border-b-2">
              <h1 className="text-2xl font-bold">COAB - Compañía de Agua</h1>
              <p className="text-gray-600">Comprobante de Pago</p>
            </div>

            {/* Payment Details */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-600">Recibo N°</p>
                <p className="text-lg font-bold">#{paymentResult.pago.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fecha</p>
                <p className="text-lg">
                  {new Date(paymentResult.pago.fecha_pago).toLocaleDateString('es-CL', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>

            {/* Customer Info */}
            <div className="mb-6 p-4 bg-gray-50 rounded">
              <p className="text-sm text-gray-600 mb-1">Cliente</p>
              <p className="font-medium">{paymentResult.cliente.nombre}</p>
              <p className="text-sm text-gray-600">RUT: {paymentResult.cliente.rut}</p>
              {clienteDireccion && (
                <p className="text-sm text-gray-600">{clienteDireccion}</p>
              )}
            </div>

            {/* Amount */}
            <div className="mb-6 p-6 bg-primary-blue text-white rounded-lg text-center">
              <p className="text-sm opacity-90 mb-2">Monto Pagado</p>
              <p className="text-4xl font-bold">
                {formatearPesos(paymentResult.pago.monto)}
              </p>
            </div>

            {/* Payment Method */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-600">Método de Pago</p>
                <p className="font-medium capitalize">{paymentResult.pago.metodo_pago}</p>
              </div>
              {paymentResult.pago.referencia_externa && (
                <div>
                  <p className="text-sm text-gray-600">N° Transacción</p>
                  <p className="font-medium">{paymentResult.pago.referencia_externa}</p>
                </div>
              )}
            </div>

            {/* Boletas Applied */}
            {paymentResult.boletasAfectadas.length > 0 && (
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">Boletas Aplicadas</p>
                <div className="space-y-1">
                  {paymentResult.boletasAfectadas.map((boleta, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>Boleta #{boleta.boletaId}</span>
                      <span>
                        {formatearPesos(boleta.montoAplicado)}
                        {boleta.tipo === 'parcial' && ' (parcial)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overpayment Warning */}
            {paymentResult.saldoRestante > 0 && (
              <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                <p className="font-medium">Saldo a Favor</p>
                <p className="text-sm">
                  {formatearPesos(paymentResult.saldoRestante)} quedará como crédito
                </p>
              </div>
            )}

            {/* New Balance */}
            <div className="mb-6 p-4 bg-gray-100 rounded text-center">
              <p className="text-sm text-gray-600">Nuevo Saldo Pendiente</p>
              <p className="text-2xl font-bold">
                {formatearPesos(paymentResult.saldoNuevo)}
              </p>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-500 pt-4 border-t">
              <p>Operador: {paymentResult.pago.operador}</p>
              <p className="mt-2">Este documento es un comprobante de pago válido</p>
              <p>Conserve para sus registros</p>
            </div>
          </div>

          {/* Action Buttons (hidden in print) */}
          <div className="no-print flex gap-3 mt-6">
            <Button onClick={handlePrint} className="flex-1">
              Imprimir Comprobante
            </Button>
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Payment Form View
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pago</DialogTitle>
        </DialogHeader>

        {/* Customer Info */}
        <div className="p-3 bg-gray-50 rounded mb-4">
          <p className="font-medium">{clienteNombre}</p>
          <p className="text-sm text-gray-600">RUT: {clienteRut}</p>
          <p className="text-sm text-gray-600">
            Saldo actual: <span className="font-medium">{formatearPesos(saldoActual)}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="monto">Monto (CLP)</Label>
            <Input
              id="monto"
              type="number"
              step="1"
              min="1"
              placeholder="25000"
              {...register('monto', { valueAsNumber: true })}
              className={`h-11 text-lg ${errors.monto ? 'border-red-500' : ''}`}
            />
            {errors.monto && (
              <p className="text-sm text-red-500 mt-1">{errors.monto.message}</p>
            )}
            {monto && monto > saldoActual && saldoActual > 0 && (
              <p className="text-sm text-yellow-600 mt-1">
                ⚠️ Monto excede el saldo. El excedente quedará a favor.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="tipoPago">Tipo de Pago</Label>
            <Select
              value={tipoPago}
              onValueChange={(value) => setValue('tipoPago', value as any)}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoPago === 'transferencia' && (
            <div>
              <Label htmlFor="numeroTransaccion">N° de Transacción</Label>
              <Input
                id="numeroTransaccion"
                placeholder="1234567890"
                {...register('numeroTransaccion')}
                className="h-11"
              />
            </div>
          )}

          <div>
            <Label htmlFor="observaciones">Observaciones (opcional)</Label>
            <Textarea
              id="observaciones"
              placeholder="Notas adicionales..."
              rows={3}
              {...register('observaciones')}
              className={errors.observaciones ? 'border-red-500' : ''}
            />
            {errors.observaciones && (
              <p className="text-sm text-red-500 mt-1">{errors.observaciones.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 h-11"
              disabled={paymentMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 h-11"
              disabled={paymentMutation.isPending}
            >
              {paymentMutation.isPending ? 'Procesando...' : 'Registrar Pago'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### Task 6.3: Payment Entry Page (Alternative to Modal)

**Create:** `src/pages/admin/PaymentEntry.tsx`

```typescript
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import adminApiClient from '@/lib/adminApi';
import { formatearRUT, formatearPesos } from '@coab/utils';
import { ArrowLeft } from 'lucide-react';
import PaymentEntryModal from '@/components/admin/PaymentEntryModal';

export default function PaymentEntryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(true);

  const { data: customer, isLoading } = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}`);
      return res.data;
    },
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Cargando...
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-red-600">Cliente no encontrado</p>
        <Button onClick={() => navigate('/admin/clientes')}>Volver</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/admin/clientes/${id}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Registrar Pago</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>{customer.nombre_completo}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">RUT: {formatearRUT(customer.rut)}</p>
            <p className="text-gray-600">
              Saldo: <span className="font-bold">{formatearPesos(customer.saldo_actual)}</span>
            </p>
          </CardContent>
        </Card>
      </main>

      <PaymentEntryModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          navigate(`/admin/clientes/${id}`);
        }}
        clienteId={id!}
        clienteNombre={customer.nombre_completo}
        clienteRut={formatearRUT(customer.rut)}
        clienteDireccion={customer.direccion}
        saldoActual={customer.saldo_actual}
        onSuccess={() => {
          // Stay on modal for receipt printing
        }}
      />
    </div>
  );
}
```

**Update Router in `src/main.tsx`:**

```typescript
import PaymentEntryPage from './pages/admin/PaymentEntry';

// Add to routes
<Route path="/admin/clientes/:id/pago" element={<PaymentEntryPage />} />
```

**Test:**
1. Login as admin
2. Search for customer with pending boletas
3. Open customer profile
4. Click "Registrar Pago"
5. Fill form:
   - Monto: 25000
   - Tipo: Efectivo
   - Observaciones: "Pago en oficina"
6. Submit
7. Should see receipt with "Imprimir Comprobante" button
8. Verify payment appears in "Pagos" tab
9. Verify customer balance updated
10. Login as that customer in another browser
11. Verify payment visible in customer portal

**Acceptance Criteria:**
- [ ] Modal opens and closes correctly
- [ ] Form validates (monto > 0, tipo required)
- [ ] Warning shows if payment exceeds balance (overpayment)
- [ ] Transaction number field only shows for "transferencia"
- [ ] Loading state during submission
- [ ] Success shows receipt view
- [ ] Receipt printable via browser print
- [ ] Receipt includes all payment details
- [ ] Customer balance refreshes automatically
- [ ] New payment visible in database
- [ ] New payment visible in customer portal
- [ ] Double-submit prevented (button disabled during processing)

---

## Integration Testing

### Task 6.4: Payment FIFO Logic Testing

**Create Test Scenarios:**

1. **Scenario: Full Payment of Single Boleta**
   - Customer has 1 boleta: $10,000
   - Admin registers payment: $10,000
   - Expected: Boleta marked as 'pagada', saldo = $0

2. **Scenario: Partial Payment**
   - Customer has 1 boleta: $50,000
   - Admin registers payment: $25,000
   - Expected: Boleta stays 'pendiente', note added, saldo = $25,000

3. **Scenario: Multiple Boletas FIFO**
   - Customer has 3 boletas (oldest to newest): $10k, $20k, $30k
   - Admin registers payment: $35,000
   - Expected:
     - Boleta 1 (oldest): Paid fully ($10k) → estado = 'pagada'
     - Boleta 2: Paid fully ($20k) → estado = 'pagada'
     - Boleta 3: Partial ($5k note added) → estado = 'pendiente'
     - Saldo remaining: $25,000

4. **Scenario: Overpayment (Saldo a Favor)**
   - Customer has 1 boleta: $10,000
   - Admin registers payment: $50,000
   - Expected: Boleta paid, observaciones note: "Saldo a favor: $40,000"

5. **Scenario: Concurrent Payments (Race Condition Test)**
   - Customer has 2 boletas: $10k, $20k
   - Admin A registers: $15,000
   - Admin B registers: $10,000 (at same time)
   - Expected: Both succeed due to row locking, correct FIFO application

**SQL Verification Queries:**

```sql
-- Check payment was created
SELECT * FROM transacciones_pago
WHERE cliente_id = 123
ORDER BY fecha_pago DESC
LIMIT 1;

-- Check boletas updated correctly
SELECT
  id,
  fecha_emision,
  monto_total,
  estado,
  fecha_pago,
  notas
FROM boletas
WHERE cliente_id = 123
ORDER BY fecha_emision ASC;

-- Check customer balance updated
SELECT
  id,
  nombre_completo,
  saldo_actual,
  estado_cuenta
FROM clientes
WHERE id = 123;

-- Verify audit trail
SELECT * FROM logs_auditoria
WHERE accion = 'REGISTRO_PAGO'
ORDER BY creado_en DESC
LIMIT 5;
```

**Acceptance Criteria:**
- [ ] All 5 scenarios tested and pass
- [ ] Database state verified with SQL queries
- [ ] Pino logs show detailed payment application
- [ ] No orphaned records (transaction rollback works)
- [ ] Performance acceptable (<500ms for normal payments)
- [ ] Concurrent payments handled correctly (no double-application)

---

## Iteration 6 Complete! ✅

**What You Can Test:**
- Complete payment entry workflow
- Verify payment appears in:
  - Admin customer profile (Pagos tab)
  - Customer portal (login as that customer)
  - Database (Prisma Studio or SQL query)
  - Audit trail (`logs_auditoria` table)
- FIFO application to oldest boletas first
- Error handling and validation
- Concurrent payment scenarios
- Real-time UI updates via TanStack Query invalidation
- Print payment receipt (save as PDF via browser)

**Commit Message:**
```
feat: manual payment entry with FIFO, transaction isolation, and audit logging

Backend (Fastify + Zod + Prisma):
- POST /admin/pagos endpoint with Zod validation
- FIFO boleta payment application (oldest first)
- Prisma transaction with Serializable isolation
- Row-level locking (FOR UPDATE) for concurrent safety
- Support for full, partial, and overpayments
- Denormalized balance updates for performance
- Permanent audit trail in logs_auditoria table
- Captures: accion, usuario_email, ip_address, user_agent, datos_anteriores, datos_nuevos

Frontend (Vite + React Router + TanStack Query):
- Payment entry modal with React Hook Form + Zod
- Printable receipt component with browser print
- Real-time balance updates via query invalidation
- Success/error toast notifications
- Conditional field rendering (transaction number for transfers)
- Loading states and double-submit protection
- Overpayment warning indicator

🚀 Generated with Claude Code
```
