import { z } from 'zod';

/**
 * Pagination query parameters schema
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * Boleta ID parameter schema
 */
export const boletaIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID debe ser numérico'),
});

/**
 * Update profile schema - email and/or phone
 * At least one field must be provided
 */
export const updateProfileSchema = z
  .object({
    correo: z
      .string()
      .email('Correo electrónico inválido')
      .optional()
      .or(z.literal('')),
    telefono: z
      .string()
      .regex(
        /^\+56[0-9]{9}$/,
        'Teléfono inválido (debe ser +56 seguido de 9 dígitos)'
      )
      .optional()
      .or(z.literal('')),
  })
  .refine((data) => data.correo !== undefined || data.telefono !== undefined, {
    message: 'Debe proporcionar al menos un campo para actualizar',
  });

/**
 * Change password schema
 * Requires current password and new password with confirmation
 */
export const cambiarContrasenaSchema = z
  .object({
    contrasenaActual: z.string().min(1, 'Contraseña actual requerida'),
    nuevaContrasena: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula')
      .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula')
      .regex(/[0-9]/, 'Debe incluir al menos un número'),
    confirmarContrasena: z.string().min(1, 'Confirmación de contraseña requerida'),
  })
  .refine((data) => data.nuevaContrasena === data.confirmarContrasena, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmarContrasena'],
  });

// Type exports
export type PaginationQuery = z.infer<typeof paginationSchema>;
export type BoletaIdParams = z.infer<typeof boletaIdSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CambiarContrasenaInput = z.infer<typeof cambiarContrasenaSchema>;
