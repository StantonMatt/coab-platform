# COAB Platform - Implementation Plan

**Single Source of Truth for Development**

---

## Quick Start

**Approach:** Build-Test-Iterate
**Philosophy:** Minimum backend → Test with frontend → Iterate

Each iteration delivers **testable, working functionality** that you can see in the browser.

---

## Progress Tracking

Mark iterations as you complete them:

- [ ] **Iteration 1:** Project Setup (Est: 4-5 days | Actual: ___ days) ⚠️ **Extended** for data migration
- [ ] **Iteration 2:** Customer Auth (Est: 3-4 days | Actual: ___ days)
- [ ] **Iteration 3:** Customer Dashboard (Est: 3-4 days | Actual: ___ days)
- [ ] **Iteration 4:** Admin Auth (Est: 1-2 days | Actual: ___ days)
- [ ] **Iteration 5:** Admin Search (Est: 2-3 days | Actual: ___ days)
- [ ] **Iteration 6:** Payment Entry (Est: 4-5 days | Actual: ___ days)
- [ ] **Iteration 7:** Password Setup (Est: 2-3 days | Actual: ___ days)
- [ ] **Iteration 7.5:** Password Recovery (Est: 1-2 days | Actual: ___ days)
- [ ] **Iteration 8:** Deploy & Test (Est: 6-7 days | Actual: ___ days)

**Total Estimated:** 5-7 weeks (26-35 days of active development)

**Note:** Timeline includes all MVP features:
- Automated WhatsApp onboarding (Infobip - Iteration 7)
- Secure password recovery (WhatsApp codes - Iteration 7.5)
- Balance reconciliation (Iteration 8)
- Service notifications, audit logging, payment receipts (Iterations 3, 6)

---

## Overview of Iterations

| # | Iteration | Backend Deliverable | Frontend Deliverable | Duration |
|---|-----------|---------------------|----------------------|----------|
| **1** | **[Project Setup](.claude/iterations/01-project-setup.md)** | Fastify + Prisma + Supabase | Vite + React Router | 4-5 days |
| **2** | **[Customer Auth](.claude/iterations/02-customer-auth.md)** | RUT login + Argon2id + jose | Login page with auto-refresh | 3-4 days |
| **3** | **[Customer Dashboard](.claude/iterations/03-customer-dashboard.md)** | Balance + history APIs + notifications | Dashboard UI + service alerts | 3-4 days |
| **4** | **[Admin Auth](.claude/iterations/04-admin-auth.md)** | Email login + unlock API | Admin login page | 1-2 days |
| **5** | **[Admin Search](.claude/iterations/05-admin-search.md)** | Customer search API | Search page with debouncing | 2-3 days |
| **6** | **[Payment Entry](.claude/iterations/06-payment-entry.md)** | FIFO + audit logging + receipt | Payment form + print receipt | 4-5 days |
| **7** | **[Password Setup](.claude/iterations/07-password-setup.md)** | Setup token + Infobip WhatsApp | Automated WhatsApp onboarding | 2-3 days |
| **7.5** | **[Password Recovery](.claude/iterations/07.5-password-recovery.md)** | Reset token + Infobip WhatsApp | Secure recovery flow | 1-2 days |
| **8** | **[Deploy & Test](.claude/iterations/08-deploy-test.md)** | Railway + Sentry + backups | Cloudflare Pages + mobile tests | 6-7 days |

---

## Key Improvements (Version 2.2)

Based on professional code review feedback:

### Technology Stack Upgrades

**Backend:**
- **Fastify v5** (replaced Express) - 2x faster, better TypeScript support
- **Argon2id** (replaced bcrypt) - OWASP #1 recommendation for password hashing
- **Pino v9** (replaced Winston) - 5x faster logging, better structured logs
- **jose** (replaced jsonwebtoken) - Modern JWT library, better security
- **Zod v4** (replaced v3) - 10x faster validation

**Frontend:**
- **Vite v7** (replaced Next.js) - Instant HMR, 10x faster builds
- **React Router v7.8.2** (replaced Next.js App Router) - Full SPA control
- **TanStack Query v5** - Smart caching, auto-refetch, optimistic updates

