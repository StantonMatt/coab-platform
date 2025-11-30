# ITERATION 3: Customer Dashboard with Real Data

**Goal:** Customer sees real balance, payment history, boletas, and service notifications from database

**You'll Be Able To:** View your actual account data and critical service interruption alerts in the browser

**Prerequisites:**
- Iteration 1 complete (database schema includes `NotificacionSistema`, `Boleta`, `TransaccionPago` tables)
- Iteration 2 complete (authentication working)

---

## Backend Tasks

### Task 3.1: Customer Service & APIs

**Create:**
1. `src/services/customer.service.ts` - Business logic for balance, pagos, boletas
2. `src/schemas/customer.schema.ts` - Zod validation schemas
3. `src/routes/customer.routes.ts` - Fastify routes

**Implementation:** [See PRD API Specifications - Customer Endpoints]

**Endpoints to implement:**
- `GET /api/v1/clientes/me` - Profile
- `GET /api/v1/clientes/me/saldo` - Balance
- `GET /api/v1/clientes/me/pagos` - Payment history (paginated)
- `GET /api/v1/clientes/me/boletas` - Boletas (paginated)
- `GET /api/v1/clientes/me/boletas/:id` - Boleta detail

**Create `src/middleware/auth.middleware.ts`:**

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

**Create `src/services/customer.service.ts`:**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getCustomerProfile(clienteId: bigint) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      rut: true,
      nombre_completo: true,
      email: true,
      telefono: true,
      direccion: true,
      saldo_actual: true,
      estado_cuenta: true,
      primer_login: true
    }
  });

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  return cliente;
}

export async function getCustomerBalance(clienteId: bigint) {
  // Calculate balance from unpaid boletas
  const result = await prisma.boleta.aggregate({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente'
    },
    _sum: {
      monto_total: true
    }
  });

  const saldo = result._sum.monto_total || 0;

  // Get earliest due date
  const nextBoleta = await prisma.boleta.findFirst({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente'
    },
    orderBy: {
      fecha_vencimiento: 'asc'
    },
    select: {
      fecha_vencimiento: true
    }
  });

  return {
    saldo: Number(saldo),
    saldoFormateado: new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(Number(saldo)),
    fechaVencimiento: nextBoleta?.fecha_vencimiento || null,
    estadoCuenta: Number(saldo) > 0 ? 'MOROSO' : 'AL_DIA'
  };
}

export async function getCustomerPayments(clienteId: bigint, limit = 50, cursor?: string) {
  const payments = await prisma.transaccionPago.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { fecha_pago: 'desc' }
  });

  const hasNextPage = payments.length > limit;
  const data = hasNextPage ? payments.slice(0, -1) : payments;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  return {
    data,
    pagination: {
      hasNextPage,
      nextCursor
    }
  };
}

export async function getCustomerBoletas(clienteId: bigint, limit = 50, cursor?: string) {
  const boletas = await prisma.boleta.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { fecha_emision: 'desc' }
  });

  const hasNextPage = boletas.length > limit;
  const data = hasNextPage ? boletas.slice(0, -1) : boletas;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  return {
    data,
    pagination: {
      hasNextPage,
      nextCursor
    }
  };
}

export async function getBoletaById(clienteId: bigint, boletaId: bigint) {
  const boleta = await prisma.boleta.findFirst({
    where: {
      id: boletaId,
      cliente_id: clienteId  // Security: ensure customer owns this boleta
    }
  });

  if (!boleta) {
    throw new Error('Boleta no encontrada');
  }

  return boleta;
}

export async function getActiveNotifications() {
  const now = new Date();

  const notifications = await prisma.notificacionSistema.findMany({
    where: {
      activo: true,
      desde: { lte: now },
      hasta: { gte: now }
    },
    orderBy: {
      creado_en: 'desc'
    },
    select: {
      id: true,
      mensaje: true,
      tipo: true, // 'info' | 'warning' | 'critical'
      desde: true,
      hasta: true
    }
  });

  return notifications;
}
```

**Create `src/schemas/customer.schema.ts`:**

```typescript
import { z } from 'zod';

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional()
});

export const boletaIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID debe ser numérico')
});
```

**Create `src/routes/customer.routes.ts`:**

```typescript
import { FastifyPluginAsync } from 'fastify';
import { paginationSchema, boletaIdSchema } from '../schemas/customer.schema.js';
import * as customerService from '../services/customer.service.js';
import { requireCliente } from '../middleware/auth.middleware.js';

