# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**COAB Platform** is a Chilean utility company (water services) admin and customer portal built as a monorepo with two main components:

- **Backend** (`coab-backend/`): Node.js 22 + Express + TypeScript API with Prisma ORM and PostgreSQL
- **Frontend** (`coab-frontend/`): Next.js 15 + TypeScript + React with mobile-first design

The platform handles customer management, payment processing, billing, service requests, and notifications for a Chilean water utility company.

## Repository Structure

```
coab-platform2/
├── .claude/
│   └── iterations/        # Step-by-step implementation guides
│       ├── 01-project-setup.md
│       ├── 02-customer-auth.md
│       ├── 03-customer-dashboard.md
│       ├── 04-admin-auth.md
│       ├── 05-admin-search.md
│       ├── 06-payment-entry.md
│       ├── 07-password-setup.md
│       ├── 07.5-password-recovery.md
│       └── 08-deploy-test.md
│
├── coab-backend/          # Backend API service (to be created)
│   ├── .env               # Environment configuration (not in version control)
│   └── .mcp.json          # MCP configuration
│
├── coab-frontend/         # Frontend Next.js application (to be created)
│   ├── .env               # Frontend environment configuration
│   └── .mcp.json          # MCP configuration
│
├── IMPLEMENTATION_PLAN.md # Main implementation guide (index)
├── PRD_COMPLETE.md        # Complete Product Requirements
└── CLAUDE.md              # This file
```

## Chilean Localization Requirements

This project is **Chilean-specific** and must adhere to Chilean standards:

1. **Chilean RUT Validation**: All RUT inputs must use format `XX.XXX.XXX-X` with proper DV (verification digit) validation using modulus 11
2. **Spanish Language**: All UI text, error messages, database schema, and code comments in Spanish (es-CL)
3. **Currency Format**: Chilean Pesos (CLP) with format `$1.234.567` (dot as thousands separator)
4. **Date Format**: `dd/MM/yyyy` or `d 'de' MMMM 'a las' HH:mm` using `date-fns` with `es` locale
5. **Database Schema**: All tables, columns, and enums use Spanish names (e.g., `clientes`, `transacciones_pago`, `metodo_pago_enum`)
6. **Payment Integration**: Transbank WebPay Plus for credit/debit, BancoEstado FTP imports for CajaVecina/PagaQui
7. **Mobile Optimization**: Touch targets minimum 44px, optimized for Chilean 3G/4G networks

## Implementation Status

Project is in **planning phase** with comprehensive implementation plan ready.

**📋 Single Source of Truth:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

**9 Iterative Build-Test Cycles:**

| # | Iteration | Duration | Link |
|---|-----------|----------|------|
| 1 | Project Setup & Health Checks | 2-3 days | [→ Details](.claude/iterations/01-project-setup.md) |
| 2 | Customer Authentication - RUT Login + Refresh Tokens | 3-4 days | [→ Details](.claude/iterations/02-customer-auth.md) |
| 3 | Customer Dashboard with Real Data | 3-4 days | [→ Details](.claude/iterations/03-customer-dashboard.md) |
| 4 | Admin Authentication + Account Unlock | 1-2 days | [→ Details](.claude/iterations/04-admin-auth.md) |
| 5 | Admin Customer Search | 2-3 days | [→ Details](.claude/iterations/05-admin-search.md) |
| 6 | Payment Entry - FIFO + Validation | 4-5 days | [→ Details](.claude/iterations/06-payment-entry.md) |
| 7 | Password Setup - WhatsApp Link | 2-3 days | [→ Details](.claude/iterations/07-password-setup.md) |
| 7.5 | Self-Service Password Recovery ✨ NEW | 1-2 days | [→ Details](.claude/iterations/07.5-password-recovery.md) |
| 8 | Production Deployment + Comprehensive Testing | 6-7 days | [→ Details](.claude/iterations/08-deploy-test.md) |

**Total Timeline:** 7-8 weeks (37-40 days)