**Deployment:**
- **Railway Hobby** (replaced Render) - $5/month, better performance, no cold starts
- **Cloudflare Pages** (replaced Vercel) - Free tier, global CDN, instant deploys
- **Total Cost:** $5/month (reduced from $20/month Vercel Pro)

### Security & Validation
- **Zod input validation** - Prevents type bugs, injection attacks
- **Refresh token rotation** - Auto-refresh interceptor
- **HTTPS enforcement** - Helmet security headers with CSP
- **Admin account unlock** - Manual unlock endpoint
- **Argon2id hashing** - `memoryCost: 19456, timeCost: 2, parallelism: 1`

### Core Business Logic
- **Payment FIFO application** - Database transactions with Prisma
- **Error recovery** - Pino structured logging with request IDs
- **BigInt JSON serialization** - Fixed globally in app.ts
- **Connection pooling** - `pgbouncer=true&connection_limit=1` (critical for Railway)

### Production Readiness
- **Sentry error tracking** - Free tier with performance monitoring
- **UptimeRobot monitoring** - Free tier (backend + frontend)
- **Railway health checks** - Prevents cold starts with `/health` endpoint
- **Backup verification strategy** - Supabase auto-backups + manual weekly backups
- **Disaster recovery plan** - RTO: 2 hours, RPO: 24 hours

### User Experience
- **Self-service password recovery** - Iteration 7.5 (6-digit code via WhatsApp)
- **Service interruption notifications** - Iteration 3 (critical/warning/info banners)
- **Payment receipts** - Iteration 6 (instant browser print-to-PDF)
- **Automated WhatsApp onboarding** - Iteration 7 (Infobip integration, $1.77 for 355 customers)
- **Data migration** - 355 existing customers with CSV import
- **Real device testing** - iOS Safari, Android Chrome (mandatory)
- **Comprehensive edge case testing** - 2 days allocated (race conditions, network failures)
- **Mobile optimization** - 44px touch targets, Chilean 3G testing, Lighthouse > 85

---

## Supporting Documents

- **[TECH_STACK.md](TECH_STACK.md)** - Complete technology stack (v2.2)
- **[PRD_COMPLETE.md](PRD_COMPLETE.md)** - Complete Product Requirements (60+ pages)
- **[CURSOR.md](CURSOR.md)** - Project overview and guidance
- **[CHANGELOG.md](CHANGELOG.md)** - Track actual progress and deviations

---

## How to Use This Plan

### Starting a New Iteration

1. **Read the iteration file** - Click the link in the table above
2. **Follow tasks sequentially** - Backend first, then frontend
3. **Test as you go** - Each task has acceptance criteria
4. **Commit when done** - Use suggested commit message
5. **Update progress** - Mark checkbox and record actual days in Progress Tracking section

### During Development

