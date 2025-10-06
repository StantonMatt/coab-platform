# ITERATION 8: Production Deployment & Testing

**Goal:** Production-ready app deployed to internet with monitoring

**Duration:** 6-7 days (extended testing + deployment checklist)

**You'll Be Able To:** Access live app from any device with internet

**REVIEWER NOTE:** Extended from 4-5 days to include comprehensive testing, monitoring setup, and real device testing. Updated to Railway + Cloudflare Pages deployment (cost-optimized vs. Vercel).

---

## Backend Tasks (Day 1-2)

### Task 8.1: Production Configuration & Security
**Time:** 3 hours

**Create:** `.env.production`

```bash
NODE_ENV=production
PORT=3000

# Supabase Connection (CRITICAL: Must include pgbouncer + connection_limit)
DATABASE_URL=postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# JWT Secret (64-char random string)
JWT_SECRET=<generate-with: openssl rand -hex 32>

# Frontend URL (will be Cloudflare Pages)
FRONTEND_URL=https://your-app.pages.dev
CORS_ORIGIN=https://your-app.pages.dev

# Force HTTPS (Railway provides x-forwarded-proto header)
FORCE_HTTPS=true

# Logging
LOG_LEVEL=info

# Optional: Sentry for error tracking
SENTRY_DSN=<your-sentry-dsn>
```

**Update:** `src/app.ts` - Add production security

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { pinoLogger } from './config/logger.js';

// Fix BigInt JSON serialization globally
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

const app = Fastify({
  logger: pinoLogger,
  trustProxy: true, // CRITICAL: Trust Railway's x-forwarded-* headers
  requestIdHeader: 'x-request-id',
  disableRequestLogging: false
});

// Security: Helmet headers (stricter for production)
await app.register(helmet, {
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  } : false,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false
});

// CORS (production: only allow frontend)
await app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN?.split(',') || []
    : true, // Dev: allow all
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

// Rate Limiting (in-memory is fine for Railway's single instance)
await app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
  errorResponseBuilder: (request, context) => ({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiadas solicitudes, intente más tarde',
      retryAfter: context.after
    }
  })
});

// Auth-specific rate limiting (stricter)
const authLimiterConfig = {
  max: 5,
  timeWindow: '15 minutes',
  errorResponseBuilder: () => ({
    error: {
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Demasiados intentos de login, intente más tarde'
    }
  })
};

// Apply to auth routes later via { config: { rateLimit: authLimiterConfig } }

// Multipart (for PDF uploads in Phase 2)
await app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

// HTTPS Redirect Hook (Railway uses x-forwarded-proto)
if (process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS === 'true') {
  app.addHook('onRequest', async (request, reply) => {
    const proto = request.headers['x-forwarded-proto'];
    if (proto !== 'https') {
      const host = request.headers['host'];
      return reply.redirect(301, `https://${host}${request.url}`);
    }
  });
}

// Health Check Endpoint (REQUIRED for Railway - prevents app from sleeping)
app.get('/health', async (request, reply) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      uptime: process.uptime()
    };
  } catch (error) {
    request.log.error('Health check failed', { error });
    return reply.code(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});

export default app;
```

**Create:** `src/config/logger.ts` - Pino Logger Configuration

```typescript
import pino from 'pino';

export const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',

  // Production: JSON logs for Railway log aggregation
  // Development: Pretty-printed for readability
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,

  // Production formatting
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },

  // Redact sensitive data
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'hash_contrasena',
      'token'
    ],
    censor: '[REDACTED]'
  },

  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort
    }),
    res: (res) => ({
      statusCode: res.statusCode
    }),
    err: pino.stdSerializers.err
  }
});
```

**Update:** Error handler for production (hide stack traces)

```typescript
// src/middleware/errorHandler.ts
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error with Pino
  request.log.error({
    err: error,
    req: request,
    errorCode: error.code,
    requestId: request.id
  }, 'Request error');

  // Send to Sentry in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, {
      user: { id: (request as any).user?.id },
      tags: { endpoint: request.url, method: request.method },
      extra: { requestId: request.id }
    });
  }

  const isDev = process.env.NODE_ENV === 'development';

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Send response
  return reply.code(statusCode).send({
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Error interno del servidor',
      requestId: request.id,
      ...(isDev && { stack: error.stack }) // Only in dev
    }
  });
}

// Register in app.ts:
// app.setErrorHandler(errorHandler);
```

**Test:** Run production build locally

```bash
cd coab-backend
npm run build
NODE_ENV=production FORCE_HTTPS=false npm start

# In another terminal:
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"...","database":"connected","uptime":...}
```

**Acceptance Criteria:**
- [ ] HTTPS redirect works (test with x-forwarded-proto: http header)
- [ ] Rate limiting active (101st request in 15 min gets 429)
- [ ] Auth rate limit stricter (6th login attempt in 15 min gets 429)
- [ ] Error stack traces hidden in production mode
- [ ] Pino logs to console in JSON format (production)
- [ ] Helmet security headers present (check with curl -I)
- [ ] Health check returns 200 OK with database connection status
- [ ] BigInt serialization works (no "Do not know how to serialize a BigInt" errors)

---

### Task 8.2: Deploy Backend to Railway
**Time:** 2 hours

**Prerequisites:**
1. Create Railway account (https://railway.app)
2. Install Railway CLI: `npm install -g @railway/cli`
3. Push code to GitHub

**Steps:**

**1. Create Railway Project:**
```bash
railway login
railway init
# Select: "Create new project"
# Project name: coab-backend
```

**2. Add PostgreSQL (if not using Supabase):**
```bash
railway add
# Select: PostgreSQL
```

**Note:** Since we're using Supabase, skip this step. Railway will just run the Node.js app.

**3. Set Environment Variables:**

Via Railway Dashboard (https://railway.app/project/your-project/variables):

```bash
NODE_ENV=production
PORT=3000

# Supabase (copy from Supabase dashboard)
DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://...

# JWT Secret (generate new for production)
JWT_SECRET=<64-char-random>

# Frontend (will update after Cloudflare Pages deployment)
FRONTEND_URL=https://your-app.pages.dev
CORS_ORIGIN=https://your-app.pages.dev

