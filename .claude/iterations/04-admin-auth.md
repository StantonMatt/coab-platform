# ITERATION 4: Admin Authentication

**Goal:** Admin can login with email + password, with role-based access control

**You'll Be Able To:** Login as admin in browser and access admin-only features

**Prerequisites:**
- Iteration 1 complete (`Administrador` table defined in schema)
- Iteration 2-3 complete (auth infrastructure in place)

---

## Backend Tasks

### Task 4.1: Admin Login Endpoint

**Update:** `src/services/auth.service.ts`

Add `loginAdmin()` method:

```typescript
// src/services/auth.service.ts
import { hash, verify } from '@node-rs/argon2';
import { SignJWT } from 'jose';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function loginAdmin(
  email: string,
  password: string,
  ip: string,
  userAgent: string
) {
  const admin = await prisma.administrador.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (!admin || !admin.hash_contrasena || !admin.activo) {
    throw new Error('Credenciales inválidas');
  }

  // Check if account is locked
  if (admin.cuenta_bloqueada && admin.bloqueada_hasta && admin.bloqueada_hasta > new Date()) {
    const minutosRestantes = Math.ceil((admin.bloqueada_hasta.getTime() - Date.now()) / 60000);
    throw new Error(`Cuenta bloqueada. Intenta en ${minutosRestantes} minutos`);
  }

  // Verify password with Argon2id
  const valid = await verify(admin.hash_contrasena, password);

  if (!valid) {
    // Increment failed attempts
    const newAttempts = admin.intentos_fallidos + 1;
    const shouldLock = newAttempts >= 5;

    await prisma.administrador.update({
      where: { id: admin.id },
      data: {
        intentos_fallidos: newAttempts,
        cuenta_bloqueada: shouldLock,
        bloqueada_hasta: shouldLock
          ? new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
          : null
      }
    });

    if (shouldLock) {
      throw new Error('Cuenta bloqueada por múltiples intentos fallidos. Intenta en 15 minutos');
    }

    throw new Error('Credenciales inválidas');
  }

  // Reset failed attempts on successful login
  await prisma.administrador.update({
    where: { id: admin.id },
    data: {
      intentos_fallidos: 0,
      cuenta_bloqueada: false,
      bloqueada_hasta: null,
      ultimo_inicio_sesion: new Date()
    }
  });

  // Generate JWT with jose (shorter expiry for admin)
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const accessToken = await new SignJWT({
    userId: admin.id.toString(),
    tipo: 'admin',
    email: admin.email,
    rol: admin.rol
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h') // Shorter for admin
    .sign(secret);

  // Generate refresh token
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  // Store refresh token (using SesionRefresh table)
  await prisma.sesionRefresh.create({
    data: {
      admin_id: admin.id,
      tipo_usuario: 'admin',
      token_hash: tokenHash,
      expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ip_address: ip,
      user_agent: userAgent
    }
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: admin.id.toString(),
      email: admin.email,
      nombre: admin.nombre,
      rol: admin.rol
    }
  };
}

export async function refreshAdminToken(
  refreshToken: string,
  ip: string,
  userAgent: string
) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const session = await prisma.sesionRefresh.findFirst({
    where: {
      token_hash: tokenHash,
      tipo_usuario: 'admin',
      expira_en: { gt: new Date() }
    },
    include: { admin: true }
  });

  if (!session || !session.admin) {
    throw new Error('Token de refresco inválido o expirado');
  }

  // Generate new access token
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const accessToken = await new SignJWT({
    userId: session.admin_id!.toString(),
    tipo: 'admin',
    email: session.admin.email,
    rol: session.admin.rol
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h')
    .sign(secret);

  // Rotate refresh token
  await prisma.sesionRefresh.delete({ where: { id: session.id } });

  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

  await prisma.sesionRefresh.create({
    data: {
      admin_id: session.admin_id,
      tipo_usuario: 'admin',
      token_hash: newTokenHash,
      expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ip_address: ip,
      user_agent: userAgent
    }
  });

  return {
    accessToken,
    refreshToken: newRefreshToken
  };
}
```

**Update:** `src/schemas/auth.schema.ts`

Add admin login schema:

```typescript
// Add to existing auth.schema.ts

export const loginAdminSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida')
});

export type LoginAdminInput = z.infer<typeof loginAdminSchema>;
```

