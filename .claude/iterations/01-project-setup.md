# ITERATION 1: Project Setup & Health Checks

**Goal:** Get both projects running locally with databases connected + migrate 355 existing customers

**You'll Be Able To:** Visit the frontend and backend in browser, see they're alive, verify 355 customers migrated

---

## ⚠️ Critical External Dependency: Infobip WhatsApp Verification

**Action Required:** Start Infobip account setup + WhatsApp sender verification **on Day 1** of this iteration.

**Why:** WhatsApp verification is required for Iteration 7 (Password Setup). Starting this immediately prevents timeline blockers. Verification takes 1-3 business days.

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

## Monorepo Setup

### Task 1.0: Initialize Monorepo with Shared Utils Package

**Why Shared Package?** RUT validation, currency formatting, and date utilities are needed in both frontend and backend. A shared `@coab/utils` package ensures:
- Single source of truth (no code drift)
- Consistent Chilean RUT validation (Modulus 11)
- Type safety across the stack
- Easier testing (test utilities once)

**Step 1: Create Root `package.json` (monorepo workspace)**

```bash
# In project root (coab-platform2/)
```

Create `package.json`:
```json
{
  "name": "coab-platform",
  "version": "1.0.0",
  "private": true,
  "description": "COAB Platform - Chilean Water Utility Customer Portal & Admin Dashboard",
  "workspaces": [
    "packages/*",
    "coab-backend",
    "coab-frontend"
  ],
  "scripts": {
    "build:utils": "npm run build -w @coab/utils",
    "test:utils": "npm run test -w @coab/utils",
    "dev:backend": "npm run dev -w coab-backend",
    "dev:frontend": "npm run dev -w coab-frontend",
    "build": "npm run build -w @coab/utils && npm run build -w coab-backend && npm run build -w coab-frontend",
    "test": "npm run test --workspaces --if-present"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

**Step 2: Create Shared Utils Package**

```bash
mkdir -p packages/coab-utils/src
mkdir -p packages/coab-utils/tests
```

Create `packages/coab-utils/package.json`:
```json
{
  "name": "@coab/utils",
  "version": "1.0.0",
  "description": "Shared utilities for COAB Platform - Chilean RUT validation, currency formatting, dates",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "peerDependencies": {
    "date-fns": "^4.1.0"
  }
}
```

Create `packages/coab-utils/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create RUT Utilities** (`packages/coab-utils/src/rut.ts`)

```typescript
/**
 * Validates a Chilean RUT using Modulus 11 algorithm
 * @param rutStr - RUT in any format (with or without dots/dash)
 * @returns true if the RUT is valid
 */
export function validarRUT(rutStr: string): boolean {
  const cleaned = rutStr.replace(/[.\-\s]/g, '').toUpperCase();
  
  if (cleaned.length < 8 || cleaned.length > 9) return false;
  
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  
  if (!/^\d+$/.test(body)) return false;
  if (!/^[0-9K]$/.test(dv)) return false;
  
  let sum = 0;
  let multiplier = 2;
  
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const remainder = sum % 11;
  const expectedDV = 11 - remainder;
  const calculatedDV = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : String(expectedDV);
  
  return dv === calculatedDV;
}

/**
 * Formats a RUT with dots and dash (XX.XXX.XXX-X)
 */
export function formatearRUT(rut: string): string {
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (cleaned.length <= 1) return cleaned;
  
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return `${formatted}-${dv}`;
}

/**
 * Removes formatting from RUT (returns digits + K only)
 */
export function limpiarRUT(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}
```

**Step 4: Create Currency Utilities** (`packages/coab-utils/src/currency.ts`)

```typescript
/**
 * Formats a number as Chilean Pesos (CLP)
 * @param amount - Amount in CLP (integer)
 * @returns Formatted string like "$1.234.567"
 */
export function formatearPesos(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Formats a number with Chilean thousands separator (dot)
 */
export function formatearNumero(value: number): string {
  return new Intl.NumberFormat('es-CL').format(value);
}
```

