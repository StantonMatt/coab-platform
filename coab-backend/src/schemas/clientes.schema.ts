import { z } from 'zod';

/**
 * Schema for contact-only updates (billing_clerk and above)
 * Limited to phone, email, and address updates
 */
export const updateClienteContactSchema = z.object({
  telefono: z.string().max(20, 'Máximo 20 caracteres').optional().nullable(),
  correo: z.string().email('Correo electrónico inválido').optional().nullable(),
  // Address updates happen via direcciones table
});

/**
 * Schema for full client updates (supervisor and above)
 * Includes name changes and other sensitive fields
 */
export const updateClienteFullSchema = z.object({
  // Contact info (same as contact schema)
  telefono: z.string().max(20).optional().nullable(),
  correo: z.string().email().optional().nullable(),
  
  // Personal info (supervisor+ only)
  primerNombre: z.string().min(1).max(100).optional(),
  segundoNombre: z.string().max(100).optional().nullable(),
  primerApellido: z.string().min(1).max(100).optional(),
  segundoApellido: z.string().max(100).optional().nullable(),
  
  // RUT can only be changed if not already set (admin only typically)
  rut: z.string()
    .regex(/^[\d.kK-]+$/, 'RUT con formato inválido')
    .optional()
    .nullable(),
  
  // Account status
  recibeFactura: z.boolean().optional(),
  nombrePagante: z.string().max(200).optional().nullable(),
  excluirCargoFijo: z.boolean().optional(),
  esClienteActual: z.boolean().optional(),
});

/**
 * Schema for updating client's primary address
 * Matches direcciones table schema
 */
export const updateDireccionSchema = z.object({
  direccion: z.string().min(1, 'Dirección requerida').max(200).optional(),
  direccionNumero: z.string().max(20).optional().nullable(),
  poblacion: z.string().max(100).optional(),
  comuna: z.string().max(100).optional(),
});

/**
 * Schema for cliente ID parameter
 */
export const clienteIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID de cliente inválido'),
});

export type UpdateClienteContactInput = z.infer<typeof updateClienteContactSchema>;
export type UpdateClienteFullInput = z.infer<typeof updateClienteFullSchema>;
export type UpdateDireccionInput = z.infer<typeof updateDireccionSchema>;