**Update:** `src/routes/auth.routes.ts`

Add admin login route:

```typescript
// src/routes/auth.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { validarRUT } from '../utils/validators.js';

const loginClienteSchema = z.object({
  rut: z.string().min(1, 'RUT requerido'),
  password: z.string().min(1, 'Contraseña requerida')
});

const loginAdminSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida')
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requerido'),
  tipo: z.enum(['cliente', 'admin']).default('cliente')
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/login (Customer - RUT)
  fastify.post('/login', async (request, reply) => {
    try {
      const body = loginClienteSchema.parse(request.body);

      if (!validarRUT(body.rut)) {
        return reply.code(400).send({
          error: { code: 'INVALID_RUT', message: 'RUT inválido' }
        });
      }

      const result = await authService.loginCliente(
        body.rut,
        body.password,
        request.ip,
        request.headers['user-agent'] || ''
      );

      return result;
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message }
        });
      }
      if (error.message.includes('bloqueada')) {
        return reply.code(423).send({
          error: { code: 'ACCOUNT_LOCKED', message: error.message }
        });
      }
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: error.message }
      });
    }
  });

  // POST /auth/admin/login (Admin - Email)
  fastify.post('/admin/login', async (request, reply) => {
    try {
      const body = loginAdminSchema.parse(request.body);

      const result = await authService.loginAdmin(
        body.email,
        body.password,
        request.ip,
        request.headers['user-agent'] || ''
      );

      return result;
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message }
        });
      }
      if (error.message.includes('bloqueada')) {
        return reply.code(423).send({
          error: { code: 'ACCOUNT_LOCKED', message: error.message }
        });
      }
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: error.message }
      });
    }
  });

  // POST /auth/refresh
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

      return tokens;
    } catch (error: any) {
      return reply.code(401).send({
        error: { code: 'INVALID_REFRESH_TOKEN', message: error.message }
      });
    }
  });
};

export default authRoutes;
```

**Test with cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@coab.cl","password":"Admin1234!"}'
```

**Acceptance Criteria:**
- [ ] Admin can login with email + password
- [ ] Returns JWT with `tipo='admin'` and `rol` claim
- [ ] Same error handling as customer login (lockout after 5 attempts)
- [ ] Access token expires in 8 hours (not 24h like customer)
- [ ] Refresh token stored in `sesiones_refresh` table

---

### Task 4.2: Admin Middleware with Role-Based Access Control

**Update:** `src/middleware/auth.middleware.ts`

Add `requireAdmin` middleware with RBAC:

```typescript
// src/middleware/auth.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';

// Extend FastifyRequest type
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

// Admin roles hierarchy
const ROLE_HIERARCHY: Record<string, number> = {
  'billing_clerk': 1,
  'supervisor': 2,
  'admin': 3
};

/**
 * Require admin authentication
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Token no proporcionado' }
      });
    }

    const token = authHeader.substring(7);
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    const { payload } = await jwtVerify(token, secret);

    if (payload.tipo !== 'admin') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Acceso denegado - se requiere rol admin' }
      });
    }

    request.user = {
      userId: BigInt(payload.userId as string),
      tipo: 'admin',
      email: payload.email as string,
      rol: payload.rol as string
    };
  } catch (error) {
    return reply.code(401).send({
      error: { code: 'INVALID_TOKEN', message: 'Token inválido o expirado' }
    });
  }
}

/**
 * Require specific admin role (or higher)
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
          message: `Se requiere rol ${minRole} o superior`
        }
      });
    }
  };
}

/**
 * Require customer authentication
 */
export async function requireCliente(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Token no proporcionado' }
      });
    }

    const token = authHeader.substring(7);
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    const { payload } = await jwtVerify(token, secret);

    if (payload.tipo !== 'cliente') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Acceso denegado - se requiere cuenta de cliente' }
      });
    }

    request.user = {
      userId: BigInt(payload.userId as string),
      tipo: 'cliente',
      rut: payload.rut as string
    };
  } catch (error) {
    return reply.code(401).send({
      error: { code: 'INVALID_TOKEN', message: 'Token inválido o expirado' }
    });
  }
}
```

**Usage Example:**
```typescript
// Any admin can access
fastify.get('/admin/stats', { preHandler: [requireAdmin] }, handler);