**Step 5: Create Date Utilities** (`packages/coab-utils/src/dates.ts`)

```typescript
import { format as dateFnsFormat } from 'date-fns';
import { es } from 'date-fns/locale';

export const FORMATOS_FECHA = {
  CORTO: 'dd/MM/yyyy',
  LARGO: "d 'de' MMMM 'de' yyyy",
  CON_HORA: "d 'de' MMMM 'a las' HH:mm",
  MES_ANIO: 'MMMM yyyy',
} as const;

/**
 * Formats a date using Chilean locale (es-CL)
 */
export function formatearFecha(date: Date | string, formato: string = FORMATOS_FECHA.CORTO): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, formato, { locale: es });
}

export { es as localeES } from 'date-fns/locale';
```

> **Note:** The actual `@coab/utils` package includes additional convenience functions beyond this minimal implementation: `formatearFechaCorta()`, `formatearFechaLarga()`, `formatearFechaHora()`, and `formatearPeriodo()`. See `packages/coab-utils/src/dates.ts` for the complete implementation.

**Step 6: Create Index Export** (`packages/coab-utils/src/index.ts`)

```typescript
export { validarRUT, formatearRUT, limpiarRUT } from './rut.js';
export { formatearPesos, formatearNumero } from './currency.js';
export { formatearFecha, FORMATOS_FECHA, localeES } from './dates.js';
```

**Step 7: Build and Test**

```bash
# Install dependencies from root
npm install

# Build the shared package
npm run build:utils

# Run tests
npm run test:utils
```

**Acceptance Criteria:**
- [ ] Root `package.json` with workspaces configuration exists
- [ ] `packages/coab-utils/` package created with RUT, currency, date utilities
- [ ] `npm install` from root installs all workspaces
- [ ] `npm run build:utils` compiles TypeScript to `dist/`
- [ ] `npm run test:utils` passes all unit tests

---

## Backend Tasks

### Task 1.1: Initialize Backend Project

```bash
cd coab-backend
npm init -y

# Install production dependencies (see TECH_STACK.md for versions)
npm install fastify @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/multipart @fastify/static
npm install @prisma/client @supabase/supabase-js
npm install zod@^4.0.0 @node-rs/argon2 jose
npm install pino pino-http @sentry/node
npm install libphonenumber-js  # For phone validation
npm install date-fns  # Peer dependency for @coab/utils

# Install dev dependencies
npm install -D typescript @types/node prisma
npm install -D tsx pino-pretty vitest

# Initialize TypeScript
npx tsc --init
```

**Update `package.json` scripts and dependencies:**
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
    "migrate:deploy": "prisma migrate deploy",
    "studio": "prisma studio",
    "test": "vitest",
    "seed": "tsx prisma/seed.ts",
    "reconcile-balances": "tsx scripts/reconcile-balances.ts"
  },
  "dependencies": {
    "@coab/utils": "workspace:*"
  }
}
```

**Note:** The `@coab/utils` workspace dependency gives you access to shared Chilean utilities:
```typescript
// Import in any backend file
import { validarRUT, formatearRUT, formatearPesos } from '@coab/utils';
```

**Create Files:**
1. `src/index.ts` - Entry point
2. `src/app.ts` - Fastify app
3. `src/config/env.ts` - Environment config with Zod validation
4. `.env` - Environment variables (copy from `.env.example` below)

**Create `.env.example` (Complete for all iterations):**
```bash
# ===========================================
# COAB Platform - Environment Variables
# Copy to .env and fill in values
# ===========================================

# Core
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
TZ=America/Santiago

# Database (Supabase)
# CRITICAL: Use connection pooling URL with pgbouncer=true&connection_limit=1
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres"

# Supabase (for storage if needed later)
SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"