**📚 Supporting Documents:**
- [PRD_COMPLETE.md](PRD_COMPLETE.md) - Complete Product Requirements (60+ pages)

**✅ Critical Fixes Applied (October 2025 - Version 2):**

**Security & Validation:**
- Zod input validation (prevents type bugs, injection attacks)
- Refresh token rotation with auto-refresh interceptor
- HTTPS enforcement + Helmet security headers
- Admin account unlock endpoint

**Core Business Logic:**
- Payment FIFO application with database transactions
- Error recovery with detailed logging
- BigInt JSON serialization fixed globally

**Production Readiness:**
- Sentry error tracking (free tier)
- UptimeRobot monitoring (free tier)
- Render cold start prevention (cron job)
- Backup verification strategy

**User Experience:**
- Self-service password recovery (Iteration 7.5) ✨ NEW
- Data migration for 355 existing customers
- Real device testing (iOS Safari, Android Chrome)
- Comprehensive edge case testing (2 days)

See [REVIEWER_FEEDBACK_V2.md](REVIEWER_FEEDBACK_V2.md) for complete details.

## Key Architectural Decisions

### Backend Architecture (MVP)

1. **Database**: Spanish-named schema with Prisma ORM, PostgreSQL (Supabase), existing 355 customers + historical data
2. **Authentication**:
   - Customer login: RUT + password (bcrypt, 12 salt rounds)
   - Admin login: email + password (no MFA in MVP)
   - JWT with access (24h customer, 8h admin) and refresh (30d) tokens using `jose` library
   - Refresh token rotation for security
   - Account lockout: 5 attempts, 15-minute lock
3. **Security**: helmet, CORS, rate limiting (100 req/15min general, 5 req/15min auth), HTTPS enforcement in production
4. **Payment Processing**:
   - Manual payment entry by admin (FIFO application to boletas)
   - ~~Transbank WebPay Plus~~ (Phase 2)
   - ~~BancoEstado SFTP imports~~ (Phase 2)
5. **PDF Generation**: ~~Puppeteer + React~~ (Phase 2)
6. **Notifications**: WhatsApp setup links (manual sharing in MVP, auto-send via Infobip in Phase 2)
7. **Logging**: Winston with JSON format, file rotation
8. **Performance**: Cursor-based pagination (50 default), database indexes

### Frontend Architecture (MVP)

