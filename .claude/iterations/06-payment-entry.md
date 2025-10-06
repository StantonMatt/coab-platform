# ITERATION 6: Payment Entry (Manual)

**Goal:** Admin can register manual payments with proper validation, audit logging, and instant receipt printing

**Duration:** 4-5 days (+2 hours audit logging, +3 hours receipt printing)

**You'll Be Able To:** Enter payments, print receipts, and see complete audit trail

---

## Backend Tasks (Day 1)

### Task 6.1: Payment Creation API with FIFO Application
**Time:** 1 day (8 hours)

**CRITICAL:** Payment application logic is core business function, not optional. Complex transactions require thorough testing.

**Create:** `src/schemas/payment.schema.ts` - Input validation with Zod v4

```typescript
// src/schemas/payment.schema.ts
import { z } from 'zod';

export const paymentSchema = z.object({
  clienteId: z.string().transform((val) => BigInt(val)),
  monto: z.number().positive('Monto debe ser mayor a 0'),
  tipoPago: z.enum(['Efectivo', 'Transferencia', 'Cheque'], {
    errorMap: () => ({ message: 'Tipo de pago inválido' })
  }),
  numeroTransaccion: z.string().max(100).optional(),
  observaciones: z.string().max(500).optional()
});

export type PaymentInput = z.infer<typeof paymentSchema>;
```

**Update:** `src/services/admin.service.ts`

Add `registrarPago()` method with FIFO boleta application and error recovery:

```typescript
// src/services/admin.service.ts
import { PrismaClient } from '@prisma/client';
import { PaymentInput } from '../schemas/payment.schema.js';

const prisma = new PrismaClient();

export async function registrarPago(
  data: PaymentInput,
  operadorEmail: string,
  ipAddress: string,
  userAgent: string,
  logger: any
) {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Create payment record
      const pago = await tx.transaccion_pago.create({
        data: {
          cliente_id: data.clienteId,
          monto: data.monto,
          fecha_pago: new Date(),
          metodo_pago: data.tipoPago.toLowerCase(),
          estado_transaccion: 'completado',
          referencia_externa: data.numeroTransaccion,
          observaciones: data.observaciones,
          operador: operadorEmail
        }
      });

      // 2. Apply payment to boletas (FIFO - oldest unpaid first)
      const boletasPendientes = await tx.boleta.findMany({
        where: {
          cliente_id: data.clienteId,
          estado: 'pendiente'
        },
        orderBy: { fecha_emision: 'asc' } // FIFO - oldest first
      });

      let montoRestante = data.monto;
      const boletasAfectadas = [];

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
          const nuevaNota = `${notaActual}\nPago parcial (${new Date().toLocaleDateString('es-CL')}): $${montoRestante.toLocaleString('es-CL')} - Ref: ${pago.id}`;

          await tx.boleta.update({
            where: { id: boleta.id },
            data: { notas: nuevaNota.trim() }
          });

          boletasAfectadas.push({
            boletaId: boleta.id.toString(),
            montoAplicado: montoRestante,
            tipo: 'parcial'
          });

          montoRestante = 0;
        }
      }

      // 3. If money left over, note it
      if (montoRestante > 0) {
        await tx.transaccion_pago.update({
          where: { id: pago.id },
          data: {
            observaciones: `${data.observaciones || ''}\nSaldo a favor: $${montoRestante.toLocaleString('es-CL')}`.trim()
          }
        });
      }

      // 4. Update customer balance (denormalized for performance)
      const nuevoSaldo = await tx.boleta.aggregate({
        where: {
          cliente_id: data.clienteId,
          estado: 'pendiente'
        },
        _sum: {
          monto_total: true
        }
      });

      await tx.cliente.update({
        where: { id: data.clienteId },
        data: {
          saldo_actual: Number(nuevoSaldo._sum.monto_total || BigInt(0)),
          estado_cuenta: Number(nuevoSaldo._sum.monto_total || BigInt(0)) > 0 ? 'MOROSO' : 'AL_DIA'
        }
      });

      // 5. **AUDIT LOGGING** (NEW - Critical for compliance)
      await tx.log_auditoria.create({
        data: {
          accion: 'REGISTRO_PAGO',
          entidad: 'transaccion_pago',
          entidad_id: pago.id,
          usuario_tipo: 'admin',
          usuario_email: operadorEmail,
          datos_anteriores: {
            saldoAnterior: Number(nuevoSaldo._sum.monto_total || BigInt(0)) + data.monto
          },
          datos_nuevos: {
            pagoId: pago.id.toString(),
            monto: data.monto,
            metodoPago: data.tipoPago,
            boletasAfectadas: boletasAfectadas.length,
            saldoNuevo: Number(nuevoSaldo._sum.monto_total || BigInt(0))
          },
          ip_address: ipAddress,
          user_agent: userAgent
        }
      });

      logger.info('Payment successfully applied', {
        clienteId: data.clienteId.toString(),
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
          metodo_pago: pago.metodo_pago
        },
        boletasAfectadas,
        saldoRestante: montoRestante
      };
    });
  } catch (error: any) {
    logger.error('Payment application failed - transaction rolled back', {
      clienteId: data.clienteId.toString(),
      monto: data.monto,
      tipoPago: data.tipoPago,
      operador: operadorEmail,
      error: error.message,
      stack: error.stack
    });

    throw new Error(
      `Error al procesar pago. No se realizaron cambios. Referencia: ${Date.now()}`
    );
  }
}
```

