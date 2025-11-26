# ITERATION 1: Project Setup & Health Checks

**Goal:** Get both projects running locally with databases connected + migrate 355 existing customers

**Duration:** 2-3 days (setup) + 2 days (data migration) = 4-5 days total

**You'll Be Able To:** Visit the frontend and backend in browser, see they're alive, verify 355 customers migrated

---

## ⚠️ Critical External Dependency: Infobip WhatsApp Verification

**Timeline:** 1-3 business days for WhatsApp Business verification

**Action Required:** Start Infobip account setup + WhatsApp sender verification **on Day 1** of this iteration.

**Why:** WhatsApp verification is required for Iteration 7 (Password Setup). Starting this immediately prevents timeline blockers.

**Steps to Start NOW:**
1. Sign up at [infobip.com](https://www.infobip.com)
2. Navigate to dashboard → Add WhatsApp channel
3. Submit business verification documents (company registration, tax ID)
4. Wait 1-3 business days for Infobip approval
5. Once approved, get your sender number (`INFOBIP_WHATSAPP_SENDER`)
6. Save your API key for later use in Iteration 7

**Fallback Plan:** If verification is delayed beyond Iteration 7, you can still proceed with manual WhatsApp link sharing (copy-paste links). This is less efficient but unblocks development.

**Cost:** Free to verify. ~$0.005 per WhatsApp message sent (355 customers = ~$1.77 one-time cost).

---

## Backend Tasks (Day 1-2)

### Task 1.1: Initialize Backend Project
**Time:** 2 hours

```bash
cd coab-backend
npm init -y

# Install production dependencies (see TECH_STACK.md for versions)
npm install fastify @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/multipart @fastify/static
npm install @prisma/client @supabase/supabase-js
npm install zod@^4.0.0 @node-rs/argon2 jose
npm install pino pino-http @sentry/node

# Install dev dependencies
npm install -D typescript @types/node prisma
npm install -D tsx pino-pretty vitest

# Initialize TypeScript
npx tsc --init
```

**Update `package.json` scripts:**
```json
{
  "name": "coab-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "prisma migrate dev",
    "studio": "prisma studio",
    "test": "vitest"
  }
}
```

**Create Files:**
1. `src/index.ts` - Entry point
2. `src/app.ts` - Fastify app
3. `src/config/env.ts` - Environment config with Zod validation
4. `.env` - Environment variables (copy from TECH_STACK.md `.env.example`)

**Critical Setup in `src/app.ts`:**
```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import pino from 'pino';

// Fix BigInt JSON serialization globally
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

const app = Fastify({
  logger: pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined
  })
});

// Security
await app.register(helmet);
await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:5173',
  credentials: true
});

// Rate limiting
await app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes'
});

// Multipart (for PDF uploads later)
await app.register(multipart);

// Health check endpoint (REQUIRED for Railway)
app.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

export default app;
```

**Create `src/index.ts`:**
```typescript
import app from './app.js';

const PORT = Number(process.env.PORT) || 3000;

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening on ${address}`);
});
```

**Test:**
```bash
npm run dev
# Visit http://localhost:3000/health
# Should see: {"status":"ok","timestamp":"..."}
```

---

### Task 1.2: Setup Supabase Project & Connect Prisma
**Time:** 2 hours

**Step 1: Create Supabase Project**
1. Go to https://supabase.com/dashboard
2. Create new project: `coab-platform-dev`
3. Wait for project to provision (~2 minutes)
4. Go to Project Settings → Database
5. Copy **Connection Pooling** string (with `:6543` port - this is pgBouncer)
6. Copy **Direct Connection** string (with `:5432` port - for migrations)

**Step 2: Create `.env` file**
```bash
# Copy from TECH_STACK.md `.env.example`
# CRITICAL: Use connection pooling URL for DATABASE_URL
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres"

SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"

