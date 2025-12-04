# ITERATION 5: Admin Customer Search

**Goal:** Admin can search customers by RUT, name, or address with performant text search

**You'll Be Able To:** Search and find customers quickly in the browser

**Prerequisites:**
- Iteration 1 complete (trigram indexes created for text search)
- Iteration 4 complete (admin authentication working)

---

## Backend Tasks

### Task 5.1: Admin Search & Profile APIs

**Update:** `src/services/admin.service.ts`

Add search and profile methods with optimized text search:

```typescript
// src/services/admin.service.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Search customers by RUT, name, or address
 * Uses trigram indexes for fuzzy text matching (created in Iteration 1)
 */
export async function searchCustomers(query: string, limit = 50, cursor?: string) {
  // Sanitize query (remove special regex chars)
  const sanitizedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const customers = await prisma.cliente.findMany({
    where: {
      es_cliente_actual: true,
      OR: [
        { rut: { contains: sanitizedQuery, mode: 'insensitive' } },
        { nombre_completo: { contains: sanitizedQuery, mode: 'insensitive' } },
        { direccion: { contains: sanitizedQuery, mode: 'insensitive' } },
        { numero_cliente: { contains: sanitizedQuery, mode: 'insensitive' } }
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
      estado_cuenta: true,
      cuenta_bloqueada: true
    }
  });

  const hasNextPage = customers.length > limit;
  const data = hasNextPage ? customers.slice(0, -1) : customers;
  const nextCursor = hasNextPage ? data[data.length - 1].id.toString() : null;

  return {
    data,
    pagination: {
      hasNextPage,
      nextCursor,
      total: data.length
    }
  };
}

/**
 * Get full customer profile for admin view
 */
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
      numero_cliente: true,
      saldo_actual: true,
      estado_cuenta: true,
      cuenta_bloqueada: true,
      intentos_fallidos: true,
      bloqueada_hasta: true,
      primer_login: true,
      hash_contrasena: true, // To check if password set
      ultimo_inicio_sesion: true,
      creado_en: true
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

  const saldoReal = Number(result._sum.monto_total || 0);

  return {
    ...customer,
    saldo_actual: saldoReal,
    estado_cuenta: saldoReal > 0 ? 'MOROSO' : 'AL_DIA',
    tiene_contrasena: !!customer.hash_contrasena,
    // Remove hash from response
    hash_contrasena: undefined
  };
}

/**
 * Get customer payment history (admin view)
 */
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
    pagination: { hasNextPage, nextCursor }
  };
}

/**
 * Get customer boletas (admin view)
 */
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
    pagination: { hasNextPage, nextCursor }
  };
}
```

**Create:** `src/schemas/admin.schema.ts`

```typescript
import { z } from 'zod';

export const searchSchema = z.object({
  q: z.string()
    .min(2, 'Búsqueda debe tener al menos 2 caracteres')
    .max(100, 'Búsqueda muy larga'),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional()
});

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional()
});

export const customerIdSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID debe ser numérico')
});
```

**Update:** `src/routes/admin.routes.ts`

Add search and profile routes:

```typescript
// src/routes/admin.routes.ts
import { FastifyPluginAsync } from 'fastify';
import { searchSchema, paginationSchema, customerIdSchema } from '../schemas/admin.schema.js';
import * as adminService from '../services/admin.service.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

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
      const params = customerIdSchema.parse(request.params);
      const customer = await adminService.getCustomerProfile(BigInt(params.id));
      return customer;
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.errors[0].message }
        });
      }
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
      const params = customerIdSchema.parse(request.params);
      const query = paginationSchema.parse(request.query);

      const result = await adminService.getCustomerPayments(
        BigInt(params.id),
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

  // GET /admin/clientes/:id/boletas
  fastify.get('/clientes/:id/boletas', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);
      const query = paginationSchema.parse(request.query);

      const result = await adminService.getCustomerBoletas(
        BigInt(params.id),
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

  // POST /admin/clientes/:id/desbloquear (from Iteration 4)
  fastify.post('/clientes/:id/desbloquear', async (request, reply) => {
    try {
      const params = customerIdSchema.parse(request.params);
      const result = await adminService.unlockCustomerAccount(
        BigInt(params.id),
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

**Test:**
```bash
# Get admin token first
TOKEN="eyJ..."

