# ITERATION 2: Customer Authentication (RUT Login + JWT Refresh)

**Goal:** Customer can login with RUT + password, get JWT with automatic refresh, see "logged in" confirmation

**Duration:** 3-4 days

**You'll Be Able To:** Login as a real customer in the browser with seamless token refresh

---

## Backend Tasks (Day 1-2)

### Task 2.1: Create Auth Service & Routes with Zod Validation
**Time:** 4 hours

**Files to Create:**
1. `src/utils/jwt.ts` - JWT generation/verification with jose
2. `src/utils/validators.ts` - RUT validation (Modulus 11)
3. `src/schemas/auth.schema.ts` - Zod validation schemas
4. `src/services/auth.service.ts` - Login logic with Argon2
5. `src/routes/auth.routes.ts` - Fastify routes
6. `src/plugins/auth.plugin.ts` - JWT verification plugin
7. `src/hooks/error-handler.ts` - Fastify error handler

**See TECH_STACK.md for complete implementation details.**

**Key Points:**
- Use **Argon2id** for password hashing (not bcrypt)
- Use **Zod v4** for input validation (10x faster than v3)
- Use **jose** library for JWT (modern, Promise-based)
- Store refresh tokens as **SHA-256 hash** (never plain text)
- Implement account lockout after 5 failed attempts (15-minute lock)

**Wire Up Routes** in `src/app.ts`:
```typescript
import authRoutes from './routes/auth.routes.js';
await app.register(authRoutes, { prefix: '/api/v1/auth' });
```

**Test with cURL:**
```bash
# First, create test customer with Argon2 password hash
# Use Prisma Studio or run:
npx tsx scripts/create-test-user.ts

curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"rut":"12345678-9","password":"Test1234"}'

# Should return:
# {
#   "accessToken": "eyJ...",
#   "refreshToken": "abc...",
#   "user": {...}
# }
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/login` accepts RUT + password
- [ ] Returns accessToken (24h), refreshToken (30d), user object
- [ ] Invalid credentials return 401
- [ ] Account locks after 5 failed attempts (returns 401 with lockout message)
- [ ] Zod validation rejects invalid RUT format (Modulus 11)
- [ ] Argon2id password verification (not bcrypt)
- [ ] Refresh token stored as SHA-256 hash in database
- [ ] Fastify logs login attempts with Pino

---

### Task 2.2: Implement Refresh Token Rotation
**Time:** 2 hours

**CRITICAL:** Without this, users get logged out after 24 hours with no way back in.

**Create:** `POST /api/v1/auth/refresh` endpoint

**Implementation:** `src/services/auth.service.ts`

```typescript
import crypto from 'crypto';
import { SignJWT } from 'jose';
import prisma from '../config/database.js';

export async function refreshAccessToken(refreshToken: string, ip: string, userAgent: string) {
  // 1. Hash the refresh token
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  // 2. Find valid session
  const session = await prisma.sesionRefresh.findFirst({
    where: {
      token_hash: tokenHash,
      expira_en: { gt: new Date() }
    },
    include: { cliente: true }
  });

  if (!session) {
    throw new Error('Invalid or expired refresh token');
  }

  // 3. Generate new access token
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const accessToken = await new SignJWT({
    userId: session.cliente_id,
    tipo: 'cliente',
    rut: session.cliente?.rut
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);

  // 4. ROTATE refresh token (security best practice)
  await prisma.sesionRefresh.delete({ where: { id: session.id } });

  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

  await prisma.sesionRefresh.create({
    data: {
      cliente_id: session.cliente_id,
      tipo_usuario: 'cliente',
      token_hash: newTokenHash,
      expira_en: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ip_address: ip,
      user_agent: userAgent
    }
  });

  return { accessToken, refreshToken: newRefreshToken };
}
```

**Add Route:**

