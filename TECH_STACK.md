# COAB Platform - Technology Stack

**Version:** 2.2
**Last Updated:** October 2025
**Project:** Chilean Water Utility Customer Portal & Admin Dashboard
**Status:** Production-Ready Architecture (Post-Professional Review v2)

---

## Backend Stack

### Runtime & Framework

| Technology | Version | Installation |
|------------|---------|--------------|
| **Node.js** | ^22.0.0 LTS | https://nodejs.org |
| **Fastify** | ^5.0.0 | `npm install fastify` |
| **TypeScript** | ^5.0.0 | `npm install -D typescript @types/node` |

**Why Fastify over Express?**
- **2-5x faster** request handling (critical for Chilean 3G/4G networks)
- **Built-in TypeScript support** with schema validation
- **JSON schema validation** out of the box (pairs with Zod)
- **Better error handling** with async/await
- **Lower memory footprint** (important for Railway deployment)
- **Long-running server support** (NOT serverless - runs on Railway)
- Express is showing its age (14 years old, slower development)

---

### Database & ORM

| Technology | Version | Installation |
|------------|---------|--------------|
| **Supabase (PostgreSQL 15)** | Free Tier | https://supabase.com |
| **Prisma ORM** | ^6.0.0 | `npm install prisma --save-dev`<br>`npm install @prisma/client` |
| **@supabase/supabase-js** | ^2.0.0 | `npm install @supabase/supabase-js` |

**Why Supabase over Neon?**
- **Supabase Studio GUI** (visual database admin - non-technical staff can query)
- **Built-in Storage** (50GB free - critical for PDF boletas/receipts)
- **Row-Level Security (RLS)** (future-proof for multi-tenant/multi-municipality)
- **Realtime subscriptions** (future: live admin dashboard updates)
- **Built-in connection pooling** (pgBouncer included)
- **500MB storage sufficient** (355 customers × 10KB = 3.5MB, room for 50,000 customers)
- **Future Auth integration** (admin SSO with Google Workspace for Chilean government)
- Professional review: "Supabase Studio alone is worth it for debugging production customer data visually"

**Why Prisma over Drizzle?**
- **Prisma Studio GUI** (debug data locally during development)
- **Mature migration system** (critical for migrating 355 existing customers)
- **Better error messages** (Spanish-speaking team will appreciate clarity)
- **Type-safe queries** with auto-completion
- **Proven with Supabase** (well-documented, battle-tested combo)
- Drizzle is faster but steeper learning curve; Prisma DX wins for your use case

**Critical Configuration (Supabase Connection Pooling):**

> ⚠️ **IMPORTANT:** Missing this configuration will cause Railway to crash with "too many connections" errors. This is the #1 mistake developers make when deploying Prisma + Supabase to Railway.

```env
# Use Supabase connection pooler for production
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct connection for migrations (use Supabase direct connection string)
DIRECT_URL="postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres"
```

