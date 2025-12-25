import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { 
  hasPermission, 
  type PermissionEntity, 
  type PermissionAction,
  type AdminRole 
} from '../config/permissions.js';

/**
 * Extend FastifyRequest to include user data from JWT
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: bigint | string; // bigint for clientes, UUID string for admins
      tipo: 'cliente' | 'admin';
      rut?: string;
      email?: string;
      rol?: string;
    };
  }
}

const secret = new TextEncoder().encode(env.JWT_SECRET);

/**
 * Admin roles hierarchy
 * Higher number = more permissions
 */
const ROLE_HIERARCHY: Record<string, number> = {
  billing_clerk: 1,
  supervisor: 2,
  admin: 3,
};

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

    // Attach user data to request (userId is UUID string for admins)
    request.user = {
      userId: payload.userId as string,
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

/**
 * Middleware factory to require a specific admin role (or higher)
 * Usage: requireRole('supervisor') - allows supervisor and admin
 * @param minRole - Minimum required role
 */
export function requireRole(minRole: 'billing_clerk' | 'supervisor' | 'admin') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // First check admin auth
    await requireAdmin(request, reply);

    // If reply was already sent (auth failed), return
    if (reply.sent) return;

    const userRole = request.user?.rol || 'billing_clerk';
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      return reply.code(403).send({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Se requiere rol ${minRole} o superior`,
        },
      });
    }
  };
}

/**
 * Middleware factory to require a specific permission on an entity
 * Uses the centralized permissions config for easy modification
 * 
 * Usage: requirePermission('repactaciones', 'create')
 * 
 * @param entity - The entity being accessed (e.g., 'clientes', 'repactaciones')
 * @param action - The action being performed (e.g., 'view', 'create', 'edit')
 */
export function requirePermission(entity: PermissionEntity, action: PermissionAction) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // First check admin auth
    await requireAdmin(request, reply);

    // If reply was already sent (auth failed), return
    if (reply.sent) return;

    const userRole = (request.user?.rol || 'billing_clerk') as AdminRole;

    if (!hasPermission(userRole, entity, action)) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `Permiso insuficiente para ${action} en ${entity}`,
        },
      });
    }
  };
}