**Update:** `src/routes/admin.routes.ts`

Add payment registration endpoint:

```typescript
// src/routes/admin.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { paymentSchema } from '../schemas/payment.schema.js';
import * as adminService from '../services/admin.service.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireAdmin);

  // POST /admin/pagos
  fastify.post('/pagos', async (request, reply) => {
    try {
      // Validate input with Zod
      const validatedData = paymentSchema.parse(request.body);

      const result = await adminService.registrarPago(
        validatedData,
        request.user!.email, // From JWT middleware
        request.ip, // IP address for audit trail
        request.headers['user-agent'] || 'unknown', // User agent for audit trail
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

      fastify.log.error('Payment registration error', error);

      return reply.code(500).send({
        error: {
          code: 'PAYMENT_ERROR',
          message: error.message
        }
      });
    }
  });
};

export default adminRoutes;
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
    "tipoPago": "Efectivo",
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
    "tipoPago": "Transferencia"
  }'

# Expected: 201 Created with saldoRestante > 0

# Test 3: Invalid monto (should fail validation)
curl -X POST http://localhost:3000/api/v1/admin/pagos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "123",
    "monto": -500,
    "tipoPago": "Efectivo"
  }'

# Expected: 400 with Zod validation error

# Test 4: Invalid tipoPago (should fail validation)
curl -X POST http://localhost:3000/api/v1/admin/pagos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "123",
    "monto": 5000,
    "tipoPago": "Bitcoin"
  }'

# Expected: 400 with Zod validation error

# Test 5: Concurrent payments (open 2 terminals, run simultaneously)
# Terminal 1:
curl -X POST http://localhost:3000/api/v1/admin/pagos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "123",
    "monto": 10000,
    "tipoPago": "Efectivo"
  }'

# Terminal 2 (at same time):
curl -X POST http://localhost:3000/api/v1/admin/pagos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "123",
    "monto": 10000,
    "tipoPago": "Efectivo"
  }'

# Expected: Both should succeed, verify boletas applied correctly in FIFO order

# Test 6: Database verification
psql $DATABASE_URL -c "SELECT * FROM transaccion_pago WHERE cliente_id = 123 ORDER BY fecha_pago DESC LIMIT 5;"
psql $DATABASE_URL -c "SELECT id, fecha_emision, monto_total, estado FROM boleta WHERE cliente_id = 123 ORDER BY fecha_emision ASC;"

# Test 7: Audit trail verification (NEW)
psql $DATABASE_URL -c "SELECT * FROM log_auditoria WHERE accion = 'REGISTRO_PAGO' ORDER BY created_at DESC LIMIT 5;"
```

**Why Audit Logging Matters (NEW - Added based on professional review):**

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
  created_at
FROM log_auditoria
WHERE accion = 'REGISTRO_PAGO'
  AND datos_nuevos->>'clienteId' = '123'
ORDER BY created_at DESC;

-- What did this admin do today?
SELECT
  accion,
  entidad,
  datos_nuevos,
  created_at