# Authentication
# Generate with: openssl rand -hex 32
JWT_SECRET="generate-with-openssl-rand-hex-32-minimum-64-chars"

# Frontend URL (for CORS and setup links)
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# HTTPS (production only)
FORCE_HTTPS=false

# Infobip WhatsApp (Iteration 7)
INFOBIP_API_KEY=
INFOBIP_BASE_URL=https://api.infobip.com
INFOBIP_WHATSAPP_SENDER=

# Error Tracking (Iteration 8)
SENTRY_DSN=
```

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

**Step 1: Create Supabase Project**
1. Go to https://supabase.com/dashboard
2. Create new project: `coab-platform-dev`
3. Wait for project to provision (~2 minutes)
4. Go to Project Settings → Database
5. Copy **Connection Pooling** string (with `:6543` port - this is pgBouncer)
6. Copy **Direct Connection** string (with `:5432` port - for migrations)

**Step 2: Create `.env` file**
```bash
# Copy from .env.example and fill in Supabase values
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

**Step 4: Update `prisma/schema.prisma` with COMPLETE schema:**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Pooled connection
  directUrl = env("DIRECT_URL")         // Direct for migrations
}

// ===========================================
// ENUMS (Type Safety)
// ===========================================
enum EstadoCuenta {
  AL_DIA
  MOROSO
}

enum EstadoBoleta {
  pendiente
  pagada
  parcial
}

enum MetodoPago {
  efectivo
  transferencia
  cheque
  webpay_plus
  caja_vecina
  paga_qui
}

enum EstadoTransaccion {
  pendiente
  completado
  rechazado
  reversado
}

enum TipoNotificacion {
  info
  warning
  critical
}

// ===========================================
// CLIENTE (Customer)
// =========================================== 
model Cliente {
  id                    BigInt    @id @default(autoincrement())
  rut                   String    @unique @db.VarChar(12)
  nombre_completo       String    @db.VarChar(200)
  email                 String?   @db.VarChar(255)
  telefono              String?   @db.VarChar(20)
  direccion             String?   @db.Text
  numero_cliente        String?   @unique @db.VarChar(50)
  saldo_actual          Int       @default(0)
  estado_cuenta         EstadoCuenta @default(AL_DIA)

  // Auth fields (NULL until password setup)
  hash_contrasena       String?   @db.Text
  primer_login          Boolean   @default(true)
  ultimo_inicio_sesion  DateTime?
  cuenta_bloqueada      Boolean   @default(false)
  intentos_fallidos     Int       @default(0)
  bloqueada_hasta       DateTime?

  // Status
  es_cliente_actual     Boolean   @default(true)

  creado_en             DateTime  @default(now())
  actualizado_en        DateTime  @updatedAt

  // Relations
  boletas               Boleta[]
  tokens                TokenConfiguracion[]
  sesiones              SesionRefresh[]
  pagos                 TransaccionPago[]

  @@index([rut])
  @@index([numero_cliente])
  @@map("clientes")
}

// ===========================================
// ADMINISTRADOR (Admin User)
// ===========================================
model Administrador {
  id                    BigInt    @id @default(autoincrement())
  email                 String    @unique @db.VarChar(255)
  nombre                String    @db.VarChar(200)
  hash_contrasena       String    @db.Text
  rol                   String    @default("billing_clerk") // billing_clerk, supervisor, admin
  
  // Auth
  cuenta_bloqueada      Boolean   @default(false)
  intentos_fallidos     Int       @default(0)
  bloqueada_hasta       DateTime?
  ultimo_inicio_sesion  DateTime?
  token_version         Int       @default(0)
  
  activo                Boolean   @default(true)
  creado_en             DateTime  @default(now())
  actualizado_en        DateTime  @updatedAt

  // Relations
  sesiones              SesionRefresh[]

  @@map("administradores")
}

// ===========================================
// TOKEN CONFIGURACION (Setup & Reset Tokens)
// ===========================================
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
  @@index([token])
  @@map("tokens_configuracion")
}