**Prisma Schema Configuration:**
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      # Pooled connection for queries
  directUrl = env("DIRECT_URL")         # Direct connection for migrations
}
```

**Why This Matters:**
- Railway Hobby plan = 1 instance, but Prisma creates connection pool
- Without pooling: Each request holds connection → exhausts Supabase free tier (60 connections)
- With pgBouncer: Connections reused → supports 1000s of requests with 1 connection
- `connection_limit=1` forces Prisma to use single connection per instance

---

### Validation & Security

| Technology | Version | Installation |
|------------|---------|--------------|
| **Zod** | ^4.0.0 | `npm install zod` |
| **Argon2id** | ^2.0.0 | `npm install @node-rs/argon2` |
| **jose** | ^5.0.0 | `npm install jose` |
| **helmet** | ^12.0.0 | `npm install @fastify/helmet` |

**Why Zod v4?**
- **10x faster parsing** than v3 (critical for payment validation)
- **Tree-shakeable** with `zod/mini` (smaller bundle size)
- **Better TypeScript inference** (fewer `as` casts)
- Stable release, excellent documentation
- Prevents injection attacks (validates RUT, monto, email)

**Why Argon2id over bcrypt?**
- **OWASP #1 recommendation** for password hashing (2025)
- **Rust-based** (@node-rs/argon2) = 3x faster than bcrypt
- **Memory-hard algorithm** (resistant to GPU cracking)
- **Side-channel attack resistant**
- bcrypt is 25+ years old; Argon2 won Password Hashing Competition (2015)

**Why jose over jsonwebtoken?**
- **Modern API** with Promises (no callbacks)
- **Better TypeScript support**
- **Smaller bundle size**
- **Supports ECDSA/EdDSA** (not just RSA/HS256)

---

### Logging & Monitoring

| Technology | Version | Installation |
|------------|---------|--------------|
| **Pino** | ^9.0.0 | `npm install pino pino-http` |
| **pino-pretty** | ^11.0.0 | `npm install -D pino-pretty` |
| **Sentry** | ^8.0.0 | `npm install @sentry/node` |

**Why Pino over Winston?**
- **Async logging** (doesn't block event loop)
- **5-10x faster** than Winston/Bunyan
- **JSON by default** (structured logs for production)
- **Works seamlessly with Fastify** via `pino-http`
- **Better performance** = lower Railway costs

**Why Sentry?**
- **Free tier** (5k events/month sufficient for MVP)
- **Source map support** (track errors to exact TypeScript line)
- **Performance monitoring** (find slow queries)

---

### Rate Limiting & Security

| Technology | Version | Installation |
|------------|---------|--------------|
| **@fastify/rate-limit** | ^10.0.0 | `npm install @fastify/rate-limit` |
| **@fastify/cors** | ^10.0.0 | `npm install @fastify/cors` |

**Configuration:**
- General endpoints: 100 requests/15 min
- Auth endpoints: 5 requests/15 min (prevents brute force)
- Account lockout: 5 failed attempts = 15-minute lock

---

## Frontend Stack

### Build Tool & Framework

| Technology | Version | Installation |
|------------|---------|--------------|
| **Vite** | ^7.0.0 | `npm create vite@latest` |
| **React** | ^18.0.0 | `npm install react react-dom` |
| **React Router** | ^7.8.2 | `npm install react-router` |
| **TypeScript** | ^5.0.0 | `npm install -D typescript` |

**Why Vite over Next.js?**
- **10x faster HMR** (Hot Module Replacement)
- **Simpler mental model** (no server components, no app router confusion)
- **Perfect for SPA** (your use case: external API + mobile-first)
- **Smaller bundle size** (no Next.js runtime overhead)
- **Better DX** (faster dev server startup)
- Professional review: "Next.js is overkill for a mobile-first SPA with external API"

**Why React Router v7?**
- **Data loading** (loader/action pattern like Remix)
- **Type-safe routing** (TypeScript inference for params)
- **Better than React Router v6** (new data APIs)
- **Replaces Next.js routing** without server components
- Stable release (October 2024)

---

### UI Components & Styling

| Technology | Version | Installation |
|------------|---------|--------------|
| **Tailwind CSS** | ^4.0.0 | `npm install tailwindcss @tailwindcss/vite` |
| **shadcn/ui** | Latest | `npx shadcn@latest init` |

**Why Tailwind CSS?**
- **Mobile-first** by default (matches your requirement)
- **Chilean theme colors** easy to configure (primary-blue: #0066CC)
- **Smaller CSS bundle** than Bootstrap/Material-UI
- **Better performance** (purges unused styles)
- **44px touch targets** easy to enforce with utilities

**Why shadcn/ui?**
- **Copy-paste components** (you own the code, no npm bloat)
- **Radix UI primitives** (accessibility built-in)
- **Tailwind-based** (consistent styling)
- **Customizable** (adapt to Chilean government design standards)
- **No runtime overhead** (just React components)

---

### State Management & Data Fetching

| Technology | Version | Installation |
|------------|---------|--------------|
| **TanStack Query** | ^5.84.1 | `npm install @tanstack/react-query` |
| **React Hook Form** | ^7.0.0 | `npm install react-hook-form` |
| **Axios** | ^1.0.0 | `npm install axios` |
| **Zod** | ^4.0.0 | `npm install zod` |

**Why TanStack Query (React Query)?**
- **Server state caching** (reduce API calls on 3G/4G)
- **Auto-refetching** (balance always up-to-date)
- **Optimistic updates** (smooth payment entry UX)
- **Built-in loading/error states**
- **Devtools** (debug cache issues)

**Why React Hook Form?**
- **Best performance** (minimal re-renders)
- **Native validation** with Zod schemas
- **44px touch targets** compatible
- **Chilean RUT formatting** easy to implement
- **10x smaller** than Formik

**Why Axios over Fetch?**
- **Interceptors** (auto-refresh JWT on 401)
- **Request/response transformation**
- **Better error handling**
- **Timeout support** (10s for Chilean 3G/4G)
- **Automatic JSON parsing**

---

### Chilean-Specific Libraries

| Technology | Version | Installation |
|------------|---------|--------------|
| **date-fns** | ^4.0.0 | `npm install date-fns` |
| **date-fns/locale/es** | Included | Built-in Spanish locale |
| **date-fns-tz** | ^3.0.0 | `npm install date-fns-tz` |

**Why date-fns?**
- **`es-CL` locale support** (d 'de' MMMM 'a las' HH:mm)
- **Tree-shakeable** (import only what you need)
- **Immutable** (no accidental date mutations)
- **Better TypeScript support** than Moment.js
- Pair with **date-fns-tz** for Chile timezone handling (America/Santiago)
- Backend should set `TZ=America/Santiago` to ensure consistent timestamps and scheduling behavior

---

## Deployment Stack

### Hosting & Infrastructure

| Service | Tier | Purpose | Cost |
|---------|------|---------|------|
| **Railway** | Hobby Plan | Backend (Fastify long-running server) | $5/month credit |
| **Cloudflare Pages** | Free | Frontend (Vite SPA) | $0 |
| **Supabase** | Free Tier | PostgreSQL database + Storage + Studio | $0 |
| **Cloudflare** | Free | DNS + DDoS protection | $0 |

**Total Monthly Cost: $5** (vs. original $20 Vercel Pro)

---

### Why Railway for Backend?

**Railway wins for long-running Node.js servers:**
- **Zero cold starts** (always-on process, not serverless)
- **Perfect for Fastify** (maintains connections, persistent state)
- **$5/month = 500 hours** (full month uptime covered)
- **Better for Chilean 3G/4G** (no cold start latency)
- **WebSocket support** (future: real-time admin notifications)
- **Automatic HTTPS** with custom domains
- **Built-in monitoring** (CPU, memory, logs)

**Railway Configuration:**
```json
// railway.json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 10,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**Health Check Endpoint (Required):**
```typescript
// src/routes/health.ts
import { FastifyPluginAsync } from 'fastify';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
};

export default healthRoute;
```

