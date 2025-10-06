# ITERATION 4: Admin Authentication

**Goal:** Admin can login with email + password

**Duration:** 1-2 days

**You'll Be Able To:** Login as admin in browser

---

## Backend Tasks (Day 1)

### Task 4.1: Admin Login Endpoint
**Time:** 2 hours

**Update:** `src/services/auth.service.ts`

Add `loginAdmin()` method (similar to `loginCliente` but with email lookup)

```typescript
// src/services/auth.service.ts
import { hash, verify } from '@node-rs/argon2';
import { SignJWT } from 'jose';

export async function loginAdmin(email: string, password: string, ip: string, userAgent: string) {
  const admin = await prisma.administrador.findUnique({
    where: { email }
  });

  if (!admin || !admin.hash_contrasena) {
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
    await prisma.administrador.update({
      where: { id: admin.id },
      data: {
        intentos_fallidos: { increment: 1 },
        cuenta_bloqueada: admin.intentos_fallidos >= 4,
        bloqueada_hasta: admin.intentos_fallidos >= 4
          ? new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
          : undefined
      }
    });
    throw new Error('Credenciales inválidas');
  }

  // Reset failed attempts
  await prisma.administrador.update({
    where: { id: admin.id },
    data: {
      intentos_fallidos: 0,
      cuenta_bloqueada: false,
      bloqueada_hasta: null,
      ultimo_inicio_sesion: new Date()
    }
  });

  // Generate JWT with jose
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

  const refreshToken = await new SignJWT({
    userId: admin.id.toString(),
    tipo: 'admin',
    tokenVersion: admin.token_version || 0
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret);

  // Store refresh token
  await prisma.token_refresco.create({
    data: {
      token: refreshToken,
      usuario_id: admin.id,
      tipo_usuario: 'admin',
      expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
```

**Update:** `src/routes/auth.routes.ts`

Update login route to handle both RUT and email

```typescript
// src/routes/auth.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { validarRUT } from '../utils/validators.js';

const loginSchema = z.object({
  rut: z.string().optional(),
  email: z.string().email('Email inválido').optional(),
  password: z.string().min(1, 'Contraseña requerida')
}).refine((data) => data.rut || data.email, {
  message: 'RUT o email requerido'
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);

      let result;
      if (body.rut) {
        // Customer login
        if (!validarRUT(body.rut)) {
          return reply.code(400).send({
            error: { code: 'INVALID_RUT', message: 'RUT inválido' }
          });
        }
        result = await authService.loginCliente(
          body.rut,
          body.password,
          request.ip,
          request.headers['user-agent'] || ''
        );
      } else if (body.email) {
        // Admin login
        result = await authService.loginAdmin(
          body.email,
          body.password,
          request.ip,
          request.headers['user-agent'] || ''
        );
      }

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
};

export default authRoutes;
```

**Test with cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@coab.cl","password":"Admin1234"}'
```

**Acceptance Criteria:**
- [ ] Admin can login with email + password
- [ ] Returns JWT with `tipo='admin'` and `rol` claim
- [ ] Same error handling as customer login (lockout after 5 attempts)
- [ ] Access token expires in 8 hours (not 24h like customer)

---

### Task 4.1.5: Admin Account Unlock Endpoint
**Time:** 1 hour

**CRITICAL:** Admins need ability to unlock customer accounts locked after failed login attempts.

**Create:** `src/services/admin.service.ts`

```typescript
// src/services/admin.service.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function unlockCustomerAccount(clienteId: bigint) {
  await prisma.cliente.update({
    where: { id: clienteId },
    data: {
      cuenta_bloqueada: false,
      intentos_fallidos: 0,
      bloqueada_hasta: null
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

  // POST /admin/clientes/:id/unlock
  fastify.post('/clientes/:id/unlock', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await adminService.unlockCustomerAccount(BigInt(id));
      return result;
    } catch (error: any) {
      return reply.code(500).send({
        error: { code: 'UNLOCK_FAILED', message: error.message }
      });
    }
  });
};

export default adminRoutes;
```

**Update:** `src/middleware/auth.middleware.ts`

Add `requireAdmin` middleware

```typescript
// src/middleware/auth.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';

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
```

**Wire Up:**
```typescript
// src/index.ts
import adminRoutes from './routes/admin.routes.js';

await app.register(adminRoutes, { prefix: '/api/v1/admin' });
```

**Test:**
```bash
# Lock an account first (5 failed login attempts)
# Then unlock it:
curl -X POST http://localhost:3000/api/v1/admin/clientes/123/unlock \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Acceptance Criteria:**
- [ ] Unlocks customer account
- [ ] Resets failed attempts counter
- [ ] Clears lockout timestamp
- [ ] Only accessible by admin (middleware check)
- [ ] Returns success message

---

## Frontend Tasks (Day 1-2)

### Task 4.2: Admin Login Page
**Time:** 2 hours

**Create:** `src/pages/admin/Login.tsx`

```typescript
import { useState } from 'react';
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
      const response = await apiClient.post('/auth/login', {
        email: data.email,
        password: data.password
      });

      const { accessToken, refreshToken, user } = response.data;

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
          <CardTitle className="text-center text-2xl">Portal Administrativo COAB</CardTitle>
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
                className={errors.email ? 'border-red-500' : ''}
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
                className={errors.password ? 'border-red-500' : ''}
              />
              {errors.password && (
                <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
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
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_user');
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Panel Administrativo</h1>
          <Button variant="outline" onClick={handleLogout}>
            Cerrar Sesión
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bienvenido, {adminUser.nombre}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">Rol: {adminUser.rol}</p>
            <p className="text-gray-600 mt-2">
              Funcionalidad de búsqueda de clientes disponible en la siguiente iteración.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Update Router:**
```typescript
// src/main.tsx or App.tsx
import { createBrowserRouter, RouterProvider } from 'react-router';
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';

const router = createBrowserRouter([
  {
    path: '/admin/login',
    element: <AdminLogin />
  },
  {
    path: '/admin/dashboard',
    element: <AdminDashboard />
  }
]);
```

**Test:**
1. Create admin in database with Argon2id password hash
2. Visit http://localhost:5173/admin/login
3. Login with email and password
4. Should see admin dashboard placeholder

**Acceptance Criteria:**
- [ ] Email input validates format
- [ ] Successful login redirects to `/admin/dashboard`
- [ ] Tokens stored separately from customer tokens (admin_access_token, admin_refresh_token)
- [ ] Logout works
- [ ] Error messages display for invalid credentials
- [ ] Account lockout works after 5 failed attempts

---

## Iteration 4 Complete! ✅

**What You Can Test:**
- Admin login flow with email/password
- Different user types (customer vs admin) with separate token storage
- Token-based authentication for both user types
- Admin can unlock locked customer accounts
- Account lockout works for admin accounts (15-minute lock after 5 attempts)

**Commit Message:**
```
feat: admin authentication and account management

Backend (Fastify + Argon2):
- Admin login with email/password
- Admin account unlock endpoint (POST /admin/clientes/:id/unlock)
- Role-based JWT tokens with jose
- requireAdmin middleware
- 8-hour access tokens for admin (shorter than customer)

Frontend (Vite + React Router):
- Admin login page with validation
- Admin dashboard placeholder
- Separate admin routing
- Separate token storage for admin vs customer
```
