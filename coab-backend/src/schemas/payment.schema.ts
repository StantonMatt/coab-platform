import { z } from 'zod';

/**
 * Payment input validation schema
 * Used for manual payment registration by admin
 */
export const paymentSchema = z.object({
  clienteId: z.string().regex(/^\d+$/, 'ID de cliente inválido'),
  monto: z
    .number()
    .positive('Monto debe ser mayor a 0')
    .int('Monto debe ser un número entero'),
  tipoPago: z.enum(['efectivo', 'transferencia', 'cheque'], {
    errorMap: () => ({ message: 'Tipo de pago inválido' }),
  }),
  numeroTransaccion: z.string().max(100).optional(),
  observaciones: z.string().max(500).optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