**Why Health Checks Matter:**
- Railway pings `/health` every 60s to keep your app alive
- **Railway Free tier** = 500 hours/month (~16.6 hours/day) → sleeps after inactivity
- **Railway Hobby ($5)** = always-on + health checks prevent restarts
- Without health check: Railway assumes your app crashed and restarts it

**Why NOT Vercel for Backend?**
- Vercel is **serverless-only** (spins up/down per request)
- Running Fastify on Vercel defeats its performance advantages
- $20/month Pro still has cold starts (just faster)
- Serverless functions have **10s timeout limit** (problematic for payment processing)

**Why NOT Render for Backend?**
- Render Free tier has **cold starts** (~30-60s)
- Render Paid ($7/month) is more expensive than Railway ($5/month)
- Railway has better DX (automatic deployments from GitHub)

---

### Why Cloudflare Pages for Frontend?

**Cloudflare Pages wins for static SPAs:**
- **Free tier allows commercial use** (Vercel Free blocks commercial apps)
- **Unlimited bandwidth** (Vercel Free = 100GB/month limit)
- **Better global CDN** (Cloudflare's network > Vercel's)
- **Automatic HTTPS** with custom domains
- **Preview deployments** (test branches before merge)
- **Built-in analytics** (Web Analytics free)
- **Faster Chilean routing** (Cloudflare has Santiago edge nodes)

**Cloudflare Pages Configuration:**
```toml
# wrangler.toml
name = "coab-platform"
compatibility_date = "2025-01-01"

[build]
command = "npm run build"
cwd = "."
publish = "dist"

[[redirects]]
from = "/*"
to = "/index.html"
status = 200
```

**Deployment via GitHub:**
- Push to `main` → Auto-deploy to production
- Push to `develop` → Auto-deploy to preview URL
- Zero configuration needed after initial setup

**Why NOT Vercel for Frontend?**
- Vercel Free **blocks commercial use** (your utility is commercial)
- Vercel Pro ($20/month) only makes sense if using Next.js
- You're using Vite (static SPA), not Next.js (SSR/RSC)

---

### Deployment Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  Chilean Users (3G/4G)                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────────┐
        │   Cloudflare Pages (Free)         │
        │   - Vite Static Build             │
        │   - Global CDN (Santiago edge)    │
        │   - Unlimited bandwidth           │
        │   - Auto HTTPS                    │
        │   - Preview deployments           │
        └───────────────┬───────────────────┘
                        │
                        │ API Calls (axios)
                        │ https://api.coab.cl
                        ▼
        ┌───────────────────────────────────┐
        │   Railway ($5/month)              │
        │   - Fastify (always-on)           │
        │   - Zero cold starts              │
        │   - WebSocket support             │
        │   - Pino logging → stdout         │
        │   - Auto HTTPS custom domain      │
        └───────────────┬───────────────────┘
                        │
                        │ Prisma Client
                        │ (connection pooling)
                        ▼
        ┌───────────────────────────────────┐
        │   Supabase (Free)                 │
        │   - PostgreSQL 15                 │
        │   - 500MB database storage        │
        │   - 50GB file storage (PDFs)      │
        │   - pgBouncer pooling             │
        │   - Supabase Studio GUI           │
        │   - Row-Level Security (RLS)      │
        └───────────────────────────────────┘