FORCE_HTTPS=true
LOG_LEVEL=info
SENTRY_DSN=<optional>
```

**4. Configure Build & Start Commands:**

Create `railway.json` in backend root:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build && npx prisma generate"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**5. Deploy:**
```bash
railway up
# Or: git push (if connected to GitHub)
```

**6. Run Migrations:**
```bash
railway run npx prisma migrate deploy
```

**7. Get Railway URL:**
```bash
railway domain
# Copy the URL: https://coab-backend-production.up.railway.app
```

**8. Verify Deployment:**
```bash
curl https://coab-backend-production.up.railway.app/health
# Should return: {"status":"ok","timestamp":"...","database":"connected"}
```

**9. Setup Custom Domain (Optional):**
- Railway Dashboard → Settings → Domains
- Add custom domain: api.yourcompany.cl
- Add CNAME record in DNS: `CNAME api.yourcompany.cl coab-backend-production.up.railway.app`

**Railway-Specific Notes:**

⚠️ **CRITICAL:** Railway bills by usage, not flat rate. Hobby plan is $5/month with $5 included usage.

**Cost Optimization:**
- Single instance keeps costs low
- Supabase connection pooling prevents connection exhaustion
- Health check every 10 min prevents cold starts (keeps instance warm)

**Monitoring:**
- Railway Dashboard shows logs in real-time
- Logs are retained for 7 days on Hobby plan
- Use Sentry for error tracking beyond 7 days

**Acceptance Criteria:**
- [ ] Backend accessible via HTTPS Railway URL
- [ ] Environment variables configured correctly
- [ ] Database connected (health check shows "connected")
- [ ] Migrations applied (check via Railway Shell: `railway run npx prisma migrate status`)
- [ ] Health check responds with 200 OK
- [ ] CORS allows requests from frontend origin
- [ ] Railway domain shows deployment status: "Active"

---

## Frontend Tasks (Day 2-3)

### Task 8.3: Mobile Optimization Pass
**Time:** 4 hours

**Tasks:**
- Verify all touch targets >= 44px (iOS HIG requirement)
- Test on actual mobile device or BrowserStack
- Add pull-to-refresh on dashboard (optional UX enhancement)
- Test 3G network throttling (Chrome DevTools → Network → Slow 3G)
- Optimize images (convert to WebP if any)
- Test landscape orientation (especially RUT input)

**Touch Target Verification:**

```typescript
// Check all buttons in src/components/
// Example: src/components/ui/button.tsx

export const buttonVariants = cva(
  "inline-flex items-center justify-center ...",
  {
    variants: {
      size: {
        default: "h-12 px-4 py-2", // 48px = 44px+ ✅
        sm: "h-11 px-3",            // 44px minimum ✅
        lg: "h-14 px-8",            // 56px ✅
        icon: "h-12 w-12"           // 48px ✅
      }
    }
  }
)
```

**Lighthouse Audit:**

```bash
cd coab-frontend
npm run build
npx serve dist

# Open Chrome DevTools
# Lighthouse tab → Mobile → Run audit
# Target: Performance > 85, Accessibility > 95
```

**Chilean 3G Testing:**

Chrome DevTools → Network → Add custom profile:
- Download: 400 Kbps (Chilean 3G reality)
- Upload: 200 Kbps
- Latency: 400ms (Chile → US East → Chile round-trip)

**Test Results Should Show:**
- FCP (First Contentful Paint) < 2.5s
- LCP (Largest Contentful Paint) < 3.5s
- TTI (Time to Interactive) < 4s

**Acceptance Criteria:**
- [ ] All buttons >= 44px height (verified with DevTools)
- [ ] Lighthouse Mobile Performance > 85
- [ ] Lighthouse Accessibility > 95
- [ ] Works on iOS Safari 15+ (test via BrowserStack or real device)
- [ ] Works on Android Chrome 90+ (test via BrowserStack or real device)
- [ ] Text readable without zooming (minimum 16px font-size)
- [ ] Forms usable with on-screen keyboard (inputs not covered)
- [ ] RUT input shows numeric keyboard on mobile (`inputMode="numeric"`)
- [ ] Password input shows secure keyboard
- [ ] Dashboard loads in < 3s on simulated Chilean 3G

---

### Task 8.3.3: Daily Balance Reconciliation Cron
**Time:** 1 hour

**Why:** Prevent `saldo_actual` drift from denormalized balance field. The `Cliente` table stores a denormalized `saldo_actual` field for performance, but it's calculated from pending `Boleta` records. This creates a risk of data inconsistency if another process modifies a `Boleta` without triggering the `Cliente` update. A daily reconciliation script ensures data integrity.

**Create:** `scripts/reconcile-balances.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { pinoLogger } from '../src/config/logger.js';

const prisma = new PrismaClient();
const logger = pinoLogger.child({ script: 'reconcile-balances' });

async function reconcileAllBalances() {
  logger.info('Starting daily balance reconciliation...');

  const clientes = await prisma.cliente.findMany({
    where: { es_cliente_actual: true }
  });

  let reconciled = 0;
  let errors = 0;

  for (const cliente of clientes) {
    try {
      // Calculate real balance from pending boletas
      const realBalance = await prisma.boleta.aggregate({
        where: {
          cliente_id: cliente.id,
          estado: 'pendiente'
        },
        _sum: {
          monto_total: true
        }
      });

      const calculatedBalance = Number(realBalance._sum.monto_total || BigInt(0));

      // Compare with denormalized balance
      if (cliente.saldo_actual !== calculatedBalance) {
        await prisma.cliente.update({
          where: { id: cliente.id },
          data: { saldo_actual: calculatedBalance }
        });

        logger.warn('Balance reconciled', {
          clienteId: cliente.id.toString(),
          rut: cliente.rut,
          saldoAnterior: cliente.saldo_actual,
          saldoNuevo: calculatedBalance,
          diferencia: calculatedBalance - cliente.saldo_actual
        });

        reconciled++;
      }
    } catch (error: any) {
      logger.error('Failed to reconcile balance', {
        clienteId: cliente.id.toString(),
        error: error.message
      });
      errors++;
    }
  }

  logger.info('Balance reconciliation complete', {
    totalClientes: clientes.length,
    reconciled,
    errors
  });

  // Alert if too many reconciliations (indicates bug in payment logic)
  if (reconciled > clientes.length * 0.05) { // > 5% of customers
    logger.error('HIGH RECONCILIATION RATE - Investigate payment logic!', {
      reconciled,
      total: clientes.length,
      percentage: (reconciled / clientes.length * 100).toFixed(2) + '%'
    });
  }

  await prisma.$disconnect();
}

