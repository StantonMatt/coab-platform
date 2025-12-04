# ITERATION 8: Production Deployment & Comprehensive Testing

**Goal:** Deploy to production on Railway (backend) + Cloudflare Pages (frontend), set up monitoring, implement comprehensive testing, and establish backup procedures

**You'll Be Able To:** Access the live production site with full monitoring, error tracking, and backup verification

**Prerequisites:** All iterations 1-7.5 complete

---

## Deployment Tasks

### Task 8.1: Backend Deployment to Railway

**Why Railway:**
- Simple PostgreSQL deployment (we use Supabase, so Railway is just for compute)
- Auto-deploy from GitHub
- Hobby plan: $5/month (free tier available for testing)
- Built-in health checks and auto-restart

**Step 1: Create Railway Account & Project**
1. Sign up at https://railway.app
2. Create new project from GitHub repo
3. Select `coab-backend` directory as root

**Step 2: Configure Environment Variables**

In Railway dashboard → Settings → Variables:

```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database (Supabase - use connection pooling URL)
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres"

# Authentication
JWT_SECRET="your-production-jwt-secret-minimum-64-chars"

# Frontend URL (Cloudflare Pages URL after deployment)
FRONTEND_URL=https://portal.coab.cl
CORS_ORIGIN=https://portal.coab.cl

# HTTPS enforcement
FORCE_HTTPS=true

# Infobip (from Iteration 7)
INFOBIP_API_KEY=your-api-key
INFOBIP_BASE_URL=https://api.infobip.com
INFOBIP_WHATSAPP_SENDER=your-sender-number

# Error Tracking (Task 8.3)
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
```

**Step 3: Configure Build Settings**

Railway → Settings:
- **Root Directory:** `coab-backend`
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start`
- **Health Check Path:** `/health`
- **Health Check Timeout:** 300 seconds (for cold starts)

**Step 4: Deploy & Verify**
1. Push to main branch
2. Railway auto-deploys
3. Check deployment logs for errors
4. Test health endpoint: `curl https://your-app.railway.app/health`

**Acceptance Criteria:**
- [ ] Railway deployment succeeds
- [ ] `/health` returns 200 OK
- [ ] Environment variables configured
- [ ] CORS allows frontend domain
- [ ] Supabase connection works (check logs)

---

### Task 8.2: Frontend Deployment to Cloudflare Pages

**Why Cloudflare Pages:**
- Free tier with generous limits
- Global CDN (fast load times in Chile)
- Auto-deploy from GitHub
- Custom domain support
- Edge caching

**Step 1: Create Cloudflare Account & Project**
1. Sign up at https://pages.cloudflare.com
2. Connect GitHub repo
3. Select `coab-frontend` directory

**Step 2: Configure Build Settings**
- **Framework preset:** Vite
- **Build command:** `npm ci && npm run build`
- **Build output directory:** `dist`
- **Root directory:** `coab-frontend`

**Step 3: Configure Environment Variables**

Cloudflare Pages → Settings → Environment Variables:

```bash
VITE_API_URL=https://your-app.railway.app/api/v1
```

**Step 4: Configure Custom Domain (Optional)**
1. Add custom domain: `portal.coab.cl`
2. Configure DNS CNAME to Cloudflare
3. Enable HTTPS (automatic with Cloudflare)

**Step 5: Deploy & Verify**
1. Push to main branch
2. Cloudflare auto-deploys
3. Test at `https://your-project.pages.dev` or custom domain
4. Verify API calls work

**Acceptance Criteria:**
- [ ] Cloudflare Pages deployment succeeds
- [ ] Frontend loads without errors
- [ ] API calls to Railway backend work
- [ ] Login flow works end-to-end
- [ ] Mobile responsive design works

---

### Task 8.3: Error Tracking with Sentry

**Step 1: Create Sentry Account**
1. Sign up at https://sentry.io (free tier: 5k errors/month)
2. Create project: `coab-backend` (Node.js)
3. Create project: `coab-frontend` (React)
4. Get DSN for each

**Step 2: Backend Integration**

Update `src/app.ts`:

```typescript
import * as Sentry from '@sentry/node';

// Initialize Sentry (before other code)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // 10% of transactions
    integrations: [
      // Auto-instrument Fastify
      Sentry.fastifyIntegration()
    ]
  });
}

// ... rest of app setup ...

// Global error handler
app.setErrorHandler(async (error, request, reply) => {
  // Capture in Sentry
  Sentry.captureException(error, {
    extra: {
      url: request.url,
      method: request.method,
      userId: request.user?.userId?.toString(),
      userType: request.user?.tipo
    }
  });

  app.log.error(error);

  return reply.code(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
      requestId: request.id
    }
  });
  });
```

**Step 3: Frontend Integration**

Create `src/lib/sentry.ts`:

```typescript
import * as Sentry from '@sentry/react';

export function initSentry() {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration()
      ],
      tracesSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0
    });
  }
}
```

Update `src/main.tsx`:

```typescript
import { initSentry } from './lib/sentry';
initSentry();

// Add Error Boundary
import * as Sentry from '@sentry/react';

function FallbackComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Ha ocurrido un error
        </h1>
        <p className="text-gray-600 mb-4">
          Estamos trabajando para solucionarlo.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-primary-blue text-white px-4 py-2 rounded"
        >
          Recargar Página
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<FallbackComponent />}>
      <QueryClientProvider client={queryClient}>
        {/* ... rest of app ... */}
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
```

**Acceptance Criteria:**
- [ ] Sentry captures backend errors
- [ ] Sentry captures frontend errors
- [ ] Error includes user context (ID, type)
- [ ] Error includes request context (URL, method)
- [ ] Alert notifications configured
- [ ] Error Boundary shows fallback UI on crash

---

### Task 8.4: Uptime Monitoring with UptimeRobot

**Step 1: Create UptimeRobot Account**
1. Sign up at https://uptimerobot.com (free tier: 50 monitors)
2. Create HTTP monitor:
   - URL: `https://your-app.railway.app/health`
   - Interval: 5 minutes
   - Alert: Email + Slack (optional)

3. Create HTTP monitor for frontend:
   - URL: `https://portal.coab.cl`
   - Interval: 5 minutes

**Step 2: Configure Alerts**
- Email notifications for downtime
- Slack webhook (optional)
- Configure alert escalation

**Acceptance Criteria:**
- [ ] Backend health monitored every 5 minutes
- [ ] Frontend availability monitored
- [ ] Email alerts configured for downtime
- [ ] First alert received (test by taking backend offline)

---

### Task 8.5: Cold Start Prevention with Cron Job

**Problem:** Railway Hobby plan puts apps to sleep after inactivity. First request takes 10-20 seconds (cold start).

**Solution:** External cron job to ping health endpoint every 10 minutes.

**Option 1: cron-job.org (Free)**
1. Sign up at https://cron-job.org
2. Create job:
   - URL: `https://your-app.railway.app/health`
   - Schedule: `*/10 * * * *` (every 10 minutes)
   - Method: GET
   - Timeout: 30 seconds

**Option 2: Cloudflare Workers (Free)**

Create a Cloudflare Worker:

```javascript
export default {
  async scheduled(event, env, ctx) {
    const response = await fetch('https://your-app.railway.app/health');
    console.log(`Health check: ${response.status}`);
  }
};
```

Configure cron trigger: `*/10 * * * *`

**Note:** Railway Pro plan ($20/month) includes always-on and built-in cron. The external approach is cost-effective for the Hobby plan.

**Acceptance Criteria:**
- [ ] Cron job configured and running
- [ ] Health endpoint pinged every 10 minutes
- [ ] Cold starts eliminated during business hours

---

## Testing Tasks

### Task 8.6: Comprehensive E2E Testing

**Test Matrix:**

| Feature | Customer Portal | Admin Portal |
|---------|-----------------|--------------|
| Login | ✓ RUT + password | ✓ Email + password |
| Account Lock | ✓ 5 failed attempts | ✓ 5 failed attempts |
| Account Unlock | - | ✓ Admin can unlock |
| Dashboard | ✓ View balance, boletas, pagos | ✓ Search, profiles |
| Payment Entry | - | ✓ FIFO application |
| Password Setup | ✓ Via WhatsApp link | ✓ Generate link |
| Password Recovery | ✓ Self-service | - |
| Service Notifications | ✓ View active alerts | - |

**Critical Path Tests:**

1. **New Customer Onboarding:**
   - Admin searches customer → no password
   - Admin sends setup link
   - Customer opens link → sets password
   - Customer logs in → sees dashboard

2. **Payment Processing:**
   - Admin searches customer with pending boletas
   - Admin registers payment ($25,000)
   - Verify FIFO application (oldest boleta first)
   - Customer sees updated balance

3. **Password Recovery:**
   - Customer forgets password
   - Customer requests reset code
   - Customer enters code → sets new password
   - Customer logs in with new password

4. **Account Lockout/Recovery:**
   - Customer enters wrong password 5 times
   - Customer locked out (15 min)
   - Admin unlocks account
   - Customer can login again

**Test Devices:**
- [ ] iPhone Safari (iOS 15+)
- [ ] Android Chrome (latest)
- [ ] Desktop Chrome (latest)
- [ ] Desktop Firefox (latest)

**Acceptance Criteria:**
- [ ] All critical paths pass
- [ ] Mobile touch targets ≥ 44px
- [ ] No console errors
- [ ] Network tab shows no failed requests
- [ ] Lighthouse mobile score > 85

---