```typescript
// src/routes/auth.routes.ts
fastify.post('/refresh', async (request, reply) => {
  try {
    const { refreshToken } = refreshSchema.parse(request.body);
    const tokens = await authService.refreshAccessToken(
      refreshToken,
      request.ip,
      request.headers['user-agent'] || ''
    );
    return tokens;
  } catch (error: any) {
    return reply.code(401).send({
      error: { code: 'INVALID_REFRESH_TOKEN', message: error.message }
    });
  }
});
```

**Test:**
```bash
# Get refresh token from login
REFRESH_TOKEN="abc123..."

curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"

# Should return new tokens
# Old refresh token is now invalid (rotation)
```

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/refresh` endpoint works
- [ ] Returns new accessToken and refreshToken
- [ ] Old refresh token is deleted (rotation)
- [ ] Expired refresh tokens return 401
- [ ] Invalid refresh tokens return 401

---

## Frontend Tasks (Day 2-3)

### Task 2.3: Create Login Page with React Router + React Hook Form
**Time:** 3 hours

**Create:** `src/pages/Login.tsx`

**Features:**
- RUT input with auto-formatting
- Password input
- React Hook Form + Zod v4 validation
- Error handling with toast
- Loading state
- Mobile-first design (44px touch targets)

**Implementation:**

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { formatearRUT, validarRUT, limpiarRUT } from '@/lib/utils';
import apiClient from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

const loginSchema = z.object({
  rut: z.string()
    .min(1, 'RUT requerido')
    .refine(validarRUT, 'RUT inválido'),
  password: z.string().min(1, 'Contraseña requerida')
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [rutDisplay, setRutDisplay] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatearRUT(e.target.value);
    setRutDisplay(formatted);
    setValue('rut', limpiarRUT(formatted));
  };

  const onSubmit = async (data: LoginForm) => {
    try {
      const response = await apiClient.post('/auth/login', {
        rut: data.rut,
        password: data.password
      });

      const { accessToken, refreshToken, user } = response.data;

      // Store tokens
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      // Redirect to dashboard
      navigate('/dashboard');
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Error al iniciar sesión';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold text-center mb-6 text-primary-blue">
          Portal Clientes COAB
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="rut">RUT</Label>
            <Input
              id="rut"
              type="text"
              inputMode="numeric"
              placeholder="12.345.678-9"
              value={rutDisplay}
              onChange={handleRutChange}
              className="h-12 text-lg"
              required
            />
            {errors.rut && (
              <p className="text-sm text-red-600 mt-1">{errors.rut.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              {...register('password')}
              className="h-12 text-lg"
              required
            />
            {errors.password && (
              <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-lg bg-primary-blue hover:bg-blue-700"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

**Setup Routing:** `src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
```

**Test:**
1. Create test customer with password in database
2. Visit http://localhost:5173/login
3. Enter RUT: 12.345.678-9 (auto-formats as you type)
4. Enter Password: Test1234
5. Click "Ingresar"
6. Should redirect to /dashboard

**Acceptance Criteria:**
- [ ] RUT auto-formats as you type (12345678 → 1.234.567-8)
- [ ] Numeric keyboard appears on mobile
- [ ] Zod validation shows error for invalid RUT
- [ ] Wrong password shows error toast
- [ ] Successful login stores tokens and redirects
- [ ] Loading state shows "Ingresando..." while waiting
- [ ] 44px button height for mobile touch targets

---

### Task 2.4: Create Protected Dashboard Route
**Time:** 2 hours

**Create:** `src/pages/Dashboard.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const userData = localStorage.getItem('user');

    if (!token) {
      navigate('/login');
      return;
    }

    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;

  return (
    <div className="min-h-screen p-4 bg-gray-50">
      <div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Hola, {user.nombre?.split(' ')[0]}</h1>
          <Button variant="outline" onClick={handleLogout} className="h-11">
            Cerrar Sesión
          </Button>
        </div>

        <div className="bg-primary-blue text-white p-6 rounded-lg text-center">
          <p className="text-sm opacity-90">Saldo Actual</p>
          <p className="text-3xl font-bold mt-2">
            ${user.saldo?.toLocaleString('es-CL') || '0'}
          </p>
          <p className="text-sm mt-2 opacity-90">
            {user.saldo > 0 ? 'Pendiente de pago' : 'Al día'}
          </p>
        </div>

        <div className="mt-6 text-center text-gray-600">
          ✅ Login exitoso! El dashboard completo viene en Iteración 3.
        </div>
      </div>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Dashboard loads after successful login
- [ ] Shows user's first name from localStorage
- [ ] Shows saldo_actual in Chilean format ($1.234.567)
- [ ] Logout button clears tokens and redirects to /login
- [ ] Redirects to /login if no token found

---

### Task 2.5: Add Automatic Token Refresh to Axios
**Time:** 2 hours

**CRITICAL:** This keeps users logged in seamlessly when access token expires.

**Update:** `src/lib/api.ts`

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  timeout: 10000
});