const customerRoutes: FastifyPluginAsync = async (fastify) => {
  // Public: Service notifications (no auth required)
  fastify.get('/notificaciones', async (request, reply) => {
    const notifications = await customerService.getActiveNotifications();
    return { data: notifications };
  });

  // Protected routes - require cliente auth
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('onRequest', requireCliente);

    // GET /clientes/me
    protectedRoutes.get('/me', async (request, reply) => {
      const clienteId = request.user!.userId;
      const cliente = await customerService.getCustomerProfile(clienteId);
      return cliente;
    });

    // GET /clientes/me/saldo
    protectedRoutes.get('/me/saldo', async (request, reply) => {
      const clienteId = request.user!.userId;
      const balance = await customerService.getCustomerBalance(clienteId);
      return balance;
    });

    // GET /clientes/me/pagos
    protectedRoutes.get('/me/pagos', async (request, reply) => {
      try {
        const query = paginationSchema.parse(request.query);
        const clienteId = request.user!.userId;
        const result = await customerService.getCustomerPayments(
          clienteId,
          query.limit,
          query.cursor
        );
        return result;
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message }
          });
        }
        throw error;
      }
    });

    // GET /clientes/me/boletas
    protectedRoutes.get('/me/boletas', async (request, reply) => {
      try {
        const query = paginationSchema.parse(request.query);
        const clienteId = request.user!.userId;
        const result = await customerService.getCustomerBoletas(
          clienteId,
          query.limit,
          query.cursor
        );
        return result;
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message }
          });
        }
        throw error;
      }
    });

    // GET /clientes/me/boletas/:id
    protectedRoutes.get('/me/boletas/:id', async (request, reply) => {
      try {
        const params = boletaIdSchema.parse(request.params);
        const clienteId = request.user!.userId;
        const boleta = await customerService.getBoletaById(clienteId, BigInt(params.id));
        return boleta;
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return reply.code(400).send({
            error: { code: 'VALIDATION_ERROR', message: error.errors[0].message }
          });
        }
        if (error.message === 'Boleta no encontrada') {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: error.message }
          });
        }
        throw error;
      }
    });
  });
};

export default customerRoutes;
```

**Wire Up in Main App:**
```typescript
// src/app.ts
import customerRoutes from './routes/customer.routes.js';

await app.register(customerRoutes, { prefix: '/api/v1/clientes' });
```

**Test with cURL (with JWT):**
```bash
# Get token from login first
TOKEN="eyJ..."

curl -X GET http://localhost:3000/api/v1/clientes/me/saldo \
  -H "Authorization: Bearer $TOKEN"

# Should return:
# {
#   "saldo": 45670,
#   "saldoFormateado": "$45.670",
#   "fechaVencimiento": "2025-10-15",
#   "estadoCuenta": "MOROSO"
# }

# Test public notifications (no auth)
curl -X GET http://localhost:3000/api/v1/clientes/notificaciones
```

**Acceptance Criteria:**
- [ ] All endpoints require valid JWT (except /notificaciones)
- [ ] `requireCliente` middleware blocks admin tokens
- [ ] Balance calculates from pending boletas
- [ ] Pagination works correctly with cursor
- [ ] Customer can only see their own data (validated by cliente_id from JWT)
- [ ] Notifications endpoint is public (no JWT required)

---

### Task 3.2: Service Interruption Notifications

**Why This Matters:** Customers get angry when water is shut off without warning. This simple feature prevents 90% of "why is my water off?" support calls.

**Note:** The `NotificacionSistema` table is already defined in Iteration 1 schema.

**Create Sample Notification (via Prisma Studio or SQL):**

```sql
-- Example notification (admin creates via admin panel in Iteration 5)
INSERT INTO notificaciones_sistema (mensaje, tipo, activo, desde, hasta, creado_en)
VALUES (
  '🚨 Corte programado: Martes 15/10 de 09:00 a 14:00 hrs. Sector Centro.',
  'warning',
  true,
  '2025-10-14 00:00:00',
  '2025-10-15 23:59:59',
  NOW()
);
```

**Why Public Endpoint?** Anonymous users visiting the site should see service interruptions even before logging in.

**Acceptance Criteria:**
- [ ] Endpoint returns active notifications (within desde/hasta time range)
- [ ] Notifications ordered by created_at descending
- [ ] Endpoint is public (no JWT required)
- [ ] Returns empty array when no active notifications

---

## Frontend Tasks

### Task 3.3: Complete Dashboard with TanStack Query

**Create:** `src/lib/utils.ts` (Re-exports from shared package + shadcn helper)

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui helper
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Re-export Chilean utilities from shared package
export {
  formatearPesos,
  formatearNumero,
  formatearRUT,
  validarRUT,
  limpiarRUT,
  formatearFecha,
  formatearFechaCorta,
  formatearFechaLarga,
  formatearPeriodo,
  FORMATOS_FECHA
} from '@coab/utils';
```

