import { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import {
  loginClienteSchema,
  loginAdminSchema,
  refreshSchema,
} from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';
import { AuthError } from '../services/auth.service.js';

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
};

export default authRoutes;