```

**DNS Configuration (Cloudflare):**
```
CNAME  coab.cl              → coab-platform.pages.dev
CNAME  api.coab.cl          → your-project.up.railway.app
CNAME  www.coab.cl          → coab-platform.pages.dev
```

---

### Monitoring & Analytics

| Service | Tier | Purpose |
|---------|------|---------|
| **Sentry** | Free (5k events/month) | Error tracking (backend + frontend) |
| **UptimeRobot** | Free | Uptime monitoring (Railway health checks) |
| **Cloudflare Web Analytics** | Free | Frontend performance monitoring |
| **Railway Metrics** | Included | Backend CPU/memory/logs monitoring |

---

## Development Tools

| Tool | Version | Installation |
|------|---------|--------------|
| **tsx** | ^4.0.0 | `npm install -D tsx` |
| **ESLint** | ^9.0.0 | `npm install -D eslint` |
| **Prettier** | ^3.0.0 | `npm install -D prettier` |
| **Vitest** | ^2.0.0 | `npm install -D vitest` |

**Why tsx?**
- **Run TypeScript directly** (no build step in dev)
- **Watch mode** (`tsx watch src/index.ts`)
- **Faster than ts-node**

**Why Vitest over Jest?**
- **10x faster** (Vite-powered)
- **Compatible with Jest API** (easy migration)
- **ESM-first** (no CommonJS quirks)
- **Better TypeScript support**

---

## Package.json Structure

### Backend (`coab-backend/package.json`)

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
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/helmet": "^12.0.0",
    "@fastify/rate-limit": "^10.0.0",
    "@fastify/multipart": "^8.0.0",
    "@fastify/static": "^7.0.0",
    "prisma": "^6.0.0",
    "@prisma/client": "^6.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "zod": "^4.0.0",
    "@node-rs/argon2": "^2.0.0",
    "jose": "^5.0.0",
    "pino": "^9.0.0",
    "pino-http": "^10.0.0",
    "@sentry/node": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "pino-pretty": "^11.0.0",
    "vitest": "^2.0.0"
  }
}
```

### Frontend (`coab-frontend/package.json`)

```json
{
  "name": "coab-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router": "^7.8.2",
    "@tanstack/react-query": "^5.84.1",
    "react-hook-form": "^7.0.0",
    "axios": "^1.0.0",
    "zod": "^4.0.0",
    "date-fns": "^4.0.0"
  },
  "devDependencies": {
    "vite": "^7.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  }
}
```

---

## Environment Variables Template

### Backend `.env.example`

```env
# Node Environment
NODE_ENV=development|test|staging|production
PORT=3000
TZ=America/Santiago

# Supabase Database
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres"

# Supabase Storage (for PDF boletas)
SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_ANON_KEY="your-anon-key-from-supabase-dashboard"

# JWT Authentication
JWT_SECRET="generate-with-openssl-rand-base64-32"
JWT_ACCESS_EXPIRY="24h"     # 24 hours for customers
JWT_REFRESH_EXPIRY="30d"    # 30 days for refresh tokens

# Admin JWT (shorter expiry)
JWT_ADMIN_ACCESS_EXPIRY="8h"

# Security
CORS_ORIGIN="https://coab.cl,https://www.coab.cl"
RATE_LIMIT_MAX=100          # General endpoints
RATE_LIMIT_AUTH_MAX=5       # Auth endpoints

# Railway Deployment
RAILWAY_ENVIRONMENT=production

# Error Tracking (Sentry)
SENTRY_DSN="your-sentry-dsn-from-dashboard"

# Logging
LOG_LEVEL=info              # dev: debug, prod: info

# Optional: Future Phase 2 integrations
INFOBIP_API_KEY=""          # WhatsApp notifications
TRANSBANK_API_KEY=""        # Payment processing
FTP_HOST=""                 # BancoEstado SFTP
FTP_USER=""
FTP_PASS=""
```

### Frontend `.env.example`

```env
# API Configuration
VITE_API_URL=http://localhost:3000/api/v1

# Production
# VITE_API_URL=https://api.coab.cl/api/v1

# Sentry (optional)
VITE_SENTRY_DSN=""

# Feature Flags (optional)
VITE_ENABLE_PDF_DOWNLOAD=true
```

