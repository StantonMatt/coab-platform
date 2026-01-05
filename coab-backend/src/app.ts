import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import adminRoutes from './routes/admin/index.js';
import paymentRoutes, { webhookRoutes } from './routes/payment.routes.js';

// Fix BigInt JSON serialization globally
// Prisma returns BigInt for BIGSERIAL columns
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

/**
 * Build and configure the Fastify application
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  // CORS configuration
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  // Rate limiting - general
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    errorResponseBuilder: () => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Demasiadas solicitudes. Por favor intente más tarde.',
      },
    }),
  });

  // Health check endpoint (required for Railway)
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    };
  });

  // API version prefix
  app.register(
    async (api) => {
      // Health check within API
      api.get('/health', async () => {
        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: 'v1',
        };
      });

      // Auth routes with stricter rate limiting
      await api.register(
        async (authApi) => {
          // Stricter rate limit for auth endpoints
          // Development: 20 attempts per 5 minutes (for testing)
          // Production: 5 attempts per 15 minutes
          const isDev = process.env.NODE_ENV === 'development';
          await authApi.register(rateLimit, {
            max: isDev ? 20 : 5,
            timeWindow: isDev ? '5 minutes' : '15 minutes',
            keyGenerator: (request) => {
              // Rate limit by IP for auth endpoints
              return request.ip;
            },
            errorResponseBuilder: () => ({
              error: {
                code: 'AUTH_RATE_LIMIT',
                message: 'Demasiados intentos de autenticación. Intente en 15 minutos.',
              },
            }),
          });

          await authApi.register(authRoutes);
        },
        { prefix: '/auth' }
      );

      // Customer routes (profile, balance, pagos, boletas)
      await api.register(customerRoutes, { prefix: '/clientes' });

      // Admin routes (customer management, account unlock)
      await api.register(adminRoutes, { prefix: '/admin' });

      // Payment routes (Mercado Pago customer payments)
      await api.register(paymentRoutes, { prefix: '/pagos' });

      // Webhook routes (public, no auth)
      await api.register(webhookRoutes, { prefix: '/webhooks' });
    },
    { prefix: '/api/v1' }
  );

  return app;
}







