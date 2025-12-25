import { z } from 'zod';

export const createMultaSchema = z.object({
  clienteId: z.string().regex(/^\d+$/, 'ID de cliente inválido'),
  monto: z.number().positive('El monto debe ser positivo'),
  descripcion: z.string().min(1, 'Descripción requerida').max(500),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateMultaSchema = z.object({
  monto: z.number().positive().optional(),
  descripcion: z.string().min(1).max(500).optional(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const multaIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de multa inválido'),
});

export type CreateMultaInput = z.infer<typeof createMultaSchema>;
export type UpdateMultaInput = z.infer<typeof updateMultaSchema>;