JWT_SECRET="generate-with-openssl-rand-base64-32"
```

⚠️ **CRITICAL:** Missing `connection_limit=1` will cause Railway crashes later!

**Step 3: Initialize Prisma**
```bash
npx prisma init
```

**Step 4: Update `prisma/schema.prisma`:**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Pooled connection
  directUrl = env("DIRECT_URL")         // Direct for migrations
}
```

**Step 5: Create Initial Schema Migration**

See TECH_STACK.md "Data Migration Plan" section for complete schema. For now, create basic structure:

```bash
npx prisma migrate dev --name init_schema
```

**Create:** `prisma/schema.prisma` (Spanish-named schema):

```prisma
model Cliente {
  id                    BigInt    @id @default(autoincrement())
  rut                   String    @unique @db.VarChar(12)
  nombre_completo       String    @db.VarChar(200)
  email                 String?   @db.VarChar(255)
  telefono              String?   @db.VarChar(20)
  direccion             String?   @db.Text
  numero_cliente        String?   @unique @db.VarChar(50)
  saldo_actual          Int       @default(0)
  estado_cuenta         String    @default("AL_DIA")

  // Auth fields (NULL until password setup)
  hash_contrasena       String?   @db.Text
  primer_login          Boolean   @default(true)
  ultimo_inicio_sesion  DateTime?
  cuenta_bloqueada      Boolean   @default(false)
  intentos_fallidos     Int       @default(0)
  bloqueada_hasta       DateTime?

  creado_en             DateTime  @default(now())
  actualizado_en        DateTime  @updatedAt

  // Relations
  boletas               Boleta[]
  tokens                TokenConfiguracion[]
  sesiones              SesionRefresh[]

  @@map("clientes")
}

model TokenConfiguracion {
  id           BigInt    @id @default(autoincrement())
  cliente_id   BigInt
  token        String    @unique
  tipo         String    @default("setup") // 'setup' or 'reset'
  usado        Boolean   @default(false)
  expira_en    DateTime
  creado_en    DateTime  @default(now())
  usado_en     DateTime?
  ip_creacion  String?
  ip_uso       String?

  cliente      Cliente   @relation(fields: [cliente_id], references: [id], onDelete: Cascade)

  @@index([cliente_id])
  @@index([token], map: "idx_token_unused", where: { usado: false })
  @@map("tokens_configuracion")
}

model SesionRefresh {
  id            BigInt    @id @default(autoincrement())
  cliente_id    BigInt?
  tipo_usuario  String    // 'cliente' or 'admin'
  token_hash    String    @db.Text
  expira_en     DateTime
  creado_en     DateTime  @default(now())
  ultimo_uso    DateTime?
  ip_address    String?
  user_agent    String?

  cliente       Cliente?  @relation(fields: [cliente_id], references: [id], onDelete: Cascade)

  @@index([cliente_id])
  @@index([token_hash])
  @@map("sesiones_refresh")
}

model Boleta {
  id                BigInt    @id @default(autoincrement())
  cliente_id        BigInt
  periodo           String    @db.VarChar(7)  // "2024-01"
  monto_total       Int
  monto_pendiente   Int
  fecha_vencimiento DateTime
  estado_pago       String    @default("PENDIENTE")
  url_pdf           String?   @db.Text
  creado_en         DateTime  @default(now())

  cliente           Cliente   @relation(fields: [cliente_id], references: [id], onDelete: Cascade)

  @@unique([cliente_id, periodo])
  @@index([cliente_id])
  @@map("boletas")
}
```

**Test:**
```bash
npx prisma migrate dev --name init_schema
npx prisma studio
# Open browser to http://localhost:5555
# Verify you see all tables: clientes, tokens_configuracion, sesiones_refresh, boletas
```

**Recommended Database Indexes (performance):**

