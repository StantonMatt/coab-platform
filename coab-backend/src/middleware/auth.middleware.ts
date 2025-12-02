import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';
import { env } from '../config/env.js';

/**
 * Extend FastifyRequest to include user data from JWT
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: bigint;
      tipo: 'cliente' | 'admin';
      rut?: string;
      email?: string;
      rol?: string;
    };
  }
}

const secret = new TextEncoder().encode(env.JWT_SECRET);

/**
 * Middleware to require a valid cliente (customer) JWT token
 * Blocks admin tokens - they must use admin-specific routes
 */
export async function requireCliente(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token no proporcionado',
        },
      });
    }

    const token = authHeader.substring(7);

    const { payload } = await jwtVerify(token, secret);

    // Ensure this is a cliente token, not an admin token
    if (payload.tipo !== 'cliente') {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Acceso denegado - se requiere cuenta de cliente',
        },
      });
    }

    // Attach user data to request
    request.user = {
      userId: BigInt(payload.userId as string),
      tipo: 'cliente',
      rut: payload.rut as string | undefined,
    };
  } catch (error: any) {
    // Handle specific JWT errors
    if (error.code === 'ERR_JWT_EXPIRED') {
      return reply.code(401).send({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token expirado',
        },
      });
    }

    return reply.code(401).send({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token inválido',
      },
    });
  }
}

/**
 * Middleware to require a valid admin JWT token
 * For future use in admin routes (Iteration 4+)
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token no proporcionado',
        },
      });
    }

    const token = authHeader.substring(7);

    const { payload } = await jwtVerify(token, secret);

    // Ensure this is an admin token
    if (payload.tipo !== 'admin') {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Acceso denegado - se requiere cuenta de administrador',
        },
      });
    }

    // Attach user data to request
    request.user = {
      userId: BigInt(payload.userId as string),
      tipo: 'admin',
      email: payload.email as string | undefined,
      rol: payload.rol as string | undefined,
    };
  } catch (error: any) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      return reply.code(401).send({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token expirado',
        },
      });
    }

    return reply.code(401).send({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token inválido',
      },
    });
  }
}