**Security Notes:**
- **Never commit** `.env` files to version control (already in `.gitignore`)
- Generate JWT secret: `openssl rand -base64 32`
- Get Supabase credentials from: https://supabase.com/dashboard → Project Settings → API
- Railway auto-injects `PORT` environment variable

---

## Key Architectural Decisions Summary

### Performance-First Choices

1. **Fastify** → 2-5x faster than Express (long-running on Railway)
2. **Pino** → 5-10x faster than Winston (async)
3. **Vite** → 10x faster HMR than Webpack/Next.js
4. **Argon2** → 3x faster than bcrypt
5. **Zod v4** → 10x faster parsing than v3
6. **Railway** → Zero cold starts (always-on process)

### Developer Experience (DX) Choices

1. **Prisma + Supabase Studio** → Visual data admin (non-technical staff can query)
2. **Railway + Cloudflare Pages** → Auto-deploy from GitHub (zero config)
3. **TypeScript strict mode** → Catch bugs at compile time
4. **React Hook Form** → Less boilerplate than Formik
5. **shadcn/ui** → Own the code, no black box
6. **tsx** → Run TS directly without build step

### Security-First Choices

1. **Argon2id** → OWASP #1 recommendation
2. **Zod** → Input validation prevents injection
3. **helmet** → Security headers
4. **Rate limiting** → Prevents brute force (5 attempts/15 min)
5. **JWT refresh rotation** → Prevents token theft

### Chilean Localization Choices

1. **date-fns** → `es-CL` locale support
2. **Zod** → Custom RUT validation (Modulus 11)
3. **Spanish schema names** → `clientes`, `transacciones_pago`
4. **CLP currency formatting** → `$1.234.567`
5. **Mobile-first Tailwind** → 44px touch targets

---

## Continuous Integration & Deployment

### Frontend Deployment (Cloudflare Pages)

**Setup:**
1. Connect GitHub repository to Cloudflare Pages
2. Configure build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `coab-frontend`
3. Add environment variables in Cloudflare dashboard
4. Enable preview deployments for all branches

**Automatic Deployment:**
- Push to `main` → Auto-deploy to production (`https://coab.cl`)
- Push to `develop` → Auto-deploy to preview (`https://develop.coab-platform.pages.dev`)
- Pull request → Preview URL comment in GitHub PR

**Zero Configuration:**
- Cloudflare automatically detects Vite
- No `wrangler.toml` needed for basic setup
- SPA routing handled via `_redirects` file:

```
# coab-frontend/public/_redirects
/*  /index.html  200
```

---

### Backend Deployment (Railway)

**Setup:**
1. Connect GitHub repository to Railway
2. Create new project from `coab-backend` folder
3. Railway auto-detects Node.js (Nixpacks builder)
4. Add environment variables in Railway dashboard
5. Configure custom domain: `api.coab.cl`

**Automatic Deployment:**
- Push to `main` → Auto-build → Auto-deploy to production
- Build command: `npm run build` (compiles TypeScript)
- Start command: `npm start` (runs `node dist/index.js`)
- Health check: `GET /health` every 60s

**Railway Configuration (Optional):**

```json
// railway.json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 10,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**Environment Variables (Railway Dashboard):**
- `DATABASE_URL` (from Supabase)
- `DIRECT_URL` (from Supabase)
- `JWT_SECRET` (generate with `openssl rand -base64 32`)
- `NODE_ENV=production`
- `SENTRY_DSN` (optional)

---

### Database Migrations (Supabase + Prisma)

**Development:**
```bash
# Create migration
npx prisma migrate dev --name add_customer_table

# Apply migration
npx prisma migrate deploy