```sql
-- Clientes
CREATE INDEX IF NOT EXISTS idx_clientes_rut ON clientes (rut);
CREATE INDEX IF NOT EXISTS idx_clientes_numero_cliente ON clientes (numero_cliente);

-- Boletas
CREATE INDEX IF NOT EXISTS idx_boletas_cliente_periodo ON boletas (cliente_id, periodo);

-- Transacciones de pago (si aplica en tu esquema)
-- CREATE INDEX IF NOT EXISTS idx_transacciones_cliente_fecha ON transacciones_pago (cliente_id, fecha);
```

**Acceptance Criteria:**
- [ ] Backend server starts on port 3000
- [ ] `/health` endpoint returns 200 OK
- [ ] Prisma connects to Supabase successfully
- [ ] `prisma studio` shows all tables (old + new)
- [ ] Migration created auth fields and tables

---

## Frontend Tasks (Day 2-3)

### Task 1.3: Initialize Frontend Project
**Time:** 2 hours

```bash
cd coab-frontend

# Create Vite project with React + TypeScript
npm create vite@latest . -- --template react-ts

# Install dependencies (see TECH_STACK.md for versions)
npm install

# Install routing and state management
npm install react-router@^7.8.2 @tanstack/react-query@^5.84.1

# Install forms and validation
npm install react-hook-form zod@^4.0.0

# Install utilities
npm install axios date-fns

# Install Tailwind CSS v4
npm install -D tailwindcss@^4.0.0 @tailwindcss/vite@^4.0.0

# Install dev tools
npm install -D @vitejs/plugin-react vitest

# Initialize shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card input label form toast
```

**Update `vite.config.ts`:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,  // Vite default
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
```

**Create `.env`:**
```bash
VITE_API_URL=http://localhost:3000/api/v1
```

**Update `tailwind.config.ts` with Chilean colors:**
```typescript
export default {
  theme: {
    extend: {
      colors: {
        'primary-blue': '#0066CC',
        'accent-green': '#00AA44',
        'text-dark': '#333333'
      }
    }
  }
};
```

**Create Files:**
1. `src/lib/api.ts` - Axios client with interceptors
2. `src/lib/utils.ts` - RUT validation helpers
3. `src/main.tsx` - Entry point with React Router

**Test:**
```bash
npm run dev
# Visit http://localhost:5173
# Should see Vite + React default page
```

---

### Task 1.4: Test API Connection from Frontend
**Time:** 1 hour

**Create:** `src/lib/api.ts` (Axios client)

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor (will add JWT later in Iteration 2)
apiClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default apiClient;
```

**Create:** `src/App.tsx` (Test health check)

```typescript
import { useEffect, useState } from 'react';
import apiClient from './lib/api';

function App() {
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    apiClient.get('/health')
      .then(res => setHealth(res.data))
      .catch(err => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-primary-blue">
          COAB Platform
        </h1>
        <p className="text-gray-600 mb-8">
          Portal de Clientes - Sistema de Agua Potable
        </p>
        {health && (
          <div className="text-green-600 text-lg font-semibold">
            ✅ Backend Conectado: {health.status}
          </div>
        )}
        {error && (
          <div className="text-red-600 text-lg font-semibold">
            ❌ Error: {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
```

**Test:**
1. Start backend: `cd coab-backend && npm run dev`
2. Start frontend: `cd coab-frontend && npm run dev`
3. Visit http://localhost:5173
4. Should see "✅ Backend Conectado: ok"

**Acceptance Criteria:**
- [ ] Frontend starts on port 5173 (Vite default)
- [ ] Frontend can call backend `/health` endpoint
- [ ] No CORS errors in browser console
- [ ] Green checkmark shows backend is connected

---

## Data Migration Tasks (Days 3-5)

### Task 1.5: Migrate 355 Existing Customers
**Time:** 4-6 hours

**See TECH_STACK.md "Data Migration Plan" for complete details.**

**Step 1: Export existing customer data to CSV**
- Export from current system: RUT, nombre, email, telefono, direccion, numero_cliente, saldo

**Step 2: Create migration script**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as csv from 'csv-parser';