# Search by name
curl -X GET "http://localhost:3000/api/v1/admin/clientes?q=juan" \
  -H "Authorization: Bearer $TOKEN"

# Search by RUT (partial)
curl -X GET "http://localhost:3000/api/v1/admin/clientes?q=12345" \
  -H "Authorization: Bearer $TOKEN"

# Get customer profile
curl -X GET "http://localhost:3000/api/v1/admin/clientes/123" \
  -H "Authorization: Bearer $TOKEN"
```

**Acceptance Criteria:**
- [ ] Search works across RUT, names, address, numero_cliente
- [ ] Minimum 2 characters required for search
- [ ] Search is case-insensitive
- [ ] Returns customers with calculated saldo
- [ ] Admin can view any customer profile
- [ ] Pagination works with cursor-based approach
- [ ] Zod validation for search parameters
- [ ] Only active customers returned (`es_cliente_actual = true`)

---

## Frontend Tasks

### Task 5.2: Admin Search Page

**Create:** `src/pages/admin/Customers.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import adminApiClient from '@/lib/adminApi';
import { formatearRUT, formatearPesos } from '@coab/utils';
import { Search, ArrowLeft, Lock } from 'lucide-react';

interface Customer {
  id: string;
  rut: string;
  nombre_completo: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  saldo_actual: number;
  estado_cuenta: string;
  cuenta_bloqueada: boolean;
}

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

  const { data: customersData, isLoading, error } = useQuery({
    queryKey: ['admin-customers', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return { data: [], pagination: { hasNextPage: false, nextCursor: null } };
      }
      const res = await adminApiClient.get(`/admin/clientes?q=${encodeURIComponent(debouncedQuery)}`);
      return res.data;
    },
    enabled: debouncedQuery.length >= 2
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin/dashboard')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Buscar Clientes</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Search Input */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Buscar por RUT, nombre, dirección o N° cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-lg"
                autoFocus
              />
            </div>
            {searchQuery.length > 0 && searchQuery.length < 2 && (
              <p className="text-sm text-gray-500 mt-2">Ingrese al menos 2 caracteres</p>
            )}
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading && debouncedQuery.length >= 2 && (
          <div className="text-center py-8 text-gray-500">
            Buscando...
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-8 text-red-500">
            Error al buscar clientes
          </div>
        )}

        {/* No Results */}
        {!isLoading && debouncedQuery.length >= 2 && customersData?.data.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No se encontraron resultados para "{debouncedQuery}"
          </div>
        )}

        {/* Results Table */}
        {customersData?.data.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="p-3 text-left text-sm font-medium text-gray-600">RUT</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-600">Nombre</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Dirección</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-600 hidden lg:table-cell">Teléfono</th>
                      <th className="p-3 text-right text-sm font-medium text-gray-600">Saldo</th>
                      <th className="p-3 text-center text-sm font-medium text-gray-600">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customersData.data.map((customer: Customer) => (
                      <tr
                        key={customer.id}
                        className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/clientes/${customer.id}`)}
                      >
                        <td className="p-3 font-mono text-sm">
                          <div className="flex items-center gap-2">
                            {formatearRUT(customer.rut)}
                            {customer.cuenta_bloqueada && (
                              <Lock className="h-4 w-4 text-red-500" title="Cuenta bloqueada" />
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-medium">{customer.nombre_completo}</td>
                        <td className="p-3 text-sm text-gray-600 hidden md:table-cell">
                          {customer.direccion || '-'}
                        </td>
                        <td className="p-3 text-sm hidden lg:table-cell">
                          {customer.telefono || '-'}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatearPesos(Number(customer.saldo_actual))}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              customer.estado_cuenta === 'AL_DIA'
                                ? 'bg-accent-green text-white'
                                : 'bg-warning-orange text-white'
                            }`}
                          >
                            {customer.estado_cuenta === 'AL_DIA' ? 'Al día' : 'Moroso'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination info */}
              {customersData.pagination.hasNextPage && (
                <div className="p-4 text-center text-sm text-gray-500">
                  Mostrando {customersData.data.length} resultados. Refine su búsqueda para ver más.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
```

### Task 5.3: Customer Profile Page

**Create:** `src/pages/admin/CustomerProfile.tsx`

```typescript
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import adminApiClient from '@/lib/adminApi';
import { formatearRUT, formatearPesos } from '@coab/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Lock, Unlock, Send, CreditCard } from 'lucide-react';

interface Customer {
  id: string;
  rut: string;
  nombre_completo: string;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  numero_cliente: string | null;
  saldo_actual: number;
  estado_cuenta: string;
  cuenta_bloqueada: boolean;
  intentos_fallidos: number;
  bloqueada_hasta: string | null;
  tiene_contrasena: boolean;
  primer_login: boolean;
  ultimo_inicio_sesion: string | null;
  creado_en: string;
}

interface Pago {
  id: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string;
  operador: string | null;
  referencia_externa: string | null;
}

interface Boleta {
  id: string;
  periodo: string;
  monto_total: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  estado: string;
}

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch customer profile
  const { data: customer, isLoading } = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}`);
      return res.data as Customer;
    },
    enabled: !!id
  });

  // Fetch payments
  const { data: paymentsData } = useQuery({
    queryKey: ['admin-customer-payments', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}/pagos?limit=20`);
      return res.data;
    },
    enabled: !!id
  });

  // Fetch boletas
  const { data: boletasData } = useQuery({
    queryKey: ['admin-customer-boletas', id],
    queryFn: async () => {
      const res = await adminApiClient.get(`/admin/clientes/${id}/boletas?limit=20`);
      return res.data;
    },
    enabled: !!id
  });

  // Unlock account mutation
  const unlockMutation = useMutation({
    mutationFn: async () => {
      const res = await adminApiClient.post(`/admin/clientes/${id}/desbloquear`);
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: 'Cuenta desbloqueada',
        description: 'El cliente puede iniciar sesión nuevamente'
      });
      queryClient.invalidateQueries({ queryKey: ['admin-customer', id] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error?.message || 'Error al desbloquear cuenta'
      });
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Cargando...
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-red-600">Cliente no encontrado</p>
        <Button onClick={() => navigate('/admin/clientes')}>Volver</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin/clientes')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{customer.nombre_completo}</h1>
            <p className="text-sm text-gray-600 font-mono">{formatearRUT(customer.rut)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Customer Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Información del Cliente</span>
              <span
                className={`px-3 py-1 rounded text-sm ${
                  customer.estado_cuenta === 'AL_DIA'
                    ? 'bg-accent-green text-white'
                    : 'bg-warning-orange text-white'
                }`}
              >
                {customer.estado_cuenta === 'AL_DIA' ? 'Al día' : 'Moroso'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-600">N° Cliente</p>
                <p className="font-medium">{customer.numero_cliente || '-'}</p>
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
                <p className="font-medium text-xl">
                  {formatearPesos(Number(customer.saldo_actual))}
                </p>
              </div>
            </div>

            {customer.direccion && (
              <div className="mt-4">
                <p className="text-sm text-gray-600">Dirección</p>
                <p className="font-medium">{customer.direccion}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => navigate(`/admin/clientes/${id}/pago`)}>
                <CreditCard className="h-4 w-4 mr-2" />
                Registrar Pago
              </Button>

              {!customer.tiene_contrasena && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/admin/clientes/${id}/setup-link`)}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Link Configuración
                </Button>
              )}

              {customer.cuenta_bloqueada && (
                <Button
                  variant="destructive"
                  onClick={() => unlockMutation.mutate()}
                  disabled={unlockMutation.isPending}
                >
                  <Unlock className="h-4 w-4 mr-2" />
                  {unlockMutation.isPending ? 'Desbloqueando...' : 'Desbloquear Cuenta'}
                </Button>
              )}
            </div>

            {/* Account Status Warnings */}
            {customer.cuenta_bloqueada && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
                <Lock className="h-5 w-5" />
                <div>
                  <p className="font-medium">Cuenta Bloqueada</p>
                  <p className="text-sm">
                    {customer.bloqueada_hasta
                      ? `Bloqueada hasta: ${format(new Date(customer.bloqueada_hasta), "d 'de' MMMM 'a las' HH:mm", { locale: es })}`
                      : `Intentos fallidos: ${customer.intentos_fallidos}`
                    }
                  </p>
                </div>
              </div>
            )}

            {!customer.tiene_contrasena && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
                <p className="font-medium">Sin contraseña configurada</p>
                <p className="text-sm">El cliente aún no ha configurado su contraseña</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="boletas">
          <TabsList>
            <TabsTrigger value="boletas">Boletas</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
            <TabsTrigger value="info">Más Info</TabsTrigger>
          </TabsList>

          <TabsContent value="boletas" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {boletasData?.data.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No hay boletas registradas
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium text-gray-600">Período</th>
                        <th className="p-3 text-left text-sm font-medium text-gray-600">Vencimiento</th>
                        <th className="p-3 text-right text-sm font-medium text-gray-600">Monto</th>
                        <th className="p-3 text-center text-sm font-medium text-gray-600">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boletasData?.data.map((boleta: Boleta) => (
                        <tr key={boleta.id} className="border-b">
                          <td className="p-3">
                            {format(new Date(boleta.fecha_emision), 'MMMM yyyy', { locale: es })}
                          </td>
                          <td className="p-3">
                            {format(new Date(boleta.fecha_vencimiento), 'dd/MM/yyyy')}
                          </td>
                          <td className="p-3 text-right font-medium">
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
                              {boleta.estado === 'pendiente' ? 'Pendiente' : 'Pagada'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagos" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {paymentsData?.data.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No hay pagos registrados
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium text-gray-600">Fecha</th>
                        <th className="p-3 text-left text-sm font-medium text-gray-600">Método</th>
                        <th className="p-3 text-right text-sm font-medium text-gray-600">Monto</th>
                        <th className="p-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">Operador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsData?.data.map((pago: Pago) => (
                        <tr key={pago.id} className="border-b">
                          <td className="p-3">
                            {format(new Date(pago.fecha_pago), 'dd/MM/yyyy HH:mm')}
                          </td>
                          <td className="p-3 capitalize">{pago.metodo_pago}</td>
                          <td className="p-3 text-right font-medium">
                            {formatearPesos(Number(pago.monto))}
                          </td>
                          <td className="p-3 text-sm text-gray-600 hidden md:table-cell">
                            {pago.operador || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Contraseña Configurada</p>
                    <p className="font-medium">{customer.tiene_contrasena ? 'Sí' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Primer Login Pendiente</p>
                    <p className="font-medium">{customer.primer_login ? 'Sí' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Último Inicio de Sesión</p>
                    <p className="font-medium">
                      {customer.ultimo_inicio_sesion
                        ? format(new Date(customer.ultimo_inicio_sesion), "d 'de' MMMM 'a las' HH:mm", { locale: es })
                        : 'Nunca'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Cliente Desde</p>
                    <p className="font-medium">
                      {format(new Date(customer.creado_en), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
```

**Update Router in `src/main.tsx`:**

```typescript
import CustomersPage from './pages/admin/Customers';
import CustomerProfilePage from './pages/admin/CustomerProfile';

// Add to routes
<Route path="/admin/clientes" element={<CustomersPage />} />
<Route path="/admin/clientes/:id" element={<CustomerProfilePage />} />
```

**Test:**
1. Login as admin
2. Navigate to `/admin/clientes`
3. Search for "juan"
4. See results table
5. Click customer → See profile with tabs

**Acceptance Criteria:**
- [ ] Search debounced (300ms)
- [ ] Minimum 2 characters required
- [ ] Results show RUT, name, address, saldo, estado
- [ ] Locked accounts show lock icon
- [ ] Empty state shows if no results
- [ ] Customer profile shows all info
- [ ] Tabs switch content correctly
- [ ] Action buttons show conditionally:
  - "Registrar Pago" - always shown
  - "Enviar Link Configuración" - only if no password
  - "Desbloquear Cuenta" - only if account locked
- [ ] Account unlock works and refreshes data

---

## Iteration 5 Complete! ✅

**What You Can Test:**
- Admin search across 355 real customers
- Search by RUT (partial), name, address, numero_cliente
- View any customer's full profile
- See customer balance, boletas, payments in tabbed interface
- Conditional UI (setup button, unlock button)
- Unlock locked customer accounts