import { z } from 'zod';
import { validarRUT } from '@coab/utils';

/**
 * Login schema for customers (clientes)
 * Validates RUT using Chilean Modulus 11 algorithm
 */
export const loginClienteSchema = z.object({
  rut: z
    .string()
    .min(1, 'RUT requerido')
    .refine(validarRUT, 'RUT inválido (verificar dígito verificador)'),
  password: z.string().min(1, 'Contraseña requerida'),
});

/**
 * Refresh token schema
 * tipo: 'cliente' (default) or 'admin'
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requerido'),
  tipo: z.enum(['cliente', 'admin']).default('cliente'),
});

/**
 * Login schema for admin users (perfiles)
 */
export const loginAdminSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

// Type exports
export type LoginClienteInput = z.infer<typeof loginClienteSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LoginAdminInput = z.infer<typeof loginAdminSchema>;