**Update:** `src/pages/Dashboard.tsx`

```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Notification {
  id: string;
  mensaje: string;
  tipo: 'info' | 'warning' | 'critical';
  desde: string;
  hasta: string;
}

interface Pago {
  id: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string;
}

interface Boleta {
  id: string;
  periodo: string;
  monto_total: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  estado: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  // Fetch balance
  const { data: saldo, isLoading: saldoLoading } = useQuery({
    queryKey: ['saldo'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/saldo');
      return res.data;
    },
  });

  // Fetch recent payments
  const { data: pagosData } = useQuery({
    queryKey: ['pagos'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/pagos?limit=5');
      return res.data;
    },
  });

  // Fetch recent boletas
  const { data: boletasData } = useQuery({
    queryKey: ['boletas'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/boletas?limit=5');
      return res.data;
    },
  });

  // Fetch active notifications (public endpoint)
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/notificaciones');
      return res.data;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary-blue">COAB</h1>
          <Button variant="ghost" onClick={handleLogout} className="h-10">
            Salir
          </Button>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-md mx-auto">
        {/* Service Interruption Notifications */}
        {notificationsData?.data?.map((notif: Notification) => (
          <div
            key={notif.id}
            className={`p-4 rounded-lg border-l-4 ${
              notif.tipo === 'critical'
                ? 'bg-red-50 border-red-500 text-red-900'
                : notif.tipo === 'warning'
                ? 'bg-yellow-50 border-warning-orange text-yellow-900'
                : 'bg-blue-50 border-primary-blue text-blue-900'
            }`}
          >
            <p className="font-medium">{notif.mensaje}</p>
            <p className="text-sm mt-1 opacity-75">
              Hasta: {format(new Date(notif.hasta), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
            </p>
          </div>
        ))}

        {/* Greeting */}
        <div className="text-lg font-medium">
          Hola, {user.nombre?.split(' ')[0] || 'Cliente'}
        </div>

        {/* Balance Card */}
        <Card className="bg-primary-blue text-white">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm opacity-90">Saldo Actual</p>
              <p className="text-3xl font-bold mt-2">
                {saldoLoading ? '...' : formatearPesos(Number(saldo?.saldo || 0))}
              </p>
              {saldo?.fechaVencimiento && (
                <p className="text-sm mt-2 opacity-90">
                  Vence: {format(new Date(saldo.fechaVencimiento), 'dd/MM/yyyy')}
                </p>
              )}
              <p className="text-sm mt-1 opacity-75">
                {saldo?.estadoCuenta === 'MOROSO' ? 'Pendiente de pago' : 'Al día ✓'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Últimos Pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pagosData?.data?.length === 0 && (
              <p className="text-center text-gray-500 py-4">No hay pagos registrados</p>
            )}
            {pagosData?.data?.map((pago: Pago) => (
              <div key={pago.id} className="flex justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium">{formatearPesos(Number(pago.monto))}</p>
                  <p className="text-sm text-gray-600">
                    {format(new Date(pago.fecha_pago), 'dd/MM/yyyy')}
                  </p>
                </div>
                <p className="text-sm text-gray-500 capitalize">{pago.metodo_pago}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Boletas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Mis Boletas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {boletasData?.data?.length === 0 && (
              <p className="text-center text-gray-500 py-4">No hay boletas</p>
            )}
            {boletasData?.data?.map((boleta: Boleta) => (
              <div
                key={boleta.id}
                className="flex justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                onClick={() => navigate(`/boletas/${boleta.id}`)}
              >
                <div>
                  <p className="font-medium">
                    {format(new Date(boleta.fecha_emision), 'MMMM yyyy', { locale: es })}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatearPesos(Number(boleta.monto_total))}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded self-center ${
                    boleta.estado === 'pendiente'
                      ? 'bg-warning-orange text-white'
                      : 'bg-accent-green text-white'
                  }`}
                >
                  {boleta.estado === 'pendiente' ? 'Pendiente' : 'Pagada'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Balance shows real data from database
- [ ] Payment history shows last 5 payments
- [ ] Boletas show last 5 bills with status badges
- [ ] Service notifications appear at top when active
- [ ] Notification styling matches type (critical=red, warning=orange, info=blue)
- [ ] Data refreshes on component mount
- [ ] Loading states show while fetching
- [ ] BigInt IDs converted to strings for display
- [ ] Chilean date format (dd/MM/yyyy)
- [ ] Chilean currency format ($1.234.567)

---

### Task 3.4: Boleta Detail Page

**Create:** `src/pages/BoletaDetail.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import apiClient from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';

export default function BoletaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: boleta, isLoading, error } = useQuery({
    queryKey: ['boleta', id],
    queryFn: async () => {
      const res = await apiClient.get(`/clientes/me/boletas/${id}`);
      return res.data;
    },
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  if (error || !boleta) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-red-600">Boleta no encontrada</p>
        <Button onClick={() => navigate('/dashboard')}>Volver</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-md mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Detalle Boleta</h1>
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>
                {format(new Date(boleta.fecha_emision), 'MMMM yyyy', { locale: es })}
              </span>
              <span
                className={`text-sm px-3 py-1 rounded ${
                  boleta.estado === 'pendiente'
                    ? 'bg-warning-orange text-white'
                    : 'bg-accent-green text-white'
                }`}
              >
                {boleta.estado === 'pendiente' ? 'Pendiente' : 'Pagada'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Fecha Emisión</p>
                <p className="font-medium">
                  {format(new Date(boleta.fecha_emision), 'dd/MM/yyyy')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Vencimiento</p>
                <p className="font-medium">
                  {format(new Date(boleta.fecha_vencimiento), 'dd/MM/yyyy')}
                </p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="border-t pt-4 space-y-2">
              {boleta.consumo_agua && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Consumo de Agua</span>
                  <span>{formatearPesos(Number(boleta.consumo_agua))}</span>
                </div>
              )}
              {boleta.cargo_alcantarillado && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Alcantarillado</span>
                  <span>{formatearPesos(Number(boleta.cargo_alcantarillado))}</span>
                </div>
              )}
              {boleta.cargo_fijo && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Cargo Fijo</span>
                  <span>{formatearPesos(Number(boleta.cargo_fijo))}</span>
                </div>
              )}
              {boleta.subtotal && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatearPesos(Number(boleta.subtotal))}</span>
                </div>
              )}
              {boleta.iva && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>IVA (19%)</span>
                  <span>{formatearPesos(Number(boleta.iva))}</span>
                </div>
              )}
              
              {/* Total */}
              <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                <span>Total</span>
                <span>{formatearPesos(Number(boleta.monto_total))}</span>
              </div>
            </div>

            {/* Payment date if paid */}
            {boleta.fecha_pago && (
              <div className="bg-accent-green/10 text-accent-green p-3 rounded-lg text-center">
                Pagada el {format(new Date(boleta.fecha_pago), 'dd/MM/yyyy')}
              </div>
            )}

            {/* Notes if any */}
            {boleta.notas && (
              <div className="bg-gray-100 p-3 rounded-lg">
                <p className="text-sm text-gray-600">Notas:</p>
                <p className="text-sm mt-1">{boleta.notas}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

**Update Router in `src/main.tsx`:**
```typescript
import BoletaDetailPage from './pages/BoletaDetail';

// Add to routes
<Route path="/boletas/:id" element={<BoletaDetailPage />} />
```

**Acceptance Criteria:**
- [ ] Shows boleta breakdown (agua, alcantarillado, IVA, etc.)
- [ ] Shows period and due date
- [ ] Shows payment date if paid
- [ ] Shows partial payment notes if any
- [ ] Back button returns to dashboard
- [ ] Loading state while fetching
- [ ] Error state if boleta not found
- [ ] Chilean date format
- [ ] Chilean currency format

---

## Iteration 3 Complete! ✅

**What You Can Test:**
- Login and see real balance from database
- View real payment history
- View real boletas with status badges
- Click boleta to see detailed breakdown
- Service interruption notifications appear when active
- All data is from your actual Supabase database

**Commit Message:**
```
feat: customer dashboard with real data + service notifications

Backend (Fastify + Zod):
- GET /clientes/me (customer profile)
- GET /clientes/me/saldo (balance calculation from boletas)
- GET /clientes/me/pagos (paginated payment history)
- GET /clientes/me/boletas (paginated boletas)
- GET /clientes/me/boletas/:id (boleta detail with breakdown)
- GET /clientes/notificaciones (active service interruptions - public)
- requireCliente middleware for protected routes
- Zod validation for pagination params

Frontend (Vite + React Router + TanStack Query):
- Dashboard with balance card and real data
- Service interruption banners (critical/warning/info styling)
- Payment history list with formatting
- Boletas list with status badges (pendiente/pagada)
- Boleta detail page with full breakdown
- Auto-refetch notifications every 5 minutes
- Chilean date/currency formatting

🚀 Generated with Claude Code
```
