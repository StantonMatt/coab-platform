import { z } from 'zod';

/**
 * Password requirements: 8+ chars, 1 uppercase, 1 lowercase, 1 number
 */
export const passwordSchema = z
  .string()
  .min(8, 'Contraseña debe tener al menos 8 caracteres')
  .regex(/[A-Z]/, 'Contraseña debe incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Contraseña debe incluir al menos una minúscula')
  .regex(/[0-9]/, 'Contraseña debe incluir al menos un número');

/**
 * Schema for password setup via token link
 */
export const setupPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token requerido'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>;