FROM log_auditoria
WHERE usuario_email = 'admin@coab.cl'
  AND created_at >= CURRENT_DATE
ORDER BY created_at DESC;

-- Payments registered from suspicious IP
SELECT
  usuario_email,
  datos_nuevos,
  created_at
FROM log_auditoria
WHERE accion = 'REGISTRO_PAGO'
  AND ip_address = '192.168.1.100'
ORDER BY created_at DESC;
```

**Acceptance Criteria:**
- [ ] Creates payment in `transaccion_pago` table
- [ ] Applies payment to boletas in FIFO order (oldest first)
- [ ] Marks boletas as 'pagada' when fully paid
- [ ] Adds partial payment notes to boletas
- [ ] Handles overpayment (saldo a favor noted in observaciones)
- [ ] Uses database transaction (all or nothing - rollback on error)
- [ ] Returns detailed breakdown of applied amounts
- [ ] Records admin email in `operador` field
- [ ] **Input validation with Zod v4 (rejects invalid data)**
- [ ] **Error recovery with detailed Pino logging**
- [ ] **Concurrent payments tested and work correctly**
- [ ] **All edge cases tested (overpayment, partial, concurrent)**
- [ ] Updates denormalized `saldo_actual` on customer record
- [ ] **Audit trail created in `logs_auditoria` table (NEW)**
- [ ] **Audit record includes: accion, usuario_email, ip_address, user_agent, datos_anteriores, datos_nuevos**
- [ ] **Audit queries work correctly (verify with test SQL queries above)**

---

## Frontend Tasks (Day 2-3)

### Task 6.2: Payment Entry Modal
**Time:** 4 hours

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
import apiClient from '@/lib/api';

const paymentFormSchema = z.object({
  monto: z.number().positive('Monto debe ser mayor a 0'),
  tipoPago: z.enum(['Efectivo', 'Transferencia', 'Cheque']),
  numeroTransaccion: z.string().max(100).optional(),
  observaciones: z.string().max(500).optional()
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

interface PaymentEntryModalProps {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNombre: string;
}

export default function PaymentEntryModal({
  open,
  onClose,
  clienteId,
  clienteNombre
}: PaymentEntryModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      tipoPago: 'Efectivo'
    }
  });

  const tipoPago = watch('tipoPago');

  const paymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const response = await apiClient.post('/admin/pagos', {
        clienteId,
        ...data
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Pago registrado exitosamente',
        description: `${data.boletasAfectadas.length} boleta(s) afectada(s). Saldo restante: $${data.saldoRestante.toLocaleString('es-CL')}`
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin-customer', clienteId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-payments', clienteId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-boletas', clienteId] });

      reset();
      onClose();
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pago - {clienteNombre}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="monto">Monto (CLP)</Label>
            <Input
              id="monto"
              type="number"
              step="1"
              placeholder="25000"
              {...register('monto', { valueAsNumber: true })}
              className={errors.monto ? 'border-red-500' : ''}
            />
            {errors.monto && (
              <p className="text-sm text-red-500 mt-1">{errors.monto.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="tipoPago">Tipo de Pago</Label>
            <Select
              value={tipoPago}
              onValueChange={(value) => setValue('tipoPago', value as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Efectivo">Efectivo</SelectItem>
                <SelectItem value="Transferencia">Transferencia</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
            {errors.tipoPago && (
              <p className="text-sm text-red-500 mt-1">{errors.tipoPago.message}</p>
            )}
          </div>

          {tipoPago === 'Transferencia' && (
            <div>
              <Label htmlFor="numeroTransaccion">Número de Transacción</Label>
              <Input
                id="numeroTransaccion"
                placeholder="1234567890"
                {...register('numeroTransaccion')}
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

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? 'Procesando...' : 'Registrar Pago'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Update:** `src/pages/admin/CustomerProfile.tsx`

Add "Registrar Pago" button functionality:

```typescript
// Add to CustomerProfile.tsx
import { useState } from 'react';
import PaymentEntryModal from '@/components/admin/PaymentEntryModal';

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // ... existing code ...

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* ... existing code ... */}

      <div className="mt-4 flex gap-2">
        <Button onClick={() => setPaymentModalOpen(true)}>
          Registrar Pago
        </Button>
        {/* ... other buttons ... */}
      </div>

      {/* Payment Modal */}
      <PaymentEntryModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        clienteId={id!}
        clienteNombre={customer?.nombre_completo || ''}
      />
    </div>
  );
}
```

**Test:**
1. Login as admin
2. Search for customer with pending boletas
3. Open customer profile
4. Click "Registrar Pago"
5. Fill form:
   - Monto: $25,000
   - Tipo: Efectivo
   - Observaciones: "Pago en oficina"
6. Submit
7. Should see success toast with boletas affected
8. Verify payment appears in "Pagos" tab
9. Verify customer balance updated
10. Login as that customer in another browser
11. Verify payment visible in customer portal

**Acceptance Criteria:**
- [ ] Modal opens and closes correctly
- [ ] Form validates (monto > 0, tipo required)
- [ ] Successful submission shows toast with details
- [ ] Customer balance refreshes automatically (via query invalidation)
- [ ] Payment list refreshes automatically
- [ ] Boletas list updates if any marked as paid
- [ ] New payment visible in database
- [ ] New payment visible in customer portal
- [ ] Número de Transacción field only shows for "Transferencia"
- [ ] Loading state shows during submission
- [ ] Error messages display for failed submissions

---

## Integration Testing (Day 4-5)

### Task 6.3: Payment FIFO Logic Testing
**Time:** 1 day

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
     - Boleta 1 (Jan): Paid fully ($10k)
     - Boleta 2 (Feb): Paid fully ($20k)
     - Boleta 3 (Mar): Partial ($5k note added)
     - Saldo remaining: $25,000

4. **Scenario: Overpayment (Saldo a Favor)**
   - Customer has 1 boleta: $10,000
   - Admin registers payment: $50,000
   - Expected: Boleta paid, observaciones note: "Saldo a favor: $40,000"

5. **Scenario: Concurrent Payments**
   - Customer has 2 boletas: $10k, $20k
   - Admin A registers: $15,000
   - Admin B registers: $10,000 (at same time)
   - Expected: Both succeed, correct FIFO application

**SQL Verification Queries:**

```sql
-- Check payment was created
SELECT * FROM transaccion_pago
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
FROM boleta
WHERE cliente_id = 123
ORDER BY fecha_emision ASC;