// Request interceptor: Attach access token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Auto-refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        // No refresh token, redirect to login
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        // Try to refresh
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'}/auth/refresh`,
          { refreshToken }
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;

        // Update tokens
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', newRefreshToken);

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

**Test:**
1. Login as customer
2. Open browser DevTools → Application → Local Storage
3. Edit `access_token` to garbage value (simulate expiration)
4. Navigate to dashboard or make any API call
5. Should automatically refresh token and load data (no logout)
6. Check Local Storage → Both tokens should be new values

**Acceptance Criteria:**
- [ ] Axios intercepts 401 responses
- [ ] Automatically calls `/auth/refresh` with refreshToken
- [ ] Updates both tokens in localStorage
- [ ] Retries original request with new accessToken
- [ ] User stays logged in seamlessly (no redirect to login)
- [ ] If refresh fails, clears storage and redirects to /login

---

## Iteration 2 Complete! ✅

**What You Can Test:**
- ✅ Complete login flow from browser
- ✅ See personalized dashboard with saldo
- ✅ Logout and login again
- ✅ Test error cases (wrong password, invalid RUT, account lockout)
- ✅ **NEW:** Stay logged in automatically (refresh token rotation)
- ✅ **NEW:** Access token expires but user stays logged in

**Production Readiness Checklist:**
- [x] Argon2id password hashing (OWASP #1 recommendation)
- [x] Zod v4 input validation (prevents injection)
- [x] JWT refresh token rotation (security best practice)
- [x] Account lockout after 5 failed attempts
- [x] Pino logging for all auth events
- [x] Chilean RUT validation with Modulus 11
- [x] Mobile-first design (44px touch targets)

---

### Nota sobre almacenamiento de tokens (seguridad)

- Opción actual (MVP): `localStorage` para `access_token` y `refresh_token`.
  - Ventajas: simple, funciona bien con SPA.
  - Riesgo: susceptible a XSS. Mitigar con CSP estricta, sanitización y evitar `dangerouslySetInnerHTML`.
- Alternativa (más segura): `refresh_token` en cookie httpOnly + `access_token` en memoria.
  - Requiere cambios de backend (cookies sameSite/secure) y manejo de CORS.
- Recomendación: mantener `localStorage` en MVP con CSP; evaluar migración a cookies httpOnly en Fase 2.

**Next Iteration:**
Iteration 3 will add the complete customer dashboard with real data (boletas, payment history, balance details).

**Commit Message:**
```
feat: customer authentication with RUT login and auto-refresh

Backend (Fastify):
- POST /api/v1/auth/login endpoint
- POST /api/v1/auth/refresh endpoint (token rotation)
- RUT validation with Modulus 11 (Zod v4)
- Argon2id password hashing (not bcrypt)
- JWT generation with jose library
- Account lockout after 5 failed attempts (15 min)
- Refresh token rotation for security
- Pino logging for auth events

Frontend (Vite + React Router):
- Login page with RUT auto-formatting
- React Hook Form + Zod v4 validation
- Numeric keyboard on mobile (inputMode)
- Protected dashboard route
- Automatic token refresh on 401 (seamless)
- Token storage in localStorage
- Chilean peso formatting ($1.234.567)

🚀 Generated with Claude Code
```