- **Backend issues?** See [Debugging Tips](#debugging-tips) below
- **Frontend issues?** See [Debugging Tips](#debugging-tips) below
- **Stuck?** See [Questions & Resources](#questions--resources) below

### After Each Iteration

- [ ] Test happy path manually
- [ ] Test error cases
- [ ] Test on mobile (Chrome DevTools)
- [ ] Commit with descriptive message
- [ ] Update CHANGELOG.md with deviations
- [ ] Mark iteration complete in Progress Tracking

---

## Development Environment

### Backend Stack (Updated v2.2)

**Core Framework:**
- Node.js 22 (ESM modules)
- Fastify v5 (not Express)
- TypeScript 5.7+ (strict mode)

**Database:**
- Prisma ORM v6
- PostgreSQL (Supabase with connection pooling)
- Spanish-named schema (clientes, transacciones_pago, etc.)

**Authentication & Security:**
- Argon2id (`@node-rs/argon2`) - OWASP #1 recommendation
- jose v5 (JWT library) - Modern, secure
- Zod v4 (input validation) - 10x faster than v3
- @fastify/helmet (security headers)
- @fastify/rate-limit (100 req/15min general, 5 req/15min auth)
- @fastify/cors (CORS handling)

**Logging & Monitoring:**
- Pino v9 (structured logging, 5x faster than Winston)
- pino-pretty (development pretty-printing)
- Sentry (@sentry/node, @sentry/profiling-node)

**Utilities:**
- date-fns v4 (date formatting, es-CL locale)
- @fastify/multipart (file uploads for Phase 2)

### Frontend Stack (Updated v2.2)

**Core Framework:**
- Vite v7 (not Next.js) - Instant HMR, 10x faster builds
- React 18 (client-side only, no SSR)
- React Router v7.8.2 (file-based routing)
- TypeScript 5.7+ (strict mode)

**UI & Styling:**
- Tailwind CSS v4
- shadcn/ui (Latest) - Accessible components
- Radix UI primitives
- class-variance-authority (cva)

**State Management:**
- TanStack Query v5.84.1 (server state) - Smart caching
- React Hook Form v7 (forms with validation)
- Zod v4 (form validation schemas)
- Axios v1 (HTTP client with interceptors)

**Utilities:**
- date-fns v4 (es-CL locale)
- clsx, tailwind-merge (className utilities)

### Deployment Architecture (Updated v2.2)

**Backend:**
- **Platform:** Railway Hobby ($5/month with $5 included usage)
- **Features:** Auto-deploy from GitHub, real-time logs, health checks
- **Configuration:** `railway.json` for build/deploy settings
- **Health Check:** `/health` endpoint required (prevents cold starts)
- **URL:** `https://coab-backend-production.up.railway.app`

**Frontend:**
- **Platform:** Cloudflare Pages (Free tier)
- **Features:** Global CDN (275+ locations), instant rollbacks, preview deployments
- **Build:** Vite production build → `dist/` folder
- **URL:** `https://coab-frontend.pages.dev`

**Database:**
- **Platform:** Supabase (Free tier)
- **Connection Pooling:** `pgbouncer=true&connection_limit=1` (CRITICAL)
- **Backups:** Daily auto-backups (7-day retention) + manual weekly backups
- **Storage:** 50GB included (for PDF files in Phase 2)

**Monitoring:**
- **Error Tracking:** Sentry (Free tier - 5k events/month)
- **Uptime Monitoring:** UptimeRobot (Free tier - 50 monitors, 5-min intervals)
- **Cold Start Prevention:** Cron-Job.org (Free tier - ping `/health` every 10 min)

**Total Cost:** **$5/month** (Railway Hobby) + **$1.77 one-time** (Infobip WhatsApp for 355 customers) = **~$5/month recurring**

---

## Debugging Tips

### Backend Issues (Fastify)

```bash
# Check server logs
cd coab-backend
npm run dev

# Test endpoint with curl
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"rut":"12.345.678-5","password":"Test1234!"}'

# Inspect database
npx prisma studio

# Check Pino logs (structured JSON)
# Look for error.message, error.stack, requestId

# Test health check
curl http://localhost:3000/health
```

### Frontend Issues (Vite + React Router)

```bash
# Check console
Open Chrome DevTools → Console tab

# Check network
Open Chrome DevTools → Network tab → Filter: Fetch/XHR

# Check React state
Install React DevTools extension → Components tab

# Check TanStack Query cache
Install TanStack Query DevTools (included in dev)
# Bottom-right corner shows cache state
```

### CORS Issues (Fastify)

```typescript
// coab-backend/src/app.ts
await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

// .env file must have:
// CORS_ORIGIN=http://localhost:5173
```

### Authentication Issues

```typescript
// Check token in localStorage (browser console)
console.log(localStorage.getItem('access_token'));
console.log(localStorage.getItem('refresh_token'));

// Decode JWT at jwt.io
// Check: exp (expiry), userId, tipo (customer/admin)

// Check auto-refresh in Network tab
// Look for: POST /api/v1/auth/refresh (should happen on 401)
```

### Connection Pooling Issues (Railway)

```bash
# Common error: "too many connections"
# Fix: Ensure DATABASE_URL has:
# ?pgbouncer=true&connection_limit=1

# Check current connections in Supabase:
SELECT count(*) FROM pg_stat_activity;

# Should be < 60 (Supabase free tier limit)
```

---

## Questions & Resources

**Stuck on Backend?**
- [Fastify docs](https://fastify.dev) - Framework documentation
- [Prisma docs](https://www.prisma.io/docs) - ORM and migrations
- [jose (JWT library)](https://github.com/panva/jose) - Modern JWT
- [Pino docs](https://getpino.io) - Logging

**Stuck on Frontend?**
- [Vite docs](https://vitejs.dev) - Build tool
- [React Router docs](https://reactrouter.com) - Routing
- [TanStack Query docs](https://tanstack.com/query) - Data fetching
- [shadcn/ui docs](https://ui.shadcn.com) - UI components

**Deployment Issues?**
- [Railway docs](https://docs.railway.app) - Backend hosting
- [Cloudflare Pages docs](https://developers.cloudflare.com/pages) - Frontend hosting
- [Supabase docs](https://supabase.com/docs) - Database

**Chilean Localization?**
- [RUT validation logic](https://gist.github.com/donpandix/6e207c6166a8fa88cfc2d4a73af5e0d6)
- [date-fns es locale](https://date-fns.org/v4.1.0/docs/I18n)
- Chilean Peso formatting: `amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })`

---

## Iteration Checklist Template

Use this for each iteration:

```markdown
## Iteration X: [Name]

### Pre-Work
- [ ] Read iteration file thoroughly
- [ ] Understand API contracts (request/response schemas)
- [ ] Review database schema changes (if any)

### Backend (Fastify)
- [ ] Create/update services (business logic)
- [ ] Create/update routes (API endpoints)
- [ ] Add Zod validation schemas
- [ ] Test endpoints with cURL or Postman
- [ ] Check database with Prisma Studio
- [ ] Verify Pino logs show structured data

### Frontend (Vite + React Router)
- [ ] Create/update pages (routes)
- [ ] Create/update components
- [ ] Add TanStack Query hooks (useQuery, useMutation)
- [ ] Add form validation with Zod + React Hook Form
- [ ] Test in browser (desktop - Chrome DevTools)
- [ ] Test in browser (mobile simulation - iPhone 12 Pro)
- [ ] Test error states (network failures, validation errors)

### Integration Testing
- [ ] Happy path works end-to-end
- [ ] Error handling works (API errors, network failures)
- [ ] Mobile experience good (44px touch targets, readable text)
- [ ] No console errors
- [ ] Data persists correctly in database
- [ ] Auto-refresh works (401 → refresh token → retry request)

### Commit & Document
- [ ] Commit with clear message (follow template in iteration file)
- [ ] Update CHANGELOG.md with any deviations
- [ ] Mark iteration complete in Progress Tracking
```

---

## Known Limitations (MVP)

1. **Rate Limiting Scalability**
   - In-memory storage via @fastify/rate-limit (resets on restart)
   - Fine for Railway's single instance
   - Phase 2: Upgrade to Redis for distributed rate limiting

2. **Railway Runtime Behavior**
   - Railway Hobby runs an always-on process (no serverless cold starts)
   - Keep `/health` endpoint; external pings are optional for uptime monitoring (not required on Hobby)
   - Deploys/restarts take ~2-3 minutes to become healthy

3. **Supabase Free Tier Limits**
   - 500MB database size (sufficient for 355 customers + history)
   - 60 concurrent connections (mitigated by pgBouncer pooling)
   - 2GB bandwidth/month (sufficient for MVP)
   - Upgrade to Pro ($25/month) if needed in Phase 2

4. **Multi-Tab Session Sync**
   - Logout in one tab doesn't immediately sync to other tabs
   - Other tabs discover logout on next API call (401 → redirect)
   - Acceptable UX for MVP (rare edge case)
   - Phase 2: Implement BroadcastChannel API for real-time sync

---

## Post-MVP: Phase 2

After MVP launch and user validation (4-6 weeks), prioritize:

1. **Transbank WebPay Plus** - Online credit/debit card payments
2. **PDF Generation** - Downloadable boletas (Puppeteer + React)
3. **Service Requests** - Report water issues (leaks, outages, pressure issues)
4. **Admin Analytics Dashboard** - Payment trends, customer growth, revenue reports
5. **Email Notifications** - Payment confirmations, boleta alerts (SMTP via SendGrid)
6. **Payment History Export** - CSV/Excel download for customers
7. **Consumption History Chart** - Visual graph of water usage over time
8. **Multi-tenant Support** - Expand to other water companies

---

## Critical Implementation Notes

### Fixed in This Plan (v2.2)

1. **BigInt Serialization** (Iteration 1)
   - Global `BigInt.prototype.toJSON` in app.ts
   - Prevents "Do not know how to serialize a BigInt" errors

2. **Refresh Token Rotation** (Iteration 2)
   - Complete implementation with auto-refresh Axios interceptor
   - 30-day refresh tokens rotate on each use
   - Prevents token reuse attacks

3. **Payment FIFO Logic** (Iteration 6)
   - Database transactions with Prisma `$transaction`
   - Oldest boletas paid first (FIFO)
   - Partial payment tracking in boleta.notas
   - Error recovery with Pino structured logging

4. **Admin Account Unlock** (Iteration 4)
   - Manual unlock endpoint for locked customer accounts
   - Resets `intentos_fallidos` to 0, `cuenta_bloqueada` to false

5. **HTTPS Enforcement** (Iteration 8)
   - Production redirect via `x-forwarded-proto` header (Railway)
   - Helmet security headers (HSTS, CSP)
   - Auto-redirect HTTP → HTTPS

6. **Data Migration** (Iteration 1)
   - Safe migration for 355 existing customers
   - 5-phase plan: CSV import, RUT validation, integrity checks, test logins, rollback plan
   - `prisma db seed` for automated migration

7. **Monitoring & Backup** (Iteration 8)
   - Sentry error tracking with performance monitoring
   - UptimeRobot uptime monitoring (backend + frontend)
   - Supabase daily auto-backups (7-day retention)
   - Manual weekly backups via `scripts/backup.sh`
   - Disaster recovery plan documented

8. **Connection Pooling** (Iteration 1) ⚠️ **CRITICAL**
   - `DATABASE_URL` must include: `?pgbouncer=true&connection_limit=1`
   - Prevents Railway from crashing with "too many connections"
   - This is the #1 mistake developers make (per professional review)

9. **Health Check Endpoint** (Iteration 1) ⚠️ **REQUIRED**
   - `GET /health` endpoint with database ping
   - Configured in `railway.json` → `healthcheckPath: "/health"`
   - Prevents Railway from assuming app crashed
   - Keeps app warm (Cron-Job.org pings every 10 min)

10. **Argon2id Password Hashing** (Iteration 2)
    - Replaced bcrypt with Argon2id (OWASP #1 recommendation)
    - Parameters: `memoryCost: 19456, timeCost: 2, parallelism: 1`
    - Resistant to GPU/ASIC attacks

11. **Service Interruption Notifications** (Iteration 3) ✨ **NEW**
    - Public endpoint: `GET /clientes/notificaciones` (no auth required)
    - Time-based filtering (desde/hasta dates)
    - Banner UI with critical/warning/info styling
    - Auto-refetch every 5 minutes via TanStack Query

12. **Audit Logging for Compliance** (Iteration 6) ✨ **NEW**
    - Permanent audit trail in `logs_auditoria` table
    - Captures: accion, usuario_email, ip_address, user_agent, datos_anteriores, datos_nuevos
    - Critical for compliance, fraud prevention, dispute resolution
    - Pino logs only retained 7 days; audit table is permanent

13. **Payment Receipt Printing** (Iteration 6) ✨ **NEW**
    - Browser print-to-PDF (instant, no server-side PDF generation)
    - Professional receipt layout with CSS print styles
    - Customer can save as PDF or print directly
    - Works on all devices (desktop + mobile)

14. **Infobip WhatsApp Auto-Send** (Iteration 7) ✨ **NEW**
    - Automated setup link delivery via WhatsApp API
    - Cost: ~$0.005/message = $1.77 for 355 customers
    - Saves ~30 hours of manual work (ROI: massive)
    - Fallback to manual copy if WhatsApp fails
    - Bulk send script for initial rollout

15. **Balance Reconciliation** (Iteration 8) ✨ **NEW**
    - Daily cron job reconciles `saldo_actual` with real-time calculation
    - Prevents drift from denormalized balance field
    - Runs at 2 AM daily via Railway cron or external Cron-Job.org
    - Logs discrepancies to Sentry for investigation
    - Alert triggered if > 5% of customers reconciled (indicates payment logic bug)

16. **Infobip Prerequisites** (Start Immediately) ⚠️ **CRITICAL**
    - WhatsApp Business verification takes 1-3 days
    - **Must start on Day 1 of Iteration 1** to avoid blocking Iteration 7
    - Fallback: Manual link sharing if verification delayed
    - Required for automated WhatsApp onboarding

---

## Railway Deployment Checklist

Before deploying to Railway (Iteration 8):

- [ ] `railway.json` created with build/deploy config
- [ ] Environment variables set in Railway Dashboard:
  - [ ] `NODE_ENV=production`
  - [ ] `DATABASE_URL` with `?pgbouncer=true&connection_limit=1`
  - [ ] `DIRECT_URL` for migrations
  - [ ] `JWT_SECRET` (64 chars, generated with `openssl rand -hex 32`)
  - [ ] `CORS_ORIGIN` pointing to Cloudflare Pages URL
  - [ ] `FORCE_HTTPS=true`
  - [ ] `SENTRY_DSN` (optional)
- [ ] Health check endpoint `/health` returns 200 OK
- [ ] Migrations run via `railway run npx prisma migrate deploy`
- [ ] Railway domain accessible via HTTPS
- [ ] CORS configured to allow frontend origin
- [ ] Logs visible in Railway Dashboard
- [ ] UptimeRobot monitor added for `/health`
- [ ] Cron-Job.org pinging every 10 min

---

## Cloudflare Pages Deployment Checklist

Before deploying to Cloudflare Pages (Iteration 8):

- [ ] Vite production build works locally (`npm run build`)
- [ ] Environment variable set in Cloudflare Dashboard:
  - [ ] `VITE_API_URL` pointing to Railway backend
- [ ] Build settings configured:
  - [ ] Framework preset: Vite
  - [ ] Build command: `npm run build`
  - [ ] Build output directory: `dist`
- [ ] Custom domain configured (optional): `www.yourcompany.cl`
- [ ] SSL certificate active (green padlock)
- [ ] API calls work (no CORS errors in console)
- [ ] Mobile responsive (test on real device)
- [ ] Lighthouse score > 85 (mobile)

---

## Performance Targets (Chilean 3G Reality)

### API Performance (Railway → Supabase)
- **Internal processing:** < 100ms
- **Total response time:** < 400ms (includes Chile → US East → Chile round-trip)
- **Database queries:** < 50ms (with proper indexes)

### Frontend Performance (Cloudflare Pages)
- **FCP (First Contentful Paint):** < 2.5s on Chilean 3G
- **LCP (Largest Contentful Paint):** < 3.5s on Chilean 3G
- **TTI (Time to Interactive):** < 4s on Chilean 3G
- **Lighthouse Mobile Score:** > 85 (Performance, Accessibility, Best Practices, SEO)

### Chilean 3G Simulation (Chrome DevTools)
- **Download:** 400 Kbps (Chilean 3G reality, not standard 750 Kbps)
- **Upload:** 200 Kbps
- **Latency:** 400ms (Chile → US East → Chile round-trip)

---

**Ready to start?** Open [Iteration 1: Project Setup](.claude/iterations/01-project-setup.md) and let's build! 🚀
