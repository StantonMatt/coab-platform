import { FastifyPluginAsync } from 'fastify';
import { z, ZodError } from 'zod';
import {
  loginClienteSchema,
  loginAdminSchema,
  refreshSchema,
} from '../schemas/auth.schema.js';
import { setupPasswordSchema, passwordSchema } from '../schemas/setup.schema.js';
import * as authService from '../services/auth.service.js';
import { AuthError } from '../services/auth.service.js';
import { env } from '../config/env.js';

// In development mode, use very high rate limits for testing
const isDev = env.NODE_ENV === 'development';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/login
   * Customer login with RUT and password
   */
  fastify.post('/login', async (request, reply) => {
    try {
      // Validate input
      const body = loginClienteSchema.parse(request.body);

      // Attempt login
      const result = await authService.loginCliente(
        body.rut,
        body.password,
        request.ip,
        request.headers['user-agent'] || ''
      );

      fastify.log.info(
        { rut: body.rut, ip: request.ip },
        'Login exitoso para cliente'
      );

      return result;
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
            details: error.errors,
          },
        });
      }

      // Handle auth errors
      if (error instanceof AuthError) {
        fastify.log.warn(
          { code: error.code, ip: request.ip },
          `Login fallido: ${error.message}`
        );

        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      // Unknown error
      fastify.log.error(error, 'Error inesperado en login');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error interno del servidor',
        },
      });
    }
  });

  /**
   * POST /auth/admin/login
   * Admin login with email and password
   */
  fastify.post('/admin/login', async (request, reply) => {
    try {
      // Validate input
      const body = loginAdminSchema.parse(request.body);

      // Attempt login
      const result = await authService.loginAdmin(
        body.email,
        body.password,
        request.ip,
        request.headers['user-agent'] || ''
      );

      fastify.log.info(
        { email: body.email, ip: request.ip },
        'Login exitoso para admin'
      );

      return result;
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
            details: error.errors,
          },
        });
      }

      // Handle auth errors
      if (error instanceof AuthError) {
        fastify.log.warn(
          { code: error.code, ip: request.ip },
          `Login admin fallido: ${error.message}`
        );

        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      // Unknown error
      fastify.log.error(error, 'Error inesperado en login admin');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error interno del servidor',
        },
      });
    }
  });

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   * Implements token rotation
   * Supports both cliente and admin tokens via tipo parameter
   */
  fastify.post('/refresh', async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);

      let tokens;
      if (body.tipo === 'admin') {
        tokens = await authService.refreshAdminToken(
          body.refreshToken,
          request.ip,
          request.headers['user-agent'] || ''
        );
      } else {
        tokens = await authService.refreshAccessToken(
          body.refreshToken,
          request.ip,
          request.headers['user-agent'] || ''
        );
      }

      fastify.log.info(
        { ip: request.ip, tipo: body.tipo },
        'Token refrescado exitosamente'
      );

      return tokens;
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }

      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      fastify.log.error(error, 'Error en refresh token');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error interno del servidor',
        },
      });
    }
  });

  /**
   * POST /auth/logout
   * Invalidate refresh token
   */
  fastify.post('/logout', async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);
      const result = await authService.logout(body.refreshToken);

      fastify.log.info({ ip: request.ip }, 'Logout exitoso');

      return result;
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
          },
        });
      }

      fastify.log.error(error, 'Error en logout');
      return reply.code(400).send({
        error: {
          code: 'LOGOUT_ERROR',
          message: 'Error al cerrar sesión',
        },
      });
    }
  });

  /**
   * GET /auth/setup/:token
   * Validate setup token and return customer info (public endpoint)
   */
  fastify.get('/setup/:token', async (request, reply) => {
    try {
      const { token } = request.params as { token: string };

      const result = await authService.validateSetupToken(token);

      if (!result.valid) {
        return reply.code(404).send({
          error: {
            code: 'INVALID_TOKEN',
            message: 'Enlace inválido o expirado',
          },
        });
      }

      return result;
    } catch (error) {
      fastify.log.error(error, 'Error al validar token de setup');
      return reply.code(500).send({
        error: {
          code: 'SERVER_ERROR',
          message: 'Error al validar enlace',
        },
      });
    }
  });

  /**
   * POST /auth/setup
   * Set password using setup token (public endpoint)
   */
  fastify.post('/setup', async (request, reply) => {
    try {
      const body = setupPasswordSchema.parse(request.body);

      const result = await authService.setupPassword(
        body.token,
        body.password,
        request.ip
      );

      fastify.log.info(
        { ip: request.ip },
        'Contraseña configurada exitosamente'
      );

      return result;
    } catch (error: any) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: error.errors[0].message,
            details: error.errors,
          },
        });
      }

      if (error.message === 'Token inválido o expirado') {
        return reply.code(400).send({
          error: {
            code: 'INVALID_TOKEN',
            message: error.message,
          },
        });
      }

      fastify.log.error(error, 'Error al configurar contraseña');
      return reply.code(500).send({
        error: {
          code: 'SETUP_ERROR',
          message: 'Error al configurar contraseña',
        },
      });
    }
  });

  /**
   * POST /auth/solicitar-reset
   * Request password reset code via WhatsApp (public endpoint)
   * Rate limited: 3 requests per RUT per 15 minutes
   */
  fastify.post(
    '/solicitar-reset',
    {
      config: {
        rateLimit: {
          max: isDev ? 100 : 3,
          timeWindow: isDev ? '5 minutes' : '15 minutes',
          keyGenerator: (req) => {
            // Rate limit by RUT to prevent spam
            const body = req.body as { rut?: string };
            const rutLimpio = (body?.rut || '')
              .replace(/[.\-\s]/g, '')
              .toUpperCase();
            return `reset-${rutLimpio}`;
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            rut: z.string().min(1, 'RUT requerido'),
          })
          .parse(request.body);

        const result = await authService.solicitarReset(
          body.rut,
          request.ip,
          fastify.log
        );

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
            },
          });
        }

        // Return generic success to prevent enumeration (even on error)
        return {
          success: true,
          message:
            'Si el RUT existe y tiene teléfono registrado, recibirás un código por WhatsApp',
        };
      }
    }
  );

  /**
   * POST /auth/validar-reset
   * Validate reset code and set new password (public endpoint)
   * Rate limited: 10 requests per RUT per 15 minutes
   */
  fastify.post(
    '/validar-reset',
    {
      config: {
        rateLimit: {
          max: isDev ? 100 : 10,
          timeWindow: isDev ? '5 minutes' : '15 minutes',
          keyGenerator: (req) => {
            const body = req.body as { rut?: string };
            const rutLimpio = (body?.rut || '')
              .replace(/[.\-\s]/g, '')
              .toUpperCase();
            return `validate-${rutLimpio}`;
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            rut: z.string().min(1, 'RUT requerido'),
            codigo: z.string().length(6, 'Código debe ser de 6 dígitos'),
            password: passwordSchema,
            confirmPassword: z.string(),
          })
          .refine((data) => data.password === data.confirmPassword, {
            message: 'Las contraseñas no coinciden',
            path: ['confirmPassword'],
          })
          .parse(request.body);

        const result = await authService.validarCodigoReset(
          body.rut,
          body.codigo,
          body.password,
          request.ip,
          fastify.log
        );

        fastify.log.info({ ip: request.ip }, 'Contraseña reseteada exitosamente');

        return result;
      } catch (error: any) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0].message,
              details: error.errors,
            },
          });
        }

        return reply.code(400).send({
          error: {
            code: 'INVALID_CODE',
            message: error.message,
          },
        });
      }
    }
  );
};

export default authRoutes;