// Only supervisors and admins can access
fastify.post('/admin/refunds', { preHandler: [requireRole('supervisor')] }, handler);

// Only admins can access
fastify.delete('/admin/users/:id', { preHandler: [requireRole('admin')] }, handler);
```

---

### Task 4.3: Admin Account Unlock Endpoint

**CRITICAL:** Admins need ability to unlock customer accounts locked after failed login attempts.

**Create:** `src/services/admin.service.ts`

```typescript
// src/services/admin.service.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function unlockCustomerAccount(clienteId: bigint, adminEmail: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId }
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  await prisma.cliente.update({
    where: { id: clienteId },
    data: {
      cuenta_bloqueada: false,
      intentos_fallidos: 0,
      bloqueada_hasta: null
    }
  });

  // Audit log
  await prisma.logAuditoria.create({
    data: {
      accion: 'DESBLOQUEO_CUENTA',
      entidad: 'cliente',
      entidad_id: clienteId,
      usuario_tipo: 'admin',
      usuario_email: adminEmail,
      datos_anteriores: {
        cuenta_bloqueada: cliente.cuenta_bloqueada,
        intentos_fallidos: cliente.intentos_fallidos
      },
      datos_nuevos: {
        cuenta_bloqueada: false,
        intentos_fallidos: 0
      }
    }
  });

  return { message: 'Cuenta desbloqueada exitosamente' };
}
```

**Create:** `src/routes/admin.routes.ts`

```typescript
// src/routes/admin.routes.ts
import { FastifyPluginAsync } from 'fastify';
import * as adminService from '../services/admin.service.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply admin auth middleware to all routes
  fastify.addHook('onRequest', requireAdmin);

  // POST /admin/clientes/:id/desbloquear
  fastify.post('/clientes/:id/desbloquear', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await adminService.unlockCustomerAccount(
        BigInt(id),
        request.user!.email!
      );
      return result;
    } catch (error: any) {
      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message }
        });
      }
      return reply.code(500).send({
        error: { code: 'UNLOCK_FAILED', message: error.message }
      });
    }
  });
};

export default adminRoutes;
```

**Wire Up:**
```typescript
// src/app.ts
import adminRoutes from './routes/admin.routes.js';

await app.register(adminRoutes, { prefix: '/api/v1/admin' });
```

**Test:**
```bash
# Lock an account first (5 failed login attempts)
# Then unlock it:
curl -X POST http://localhost:3000/api/v1/admin/clientes/123/desbloquear \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Acceptance Criteria:**
- [ ] Unlocks customer account
- [ ] Resets failed attempts counter to 0
- [ ] Clears lockout timestamp
- [ ] Only accessible by admin (middleware check)
- [ ] Returns success message
- [ ] Creates audit log entry

---

## Frontend Tasks

### Task 4.4: Admin Login Page

**Create:** `src/pages/admin/Login.tsx`