# Open Prisma Studio
npx prisma studio
```

**Production (Railway):**
Railway automatically runs migrations on deploy:

```json
// package.json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "postinstall": "prisma generate",
    "deploy": "prisma migrate deploy"
  }
}
```

**Migration Workflow:**
1. Develop locally with `prisma migrate dev`
2. Commit migration files to Git (`prisma/migrations/`)
3. Push to `main` → Railway runs `prisma migrate deploy`
4. Verify in Supabase Studio GUI

---

### Rollback Strategy

**Frontend (Cloudflare Pages):**
- Cloudflare keeps deployment history (unlimited)
- Rollback via dashboard: Deployments → Select previous → "Rollback"
- Instant rollback (no rebuild needed)

**Backend (Railway):**
- Railway keeps deployment history (last 10)
- Rollback via dashboard: Deployments → Select previous → "Redeploy"
- Rollback takes ~2-3 minutes (rebuilds from Git)

**Database (Supabase + Prisma):**
- **No automatic rollback** (migrations are one-way)
- Manual rollback: Create reverse migration
- Example:
  ```bash
  # If migration added column, create reverse migration:
  npx prisma migrate dev --name remove_added_column
  ```

---

### Monitoring Deployment Health

**Cloudflare Pages:**
- Build logs: Cloudflare dashboard → Deployments → View build log
- Analytics: Cloudflare Web Analytics (free)
- Uptime: 99.99% SLA (Cloudflare edge network)

**Railway:**
- Build logs: Railway dashboard → Deployments → View logs
- Runtime logs: Railway dashboard → Logs (Pino JSON logs)
- Metrics: Railway dashboard → Metrics (CPU, memory, network)
- Uptime: Monitor with UptimeRobot (free, 5-minute interval)

**Supabase:**
- Query performance: Supabase dashboard → Database → Query Performance
- Connection pool: Supabase dashboard → Database → Connection Pooling
- Storage usage: Supabase dashboard → Storage

---

## Migration Path (If Needed)

**Future optimizations** (only if performance becomes an issue):

1. **Prisma → Drizzle** (if 10k+ customers, need edge performance)
2. **Railway → Self-hosted Kubernetes** (if cost becomes issue at scale)
3. **Supabase Free → Supabase Pro** ($25/month if exceed 500MB storage or need >50GB file storage)
4. **Supabase → CockroachDB** (if need multi-region latency <50ms)

**Current stack is designed for 355 → 10,000 customers.** All choices are production-ready and battle-tested.

---

## Version Lock Recommendations

**Lock major versions** in `package.json`:

```json
{
  "dependencies": {
    "fastify": "^5.0.0",
    "zod": "^4.0.0",
    "react-router": "^7.8.2"
  }
}
```

**Why `^` (caret)?**
- Allows **patch updates** (bug fixes)
- Blocks **breaking changes** (major versions)
- Example: `^5.0.0` allows `5.0.1`, `5.1.0` but NOT `6.0.0`

---

## Total Stack Size

**Backend:**
- Node.js runtime: ~50MB
- Dependencies: ~80MB (Fastify, Prisma, Pino, Zod)
- **Total:** ~130MB

**Frontend:**
- Build output: ~200KB gzipped (Vite optimized)
- Dependencies: ~2MB (React, React Router, TanStack Query)

**Database:**
- Supabase free tier: 500MB database storage (sufficient for 355 customers)
- Supabase free tier: 50GB file storage (for PDF boletas/receipts)
- Estimated growth: ~10KB per customer = 50,000 customers = 500MB (at free tier limit)

---

## Performance Targets

| Metric | Target | Reasoning |
|--------|--------|-----------|
| API processing time | <100ms | Railway internal (Fastify + Prisma) |
| Total API response (3G) | <400ms | Including network hops (see breakdown below) |
| Frontend FCP (3G) | <2.5s | Realistic for Chilean 3G networks |
| Lighthouse mobile score | >85 | Accessibility + SEO + Performance |
| Database query | <50ms | Supabase connection pooling (pgBouncer) |
| JWT generation | <10ms | Argon2 + jose |
| Railway cold start | 0ms | Always-on process (not serverless) |
| Cloudflare edge latency | <50ms | Santiago edge node |

**Total API Response Breakdown (Chilean 3G User):**
- Santiago user → Cloudflare Pages: ~50ms
- Cloudflare → Railway (US East): ~150-200ms
- Railway processing: ~50-100ms
- Railway → Supabase (US East): ~20-50ms
- **Total round-trip: 270-400ms** (realistic target)

---

## Data Migration Plan (355 Existing Customers)

This project is **not greenfield** - we have 355 existing customers with historical billing data that must be migrated to the new system.

### Phase 1: Database Schema Setup

**Timeline:** Day 1 of Iteration 1

1. Create Supabase project
2. Configure Prisma schema with Spanish-named tables
3. Run `npx prisma db push` to create initial schema
4. Verify schema in Supabase Studio GUI

**Tables to Create:**
- `clientes` (customers: RUT, nombre, email, telefono)
- `boletas` (invoices: periodo, monto_total, fecha_vencimiento)
- `transacciones_pago` (payment transactions: metodo_pago, monto, fecha)
- `solicitudes_servicio` (service requests)
- `notificaciones_whatsapp` (WhatsApp notifications)

---

### Phase 2: Customer Data Migration

**Timeline:** Days 2-3 of Iteration 1

**Step 1: Export Existing Data**
- Export customer data from current system to CSV
- Required fields:
  - RUT (format: XX.XXX.XXX-X)
  - Nombre completo
  - Email (if available)
  - Teléfono (for WhatsApp setup)
  - Dirección
  - Número cliente (existing customer ID)

**Step 2: Create Prisma Seed Script**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as csv from 'csv-parser';

const prisma = new PrismaClient();

async function main() {
  const customers = [];

  // Read CSV file
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
            estado_cuenta: customer.saldo > 0 ? 'MOROSO' : 'AL_DIA',
            // No password yet - will be set via WhatsApp link
            hash_contrasena: null,
            requiere_configuracion_inicial: true
          }
        });
      }

      console.log('Migration complete!');
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

**Step 3: Run Migration**
```bash
npx tsx prisma/seed.ts
```

**Step 4: Verify in Supabase Studio**
- Open Supabase Studio GUI
- Query `clientes` table
- Verify 355 records imported
- Check data integrity (RUT validation, no duplicates)

---

### Phase 3: Historical Billing Data Migration

**Timeline:** Days 4-5 of Iteration 1

**Step 1: Export Historical Boletas**
- Export last 12 months of billing data
- Required fields:
  - RUT cliente
  - Periodo (YYYY-MM format: 2024-01)
  - Monto total
  - Fecha vencimiento
  - Estado pago (pagado/pendiente)

**Step 2: Migrate Boletas**

```typescript
// prisma/migrate-boletas.ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as csv from 'csv-parser';

