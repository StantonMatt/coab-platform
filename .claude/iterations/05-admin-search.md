# ITERATION 5: Admin Customer Search

**Goal:** Admin can search customers by RUT, name, or address

**Duration:** 2-3 days

**You'll Be Able To:** Search and find customers in browser

---

## Backend Tasks (Day 1)

### Task 5.1: Admin Search & Profile APIs
**Time:** 3 hours

**Update:** `src/services/admin.service.ts`

Add search and profile methods:

```typescript
// src/services/admin.service.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function searchCustomers(query: string, limit = 50, cursor?: string) {
  const customers = await prisma.cliente.findMany({
    where: {
      OR: [
        { rut: { contains: query, mode: 'insensitive' } },
        { nombre_completo: { contains: query, mode: 'insensitive' } },
        { direccion: { contains: query, mode: 'insensitive' } }
      ]
    },
    take: limit + 1,
    cursor: cursor ? { id: BigInt(cursor) } : undefined,
    orderBy: { nombre_completo: 'asc' },
    select: {
      id: true,
      rut: true,
      nombre_completo: true,
      direccion: true,
      telefono: true,
      email: true,
      saldo_actual: true,
      estado_cuenta: true
    }
  });

  const hasNextPage = customers.length > limit;
  const data = hasNextPage ? customers.slice(0, -1) : customers;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  return {
    data,
    pagination: {
      hasNextPage,
      nextCursor
    }
  };
}

export async function getCustomerProfile(clienteId: bigint) {
  const customer = await prisma.cliente.findUnique({
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
      cuenta_bloqueada: true,
      primer_login: true,
      hash_contrasena: true
    }
  });

  if (!customer) {
    throw new Error('Cliente no encontrado');
  }

  // Calculate real-time balance from pending boletas
  const result = await prisma.boleta.aggregate({
    where: {
      cliente_id: clienteId,
      estado: 'pendiente'
    },
    _sum: {
      monto_total: true
    }
  });

  const saldoReal = Number(result._sum.monto_total || BigInt(0));

  return {
    ...customer,
    saldo_actual: saldoReal,
    estado_cuenta: saldoReal > 0 ? 'MOROSO' : 'AL_DIA',
    tiene_contrasena: !!customer.hash_contrasena
  };
}
```

**Create:** `src/routes/admin.routes.ts`

Update with search and profile routes:

```typescript
// src/routes/admin.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as adminService from '../services/admin.service.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const searchSchema = z.object({
  q: z.string().min(1, 'Query requerido'),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional()
});

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply admin auth middleware to all routes
  fastify.addHook('onRequest', requireAdmin);

  // GET /admin/clientes?q=...
  fastify.get('/clientes', async (request, reply) => {
    try {
      const query = searchSchema.parse(request.query);
      const result = await adminService.searchCustomers(
        query.q,
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

  // GET /admin/clientes/:id
  fastify.get('/clientes/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const customer = await adminService.getCustomerProfile(BigInt(id));
      return customer;
    } catch (error: any) {
      if (error.message === 'Cliente no encontrado') {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
  });

  // GET /admin/clientes/:id/pagos
  fastify.get('/clientes/:id/pagos', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { limit = 50, cursor } = request.query as { limit?: number; cursor?: string };

      const payments = await prisma.transaccion_pago.findMany({
        where: { cliente_id: BigInt(id) },
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
    } catch (error: any) {
      throw error;
    }
  });

  // GET /admin/clientes/:id/boletas
  fastify.get('/clientes/:id/boletas', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { limit = 50, cursor } = request.query as { limit?: number; cursor?: string };

      const boletas = await prisma.boleta.findMany({
        where: { cliente_id: BigInt(id) },
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
    } catch (error: any) {
      throw error;
    }
  });
};

export default adminRoutes;
```

**Test:**
```bash
# Get admin token first
TOKEN="eyJ..."

curl -X GET "http://localhost:3000/api/v1/admin/clientes?q=juan" \
  -H "Authorization: Bearer $TOKEN"

# Get customer profile
curl -X GET "http://localhost:3000/api/v1/admin/clientes/123" \
  -H "Authorization: Bearer $TOKEN"
```

**Acceptance Criteria:**
- [ ] Search works across RUT, names, address
- [ ] Returns customers with calculated saldo
- [ ] Admin can view any customer profile
- [ ] Pagination works with cursor-based approach
- [ ] Zod validation for search parameters

---

## Frontend Tasks (Day 2-3)

### Task 5.2: Admin Search Page
**Time:** 4 hours

**Create:** `src/pages/admin/Customers.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import apiClient from '@/lib/api';
import { formatearRut, formatearPesos } from '@/lib/utils';

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const navigate = useNavigate();

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: customersData, isLoading } = useQuery({
    queryKey: ['admin-customers', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return { data: [], pagination: { hasNextPage: false, nextCursor: null } };
      }
      const res = await apiClient.get(`/admin/clientes?q=${debouncedQuery}`);
      return res.data;
    },
    enabled: debouncedQuery.length >= 2
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Buscar Clientes</h1>

        <Card>
          <CardHeader>
            <CardTitle>Búsqueda</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Buscar por RUT, nombre o dirección..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </CardContent>
        </Card>

        {isLoading && (
          <p className="text-center text-gray-500">Buscando...</p>
        )}

        {!isLoading && debouncedQuery.length >= 2 && customersData?.data.length === 0 && (
          <p className="text-center text-gray-500">No se encontraron resultados</p>
        )}

        {customersData?.data.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 text-left">RUT</th>
                      <th className="p-3 text-left">Nombre</th>
                      <th className="p-3 text-left">Dirección</th>
                      <th className="p-3 text-left">Teléfono</th>
                      <th className="p-3 text-right">Saldo</th>
                      <th className="p-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customersData.data.map((customer: any) => (
                      <tr
                        key={customer.id.toString()}
                        className="border-t hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate(`/admin/clientes/${customer.id}`)}
                      >
                        <td className="p-3">{formatearRut(customer.rut)}</td>
                        <td className="p-3">{customer.nombre_completo}</td>
                        <td className="p-3 text-sm text-gray-600">{customer.direccion || '-'}</td>
                        <td className="p-3 text-sm">{customer.telefono || '-'}</td>
                        <td className="p-3 text-right font-medium">
                          {formatearPesos(Number(customer.saldo_actual))}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              customer.estado_cuenta === 'AL_DIA'
                                ? 'bg-accent-green text-white'
                                : 'bg-warning-orange text-white'
                            }`}
                          >
                            {customer.estado_cuenta}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