// Run reconciliation
reconcileAllBalances()
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });
```

**Setup Cron Job:**

**Option 1: Railway Cron (if available on your plan)**

Add to `railway.json`:
```json
{
  "cron": [
    {
      "schedule": "0 2 * * *",
      "command": "npm run reconcile-balances"
    }
  ]
}
```

**Option 2: External Cron (Cron-Job.org - Free)**

- Visit https://cron-job.org
- Create new cron job:
  - **Title:** COAB Balance Reconciliation
  - **URL:** `https://coab-backend-production.up.railway.app/api/v1/admin/reconcile-balances` (trigger endpoint)
  - **Schedule:** `0 2 * * *` (2 AM daily, Chilean time)
  - **Authentication:** Add admin JWT token in headers

**Create Reconciliation Endpoint** (for external cron):

```typescript
// src/routes/admin.routes.ts

// POST /admin/reconcile-balances (admin only)
app.post('/admin/reconcile-balances', {
  preHandler: [requireAuth, requireAdmin]
}, async (request, reply) => {
  try {
    // Trigger reconciliation script
    const { exec } = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(exec);

    await execPromise('npx tsx scripts/reconcile-balances.ts');

    return reply.code(200).send({
      message: 'Reconciliación iniciada exitosamente'
    });
  } catch (error: any) {
    request.log.error('Reconciliation trigger failed', { error: error.message });
    return reply.code(500).send({
      error: {
        code: 'RECONCILIATION_FAILED',
        message: 'Error al iniciar reconciliación'
      }
    });
  }
});
```

**Add NPM Script:**

Update `package.json`:
```json
{
  "scripts": {
    "reconcile-balances": "tsx scripts/reconcile-balances.ts"
  }
}
```

**Manual Testing:**

```bash
# Run locally
cd coab-backend
npm run reconcile-balances

# Check logs for reconciliation events
# Should see: "Balance reconciliation complete" with count of reconciled accounts
```

**Monitoring:**

- Logs sent to Pino (Railway logs)
- High reconciliation rate (> 5% of customers) triggers ERROR log
- This alerts you to potential bugs in payment application logic
- Sentry captures errors if reconciliation script fails

**Acceptance Criteria:**
- [ ] Reconciliation script created in `scripts/reconcile-balances.ts`
- [ ] NPM script added: `npm run reconcile-balances`
- [ ] Script runs successfully and reconciles all customers
- [ ] Logs show reconciliation summary (total, reconciled, errors)
- [ ] Alert triggered if > 5% of customers reconciled (indicates bug)
- [ ] Cron job scheduled to run daily at 2 AM Chilean time
- [ ] Endpoint created for external cron trigger (if using Cron-Job.org)
- [ ] Test reconciliation with intentionally incorrect `saldo_actual` (manually update in database)
- [ ] Verify discrepancies logged to Sentry for investigation

---

### Task 8.4: Deploy Frontend to Cloudflare Pages
**Time:** 1.5 hours

**Why Cloudflare Pages:**
- Free tier: Unlimited sites, unlimited requests, 500 builds/month
- Global CDN (faster than Vercel for Chilean users)
- No cold starts (static hosting)
- Built-in analytics (optional)
- Cost: $0/month (vs. Vercel Pro $20/month)