const prisma = new PrismaClient();

async function main() {
  const boletas = [];

  fs.createReadStream('data/boletas.csv')
    .pipe(csv())
    .on('data', (row) => boletas.push(row))
    .on('end', async () => {
      console.log(`Migrating ${boletas.length} boletas...`);

      for (const boleta of boletas) {
        // Find customer by RUT
        const cliente = await prisma.cliente.findUnique({
          where: { rut: boleta.rut_cliente }
        });

        if (!cliente) {
          console.error(`Customer not found: ${boleta.rut_cliente}`);
          continue;
        }

        await prisma.boleta.create({
          data: {
            cliente_id: cliente.id,
            periodo: boleta.periodo,
            monto_total: parseFloat(boleta.monto_total),
            monto_pendiente: boleta.estado === 'pendiente'
              ? parseFloat(boleta.monto_total)
              : 0,
            fecha_vencimiento: new Date(boleta.fecha_vencimiento),
            estado_pago: boleta.estado === 'pagado' ? 'COMPLETADO' : 'PENDIENTE'
          }
        });
      }

      console.log('Boletas migration complete!');
    });
}
```

**Step 3: Verify Data Integrity**
- Query boletas in Supabase Studio
- Check saldo_actual matches sum of monto_pendiente
- Verify foreign key relationships (cliente_id)

---

### Phase 4: PDF Boletas Upload (Optional)

**Timeline:** Days 6-7 of Iteration 1 (if PDFs exist)

**If you have existing PDF boletas:**

```typescript
// prisma/upload-pdfs.ts
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function uploadPDFs() {
  const pdfDir = 'data/boletas-pdf/';
  const files = fs.readdirSync(pdfDir);

  for (const file of files) {
    if (!file.endsWith('.pdf')) continue;

    // Extract RUT and period from filename
    // Example: 12345678-9_2024-01.pdf
    const [rut, periodo] = file.replace('.pdf', '').split('_');

    const fileBuffer = fs.readFileSync(path.join(pdfDir, file));

    const { data, error } = await supabase.storage
      .from('boletas')
      .upload(`${rut}/${periodo}.pdf`, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) {
      console.error(`Failed to upload ${file}:`, error);
      continue;
    }

    // Update boleta record with storage URL
    const publicURL = supabase.storage
      .from('boletas')
      .getPublicUrl(`${rut}/${periodo}.pdf`).data.publicUrl;

    await prisma.boleta.update({
      where: {
        cliente_rut_periodo: { rut, periodo }
      },
      data: { url_pdf: publicURL }
    });

    console.log(`Uploaded: ${file}`);
  }
}
```

---

### Phase 5: Data Integrity Verification

**Timeline:** Day 8 of Iteration 1

**Verification Checklist:**

```sql
-- 1. Verify customer count
SELECT COUNT(*) FROM clientes;
-- Expected: 355

-- 2. Verify all RUTs are valid (Chilean format)
SELECT rut FROM clientes WHERE rut !~ '^\d{1,2}\.\d{3}\.\d{3}-[0-9Kk]$';
-- Expected: 0 results

-- 3. Verify saldo_actual matches sum of pending boletas
SELECT
  c.rut,
  c.saldo_actual,
  SUM(b.monto_pendiente) as saldo_calculado