// ===========================================
// SESION REFRESH (Refresh Tokens)
// ===========================================
model SesionRefresh {
  id            BigInt    @id @default(autoincrement())
  cliente_id    BigInt?
  admin_id      BigInt?
  tipo_usuario  String    // 'cliente' or 'admin'
  token_hash    String    @db.Text
  expira_en     DateTime
  creado_en     DateTime  @default(now())
  ultimo_uso    DateTime?
  ip_address    String?
  user_agent    String?

  cliente       Cliente?       @relation(fields: [cliente_id], references: [id], onDelete: Cascade)
  admin         Administrador? @relation(fields: [admin_id], references: [id], onDelete: Cascade)

  @@index([cliente_id])
  @@index([admin_id])
  @@index([token_hash])
  @@map("sesiones_refresh")
}

// ===========================================
// BOLETA (Invoice/Bill)
// ===========================================
model Boleta {
  id                BigInt    @id @default(autoincrement())
  cliente_id        BigInt
  periodo           String    @db.VarChar(7)  // "2024-01"
  monto_total       Int
  monto_pendiente   Int
  fecha_emision     DateTime  @default(now())
  fecha_vencimiento DateTime
  fecha_pago        DateTime?
  estado            EstadoBoleta @default(pendiente)
  url_pdf           String?   @db.Text
  notas             String?   @db.Text  // For partial payment notes
  
  // Breakdown (optional, for detailed view)
  consumo_agua         Int?
  cargo_alcantarillado Int?
  cargo_fijo           Int?
  subtotal             Int?
  iva                  Int?

  creado_en         DateTime  @default(now())

  cliente           Cliente   @relation(fields: [cliente_id], references: [id], onDelete: Cascade)

  @@unique([cliente_id, periodo])
  @@index([cliente_id])
  @@index([cliente_id, estado])
  @@map("boletas")
}

// ===========================================
// TRANSACCION PAGO (Payment Transaction)
// ===========================================
model TransaccionPago {
  id                  BigInt   @id @default(autoincrement())
  cliente_id          BigInt
  monto               Int
  fecha_pago          DateTime @default(now())
  metodo_pago         MetodoPago
  estado_transaccion  EstadoTransaccion @default(completado)
  referencia_externa  String?  @db.VarChar(100)
  observaciones       String?  @db.Text
  operador            String?  @db.VarChar(255) // Admin email who registered
  
  creado_en           DateTime @default(now())
  
  cliente             Cliente  @relation(fields: [cliente_id], references: [id], onDelete: Cascade)

  @@index([cliente_id])
  @@index([cliente_id, fecha_pago])
  @@map("transacciones_pago")
}

// ===========================================
// LOG AUDITORIA (Audit Log)
// ===========================================
model LogAuditoria {
  id              BigInt   @id @default(autoincrement())
  accion          String   // REGISTRO_PAGO, DESBLOQUEO_CUENTA, etc.
  entidad         String   // transaccion_pago, cliente, etc.
  entidad_id      BigInt?
  usuario_tipo    String   // admin, cliente, system
  usuario_email   String?
  datos_anteriores Json?
  datos_nuevos    Json?
  ip_address      String?
  user_agent      String?
  creado_en       DateTime @default(now())

  @@index([accion])
  @@index([entidad, entidad_id])
  @@index([creado_en])
  @@map("logs_auditoria")
}

