# ITERATION 3: Customer Dashboard with Real Data

**Goal:** Customer sees real balance, payment history, boletas, and service notifications from database

**Duration:** 3-4 days (+4 hours for service notifications)

**You'll Be Able To:** View your actual account data and critical service interruption alerts in the browser

---

## Backend Tasks (Day 1-2)

### Task 3.1: Customer Service & APIs
**Time:** 4 hours

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

**Customer Service Example:**
```typescript
// src/services/customer.service.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  const saldo = result._sum.monto_total || BigInt(0);

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
    estadoCuenta: saldo > 0 ? 'MOROSO' : 'AL_DIA'
  };
}

export async function getCustomerPayments(clienteId: bigint, limit = 50, cursor?: string) {
  const payments = await prisma.transaccion_pago.findMany({
    where: { cliente_id: clienteId },
    take: limit + 1,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { fecha_pago: 'desc' },
    include: {
      cliente: {
        select: {
          nombre_completo: true,
          rut: true
        }
      }
    }
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
```

**Fastify Routes:**
```typescript
// src/routes/customer.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as customerService from '../services/customer.service.js';
import { requireCliente } from '../middleware/auth.middleware.js';

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional()
});

const customerRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth middleware to all routes
  fastify.addHook('onRequest', requireCliente);

  // GET /clientes/me
  fastify.get('/me', async (request, reply) => {
    const clienteId = request.user!.userId;
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
        estado_cuenta: true
      }
    });
    return cliente;
  });

  // GET /clientes/me/saldo
  fastify.get('/me/saldo', async (request, reply) => {
    const clienteId = request.user!.userId;
    const balance = await customerService.getCustomerBalance(clienteId);
    return balance;
  });

  // GET /clientes/me/pagos
  fastify.get('/me/pagos', async (request, reply) => {
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
  fastify.get('/me/boletas', async (request, reply) => {
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
  fastify.get('/me/boletas/:id', async (request, reply) => {
    try {
      const clienteId = request.user!.userId;
      const { id } = request.params as { id: string };
      const boleta = await customerService.getBoletaById(clienteId, BigInt(id));
      return boleta;
    } catch (error: any) {
      if (error.message === 'Boleta no encontrada') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
  });
};

export default customerRoutes;
```

**Wire Up in Main App:**
```typescript
// src/index.ts
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
```

**Acceptance Criteria:**
- [ ] All endpoints require valid JWT
- [ ] `requireCliente` middleware blocks admin tokens
- [ ] Balance calculates from pending boletas
- [ ] Pagination works correctly
- [ ] Customer can only see their own data (validated by cliente_id from JWT)

---

### Task 3.1.5: Service Interruption Notifications (NEW)
**Time:** 4 hours

**Why This Matters:** Customers get angry when water is shut off without warning. This simple feature prevents 90% of "why is my water off?" support calls.

**Database Schema Addition:**

The `notificacion_sistema` table already exists in the schema. We just need to populate it.

```sql
-- Example notification (admin creates via admin panel in Iteration 5)
INSERT INTO notificacion_sistema (mensaje, tipo, activo, desde, hasta, created_at)
VALUES (
  '🚨 Corte programado: Martes 15/10 de 09:00 a 14:00 hrs. Sector Centro.',
  'warning',
  true,
  '2025-10-14 00:00:00',
  '2025-10-15 23:59:59',
  NOW()
);
```

**Backend Service:**

Add to `src/services/customer.service.ts`:

```typescript
export async function getActiveNotifications() {
  const now = new Date();

  const notifications = await prisma.notificacion_sistema.findMany({
    where: {
      activo: true,
      desde: { lte: now },
      hasta: { gte: now }
    },
    orderBy: {
      created_at: 'desc'
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

**Backend Route:**

Add to `src/routes/customer.routes.ts`:

```typescript
// GET /clientes/notificaciones (public - no auth required)
fastify.get('/notificaciones', async (request, reply) => {
  const notifications = await customerService.getActiveNotifications();
  return { data: notifications };
});
```

**Why Public?** Anonymous users visiting the site should see service interruptions even before logging in.

**Wire Up Route:**

```typescript
// src/index.ts - register BEFORE auth routes
await app.register(customerRoutes, { prefix: '/api/v1/clientes' });
```

**Test with cURL:**

```bash
curl -X GET http://localhost:3000/api/v1/clientes/notificaciones