**Prerequisites:**
1. Create Cloudflare account (https://dash.cloudflare.com)
2. Push code to GitHub

**Steps:**

**1. Configure Build Settings:**

Create `wrangler.toml` in frontend root (optional, for Cloudflare Workers if needed later):

```toml
name = "coab-frontend"
compatibility_date = "2025-01-01"
```

**2. Update Environment Variable:**

Create `.env.production` in frontend root:

```bash
# Railway backend URL
VITE_API_URL=https://coab-backend-production.up.railway.app/api/v1
```

**3. Update Vite Config for Cloudflare:**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable for production
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router'],
          'query-vendor': ['@tanstack/react-query']
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
```

**4. Deploy via Cloudflare Dashboard:**

- Go to Cloudflare Dashboard → Pages
- Click "Create a project" → "Connect to Git"
- Select GitHub repo: `coab-frontend`
- Configure build settings:
  - **Framework preset:** Vite
  - **Build command:** `npm run build`
  - **Build output directory:** `dist`
  - **Root directory:** `/` (or `/coab-frontend` if monorepo)
- Add environment variable:
  - `VITE_API_URL` = `https://coab-backend-production.up.railway.app/api/v1`
- Click "Save and Deploy"

**5. Wait for Deployment:**
- Build takes ~2-3 minutes
- Cloudflare will provide URL: `https://coab-frontend.pages.dev`

**6. Update Backend CORS:**

Go back to Railway → Environment Variables → Update:

```bash
CORS_ORIGIN=https://coab-frontend.pages.dev
FRONTEND_URL=https://coab-frontend.pages.dev
```

Redeploy backend:
```bash
railway up
```

**7. Setup Custom Domain (Optional):**

If you have `www.yourcompany.cl`:
- Cloudflare Pages → Custom domains → Add domain
- Add CNAME record: `CNAME www coab-frontend.pages.dev`
- SSL certificate auto-provisioned by Cloudflare

**8. Test Deployment:**

```bash
# Visit frontend
open https://coab-frontend.pages.dev

# Test API connection (open browser DevTools → Network)
# Login as customer
# Should see requests to: https://coab-backend-production.up.railway.app/api/v1/auth/login
```

**Cloudflare-Specific Notes:**

**Benefits:**
- Instant rollbacks (via Cloudflare dashboard)
- Preview deployments for every git push
- Free analytics (optional: enable in dashboard)
- DDoS protection included
- Global CDN: Assets served from 275+ locations

**Limitations:**
- Static hosting only (no server-side rendering) - Perfect for Vite SPA
- 25 MB per file limit (not an issue for us)
- 20,000 files per deployment (not an issue for us)

**Acceptance Criteria:**
- [ ] Frontend accessible via HTTPS Cloudflare Pages URL
- [ ] API calls work (check Network tab for successful requests)
- [ ] CORS configured correctly (no CORS errors in console)
- [ ] All features functional (login, dashboard, admin)
- [ ] Mobile responsive (test on device)
- [ ] Environment variable `VITE_API_URL` pointing to Railway backend
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active (green padlock in browser)

---

## Data Migration (Day 4)

### Task 8.5: Load Real Customer Data
**Time:** 2 hours

**Context:** 355 customers already migrated in Iteration 1 via `prisma db seed`. This task verifies data integrity in production.

**Tasks:**

**1. Verify Customer Count:**

Via Railway Shell:
```bash
railway run npx prisma studio
# Opens Prisma Studio in browser
# Navigate to "cliente" table
# Verify 355 records exist
```

Or via SQL:
```bash
railway run npx prisma db execute --stdin <<SQL
SELECT COUNT(*) FROM cliente WHERE es_cliente_actual = true;
SQL
# Should return: 355
```

**2. Verify Data Integrity:**

```sql
-- Check for missing RUTs
SELECT COUNT(*) FROM cliente WHERE rut IS NULL;
-- Should return: 0

-- Check for customers needing setup
SELECT COUNT(*) FROM cliente WHERE hash_contrasena IS NULL;
-- Should return: 355 (none have passwords yet)

-- Check saldo consistency
SELECT
  SUM(saldo_actual) AS total_saldo,
  COUNT(CASE WHEN saldo_actual > 0 THEN 1 END) AS clientes_morosos
FROM cliente;
```

**3. Generate Setup Links for Top 20 Customers:**

Via Admin UI:
1. Login as admin: https://coab-frontend.pages.dev/admin/login
2. Search for customer by RUT
3. Open customer profile
4. Click "Generar Link de Configuración"
5. Copy WhatsApp link
6. Send via WhatsApp manually (for MVP)

Repeat for 20 customers (prioritize highest saldo_actual).

**4. Test Customer Onboarding:**

For each of the 20 setup links:
1. Open link in private/incognito window
2. Enter new password (8+ chars, 1 uppercase, 1 number)
3. Confirm password
4. Click "Configurar Contraseña"
5. Redirected to login
6. Login with RUT + new password
7. Verify dashboard shows correct balance

**5. Verify Historical Data:**

For sample customer:
1. Check payment history (should show all `transacciones_pago` records)
2. Check boletas (should show all `boleta` records)
3. Verify balance matches: `saldo_actual = SUM(boletas.pendiente) - SUM(pagos)`

**Acceptance Criteria:**
- [ ] All 355 customers visible in Prisma Studio
- [ ] No NULL RUTs
- [ ] All customers have `primer_login = true` and `hash_contrasena = NULL` initially
- [ ] Setup links generated for 20 customers
- [ ] At least 5 customers successfully complete setup flow
- [ ] All historical payments visible in customer portal
- [ ] All boletas visible in customer portal
- [ ] Balance calculations match database

---

## Production Readiness (Day 4)

### Task 8.5.5: Setup Monitoring & Error Tracking
**Time:** 3 hours

**1. Error Tracking (Sentry - Free Tier)**

**Install Sentry:**
```bash
cd coab-backend
npm install @sentry/node @sentry/profiling-node
```

**Configure Sentry:**

```typescript
// src/config/sentry.ts
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export function initSentry() {
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,

      // Performance monitoring
      tracesSampleRate: 0.1, // 10% of requests (free tier limit)

      // Profiling (optional)
      profilesSampleRate: 0.1,
      integrations: [
        new ProfilingIntegration(),
      ],

      // Filter out health checks
      beforeSend(event, hint) {
        const url = event.request?.url;
        if (url?.includes('/health')) {
          return null; // Don't send to Sentry
        }
        return event;
      }
    });
  }
}

// Call in src/server.ts:
// import { initSentry } from './config/sentry.js';
// initSentry();
```

**Add to Error Handler:**

```typescript
// src/middleware/errorHandler.ts (already updated in Task 8.1)
import * as Sentry from '@sentry/node';

export async function errorHandler(error, request, reply) {
  // Send to Sentry
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, {
      user: { id: request.user?.id, rut: request.user?.rut },
      tags: {
        endpoint: request.url,
        method: request.method,
        userType: request.user?.tipo
      },
      extra: { requestId: request.id }
    });
  }

  // ... rest of error handling
}
```

**Test Sentry:**

```bash
# Trigger an error manually
curl -X POST https://coab-backend-production.up.railway.app/api/v1/test-error

# Check Sentry dashboard (https://sentry.io)
# Should see error appear within 1 minute
```

**2. Uptime Monitoring (UptimeRobot - Free Tier)**

- Visit https://uptimerobot.com
- Create account (free tier: 50 monitors, 5-min intervals)

**Add Backend Monitor:**
1. Dashboard → Add New Monitor
2. Monitor Type: HTTP(s)
3. Friendly Name: COAB Backend Health
4. URL: `https://coab-backend-production.up.railway.app/health`
5. Monitoring Interval: 5 minutes
6. Alert Contacts: Your email
7. Save

**Add Frontend Monitor:**
1. Add New Monitor
2. Monitor Type: HTTP(s)
3. Friendly Name: COAB Frontend
4. URL: `https://coab-frontend.pages.dev`
5. Monitoring Interval: 5 minutes
6. Alert Contacts: Your email
7. Save

**Configure Alerts:**
- Email alerts when down
- Optional: SMS alerts (requires paid plan)

**3. Railway Cold Start Prevention (Cron-Job.org - Free)**

**Why:** Railway Hobby plan may spin down after 30 min of inactivity. Health checks keep it warm.

- Visit https://cron-job.org
- Create account (free tier: 15 cron jobs)

**Create Cron Job:**
1. Dashboard → Create Cronjob
2. Title: Keep COAB Backend Warm
3. URL: `https://coab-backend-production.up.railway.app/health`
4. Schedule: `*/10 * * * *` (every 10 minutes)
5. Save

**Note:** Railway's own health check (configured in railway.json) also helps, but external cron adds redundancy.

**4. Railway Logs & Alerts (Built-in)**

Railway Dashboard:
- View real-time logs: Railway Dashboard → Deployments → Logs
- Logs retained for 7 days (Hobby plan)
- No built-in alerting (use Sentry for alerts)

**Acceptance Criteria:**
- [ ] Sentry installed and configured
- [ ] Test error sent to Sentry (visible in dashboard)
- [ ] UptimeRobot monitors active for backend + frontend
- [ ] Email alerts configured in UptimeRobot
- [ ] Cron job pinging backend every 10 min
- [ ] Verify cron job works (check Railway logs for /health requests every 10 min)
- [ ] Railway logs accessible and readable

---

### Task 8.5.6: Backup Verification
**Time:** 1 hour

**Supabase Backup Strategy:**

**1. Verify Point-in-Time Recovery:**

- Supabase Dashboard → Database → Backups
- Free tier: Daily backups, 7-day retention
- Paid tier: PITR (Point-in-Time Recovery) up to 30 days

**What to Check:**
- Last backup timestamp (should be < 24 hours ago)
- Backup size (should match your database size ~50MB for 355 customers)

**2. Manual Backup Script (Run Weekly):**

Create `scripts/backup.sh` in backend root:

```bash
#!/bin/bash
# Weekly manual backup to local storage

# Configuration
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/coab_$DATE.sql"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Get DATABASE_URL from Railway
if [ -z "$DIRECT_URL" ]; then
  echo "Error: DIRECT_URL not set. Run: railway run ./scripts/backup.sh"
  exit 1
fi

# Dump database
echo "Starting backup to $BACKUP_FILE..."
pg_dump $DIRECT_URL > $BACKUP_FILE

if [ $? -eq 0 ]; then
  echo "Backup successful: $BACKUP_FILE"

  # Compress backup
  gzip $BACKUP_FILE
  echo "Compressed: $BACKUP_FILE.gz"

  # Optional: Upload to cloud storage (add later)
  # aws s3 cp $BACKUP_FILE.gz s3://your-bucket/backups/

  # Delete backups older than 30 days
  find $BACKUP_DIR -name "coab_*.sql.gz" -mtime +30 -delete
  echo "Cleaned up old backups (>30 days)"
else
  echo "Backup failed!"
  exit 1
fi
```

Make executable:
```bash
chmod +x scripts/backup.sh
```

**Run Weekly Backup:**
```bash
cd coab-backend
railway run ./scripts/backup.sh
```

**3. Test Restore (Do This Once):**

```bash
# Create test database in Supabase
# Dashboard → SQL Editor → New query:
CREATE DATABASE coab_test;

# Restore from backup
gunzip -c backups/coab_20250115_000000.sql.gz | psql <TEST_DATABASE_URL>

# Verify data
psql <TEST_DATABASE_URL> -c "SELECT COUNT(*) FROM cliente;"
# Should return: 355

# Clean up test database
psql <TEST_DATABASE_URL> -c "DROP DATABASE coab_test;"
```

**4. Document Recovery Procedure:**

Create `docs/DISASTER_RECOVERY.md`:

```markdown
# Disaster Recovery Procedure

## Scenario 1: Database Corruption

1. Stop backend: `railway down`
2. Create new Supabase project
3. Restore from latest backup:
   ```bash
   gunzip -c backups/coab_latest.sql.gz | psql <NEW_DATABASE_URL>
   ```
4. Update Railway environment variables with new DATABASE_URL
5. Deploy: `railway up`
6. Verify: `curl https://.../health`

## Scenario 2: Accidental Data Deletion

1. Use Supabase PITR (Paid tier only)
2. Or restore from manual backup:
   ```bash
   pg_restore -d <DATABASE_URL> backups/coab_YYYYMMDD.sql.gz
   ```

## Scenario 3: Railway Outage

1. Deploy to backup hosting (Render/Fly.io)
2. Update CORS_ORIGIN in new environment
3. Update DNS/CDN to point to new backend
4. Estimated downtime: 30 minutes

## Scenario 4: Complete Loss

**Recovery Time Objective (RTO):** 2 hours
**Recovery Point Objective (RPO):** 24 hours (daily backups)

1. Restore database from latest backup
2. Redeploy backend to Railway
3. Redeploy frontend to Cloudflare Pages
4. Verify all 355 customers can login
```

**Acceptance Criteria:**
- [ ] Supabase auto-backups verified (< 24 hours old)
- [ ] Manual backup script created and tested
- [ ] Backup script runs successfully via `railway run`
- [ ] Test restore successful (data integrity verified)
- [ ] Disaster recovery procedure documented
- [ ] Backups stored locally (and optionally in cloud)
- [ ] Old backups auto-deleted after 30 days

---

## Comprehensive Testing (Day 5-6)

### Task 8.6: End-to-End Testing (Extended)
**Time:** 2 days (not 3 hours)

**CRITICAL:** Financial application requires thorough QA before launch.

**Test Scenarios:**

---

#### **Customer Flow (90 minutes)**

**Setup:**
1. [ ] Admin generates setup link for test customer (RUT: 12.345.678-5)
2. [ ] Copy WhatsApp link

**First-Time Setup:**
1. [ ] Open link in private/incognito window
2. [ ] Verify token is valid (no "Token expirado" error)
3. [ ] Enter password: `Test1234!`
4. [ ] Confirm password: `Test1234!`
5. [ ] Click "Configurar Contraseña"
6. [ ] Verify redirect to `/login` with success message
7. [ ] Verify database: `primer_login = false`, `hash_contrasena` not NULL

**Login:**
1. [ ] Enter RUT: `12.345.678-5` (auto-formats to `12.345.678-5`)
2. [ ] Enter password: `Test1234!`
3. [ ] Click "Ingresar"
4. [ ] Verify redirect to `/dashboard`
5. [ ] Verify localStorage has `access_token`, `refresh_token`, `user`

**Dashboard:**
1. [ ] Verify balance matches database `saldo_actual`
2. [ ] Verify currency format: `$1.234.567` (Chilean CLP format)
3. [ ] Verify payment history shows last 5 payments
4. [ ] Verify boletas list shows all unpaid boletas
5. [ ] Click on boleta detail
6. [ ] Verify boleta breakdown (consumo, alcantarillado, otros, total)
7. [ ] Verify fecha_emision formatted as `dd/MM/yyyy`

**Logout & Re-login:**
1. [ ] Click "Cerrar Sesión"
2. [ ] Verify redirect to `/login`
3. [ ] Verify localStorage cleared
4. [ ] Login again with same RUT + password
5. [ ] Verify session persists (access_token refreshed via refresh_token)

**Password Recovery:**
1. [ ] Logout
2. [ ] Click "¿Olvidaste tu contraseña?"
3. [ ] Enter RUT: `12.345.678-5`
4. [ ] Click "Enviar Código"
5. [ ] Copy 6-digit code from console/logs (MVP: displayed for testing)
6. [ ] Enter code + new password
7. [ ] Verify redirect to login
8. [ ] Login with new password
9. [ ] Verify old password doesn't work

**Session Expiry:**
1. [ ] Manually expire access_token (edit in localStorage, change exp to past)
2. [ ] Refresh page
3. [ ] Verify auto-refresh via refresh_token (check Network tab)
4. [ ] Verify user stays logged in

**Account Lockout:**
1. [ ] Logout
2. [ ] Attempt login with wrong password (5 times)
3. [ ] Verify 6th attempt shows "Cuenta bloqueada, intente en 15 minutos"
4. [ ] Verify database: `cuenta_bloqueada = true`, `bloqueada_hasta` set
5. [ ] Admin unlocks account via admin UI
6. [ ] Verify customer can login again

---

#### **Admin Flow (90 minutes)**

**Admin Login:**
1. [ ] Visit `/admin/login`
2. [ ] Enter email: `admin@coab.cl`
3. [ ] Enter password: `Admin1234!`
4. [ ] Click "Ingresar"
5. [ ] Verify redirect to `/admin/customers`
6. [ ] Verify localStorage has `admin_access_token`, `admin_refresh_token`

**Customer Search:**
1. [ ] Search by RUT: `12.345.678` (partial)
2. [ ] Verify results appear after 300ms debounce
3. [ ] Verify pagination (if > 50 results)
4. [ ] Search by name: `Juan Perez`
5. [ ] Verify case-insensitive search works
6. [ ] Search by address: `Calle Falsa 123`
7. [ ] Verify results match

**Customer Profile:**
1. [ ] Click on customer from search results
2. [ ] Verify profile shows:
   - RUT, nombre_completo, email, telefono
   - saldo_actual (formatted as CLP)
   - estado_cuenta (MOROSO/AL_DIA)
   - ultimo_inicio_sesion
3. [ ] Verify tabs: Boletas, Pagos, Historial

**View Boletas:**
1. [ ] Click "Boletas" tab
2. [ ] Verify all boletas listed
3. [ ] Verify estado: pendiente/pagada
4. [ ] Click boleta detail
5. [ ] Verify breakdown matches database

**View Payments:**
1. [ ] Click "Pagos" tab
2. [ ] Verify all payments listed
3. [ ] Verify fecha_pago, monto, metodo_pago, operador

**Register Manual Payment:**
1. [ ] Click "Registrar Pago"
2. [ ] Enter monto: `50000`
3. [ ] Select metodo_pago: `efectivo`
4. [ ] Enter observaciones: `Pago en oficina`
5. [ ] Click "Guardar"
6. [ ] Verify success message
7. [ ] Verify database:
   - `transacciones_pago` new record
   - Oldest `boleta` marked as `pagada` (FIFO)
   - `saldo_actual` decreased by 50000
8. [ ] Verify customer portal shows new payment
9. [ ] Verify customer portal shows updated balance

**FIFO Payment Application:**
1. [ ] Find customer with 3 unpaid boletas:
   - Boleta 1: $30,000 (oldest)
   - Boleta 2: $40,000
   - Boleta 3: $50,000
2. [ ] Register payment: $100,000
3. [ ] Verify:
   - Boleta 1: `estado = pagada` (fully paid)
   - Boleta 2: `estado = pagada` (fully paid)
   - Boleta 3: `estado = pendiente`, `notas` shows partial payment of $30,000
   - `saldo_actual` decreased by $100,000

**Generate Setup Link:**
1. [ ] Find customer without password (`hash_contrasena = NULL`)
2. [ ] Click "Generar Link de Configuración"
3. [ ] Verify success message with WhatsApp link
4. [ ] Copy link
5. [ ] Open in incognito window
6. [ ] Complete setup flow (test as customer)

**Unlock Locked Account:**
1. [ ] Find customer with `cuenta_bloqueada = true`
2. [ ] Click "Desbloquear Cuenta"
3. [ ] Verify success message
4. [ ] Verify database: `cuenta_bloqueada = false`, `intentos_fallidos = 0`
5. [ ] Test customer can login

---

#### **Security Tests (60 minutes)**

**Authorization Tests:**
1. [ ] Customer cannot access other customer's data:
   - Login as customer A (RUT: 11.111.111-1)
   - Manually change URL to: `/api/v1/clientes/999/saldo`
   - Verify 403 Forbidden
2. [ ] Customer cannot access admin endpoints:
   - Login as customer
   - Try: `GET /api/v1/admin/clientes`
   - Verify 403 Forbidden
3. [ ] Admin can access all customer data:
   - Login as admin
   - Try: `GET /api/v1/admin/clientes/123`
   - Verify 200 OK

**Authentication Tests:**
1. [ ] Unauthenticated user redirected to login:
   - Clear localStorage
   - Visit `/dashboard`
   - Verify redirect to `/login`
2. [ ] Invalid JWT rejected:
   - Set `access_token` to `invalid.jwt.token`
   - Refresh page
   - Verify 401 Unauthorized, redirect to `/login`
3. [ ] Expired JWT refreshed automatically:
   - Manually expire `access_token` (change exp in localStorage)
   - Make API request
   - Verify auto-refresh via `refresh_token` (check Network tab)

**Account Lockout:**
1. [ ] Lockout works:
   - Login with wrong password 5 times
   - Verify 6th attempt shows "Cuenta bloqueada"
   - Verify database: `cuenta_bloqueada = true`
2. [ ] Lockout expires:
   - Wait 15 minutes (or manually update `bloqueada_hasta` in database)
   - Login with correct password
   - Verify success

**Token Security:**
1. [ ] Setup token cannot be reused:
   - Use setup link once
   - Try to use same link again
   - Verify "Token ya usado" error
2. [ ] Expired setup token rejected:
   - Manually expire token in database (`expira_en = NOW() - INTERVAL '1 hour'`)
   - Try to use link
   - Verify "Token expirado" error
3. [ ] Reset code expires:
   - Request password reset
   - Wait 16 minutes (or manually expire in database)
   - Try to use code
   - Verify "Código expirado" error

---

#### **Mobile Tests - Real Devices (4 hours)**

**CRITICAL:** Must test on real devices or BrowserStack before launch.

**iOS Safari (iPhone 12+, iOS 15+):**
1. [ ] Visit `https://coab-frontend.pages.dev` on iPhone
2. [ ] RUT input:
   - Verify numeric keyboard appears (`inputmode="numeric"`)
   - Verify auto-formatting works (dots and dash)
   - Verify cursor position correct after formatting
3. [ ] Password input:
   - Verify secure keyboard (dots instead of letters)
   - Verify "Show Password" toggle works
4. [ ] Login flow:
   - Enter RUT + password
   - Tap "Ingresar" (verify button >= 44px)
   - Verify redirect to dashboard
5. [ ] Dashboard:
   - Verify balance readable (font-size >= 16px)
   - Verify payment history scrollable
   - Verify boletas list scrollable
   - Verify pull-to-refresh works (if implemented)
6. [ ] Landscape orientation:
   - Rotate device
   - Verify UI adapts (no horizontal scroll)
   - Verify inputs still usable
7. [ ] iOS Safari quirks:
   - Verify no 300ms tap delay (should feel instant)
   - Verify no zoom on input focus (font-size >= 16px)
   - Verify fixed positioning works (header doesn't jump)
8. [ ] Network:
   - Enable "Low Data Mode" in iOS settings
   - Verify app still loads (< 5s)

**Android Chrome (Samsung/Pixel, Android 10+):**
1. [ ] Visit `https://coab-frontend.pages.dev` on Android
2. [ ] RUT input:
   - Verify numeric keyboard appears
   - Verify auto-formatting works
3. [ ] Password input:
   - Verify secure keyboard
   - Verify "Show Password" toggle works
4. [ ] Login flow:
   - Enter RUT + password
   - Tap "Ingresar"
   - Verify redirect to dashboard
5. [ ] Dashboard:
   - Verify all content visible (no cut-off)
   - Verify scrolling smooth (60fps)
6. [ ] Keyboard:
   - Verify on-screen keyboard doesn't cover inputs
   - Verify page scrolls when input focused
7. [ ] Back button:
   - Tap Android back button
   - Verify navigation history works
8. [ ] Network:
   - Enable "Data Saver" in Chrome settings
   - Verify app still loads

**Touch Latency Test:**
1. [ ] Tap buttons rapidly (10 taps/second)
2. [ ] Verify all taps registered (no missed taps)
3. [ ] Verify feedback instant (ripple effect < 100ms)

**3G Network Simulation:**
1. [ ] Chrome DevTools → Network → Slow 3G
2. [ ] Refresh page
3. [ ] Verify FCP < 2.5s
4. [ ] Verify app usable (loading states shown)

---

#### **Edge Cases & Error Handling (4 hours)**

**Session Management:**
1. [ ] Browser refresh during token refresh:
   - Expire access_token
   - Start refresh request
   - Immediately refresh browser (F5)
   - Verify user stays logged in (no error)
2. [ ] Multiple tabs:
   - Login in Tab 1
   - Open Tab 2 (same user)
   - Logout in Tab 1
   - Refresh Tab 2
   - Verify Tab 2 redirects to login
3. [ ] Concurrent token refresh:
   - Open 2 tabs
   - Expire access_token in both
   - Make API request in both simultaneously
   - Verify both refresh successfully (no race condition)

**Payment Edge Cases:**
1. [ ] Network failure during payment:
   - Start payment registration
   - Kill network connection (DevTools → Offline)
   - Verify error message shown
   - Restore network
   - Verify payment not duplicated (transaction rolled back)
2. [ ] Concurrent payments to same customer:
   - Admin 1 registers payment: $50,000
   - Admin 2 registers payment: $30,000 (simultaneously)
   - Verify both succeed
   - Verify FIFO applied correctly
   - Verify `saldo_actual` decreased by $80,000 (not less)
3. [ ] Payment > total debt:
   - Customer owes $100,000
   - Register payment: $200,000
   - Verify all boletas marked as `pagada`
   - Verify remaining $100,000 shown in success message
   - Verify `saldo_actual = -100000` (credit)

**Race Conditions:**
1. [ ] Account lockout race condition:
   - Open 5 browser tabs
   - Enter wrong password in all tabs
   - Click "Ingresar" simultaneously
   - Verify account locked after 5th attempt (not 25th)
   - Verify `intentos_fallidos` doesn't exceed 5
2. [ ] Setup token race condition:
   - Open setup link in 2 tabs
   - Enter password in Tab 1, click "Configurar"
   - Immediately enter password in Tab 2, click "Configurar"
   - Verify only first succeeds
   - Verify second shows "Token ya usado"

**Input Validation:**
1. [ ] XSS attempt in observaciones:
   - Register payment with observaciones: `<script>alert('XSS')</script>`
   - Verify script not executed (sanitized or escaped)
   - Verify displayed as plain text
2. [ ] SQL injection in RUT:
   - Login with RUT: `'; DROP TABLE cliente; --`
   - Verify rejected by Zod (invalid RUT format)
   - Verify database intact
3. [ ] Very long input:
   - Enter observaciones: 10,000 characters
   - Verify rejected (max length validation)
   - Or verify truncated gracefully

**UI Edge Cases:**
1. [ ] Very long customer name:
   - Customer: `Juan Pablo Andrés Francisco de la Cruz García López Martínez`
   - Verify name doesn't break layout (text wraps or truncates)
2. [ ] Customer with 100+ boletas:
   - Find customer with many boletas
   - Open boletas tab
   - Verify pagination works (50 per page)
   - Verify performance acceptable (< 500ms load)
3. [ ] Customer with 0 balance:
   - Find customer with `saldo_actual = 0`
   - Verify dashboard shows `$0` (not blank)
   - Verify estado_cuenta = "AL_DIA"
4. [ ] Admin search with special chars:
   - Search for: `O'Brien` (apostrophe)
   - Verify results shown (no SQL error)
   - Search for: `García` (accent)
   - Verify results shown (accent-insensitive search)

**Error Recovery:**
1. [ ] Database connection lost:
   - Stop Supabase connection (simulate via firewall)
   - Make API request
   - Verify 503 Service Unavailable shown
   - Verify user-friendly error message (not stack trace)
   - Restore connection
   - Verify app recovers automatically
2. [ ] Sentry down:
   - Disable Sentry (invalid DSN)
   - Trigger error
   - Verify app still works (error logged to console, not Sentry)
3. [ ] Backend down:
   - Stop Railway backend
   - Refresh frontend
   - Verify error message: "Servidor no disponible, intente más tarde"
   - Verify no infinite loading spinner

**Performance Stress Tests:**
1. [ ] 100 concurrent logins:
   - Use tool like Apache Bench: `ab -n 100 -c 10 <login_url>`
   - Verify all succeed (no rate limit errors)
   - Verify response time < 500ms
2. [ ] 1000 admin searches:
   - Use tool to send 1000 search requests
   - Verify no database connection errors
   - Verify response time stays < 200ms

---

## Iteration 8 Complete! ✅

**What You Have:**
- ✅ Live production application on internet
- ✅ 355 customers with real data
- ✅ Customer portal (mobile-optimized, Lighthouse > 85)
- ✅ Admin portal (desktop-optimized)
- ✅ WhatsApp onboarding flow (manual link sharing in MVP)
- ✅ Manual payment entry with FIFO application
- ✅ Self-service password recovery (6-digit code)
- ✅ Secure authentication (JWT + refresh token rotation)
- ✅ Argon2id password hashing (OWASP #1 recommendation)
- ✅ HTTPS encryption (Railway + Cloudflare)
- ✅ Error tracking (Sentry free tier)
- ✅ Uptime monitoring (UptimeRobot free tier)
- ✅ Cold start prevention (Cron-Job.org)
- ✅ Backup strategy (Supabase auto + manual weekly)
- ✅ Comprehensive E2E testing (2 days)
- ✅ Real device testing (iOS Safari + Android Chrome)
- ✅ Total cost: **$5/month** (Railway Hobby)

**Deployment URLs:**
- Backend: `https://coab-backend-production.up.railway.app`
- Frontend: `https://coab-frontend.pages.dev`
- Health check: `https://coab-backend-production.up.railway.app/health`

**Monitoring:**
- Sentry: https://sentry.io (error tracking)
- UptimeRobot: https://uptimerobot.com (uptime monitoring)
- Railway Dashboard: https://railway.app (logs, metrics)
- Cloudflare Dashboard: https://dash.cloudflare.com (analytics)

**Backup:**
- Supabase: Daily auto-backups (7-day retention)
- Manual: Weekly backups via `scripts/backup.sh`
- Recovery time: < 2 hours

**Commit Message:**
```
feat: production deployment to Railway + Cloudflare Pages

Backend (Railway):
- Fastify v5 production configuration
- HTTPS enforcement via x-forwarded-proto
- Helmet security headers (HSTS, CSP)
- Rate limiting (100 req/15min general, 5 req/15min auth)
- Pino v9 logging with redaction
- Sentry error tracking + performance monitoring
- Health check endpoint (/health) with database ping
- Supabase connection pooling (pgbouncer + connection_limit=1)
- Argon2id password hashing (memoryCost: 19456)
- JWT with jose library (24h customer, 8h admin)
- Deployed to Railway Hobby ($5/month)

Frontend (Cloudflare Pages):
- Vite v7 production build
- Mobile optimization (44px touch targets, Lighthouse > 85)
- Chilean 3G optimization (FCP < 2.5s)
- React Router v7.8.2
- TanStack Query v5 with caching
- Deployed to Cloudflare Pages (Free tier)

Infrastructure:
- UptimeRobot monitoring (backend + frontend)
- Cron-Job.org keep-warm (every 10 min)
- Supabase daily backups + manual weekly backups
- Disaster recovery procedure documented

Testing:
- 2-day comprehensive E2E testing
- Real device testing (iOS Safari, Android Chrome)
- Security testing (XSS, SQL injection, CSRF)
- Edge case testing (race conditions, network failures)
- Performance stress testing (100 concurrent logins)

🚀 Ready to launch!
```

---

## Post-MVP: Phase 2 Planning

After MVP launch and user validation (4-6 weeks), prioritize:

1. **Transbank WebPay Plus Integration** - Online credit/debit card payments
2. **Infobip WhatsApp Auto-Send** - Automated onboarding (replace manual link sharing)
3. **PDF Generation** - Downloadable boletas (Puppeteer + React)
4. **Service Requests** - Report water issues (leaks, outages, etc.)
5. **Admin Analytics Dashboard** - Payment trends, customer growth, revenue reports
6. **Email Notifications** - Payment confirmations, boleta alerts (SMTP)
7. **Multi-tenant Support** - Expand to other water companies

**Next Steps:**
1. Monitor Sentry for errors (first 2 weeks critical)
2. Collect user feedback (focus groups with 20 early adopters)
3. Track UptimeRobot alerts (aim for 99.9% uptime)
4. Weekly manual backups (every Sunday)
5. Review Railway usage costs (should stay < $5/month)

**Ready to launch! 🚀**