const prisma = new PrismaClient();

async function main() {
  const customers: any[] = [];

  // Read CSV
  fs.createReadStream('data/clientes.csv')
    .pipe(csv())
    .on('data', (row) => customers.push(row))
    .on('end', async () => {
      console.log(`Migrating ${customers.length} customers...`);

      for (const customer of customers) {
        await prisma.cliente.create({
          data: {
            rut: customer.rut,
            nombre_completo: customer.nombre,
            email: customer.email || null,
            telefono: customer.telefono,
            direccion: customer.direccion,
            numero_cliente: customer.numero_cliente,
            saldo_actual: parseFloat(customer.saldo || '0'),
            estado_cuenta: parseFloat(customer.saldo) > 0 ? 'MOROSO' : 'AL_DIA',
            // No password yet
            hash_contrasena: null,
            primer_login: true
          }
        });
      }

      console.log('✅ Migration complete!');
    });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Step 3: Run migration**
```bash
npx tsx prisma/seed.ts
```

**Step 4: Verify in Supabase Studio**
```bash
npx prisma studio
# Verify 355 customers imported
# Check RUT format is correct (XX.XXX.XXX-X)
# Verify no duplicates
```

---

### Task 1.6: Data Integrity Verification
**Time:** 2 hours

**Run SQL queries in Supabase Studio:**

```sql
-- 1. Verify customer count
SELECT COUNT(*) FROM clientes;
-- Expected: 355

-- 2. Verify all RUTs are valid format
SELECT rut FROM clientes WHERE rut !~ '^\d{1,2}\.\d{3}\.\d{3}-[0-9Kk]$';
-- Expected: 0 results

-- 3. Verify all customers have unique RUT
SELECT rut, COUNT(*) FROM clientes GROUP BY rut HAVING COUNT(*) > 1;
-- Expected: 0 results

-- 4. Check saldo_actual distribution
SELECT
  COUNT(*) FILTER (WHERE saldo_actual = 0) as al_dia,
  COUNT(*) FILTER (WHERE saldo_actual > 0) as morosos,
  SUM(saldo_actual) as deuda_total
FROM clientes;
```

**Acceptance Criteria:**
- [ ] 355 customers migrated successfully
- [ ] All RUTs in correct format (XX.XXX.XXX-X)
- [ ] No duplicate RUTs
- [ ] `hash_contrasena` is NULL for all (passwords set in Iteration 7)
- [ ] `saldo_actual` matches expected amounts

---

## Iteration 1 Complete! ✅

**What You Can Test:**
- ✅ Backend Fastify server running on http://localhost:3000/health
- ✅ Frontend Vite server running on http://localhost:5173
- ✅ Frontend connecting to backend (green checkmark)
- ✅ Prisma Studio showing all tables with 355 customers
- ✅ Supabase connection pooling configured correctly

**Production Readiness Checklist:**
- [x] Supabase project created with connection pooling
- [x] `.env` file has `connection_limit=1` (prevents Railway crashes)
- [x] Health check endpoint working (required for Railway)
- [x] Prisma schema uses Spanish names (clientes, boletas, etc.)
- [x] 355 existing customers migrated
- [x] BigInt JSON serialization fixed globally

**Next Iteration:**
Iteration 2 will add customer authentication (RUT + password login) with JWT refresh tokens.

**Commit Message:**
```
feat: initial project setup with data migration

Backend:
- Fastify v5 with Pino logging
- Prisma v6 connected to Supabase (connection pooling)
- Health check endpoint for Railway
- Spanish-named database schema

Frontend:
- Vite v7 + React 18 + TypeScript
- Tailwind CSS v4 with Chilean theme colors
- Axios API client with interceptors
- shadcn/ui components initialized

Data:
- 355 existing customers migrated from CSV
- Data integrity verification passed
- All customers pending password setup (Iteration 7)

🚀 Generated with Claude Code
```