FROM clientes c
LEFT JOIN boletas b ON c.id = b.cliente_id
GROUP BY c.id
HAVING c.saldo_actual != COALESCE(SUM(b.monto_pendiente), 0);
-- Expected: 0 results (or investigate discrepancies)

-- 4. Verify all customers have unique RUT
SELECT rut, COUNT(*) FROM clientes GROUP BY rut HAVING COUNT(*) > 1;
-- Expected: 0 results

-- 5. Check for orphaned boletas (no customer)
SELECT COUNT(*) FROM boletas WHERE cliente_id NOT IN (SELECT id FROM clientes);
-- Expected: 0
```

**Manual Spot Checks in Supabase Studio:**
- Open 5-10 random customer records
- Verify saldo_actual matches boletas
- Check date formats (Chilean dd/MM/yyyy)
- Verify currency amounts (CLP, no decimals)

---

### Migration Rollback Plan

**If migration fails:**

```bash
# Drop all tables and start over
npx prisma migrate reset --force

# Re-run setup
npx prisma db push
npx tsx prisma/seed.ts
```

**Supabase Studio Backup:**
- Supabase automatically creates daily backups (free tier: 7 days retention)
- Manual backup: Dashboard → Database → Backups → "Download"
- Store backup before running migration scripts

---

### Post-Migration Testing

**Iteration 2 (Customer Auth) Testing:**
1. Pick 5 test customers with real RUTs
2. Generate WhatsApp setup links
3. Have test users set passwords
4. Verify login works with RUT + password
5. Verify dashboard shows correct saldo_actual

**Iteration 3 (Customer Dashboard) Testing:**
1. Verify payment history displays correctly
2. Check boletas show correct amounts
3. Verify PDF downloads work (if uploaded)
4. Test on real Chilean mobile devices (3G/4G)

---

**Last Updated:** October 2025
**Next Review:** After Iteration 3 (Customer Dashboard) completion

---

## Summary of Professional Review Changes

### v2.0 → v2.1: Architecture Fix

**Critical Architecture Fix:**
- **Problem:** Original stack had Fastify on Vercel serverless (architectural mismatch)
- **Solution:** Split deployment - Railway (backend) + Cloudflare Pages (frontend)

**Cost Reduction:**
- Before: Vercel Pro ($20/month)
- After: Railway ($5/month) + Cloudflare Pages (Free)
- Savings: $15/month = $180/year

**Database Change:**
- Before: Neon (3GB free, database branching)
- After: Supabase (500MB database + 50GB file storage + Studio GUI + RLS)

**Why Supabase Won:**
1. Built-in PDF storage (Chilean boletas requirement)
2. Supabase Studio GUI (non-technical staff can query data)
3. Row-Level Security (future multi-tenant support)
4. Realtime subscriptions (future admin dashboard live updates)

---

### v2.1 → v2.2: Production Hardening

**Added Missing Dependencies:**
- `@fastify/multipart` (PDF boleta uploads)
- `@fastify/static` (serve uploaded files)

**Fixed Documentation Issues:**
1. ✅ Connection pooling warning (prevents Railway crashes)
2. ✅ Railway health check endpoint (prevents unnecessary restarts)
3. ✅ Performance targets adjusted for Chilean 3G reality
4. ✅ Version notation consistency (^x.x.x format)
5. ✅ shadcn/ui version clarified (Latest, not v3.2.1)

**Added Critical Sections:**
1. ✅ Environment Variables Template (`.env.example` with all required vars)
2. ✅ CI/CD Deployment Guide (Railway + Cloudflare Pages setup)
3. ✅ Data Migration Plan (355 existing customers + historical boletas)

**Performance Targets Revised:**
- API processing: <100ms (Railway internal)
- Total API response (3G): <400ms (realistic for Chile → US East round-trip)
- Frontend FCP (3G): <2.5s (was <1.5s - unrealistic)
- Lighthouse mobile: >85 (was >90 - more achievable)

---

### Key Learnings

1. **Long-running servers ≠ Serverless** (Fastify needs Railway, not Vercel)
2. **Free tier differences matter** (Vercel Free blocks commercial use)
3. **Storage requirements overlooked** (PDF boletas need file storage)
4. **GUI admin tools save time** (Supabase Studio > CLI-only)
5. **Connection pooling is critical** (#1 mistake with Prisma + Supabase on Railway)
6. **Performance targets must account for geography** (Chile → US East = 150-200ms)
7. **Migration is not greenfield** (355 existing customers must be migrated)

**Reviewer Credit:** Professional feedback prevented production deployment disaster and caught critical missing configurations