// ===========================================
// NOTIFICACION SISTEMA (System Notifications)
// ===========================================
model NotificacionSistema {
  id        BigInt   @id @default(autoincrement())
  mensaje   String   @db.Text
  tipo      TipoNotificacion @default(info)
  activo    Boolean  @default(true)
  desde     DateTime
  hasta     DateTime
  creado_en DateTime @default(now())

  @@index([activo, desde, hasta])
  @@map("notificaciones_sistema")
}
```

**Step 5: Create Initial Migration**

```bash
npx prisma migrate dev --name init_schema
```

**Step 6: Create Additional Indexes (Raw SQL Migration)**

Create `prisma/migrations/YYYYMMDDHHMMSS_add_performance_indexes/migration.sql`:

```sql
-- Filtered index for unused tokens (Prisma doesn't support WHERE clause in @@index)
CREATE INDEX IF NOT EXISTS idx_tokens_unused 
ON tokens_configuracion (token) 
WHERE usado = false;

-- Trigram indexes for text search (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_clientes_nombre_trgm 
ON clientes USING gin (nombre_completo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clientes_direccion_trgm 
ON clientes USING gin (direccion gin_trgm_ops);

-- RUT search index
CREATE INDEX IF NOT EXISTS idx_clientes_rut_trgm 
ON clientes USING gin (rut gin_trgm_ops);
```

Apply:
```bash
npx prisma migrate dev --name add_performance_indexes
```

**Test:**
```bash
npx prisma studio
# Open browser to http://localhost:5555
# Verify you see all tables: clientes, administradores, boletas, transacciones_pago, etc.
```

**Acceptance Criteria:**
- [ ] Backend server starts on port 3000
- [ ] `/health` endpoint returns 200 OK
- [ ] Prisma connects to Supabase successfully
- [ ] `prisma studio` shows all tables
- [ ] All migrations applied successfully
- [ ] Trigram extension enabled for text search

---

## Frontend Tasks

### Task 1.3: Initialize Frontend Project

```bash
cd coab-frontend

# Create Vite project with React + TypeScript
npm create vite@latest . -- --template react-ts

# Install dependencies (see TECH_STACK.md for versions)
npm install

# Install routing and state management
npm install react-router@^7.8.2 @tanstack/react-query@^5.84.1

# Install forms and validation
npm install react-hook-form zod@^4.0.0 @hookform/resolvers

# Install utilities
npm install axios date-fns

# Install Tailwind CSS v4
npm install -D tailwindcss@^4.1.0 @tailwindcss/vite@^4.1.0

# Install dev tools
npm install -D @vitejs/plugin-react vitest

# Initialize shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card input label form toast tabs dialog select textarea
```

**Add to `package.json` dependencies:**
```json
{
  "dependencies": {
    "@coab/utils": "workspace:*"
  }
}
```

**Note:** The `@coab/utils` workspace dependency gives you access to shared Chilean utilities:
```typescript
// Import in any frontend file
import { validarRUT, formatearRUT, formatearPesos, formatearFecha } from '@coab/utils';
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
        'warning-orange': '#FF6B35',
        'text-dark': '#333333'
      }
    }
  }
};
```

**Create Files:**
1. `src/lib/api.ts` - Axios client with interceptors
2. `src/lib/utils.ts` - Re-exports from `@coab/utils` + shadcn/ui `cn()` helper
3. `src/main.tsx` - Entry point with React Router

**Test:**
```bash
npm run dev
# Visit http://localhost:5173
# Should see Vite + React default page
```

---

### Task 1.4: Test API Connection from Frontend

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

## Data Migration Tasks

### Task 1.5: Migrate 355 Existing Customers

**See TECH_STACK.md "Data Migration Plan" for complete details.**

**Step 1: Export existing customer data to CSV**
- Export from current system: RUT, nombre, email, telefono, direccion, numero_cliente, saldo

**Step 2: Install CSV parser**
```bash
cd coab-backend
npm install csv-parse
```

**Step 3: Create migration script**

Create `prisma/seed.ts` (FIXED - proper async handling):

```typescript
import { PrismaClient } from '@prisma/client';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { finished } from 'stream/promises';

const prisma = new PrismaClient();

interface CustomerRow {
  rut: string;
  nombre: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  numero_cliente?: string;
  saldo?: string;
}