### Task 8.7: Lighthouse Performance Audit

**Run Lighthouse:**
```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit (mobile)
lighthouse https://portal.coab.cl --preset=mobile --output=html --output-path=./lighthouse-mobile.html

# Run audit (desktop)
lighthouse https://portal.coab.cl --preset=desktop --output=html --output-path=./lighthouse-desktop.html
```

**Target Scores:**
- Performance: > 85
- Accessibility: > 90
- Best Practices: > 90
- SEO: > 80

**Common Issues to Fix:**
- Large images: Use WebP, lazy loading
- Unused JavaScript: Code splitting
- Missing alt text: Add to all images
- Touch targets: Minimum 44x44px

**Acceptance Criteria:**
- [ ] Mobile performance > 85
- [ ] Accessibility > 90
- [ ] No critical issues
- [ ] Touch targets all ≥ 44px

---

### Task 8.8: Security Audit

**Automated Scan:**
```bash
# Install OWASP ZAP or use online scanner
# Scan: https://portal.coab.cl
```

**Manual Checklist:**

1. **Authentication:**
   - [ ] Passwords hashed with Argon2id
   - [ ] JWT tokens have reasonable expiry (24h customer, 8h admin)
   - [ ] Refresh tokens rotated on use
   - [ ] Account lockout after 5 failed attempts

2. **Authorization:**
   - [ ] Customer can only see own data
   - [ ] Admin routes require admin JWT
   - [ ] RBAC roles enforced where applicable

3. **Input Validation:**
   - [ ] All inputs validated with Zod
   - [ ] RUT validation (Modulus 11)
   - [ ] SQL injection prevented (Prisma parameterized queries)
   - [ ] XSS prevented (React escapes by default)

4. **Transport Security:**
   - [ ] HTTPS enforced in production
   - [ ] CORS configured for specific origins
   - [ ] Security headers (Helmet)

5. **Rate Limiting:**
   - [ ] Auth endpoints: 5 req/15min
   - [ ] Setup link generation: 3 req/hour
   - [ ] Password reset: 3 req/15min

**Acceptance Criteria:**
- [ ] No critical vulnerabilities
- [ ] All OWASP Top 10 addressed
- [ ] Rate limiting effective
- [ ] Security headers present

---

## Operational Tasks

### Task 8.9: Backup Verification

**Supabase Automatic Backups:**
- Daily backups (free tier: 7-day retention)
- Point-in-time recovery (Pro plan)

**Manual Backup Script:**

Create `scripts/backup.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function backup() {
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `backup-${timestamp}.sql`;

  // Use DIRECT_URL (not pooled) for pg_dump
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new Error('DIRECT_URL not configured');
  }

  console.log('Starting backup...');

  await execAsync(
    `pg_dump "${directUrl}" > backups/${filename}`,
    { maxBuffer: 100 * 1024 * 1024 } // 100MB buffer
  );

  console.log(`Backup created: ${filename}`);

  // Optional: Upload to S3/GCS
  // await uploadToS3(`backups/${filename}`);
}

backup().catch(console.error);
```

**Backup Verification:**
1. Download backup from Supabase dashboard
2. Restore to local/test database
3. Verify customer count matches
4. Verify recent transactions present

**Acceptance Criteria:**
- [ ] Daily backups running on Supabase
- [ ] Manual backup script works
- [ ] Backup restoration tested
- [ ] Customer data verified after restore

---

### Task 8.10: Daily Balance Reconciliation Script

**Purpose:** Verify `saldo_actual` matches sum of pending boletas.

Create `scripts/reconcile-balances.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reconcileBalances() {
  console.log('Starting balance reconciliation...');
  const startTime = Date.now();

  // Use single aggregate query for efficiency (not N+1)
  const discrepancies = await prisma.$queryRaw<Array<{
    cliente_id: bigint;
    rut: string;
    nombre_completo: string;
    saldo_actual: number;
    saldo_calculado: number;
    diferencia: number;
  }>>`
    SELECT
      c.id as cliente_id,
      c.rut,
      c.nombre_completo,
      c.saldo_actual,
      COALESCE(SUM(b.monto_total), 0)::int as saldo_calculado,
      c.saldo_actual - COALESCE(SUM(b.monto_total), 0)::int as diferencia
    FROM clientes c
    LEFT JOIN boletas b ON b.cliente_id = c.id AND b.estado = 'pendiente'
    WHERE c.es_cliente_actual = true
    GROUP BY c.id, c.rut, c.nombre_completo, c.saldo_actual
    HAVING c.saldo_actual != COALESCE(SUM(b.monto_total), 0)
  `;

  if (discrepancies.length === 0) {
    console.log('✅ All balances match!');
  } else {
    console.log(`❌ Found ${discrepancies.length} discrepancies:`);

    for (const d of discrepancies) {
      console.log(`  - ${d.rut} (${d.nombre_completo})`);
      console.log(`    saldo_actual: $${d.saldo_actual.toLocaleString()}`);
      console.log(`    calculated: $${d.saldo_calculado.toLocaleString()}`);
      console.log(`    diff: $${d.diferencia.toLocaleString()}`);
    }

    // Auto-fix discrepancies
    if (process.argv.includes('--fix')) {
      console.log('\nAuto-fixing discrepancies...');

      for (const d of discrepancies) {
        await prisma.cliente.update({
          where: { id: d.cliente_id },
          data: {
            saldo_actual: d.saldo_calculado,
            estado_cuenta: d.saldo_calculado > 0 ? 'MOROSO' : 'AL_DIA'
          }
        });
        console.log(`  ✓ Fixed ${d.rut}`);
      }

      console.log('✅ All discrepancies fixed!');
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`\nCompleted in ${elapsed}ms`);

  await prisma.$disconnect();
}

reconcileBalances().catch(console.error);
```