1. **Framework**: Next.js 15 App Router, TypeScript strict mode, mobile-first design
2. **UI Library**: shadcn/ui with Tailwind CSS, Chilean theme colors (primary-blue: #0066CC, accent-green: #00AA44)
3. **State Management**:
   - React Query (@tanstack/react-query) for server state with caching
   - localStorage for auth tokens
   - react-hook-form for forms
4. **API Client**: Axios with interceptors for JWT attachment, auto-refresh on 401, 10s timeout
5. **Authentication**:
   - Customer: RUT + password with auto-formatting, numeric keyboard on mobile
   - Admin: Email + password
   - First-time setup via WhatsApp token links
6. **Customer Portal**: View-only dashboard (balance, payment history, boletas)
7. **Admin Portal**: Search customers, view profiles, manual payment entry
8. **Performance**: Mobile optimization (44px touch targets), Lighthouse score >85

## Environment Configuration

Both services require `.env` files (already exist but not version controlled):

### Backend (.env)
```
NODE_ENV=development|test|staging|production
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=<32+ chars>
INFOBIP_API_KEY=<optional>
TRANSBANK_API_KEY=<optional>
FTP_HOST/USER/PASS=<optional>
SMTP_HOST/USER/PASS=<optional>
```

### Frontend (.env)
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

## Common Patterns

### Chilean RUT Validation (Both Frontend & Backend)
```typescript
function validarRUT(rutStr: string): boolean {
  const cleaned = rutStr.replace(/[.-]/g, '');
  if (cleaned.length !== 9) return false;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1).toUpperCase();
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const expectedDV = 11 - (sum % 11);
  const calculatedDV = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : String(expectedDV);
  return dv === calculatedDV;
}
```

### RUT Formatting (Frontend)
```typescript
function formatRut(value: string): string {
  const cleaned = value.replace(/[^0-9kK]/g, '');
  if (cleaned.length <= 1) return cleaned;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const formatted = body.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
  return `${formatted}-${dv}`;
}
```

### Chilean Currency Formatting
```typescript
const formatted = amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
```

### Error Response Structure (Backend)
```typescript
{
  error: {
    code: string,        // e.g., 'INVALID_CREDENTIALS', 'LOCKED', 'VALIDATION_ERROR'
    message: string,     // Spanish user-friendly message
    details?: any,       // Optional validation details
    requestId: string    // Correlation ID for tracing
  }
}
```

## Database Schema Highlights

Key Spanish-named enums:
- `metodo_pago_enum`: webpay_plus, transferencia, efectivo, cheque, caja_vecina, paga_qui
- `estado_pago_enum`: pendiente, completado, rechazado, reversado
- `tipo_solicitud_enum`: fuga, sin_suministro, baja_presion, alcantarillado, otro
- `tipo_notificacion_enum`: recordatorio_pago, aviso_corte, boleta_generada

Key tables:
- `clientes`: customers with RUT, numero_cliente, hash_contrasena, ultimo_inicio_sesion
- `transacciones_pago`: payments with monto, metodo_pago, estado_transaccion, referencia_externa, datos_respuesta (JSON)
- `solicitudes_servicio`: service requests with tipo_solicitud, descripcion, estado, prioridad
- `notificaciones_whatsapp`: WhatsApp messages with mensaje_id_externo, estado_entrega
- `generaciones_pdf`: PDF generation tracking with periodo, tipo_generacion, pdfs_generados

## Security Considerations

1. **Never commit** `.env` files or secrets to version control
2. **PCI Compliance**: Never store card data; use Transbank redirect for payment capture
3. **RBAC**: Enforce role-based access (billing_clerk, supervisor, admin) via middleware
4. **Audit Logging**: All customer updates, payment operations, and admin actions must log to `logs_auditoria` with before/after state
5. **HTTPS Only**: Enforce in production; Transbank requires secure return URLs
6. **Token Rotation**: Refresh tokens must rotate on use; detect reuse and revoke chain
7. **Rate Limiting**: Aggressive on auth endpoints (5 attempts lockout)

## Performance Targets

- Basic API operations: <200ms
- Search with pagination: <200ms with 10k records
- Reports/aggregations: <2s
- FTP daily import: <10 minutes for ~10k records
- Frontend FCP on 3G: <1.5s
- Lighthouse mobile: >90

## Testing Strategy

Each task has detailed test strategies. General patterns:
- **Backend**: Jest/Supertest for integration, unit tests for validators/utils, mock Transbank/Infobip in CI
- **Frontend**: React Testing Library for components, MSW for API mocking, Lighthouse CI for performance
- **Contract Tests**: Snapshot representative API responses for frontend alignment

## Development Workflow

1. Check task status in `.claude/tasks/` directories
2. Refer to implementation plans for phase context
3. Follow Spanish naming conventions for all new code
4. Update CHANGELOG.md in `.claude/logs/` for significant changes
5. Test with Chilean data formats (RUT, CLP currency, es-CL dates)
6. Ensure mobile-first approach for customer-facing features (44px touch targets)

## Important Notes

- **No package.json yet**: Projects are in planning phase; setup will be done in Task 1 for each service
- **Task Dependencies**: Follow task order in implementation plans; some tasks have explicit dependencies
- **Chilean Context**: Always validate RUT format, use Spanish error messages, format currency as CLP
- **Mobile Priority**: Customer portal is mobile-first; admin portal is desktop-optimized
- **Documentation**: Detailed implementation steps and test strategies are in task JSON files