async function main() {
  const customers: CustomerRow[] = [];
  
  const parser = createReadStream('data/clientes.csv')
    .pipe(parse({
      columns: true,
      skip_empty_lines: true,
      trim: true
    }));

  parser.on('data', (row: CustomerRow) => {
    customers.push(row);
  });

  // Wait for parsing to complete
  await finished(parser);

  console.log(`Migrating ${customers.length} customers...`);

  let created = 0;
  let errors = 0;

  for (const customer of customers) {
    try {
      // Clean RUT (remove dots and dash for storage, keep original format)
      const rutLimpio = customer.rut.replace(/[.-]/g, '');
      
      await prisma.cliente.create({
        data: {
          rut: rutLimpio,
          nombre_completo: customer.nombre,
          email: customer.email || null,
          telefono: customer.telefono || null,
          direccion: customer.direccion || null,
          numero_cliente: customer.numero_cliente || null,
          saldo_actual: parseInt(customer.saldo || '0', 10),
          estado_cuenta: parseInt(customer.saldo || '0', 10) > 0 ? 'MOROSO' : 'AL_DIA',
          // No password yet
          hash_contrasena: null,
          primer_login: true,
          es_cliente_actual: true
        }
      });
      created++;
    } catch (error: any) {
      console.error(`Error migrating ${customer.rut}:`, error.message);
      errors++;
    }
  }

  console.log(`✅ Migration complete! Created: ${created}, Errors: ${errors}`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Step 4: Create data directory and sample CSV**

```bash
mkdir -p data
```

Create `data/clientes.csv`:
```csv
rut,nombre,email,telefono,direccion,numero_cliente,saldo
12345678-9,Juan Pérez García,juan@email.com,+56912345678,Calle Falsa 123,CLI-001,45670
98765432-1,María López Soto,maria@email.com,+56987654321,Av. Principal 456,CLI-002,0
```

**Step 5: Run migration**
```bash
npm run seed
```

**Step 6: Verify in Prisma Studio**
```bash
npx prisma studio
# Verify customers imported
# Check RUT format is correct
# Verify no duplicates
```

---

### Task 1.6: Create Initial Admin User

Create `scripts/create-admin.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || 'admin@coab.cl';
  const password = process.argv[3] || 'Admin1234!';
  const nombre = process.argv[4] || 'Administrador COAB';

  const hashContrasena = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  const admin = await prisma.administrador.upsert({
    where: { email },
    update: {},
    create: {
      email,
      nombre,
      hash_contrasena: hashContrasena,
      rol: 'admin'
    }
  });

  console.log(`✅ Admin created/updated: ${admin.email}`);
  console.log(`   Role: ${admin.rol}`);
  console.log(`   Password: ${password}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run:
```bash
npx tsx scripts/create-admin.ts admin@coab.cl Admin1234! "Administrador Principal"
```

---

### Task 1.7: Data Integrity Verification

**Run SQL queries in Supabase Studio or via Prisma:**

```sql
-- 1. Verify customer count
SELECT COUNT(*) FROM clientes;
-- Expected: 355

-- 2. Verify all RUTs are valid format (digits only, 8-9 chars)
SELECT rut FROM clientes WHERE rut !~ '^\d{7,8}[0-9Kk]$';
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

-- 5. Verify admin exists
SELECT email, rol, activo FROM administradores;
-- Expected: at least 1 admin
```

**Acceptance Criteria:**
- [ ] 355 customers migrated successfully
- [ ] All RUTs in correct format
- [ ] No duplicate RUTs
- [ ] `hash_contrasena` is NULL for all customers (passwords set in Iteration 7)
- [ ] `saldo_actual` matches expected amounts
- [ ] At least 1 admin user created

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
- [x] Complete schema with all tables for future iterations
- [x] 355 existing customers migrated
- [x] Admin user created
- [x] BigInt JSON serialization fixed globally
- [x] Trigram indexes for text search

**Next Iteration:**
Iteration 2 will add customer authentication (RUT + password login) with JWT refresh tokens.