**Run:**
```bash
# Check only
npm run reconcile-balances

# Check and fix
npm run reconcile-balances -- --fix
```

**Acceptance Criteria:**
- [ ] Script runs without errors
- [ ] Detects intentional discrepancies (test)
- [ ] Auto-fix mode works
- [ ] Efficient single query (not N+1)

---

### Task 8.11: CI/CD Pipeline with GitHub Actions

**Create:** `.github/workflows/ci.yml`

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./coab-backend

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: ./coab-backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint --if-present

      - name: Run type check
        run: npm run typecheck --if-present

      - name: Run tests
        run: npm test --if-present
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          JWT_SECRET: test-jwt-secret-for-ci

  frontend-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./coab-frontend

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: ./coab-frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint --if-present

      - name: Run type check
        run: npm run typecheck --if-present

      - name: Build
        run: npm run build
        env:
          VITE_API_URL: https://api.coab.cl

  # Deploy job (runs only on main)
  deploy:
    needs: [backend-test, frontend-test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest

    steps:
      - name: Deploy Backend
        run: |
          echo "Railway auto-deploys from GitHub - no action needed"

      - name: Deploy Frontend
        run: |
          echo "Cloudflare Pages auto-deploys from GitHub - no action needed"
```

**Configure GitHub Secrets:**
- `TEST_DATABASE_URL`: Supabase test/staging database URL

**Acceptance Criteria:**
- [ ] CI runs on push and PR
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Tests pass (when added)
- [ ] Build succeeds
- [ ] Deploy triggers on main branch

---

### Task 8.12: Staging Environment (Recommended)

**Purpose:** Test deployments before production.

**Option 1: Railway Preview Deployments**
- Enable in Railway settings
- Each PR gets a preview URL
- Auto-deletes when PR merged

**Option 2: Separate Staging Project**
1. Create `coab-staging` project in Railway
2. Point to staging database (separate Supabase project)
3. Deploy from `develop` branch

**Staging Environment Variables:**
```bash
NODE_ENV=staging
FRONTEND_URL=https://staging.portal.coab.cl
CORS_ORIGIN=https://staging.portal.coab.cl
# Use staging Supabase database
DATABASE_URL="postgresql://..."
```

**Acceptance Criteria:**
- [ ] Staging environment configured
- [ ] Can test deployments before production
- [ ] Staging uses separate database
- [ ] PR previews available (Railway)

---

## Iteration 8 Complete! 🎉

**Production Deployment Checklist:**
- [x] Backend deployed to Railway
- [x] Frontend deployed to Cloudflare Pages
- [x] Custom domain configured (optional)
- [x] Environment variables set
- [x] Sentry error tracking configured
- [x] UptimeRobot monitoring active
- [x] Cold start prevention (cron job)
- [x] CI/CD pipeline with GitHub Actions
- [x] Staging environment (recommended)

**Operational Checklist:**
- [x] Supabase backups verified
- [x] Manual backup script tested
- [x] Daily reconciliation script ready
- [x] Security audit passed
- [x] Lighthouse scores acceptable

**Testing Checklist:**
- [x] All critical paths tested
- [x] Mobile devices tested (iOS Safari, Android Chrome)
- [x] Performance acceptable (FCP < 2.5s on 3G)
- [x] Touch targets ≥ 44px
- [x] Error Boundary catches frontend crashes

**You're Now Live! 🚀**

**Monitoring Dashboard Links:**
- Railway: https://railway.app/dashboard
- Cloudflare: https://dash.cloudflare.com
- Sentry: https://sentry.io
- UptimeRobot: https://uptimerobot.com/dashboard
- Supabase: https://supabase.com/dashboard

**Daily Operations:**
1. Check UptimeRobot for downtime alerts
2. Check Sentry for new errors
3. Review Railway logs for anomalies
4. Run balance reconciliation weekly