# Should return:
# {
#   "data": [
#     {
#       "id": "1",
#       "mensaje": "🚨 Corte programado: Martes 15/10 de 09:00 a 14:00 hrs.",
#       "tipo": "warning",
#       "desde": "2025-10-14T00:00:00.000Z",
#       "hasta": "2025-10-15T23:59:59.000Z"
#     }
#   ]
# }
```

**Acceptance Criteria:**
- [ ] Endpoint returns active notifications (dentro, hasta within current time)
- [ ] Notifications ordered by created_at descending
- [ ] Endpoint is public (no JWT required)
- [ ] Returns empty array when no active notifications

---

## Frontend Tasks (Day 2-3)

### Task 3.2: Complete Dashboard with TanStack Query
**Time:** 4 hours

**Create:** `src/pages/Dashboard.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import apiClient from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatearPesos } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DashboardPage() {
  const navigate = useNavigate();

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
    queryKey: ['pagos', 1],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/pagos?limit=5');
      return res.data;
    },
  });

  // Fetch recent boletas
  const { data: boletasData } = useQuery({
    queryKey: ['boletas', 1],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/me/boletas?limit=5');
      return res.data;
    },
  });

  // Fetch active notifications (NEW)
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get('/clientes/notificaciones');
      return res.data;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4 space-y-4">
      {/* Service Interruption Notifications (NEW) */}
      {notificationsData?.data.map((notif: any) => (
        <div
          key={notif.id.toString()}
          className={`p-4 rounded-lg border-l-4 ${
            notif.tipo === 'critical'
              ? 'bg-red-50 border-red-500 text-red-900'
              : notif.tipo === 'warning'
              ? 'bg-yellow-50 border-yellow-500 text-yellow-900'
              : 'bg-blue-50 border-blue-500 text-blue-900'
          }`}
        >
          <p className="font-medium">{notif.mensaje}</p>
          <p className="text-sm mt-1 opacity-75">
            Hasta: {format(new Date(notif.hasta), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
          </p>
        </div>
      ))}

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
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Pagos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pagosData?.data.map((pago: any) => (
            <div key={pago.id.toString()} className="flex justify-between py-2 border-b">
              <div>
                <p className="font-medium">{formatearPesos(Number(pago.monto))}</p>
                <p className="text-sm text-gray-600">
                  {format(new Date(pago.fecha_pago), 'dd/MM/yyyy')}
                </p>
              </div>
              <p className="text-sm text-gray-500">{pago.metodo_pago}</p>
            </div>
          ))}
          {pagosData?.data.length === 0 && (
            <p className="text-center text-gray-500">No hay pagos registrados</p>
          )}
        </CardContent>
      </Card>

      {/* Boletas */}
      <Card>
        <CardHeader>
          <CardTitle>Mis Boletas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {boletasData?.data.map((boleta: any) => (
            <div
              key={boleta.id.toString()}
              className="flex justify-between py-2 border-b cursor-pointer hover:bg-gray-50"
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
                className={`text-sm px-2 py-1 rounded ${
                  boleta.estado === 'pendiente'
                    ? 'bg-warning-orange text-white'
                    : 'bg-accent-green text-white'
                }`}
              >
                {boleta.estado}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Update Router:**
```typescript
// src/main.tsx or App.tsx
import { createBrowserRouter, RouterProvider } from 'react-router';
import Dashboard from './pages/Dashboard';

const router = createBrowserRouter([
  {
    path: '/dashboard',
    element: <Dashboard />
  }
]);
```

**Test:**
1. Login as customer with real data
2. Should see actual balance from database
3. Should see real payment history
4. Should see real boletas

**Acceptance Criteria:**
- [ ] Balance shows real data from database
- [ ] Payment history shows last 5 payments
- [ ] Boletas show last 5 bills with status badges
- [ ] Data refreshes on component mount
- [ ] Loading states show while fetching
- [ ] BigInt IDs converted to strings for display

---

### Task 3.3: Boleta Detail Page
**Time:** 2 hours

**Create:** `src/pages/BoletaDetail.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router';
import apiClient from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatearPesos } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';

export default function BoletaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: boleta, isLoading } = useQuery({
    queryKey: ['boleta', id],
    queryFn: async () => {
      const res = await apiClient.get(`/clientes/me/boletas/${id}`);
      return res.data;
    },
    enabled: !!id
  });

  if (isLoading) {
    return <div className="p-4">Cargando...</div>;
  }

  if (!boleta) {
    return <div className="p-4">Boleta no encontrada</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 space-y-4">
      <Button
        variant="ghost"
        onClick={() => navigate('/dashboard')}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            Boleta {format(new Date(boleta.fecha_emision), 'MMMM yyyy', { locale: es })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Período</p>
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

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between">
              <span>Consumo de Agua</span>
              <span>{formatearPesos(Number(boleta.consumo_agua || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span>Alcantarillado</span>
              <span>{formatearPesos(Number(boleta.cargo_alcantarillado || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span>Cargo Fijo</span>
              <span>{formatearPesos(Number(boleta.cargo_fijo || 0))}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatearPesos(Number(boleta.subtotal || 0))}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>IVA (19%)</span>
              <span>{formatearPesos(Number(boleta.iva || 0))}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total</span>
              <span>{formatearPesos(Number(boleta.monto_total))}</span>
            </div>
          </div>

          <div className="flex justify-between items-center mt-4 p-3 bg-gray-100 rounded">
            <span className="font-medium">Estado</span>
            <span
              className={`px-3 py-1 rounded text-white ${
                boleta.estado === 'pendiente'
                  ? 'bg-warning-orange'
                  : 'bg-accent-green'
              }`}
            >
              {boleta.estado}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Update Router:**
```typescript
const router = createBrowserRouter([
  {
    path: '/boletas/:id',
    element: <BoletaDetail />
  }
]);
```

**Test:**
1. Click a boleta from dashboard
2. Should navigate to `/boletas/123`
3. Should show full breakdown (consumo, costos, total)

**Acceptance Criteria:**
- [ ] Shows boleta breakdown (agua, alcantarillado, IVA, etc.)
- [ ] Shows period and due date
- [ ] Back button returns to dashboard
- [ ] Loading state while fetching

---

## Iteration 3 Complete! ✅

**What You Can Test:**
- Login and see real balance
- View real payment history from database
- View real boletas with status
- Click boleta to see detailed breakdown
- All data is from your actual Supabase database

**Commit Message:**
```
feat: customer dashboard with real data + service notifications

Backend (Fastify + Zod):
- GET /clientes/me/saldo (balance calculation)
- GET /clientes/me/pagos (paginated payment history)
- GET /clientes/me/boletas (paginated boletas)
- GET /clientes/me/boletas/:id (boleta detail)
- GET /clientes/notificaciones (active service interruptions - public)
- Zod validation for pagination params
- Service notification logic (time-based filtering)

Frontend (Vite + React Router):
- Dashboard with balance card
- Service interruption banner (critical/warning/info styling)
- Payment history list
- Boletas list with status badges
- Boleta detail page with breakdown
- TanStack Query for data fetching and caching
- Auto-refetch notifications every 5 minutes
```