```typescript
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import apiClient from '@/lib/api';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida')
});

type LoginForm = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      const response = await apiClient.post('/auth/admin/login', {
        email: data.email,
        password: data.password
      });

      const { accessToken, refreshToken, user } = response.data;

      // Store admin tokens separately
      localStorage.setItem('admin_access_token', accessToken);
      localStorage.setItem('admin_refresh_token', refreshToken);
      localStorage.setItem('admin_user', JSON.stringify(user));

      toast({
        title: 'Inicio de sesión exitoso',
        description: `Bienvenido, ${user.nombre}`
      });

      navigate('/admin/dashboard');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || 'Error al iniciar sesión';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Portal Administrativo</CardTitle>
          <p className="text-center text-gray-600 text-sm">COAB - Sistema de Gestión</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@coab.cl"
                {...register('email')}
                className={`h-11 ${errors.email ? 'border-red-500' : ''}`}
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                className={`h-11 ${errors.password ? 'border-red-500' : ''}`}
                autoComplete="current-password"
              />
              {errors.password && (
                <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
              {isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Create:** `src/pages/admin/Dashboard.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, CreditCard, FileText, Settings } from 'lucide-react';

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    const user = localStorage.getItem('admin_user');

    if (!token) {
      navigate('/admin/login');
      return;
    }

    if (user) {
      setAdminUser(JSON.parse(user));
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_user');
    navigate('/admin/login');
  };

  if (!adminUser) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-primary-blue">COAB Admin</h1>
            <p className="text-sm text-gray-600">{adminUser.nombre} ({adminUser.rol})</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            Cerrar Sesión
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6">Panel de Control</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/admin/clientes">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <Users className="h-8 w-8 text-primary-blue" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg">Clientes</CardTitle>
                <p className="text-sm text-gray-600">Buscar y gestionar clientes</p>
              </CardContent>
            </Card>
          </Link>

          <Card className="opacity-50">
            <CardHeader className="pb-2">
              <CreditCard className="h-8 w-8 text-gray-400" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">Pagos</CardTitle>
              <p className="text-sm text-gray-600">Iteración 6</p>
            </CardContent>
          </Card>

          <Card className="opacity-50">
            <CardHeader className="pb-2">
              <FileText className="h-8 w-8 text-gray-400" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">Reportes</CardTitle>
              <p className="text-sm text-gray-600">Fase 2</p>
            </CardContent>
          </Card>

          <Card className="opacity-50">
            <CardHeader className="pb-2">
              <Settings className="h-8 w-8 text-gray-400" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">Configuración</CardTitle>
              <p className="text-sm text-gray-600">Fase 2</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
```

**Create Admin API Client:** `src/lib/adminApi.ts`

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const adminApiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  timeout: 10000
});

// Track refresh state
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token!);
    }
  });
  failedQueue = [];
};

// Request interceptor: Attach admin access token
adminApiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Auto-refresh on 401
adminApiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return adminApiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('admin_refresh_token');

      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem('admin_access_token');
        localStorage.removeItem('admin_refresh_token');
        localStorage.removeItem('admin_user');
        window.location.href = '/admin/login';
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'}/auth/refresh`,
          { refreshToken, tipo: 'admin' }
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;

        localStorage.setItem('admin_access_token', accessToken);
        localStorage.setItem('admin_refresh_token', newRefreshToken);

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return adminApiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('admin_access_token');
        localStorage.removeItem('admin_refresh_token');
        localStorage.removeItem('admin_user');
        window.location.href = '/admin/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default adminApiClient;
```

**Update Router in `src/main.tsx`:**

```typescript
import AdminLoginPage from './pages/admin/Login';
import AdminDashboardPage from './pages/admin/Dashboard';

// Add to routes
<Route path="/admin/login" element={<AdminLoginPage />} />
<Route path="/admin/dashboard" element={<AdminDashboardPage />} />
```

**Test:**
1. Create admin in database with Argon2id password hash (Iteration 1)
2. Visit http://localhost:5173/admin/login
3. Login with email and password
4. Should see admin dashboard

**Acceptance Criteria:**
- [ ] Email input validates format
- [ ] Successful login redirects to `/admin/dashboard`
- [ ] Tokens stored separately from customer tokens (`admin_access_token`, `admin_refresh_token`)
- [ ] Logout works
- [ ] Error messages display for invalid credentials
- [ ] Account lockout works after 5 failed attempts
- [ ] Dashboard shows admin name and role
- [ ] Navigation cards link to future features

---

## Iteration 4 Complete! ✅

**What You Can Test:**
- Admin login flow with email/password
- Different user types (customer vs admin) with separate token storage
- Token-based authentication for both user types
- Admin can unlock locked customer accounts
- Account lockout works for admin accounts (15-minute lock after 5 attempts)
- Role displayed on admin dashboard

**Commit Message:**
```
feat: admin authentication with RBAC and account management

Backend (Fastify + Argon2):
- POST /auth/admin/login endpoint
- Admin token refresh with tipo='admin'
- POST /admin/clientes/:id/desbloquear (unlock accounts)
- requireAdmin middleware
- requireRole middleware for RBAC (billing_clerk < supervisor < admin)
- 8-hour access tokens for admin (shorter than customer)
- Audit logging for account unlocks

Frontend (Vite + React Router):
- Admin login page with email/password
- Admin dashboard with navigation cards
- Separate admin API client with token refresh
- Separate token storage for admin vs customer
- Role display on dashboard

🚀 Generated with Claude Code
```