```

### Task 5.3: Customer Profile Page
**Time:** 3 hours

**Create:** `src/pages/admin/CustomerProfile.tsx`

```typescript
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/api';
import { formatearRut, formatearPesos } from '@/lib/utils';
import { format } from 'date-fns';

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();

  const { data: customer, isLoading } = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/clientes/${id}`);
      return res.data;
    },
    enabled: !!id
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['admin-customer-payments', id],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/clientes/${id}/pagos?limit=20`);
      return res.data;
    },
    enabled: !!id
  });

  const { data: boletasData } = useQuery({
    queryKey: ['admin-customer-boletas', id],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/clientes/${id}/boletas?limit=20`);
      return res.data;
    },
    enabled: !!id
  });

  if (isLoading) {
    return <div className="p-4">Cargando...</div>;
  }

  if (!customer) {
    return <div className="p-4">Cliente no encontrado</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle>{customer.nombre_completo}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">RUT</p>
                <p className="font-medium">{formatearRut(customer.rut)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Teléfono</p>
                <p className="font-medium">{customer.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{customer.email || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Saldo</p>
                <p className="font-medium text-lg">
                  {formatearPesos(Number(customer.saldo_actual))}
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button>Registrar Pago</Button>
              {!customer.tiene_contrasena && (
                <Button variant="outline">Enviar Link Configuración</Button>
              )}
              {customer.cuenta_bloqueada && (
                <Button variant="destructive">Desbloquear Cuenta</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="boletas">Boletas</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Dirección</p>
                    <p>{customer.direccion || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Estado de Cuenta</p>
                    <p>{customer.estado_cuenta}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Contraseña Configurada</p>
                    <p>{customer.tiene_contrasena ? 'Sí' : 'No'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="boletas">
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 text-left">Período</th>
                      <th className="p-3 text-left">Vencimiento</th>
                      <th className="p-3 text-right">Monto</th>
                      <th className="p-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boletasData?.data.map((boleta: any) => (
                      <tr key={boleta.id.toString()} className="border-t">
                        <td className="p-3">
                          {format(new Date(boleta.fecha_emision), 'MM/yyyy')}
                        </td>
                        <td className="p-3">
                          {format(new Date(boleta.fecha_vencimiento), 'dd/MM/yyyy')}
                        </td>
                        <td className="p-3 text-right">
                          {formatearPesos(Number(boleta.monto_total))}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              boleta.estado === 'pendiente'
                                ? 'bg-warning-orange text-white'
                                : 'bg-accent-green text-white'
                            }`}
                          >
                            {boleta.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagos">
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 text-left">Fecha</th>
                      <th className="p-3 text-left">Tipo</th>
                      <th className="p-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsData?.data.map((pago: any) => (
                      <tr key={pago.id.toString()} className="border-t">
                        <td className="p-3">
                          {format(new Date(pago.fecha_pago), 'dd/MM/yyyy')}
                        </td>
                        <td className="p-3">{pago.metodo_pago}</td>
                        <td className="p-3 text-right">
                          {formatearPesos(Number(pago.monto))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

**Update Router:**
```typescript
// src/main.tsx or App.tsx
import Customers from './pages/admin/Customers';
import CustomerProfile from './pages/admin/CustomerProfile';

const router = createBrowserRouter([
  {
    path: '/admin/clientes',
    element: <Customers />
  },
  {
    path: '/admin/clientes/:id',
    element: <CustomerProfile />
  }
]);
```

**Test:**
1. Login as admin
2. Navigate to `/admin/clientes`
3. Search for "juan"
4. See results table
5. Click customer → See profile with tabs

**Acceptance Criteria:**
- [ ] Search debounced (300ms)
- [ ] Keyboard navigation works (↑↓ arrows work with table rows)
- [ ] Empty state shows if no results
- [ ] Customer profile shows all info
- [ ] Tabs switch content correctly
- [ ] Buttons show conditionally (setup link only if no password)

---

## Iteration 5 Complete! ✅

**What You Can Test:**
- Admin search across 355 real customers
- View any customer's full profile
- See customer balance, boletas, payments in tabbed interface
- Conditional UI (setup button, unlock button)

**Commit Message:**
```
feat: admin customer search and profiles

Backend (Fastify + Zod):
- Customer search API (RUT, name, address)
- Admin customer profile endpoints
- Paginated results with cursor-based pagination
- Zod validation for search parameters

Frontend (Vite + React Router):
- Admin search page with 300ms debouncing
- Customer profile view with tabs
- Tabbed interface for customer data (Info, Boletas, Pagos)
- Conditional button rendering
```