-- Check customer balance updated
SELECT
  id,
  nombre_completo,
  saldo_actual,
  estado_cuenta
FROM cliente
WHERE id = 123;
```

**Acceptance Criteria:**
- [ ] All 5 scenarios tested and pass
- [ ] Database state verified with SQL queries
- [ ] Pino logs show detailed payment application
- [ ] No orphaned records (transaction rollback works)
- [ ] Performance acceptable (<500ms for normal payments)

---

### Task 6.4: Payment Receipt Printing (NEW)
**Time:** 3 hours

**Why This Matters:** Customer pays $50,000 cash → needs proof immediately. Waiting for PDF generation (Phase 2) is not an option. Browser print-to-PDF is instant and works on all devices.

**Create:** `src/components/PaymentReceipt.tsx`

```typescript
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PaymentReceiptProps {
  pago: {
    id: string;
    monto: number;
    fecha_pago: Date;
    metodo_pago: string;
    operador: string;
    referencia_externa?: string;
    observaciones?: string;
  };
  cliente: {
    rut: string;
    nombre_completo: string;
    direccion: string;
  };
}

export function PaymentReceipt({ pago, cliente }: PaymentReceiptProps) {
  return (
    <>
      {/* Print Styles - Only visible when printing */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .receipt-print, .receipt-print * {
            visibility: visible;
          }
          .receipt-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Receipt Content */}
      <div className="receipt-print max-w-2xl mx-auto p-8 bg-white">
        {/* Header */}
        <div className="text-center mb-8 pb-4 border-b-2 border-gray-300">
          <h1 className="text-2xl font-bold mb-2">COAB - Compañía de Agua</h1>
          <p className="text-sm text-gray-600">Comprobante de Pago</p>
        </div>

        {/* Payment Details */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-sm font-semibold text-gray-600">Recibo N°:</p>
            <p className="text-lg">#{pago.id}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600">Fecha:</p>
            <p className="text-lg">
              {format(new Date(pago.fecha_pago), "d 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
          </div>
        </div>

        {/* Customer Info */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <p className="text-sm font-semibold text-gray-600 mb-2">Cliente:</p>
          <p className="font-medium">{cliente.nombre_completo}</p>
          <p className="text-sm text-gray-600">RUT: {cliente.rut}</p>
          <p className="text-sm text-gray-600">{cliente.direccion}</p>
        </div>

        {/* Payment Amount */}
        <div className="mb-6 p-6 bg-primary-blue text-white rounded-lg text-center">
          <p className="text-sm opacity-90 mb-2">Monto Pagado</p>
          <p className="text-4xl font-bold">
            {pago.monto.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
          </p>
        </div>

        {/* Payment Method */}
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-600">Método de Pago:</p>
              <p className="capitalize">{pago.metodo_pago}</p>
            </div>
            {pago.referencia_externa && (
              <div>
                <p className="text-sm font-semibold text-gray-600">N° Transacción:</p>
                <p>{pago.referencia_externa}</p>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {pago.observaciones && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-600 mb-1">Observaciones:</p>
            <p className="text-sm">{pago.observaciones}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
          <p>Operador: {pago.operador}</p>
          <p className="mt-2">Este documento es un comprobante de pago válido</p>
          <p>Conserve para sus registros</p>
        </div>
      </div>

      {/* Print Button (hidden in print view) */}
      <div className="no-print flex justify-center mt-4">
        <button
          onClick={() => window.print()}
          className="px-6 py-3 bg-primary-blue text-white rounded-lg hover:bg-blue-700 transition"
        >
          Imprimir Comprobante
        </button>
      </div>
    </>
  );
}
```

**Usage in PaymentEntryModal:**

After successful payment submission, show receipt:

```typescript
// In PaymentEntryModal.tsx
const [showReceipt, setShowReceipt] = useState(false);
const [lastPayment, setLastPayment] = useState<any>(null);

const mutation = useMutation({
  mutationFn: async (data) => {
    const res = await apiClient.post('/admin/pagos', data);
    return res.data;
  },
  onSuccess: (result) => {
    toast.success('Pago registrado exitosamente');
    setLastPayment(result.pago);
    setShowReceipt(true);
    queryClient.invalidateQueries({ queryKey: ['customer', clienteId] });
  }
});

// In modal JSX:
{showReceipt && lastPayment && (
  <PaymentReceipt
    pago={lastPayment}
    cliente={customerData}
  />
)}
```

**How It Works:**

1. Admin registers payment
2. Success → Receipt component renders
3. Admin clicks "Imprimir Comprobante"
4. Browser print dialog opens
5. Customer can:
   - Print directly (thermal printer, laser printer)
   - Save as PDF (browser's "Save as PDF" option)
   - Email PDF to themselves

**Test:**

1. Register a payment
2. Click "Imprimir Comprobante"
3. In print preview, verify:
   - Only receipt is visible (not admin UI)
   - All payment details shown
   - Professional formatting
4. Save as PDF or print

**Acceptance Criteria:**
- [ ] Receipt component displays all payment details
- [ ] Print button triggers browser print dialog
- [ ] Print preview shows only receipt (admin UI hidden)
- [ ] Receipt includes: payment ID, date, customer info, amount, method, operator
- [ ] Works on desktop (Chrome, Firefox, Safari)
- [ ] Works on mobile (iOS Safari, Android Chrome)
- [ ] Customer can save as PDF via browser
- [ ] Professional appearance (suitable for records/audits)

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
feat: manual payment entry with FIFO, audit logging, and receipt printing

Backend (Fastify + Zod v4 + Pino):
- POST /admin/pagos endpoint with Zod validation
- FIFO boleta payment application (oldest first)
- Prisma database transaction for atomicity
- Error recovery with detailed Pino logging
- Support for full, partial, and overpayments
- Denormalized balance updates for performance
- Permanent audit trail in logs_auditoria table (compliance)
- Captures: accion, usuario_email, ip_address, user_agent, datos_anteriores, datos_nuevos

Frontend (Vite + React Router + TanStack Query):
- Payment entry modal with React Hook Form + Zod
- Real-time balance updates via query invalidation
- Success/error toast notifications
- Conditional field rendering (transaction number for transfers)
- Loading states during submission
- Printable payment receipt component
- Browser print-to-PDF for instant customer receipts
```
