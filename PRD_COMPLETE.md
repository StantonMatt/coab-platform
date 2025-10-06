# COAB Platform - Product Requirements Document (MVP)

**Version:** 2.0 - Complete MVP Specification
**Last Updated:** 2025-10-04
**Author:** Product Team
**Status:** Approved for Implementation
**Target Launch:** 6 weeks from start

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Business Context](#business-context)
3. [Success Criteria](#success-criteria)
4. [User Personas](#user-personas)
5. [Technology Architecture](#technology-architecture)
6. [Database Design](#database-design)
7. [API Specifications](#api-specifications)
8. [Frontend Specifications](#frontend-specifications)
9. [Security Requirements](#security-requirements)
10. [Performance Requirements](#performance-requirements)
11. [Testing Strategy](#testing-strategy)
12. [Deployment Architecture](#deployment-architecture)
13. [Out of Scope](#out-of-scope)
14. [Implementation Phases](#implementation-phases)

---

## Executive Summary

### Problem Statement
COAB water utility company needs a modern web platform to enable 355 existing customers to self-service their accounts and allow administrators to efficiently manage customer data and payments.

### Solution Overview
A dual-portal web application:
- **Customer Portal** (mobile-first): Self-service account viewing and payment history
- **Admin Portal** (desktop-optimized): Customer management and manual payment entry
- **WhatsApp Onboarding**: Secure, accessible first-time password setup

### Core Value Propositions

**For Customers:**
- 24/7 access to account balance and payment history
- Mobile-friendly interface (majority lack computers)
- Chilean RUT-based login (no email required)
- Reduced need for in-person visits

**For Admins:**
- Fast customer search and profile access
- Streamlined manual payment entry
- Elimination of paper-based processes
- Centralized customer management

### Key Constraints
- Must use existing Supabase PostgreSQL database with 355 customers
- Must work on 3G/4G Chilean mobile networks
- Budget: $0 infrastructure costs (free tiers only)
- Timeline: 6 weeks to production

---

## Business Context

### Current State
- **Customers**: 355 active water service subscribers
- **Data**: Existing database with customers, payments (4,257 records), boletas (6,880 records), meter readings
- **Current Process**: Manual/in-person for account inquiries and payments
- **Pain Points**:
  - Customers must visit office for balance inquiries
  - Phone-based support is time-consuming
  - Payment reconciliation is manual and error-prone
  - No digital records for customers

### Target State (Post-MVP)
- 80%+ customers can self-serve account inquiries digitally
- Admins save 10+ hours/week on routine inquiries
- Payment entry digitized and traceable
- Foundation for online payment processing (Phase 2)

---

## Success Criteria

### Quantitative Metrics
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Customer Adoption | 60% of 355 customers (213) | Login activity within first month |
| Login Success Rate | >95% | Failed logins / total attempts |
| Page Load Time (Mobile) | <2s on 4G | Lighthouse + Real User Monitoring |
| Payment Entry Time | <2 min per payment | Admin time tracking |
| System Uptime | >99% | Render/Vercel monitoring |
| Zero Security Incidents | 0 data breaches | Security audit |

### Qualitative Goals
- Customers report "easy to use" (user testing)
- Admins prefer new system over manual process
- Mobile experience rated 4/5 or higher
- Zero customer complaints about data accuracy

---

## User Personas

### Persona 1: María - Customer (Primary)
**Demographics:**
- Age: 45
- Occupation: Retail worker
- Tech Literacy: Basic smartphone user
- Device: Android phone, occasional WiFi access

**Goals:**
- Check water bill without visiting office
- Verify payment was recorded
- Avoid surprises on bill amount

**Pain Points:**
- No computer at home
- Limited data plan
- Doesn't have email address
- Works during office hours

**Key Needs:**
- Simple mobile interface
- RUT-based login (no email needed)
- Large text and buttons
- Works on slow connections

---

### Persona 2: Juan - Administrator (Secondary)
**Demographics:**
- Age: 32
- Occupation: COAB Office Staff
- Tech Literacy: Intermediate
- Device: Desktop computer

**Goals:**
- Quickly find customer information
- Enter payments received in person/by transfer
- Reduce manual paperwork
- Answer customer phone inquiries faster

**Pain Points:**
- Current system is Excel-based
- Difficult to search across multiple files
- Manual calculation of balances
- No audit trail for changes

**Key Needs:**
- Fast search across RUT, name, address
- Simple payment entry form
- Clear balance calculation
- Desktop-optimized workflow

---

## Technology Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Client Layer                         │
├──────────────────────┬──────────────────────────────────┤
│  Customer Portal     │     Admin Portal                 │
│  (Mobile-First)      │     (Desktop-Optimized)          │
│  - Next.js 15        │     - Next.js 15                 │
│  - Tailwind + UI     │     - Tailwind + UI              │
│  - React Query       │     - React Query                │
└──────────┬───────────┴──────────────┬───────────────────┘
           │                          │
           │      HTTPS (Axios)       │
           │                          │
┌──────────┴──────────────────────────┴───────────────────┐
│              API Gateway / Express Server                │
│  - JWT Authentication Middleware                         │
│  - Rate Limiting                                         │
│  - Request Validation                                    │
│  - Error Handling                                        │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│                 Business Logic Layer                     │
│  - AuthService (login, password setup)                   │
│  - CustomerService (balance, history)                    │
│  - AdminService (search, payment entry)                  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│              Data Access Layer (Prisma ORM)              │
│  - Query Building                                        │
│  - Transaction Management                                │
│  - Connection Pooling                                    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│            Supabase PostgreSQL Database                  │
│  - clientes (355 rows)                                   │
│  - pagos (4,257 rows)                                    │
│  - boletas (6,880 rows)                                  │
│  - + new auth tables                                     │
└──────────────────────────────────────────────────────────┘

External Services (Phase 2):
- Infobip WhatsApp API
- Transbank WebPay Plus
```

### Technology Stack Details

#### Backend
| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| Runtime | Node.js | 22 LTS | Latest stable, ESM support |
| Framework | Express | ^4.18 | Lightweight, mature, flexible |
| Language | TypeScript | ^5.3 | Type safety, developer experience |
| ORM | Prisma | ^5.7 | Type-safe queries, great DX, Supabase compatible |
| Database | PostgreSQL | 15 | Existing Supabase instance |
| Auth | jose | ^5.1 | Modern JWT library, no dependencies |
| Password Hashing | bcrypt | ^5.1 | Industry standard, secure |
| Validation | zod | ^3.22 | TypeScript-first validation |
| Rate Limiting | express-rate-limit | ^7.1 | DDoS protection |

#### Frontend
| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| Framework | Next.js | 15.0 | Server components, App Router, Vercel-optimized |
| Language | TypeScript | ^5.3 | Type safety across stack |
| UI Library | Tailwind CSS | ^3.4 | Utility-first, mobile-responsive |
| Components | shadcn/ui | latest | Accessible, customizable, free |
| State Management | @tanstack/react-query | ^5.14 | Server state caching, optimistic updates |
| Forms | react-hook-form | ^7.49 | Performance, validation |
| HTTP Client | axios | ^1.6 | Interceptors, better errors than fetch |
| Date Formatting | date-fns | ^3.0 | Lightweight, tree-shakeable, i18n support |

#### Infrastructure
| Component | Provider | Tier | Cost |
|-----------|----------|------|------|
| Frontend Hosting | Vercel | Free | $0/month |
| Backend Hosting | Render | Free | $0/month (750 hrs) |
| Database | Supabase | Free | $0/month (existing) |
| Domain | TBD | - | ~$12/year |

---

## Database Design

### Existing Schema (To Preserve)

The following tables already exist in Supabase and contain production data:

#### `clientes` (355 rows)
Stores customer master data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Unique customer ID |
| numero_cliente | TEXT | NOT NULL | Customer account number |
| primer_apellido | TEXT | NOT NULL | First last name |
| segundo_apellido | TEXT | NULL | Second last name |
| primer_nombre | TEXT | NOT NULL | First name |
| segundo_nombre | TEXT | NULL | Middle name |
| rut | TEXT | NULL | Chilean national ID |
| telefono | TEXT | NULL | Phone number |
| correo | TEXT | NULL | Email (optional) |
| fecha_creacion | TIMESTAMPTZ | DEFAULT now() | Record creation date |
| excluir_cargo_fijo | BOOLEAN | DEFAULT false | Exclude fixed charge |
| es_cliente_actual | BOOLEAN | DEFAULT true | Active customer flag |

**New Columns to Add:**
```sql
ALTER TABLE clientes
ADD COLUMN hash_contrasena TEXT,
ADD COLUMN primer_login BOOLEAN DEFAULT true,
ADD COLUMN ultimo_inicio_sesion TIMESTAMPTZ,
ADD COLUMN cuenta_bloqueada BOOLEAN DEFAULT false,
ADD COLUMN intentos_fallidos INTEGER DEFAULT 0,
ADD COLUMN bloqueada_hasta TIMESTAMPTZ;
```

#### `pagos` (4,257 rows)
Payment transaction history.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | PRIMARY KEY |
| cliente_id | BIGINT | FK to clientes |
| numero_cliente | TEXT | Denormalized for search |
| monto | NUMERIC | Payment amount |
| fecha_pago | DATE | Payment date |
| tipo_pago | TEXT | Payment type (efectivo, transferencia, etc.) |
| estado | TEXT | Payment status |
| numero_transaccion | TEXT | Transaction reference |
| observaciones | TEXT | Notes |
| operador | TEXT | Admin who entered payment |

**New Columns to Add:**
```sql
ALTER TABLE pagos
ADD COLUMN metodo_pago TEXT DEFAULT 'manual',
ADD COLUMN datos_gateway JSONB,
ADD COLUMN token_transaccion TEXT;
```

#### `boletas` (6,880 rows)
Billing invoices/statements.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | PRIMARY KEY |
| cliente_id | BIGINT | FK to clientes |
| numero_cliente | TEXT | Customer number |
| fecha_emision | DATE | Issue date |
| fecha_vencimiento | DATE | Due date |
| monto_total | NUMERIC | Total amount due |
| monto_saldo_anterior | NUMERIC | Previous balance |
| estado | TEXT | pendiente, pagada, etc. |
| periodo_desde | DATE | Billing period start |
| periodo_hasta | DATE | Billing period end |
| consumo_m3 | NUMERIC | Water consumption |

#### `direcciones` (353 rows)
Customer addresses.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL | PRIMARY KEY |
| cliente_id | BIGINT | FK to clientes |
| direccion_calle | TEXT | Street address |
| direccion_numero | TEXT | Street number |
| poblacion | TEXT | Neighborhood |
| comuna | TEXT | Municipality |

#### `perfiles` (3 rows)
Admin user profiles (linked to Supabase Auth).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PRIMARY KEY (Supabase Auth ID) |
| nombre | TEXT | First name |
| apellido | TEXT | Last name |
| correo | TEXT | Email |
| is_admin | BOOLEAN | Admin flag |

**New Column to Add:**
```sql
ALTER TABLE perfiles
ADD COLUMN hash_contrasena TEXT;
```

---

### New Tables to Create

#### `tokens_configuracion`
Stores one-time setup tokens for WhatsApp password setup flow.

```sql
CREATE TABLE tokens_configuracion (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  usado BOOLEAN DEFAULT false,
  expira_en TIMESTAMPTZ NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  usado_en TIMESTAMPTZ,
  ip_creacion TEXT,
  ip_uso TEXT
);

CREATE INDEX idx_tokens_token ON tokens_configuracion(token) WHERE NOT usado;
CREATE INDEX idx_tokens_cliente ON tokens_configuracion(cliente_id);
```

**Purpose:** When admin sends WhatsApp setup link to customer, a unique token is generated and stored here. Token is marked `usado=true` when customer completes password setup.

**Lifecycle:**
1. Admin clicks "Send Setup Link" → Token created, expires in 24h
2. Customer clicks link → Token validated, not yet used
3. Customer sets password → Token marked `usado=true`, `usado_en=now()`
4. Expired/used tokens cannot be reused

---

#### `sesiones_refresh`
Stores hashed refresh tokens for JWT authentication.

```sql
CREATE TABLE sesiones_refresh (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
  perfil_id UUID REFERENCES perfiles(id) ON DELETE CASCADE,
  tipo_usuario TEXT NOT NULL CHECK (tipo_usuario IN ('cliente', 'admin')),
  token_hash TEXT NOT NULL,
  expira_en TIMESTAMPTZ NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX idx_sesiones_token_hash ON sesiones_refresh(token_hash);
CREATE INDEX idx_sesiones_cliente ON sesiones_refresh(cliente_id);
CREATE INDEX idx_sesiones_perfil ON sesiones_refresh(perfil_id);
CREATE INDEX idx_sesiones_expiracion ON sesiones_refresh(expira_en) WHERE expira_en > CURRENT_TIMESTAMP;
```

**Purpose:** Secure storage of refresh tokens for persistent authentication sessions.

**Flow:**
1. User logs in → Access token (short-lived, 24h for customers, 8h for admins) + Refresh token (long-lived, 30d) issued
2. Refresh token is hashed (SHA-256) before storage
3. On token refresh request → Verify hash, issue new access token, update `ultimo_uso`
4. On logout → Delete corresponding row

---

### Entity Relationship Diagram

```
┌─────────────────┐
│    perfiles     │ (Admin Users)
│  ──────────────│
│  id (UUID) PK   │◄────┐
│  correo         │     │
│  hash_contrasena│     │
│  is_admin       │     │
└─────────────────┘     │
                        │
                        │
                        │ perfil_id
                        │
                   ┌────┴──────────────┐
                   │sesiones_refresh   │
                   │  ────────────────│
                   │  id PK            │
                   │  cliente_id FK    │
                   │  perfil_id FK     │
                   │  tipo_usuario     │
                   │  token_hash       │
                   │  expira_en        │
                   └────┬──────────────┘
                        │
                        │ cliente_id
                        │
┌─────────────────┐     │
│    clientes     │◄────┘
│  ──────────────│
│  id PK          │◄────────┐
│  numero_cliente │         │
│  rut            │         │
│  primer_nombre  │         │
│  primer_apellido│         │
│  telefono       │         │
│  hash_contrasena│         │
│  primer_login   │         │
└────┬────────────┘         │
     │                      │
     │ cliente_id           │
     │                      │
     ├──────────────────────┼───────────────────┐
     │                      │                   │
     ▼                      ▼                   ▼
┌─────────────┐    ┌──────────────┐    ┌────────────────┐
│ direcciones │    │   boletas    │    │     pagos      │
│ ────────────│    │ ────────────│    │ ──────────────│
│ id PK       │    │ id PK        │    │ id PK          │
│ cliente_id FK│   │ cliente_id FK│    │ cliente_id FK  │
│ calle       │    │ monto_total  │    │ monto          │
│ comuna      │    │ estado       │    │ fecha_pago     │
└─────────────┘    │ fecha_venc   │    │ metodo_pago    │
                   └──────────────┘    └────────────────┘

┌──────────────────────┐
│ tokens_configuracion │
│ ───────────────────│
│ id PK                │
│ cliente_id FK ───────┼──► clientes.id
│ token (unique)       │
│ usado                │
│ expira_en            │
└──────────────────────┘
```

---

## API Specifications

### Authentication Endpoints

#### `POST /api/v1/auth/login`
Authenticate customer (RUT) or admin (email).

**Request:**
```json
{
  "rut": "12.345.678-9",        // For customer login (XOR with email)
  "email": "admin@coab.cl",     // For admin login (XOR with rut)
  "password": "SecurePass123"
}
```

**Response (Success - 200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...",
  "user": {
    "id": "123",
    "nombre": "Juan Pérez",
    "rut": "123456789",          // For customers
    "email": "admin@coab.cl",    // For admins
    "tipo": "cliente",           // "cliente" | "admin"
    "primerLogin": false
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing required fields
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "RUT o email requerido",
      "details": { "field": "rut" }
    }
  }
  ```
- `401 Unauthorized`: Invalid credentials
  ```json
  {
    "error": {
      "code": "INVALID_CREDENTIALS",
      "message": "Credenciales inválidas"
    }
  }
  ```
- `403 Forbidden`: Account locked
  ```json
  {
    "error": {
      "code": "ACCOUNT_LOCKED",
      "message": "Cuenta bloqueada. Intente nuevamente en 15 minutos.",
      "details": { "bloqueadaHasta": "2025-10-04T15:30:00Z" }
    }
  }
  ```

**Business Logic:**
1. Validate RUT format (if customer) or email format (if admin)
2. Look up user in `clientes` (by cleaned RUT) or `perfiles` (by email)
3. Check if account is locked (`cuenta_bloqueada` and `bloqueada_hasta > now()`)
4. Verify password with bcrypt
5. On failure:
   - Increment `intentos_fallidos`
   - If `intentos_fallidos >= 5`, set `cuenta_bloqueada=true`, `bloqueada_hasta=now() + 15 minutes`
   - Return 401
6. On success:
   - Reset `intentos_fallidos=0`, `cuenta_bloqueada=false`
   - Update `ultimo_inicio_sesion=now()`
   - Generate access token (JWT with `sub`, `tipo`, `rut`/`email`)
   - Generate refresh token (random 32 bytes)
   - Hash refresh token (SHA-256) and store in `sesiones_refresh`
   - Return tokens + user object

---

#### `POST /api/v1/auth/configurar/:token`
First-time password setup via WhatsApp link.

**URL Parameter:**
- `token`: UUID from WhatsApp link

**Request:**
```json
{
  "password": "NewSecure123",
  "passwordConfirm": "NewSecure123"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Contraseña configurada exitosamente"
}
```

**Error Responses:**
- `404 Not Found`: Token not found
- `400 Bad Request`: Token expired or already used
  ```json
  {
    "error": {
      "code": "TOKEN_EXPIRED",
      "message": "El link de configuración ha expirado. Contacte al administrador."
    }
  }
  ```
- `400 Bad Request`: Password validation failed
  ```json
  {
    "error": {
      "code": "WEAK_PASSWORD",
      "message": "La contraseña debe tener al menos 8 caracteres y un número"
    }
  }
  ```

**Business Logic:**
1. Validate token exists in `tokens_configuracion`
2. Check `usado=false` and `expira_en > now()`
3. Validate password:
   - Minimum 8 characters
   - At least one number
   - Matches confirmation
4. Hash password with bcrypt (12 rounds)
5. Update `clientes.hash_contrasena`, set `primer_login=false`
6. Mark token `usado=true`, `usado_en=now()`
7. Return success

---

#### `POST /api/v1/auth/refresh`
Exchange refresh token for new access token.

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (Success - 200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Business Logic:**
1. Hash provided refresh token
2. Look up in `sesiones_refresh` where `token_hash = hash AND expira_en > now()`
3. If not found → 401 Unauthorized
4. Update `ultimo_uso = now()`
5. Generate new access token (same payload as original)
6. Return new access token

---

#### `POST /api/v1/auth/logout`
Invalidate refresh token.

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (Success - 200):**
```json
{
  "success": true
}
```

**Business Logic:**
1. Hash provided refresh token
2. Delete from `sesiones_refresh` where `token_hash = hash`
3. Return success (even if token not found)

---

### Customer Endpoints (Require `tipo=cliente` in JWT)

#### `GET /api/v1/clientes/me`
Get authenticated customer's profile.

**Headers:**
```
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "id": "123",
  "numeroCliente": "0001",
  "nombre": "Juan Pérez Silva",
  "primerNombre": "Juan",
  "primerApellido": "Pérez",
  "segundoApellido": "Silva",
  "rut": "123456789",
  "rutFormateado": "12.345.678-9",
  "telefono": "+56912345678",
  "correo": "juan@email.com",
  "primerLogin": false,
  "direccion": {
    "calle": "Av. Principal",
    "numero": "123",
    "poblacion": "Villa Hermosa",
    "comuna": "Puente Alto"
  }
}
```

---

#### `GET /api/v1/clientes/me/saldo`
Get current balance and next due date.

**Response (200):**
```json
{
  "saldo": 45670,
  "saldoFormateado": "$45.670",
  "fechaVencimiento": "2025-10-15",
  "diasVencimiento": 11,
  "boletasPendientes": 2
}
```

**Calculation Logic:**
```sql
SELECT
  SUM(monto_total) as saldo,
  MIN(fecha_vencimiento) as fecha_vencimiento,
  COUNT(*) as boletas_pendientes
FROM boletas
WHERE cliente_id = {clienteId}
  AND estado = 'pendiente'
```

---

#### `GET /api/v1/clientes/me/pagos`
Get payment history (paginated).

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10, max: 50)

**Response (200):**
```json
{
  "data": [
    {
      "id": "789",
      "monto": 25000,
      "montoFormateado": "$25.000",
      "fechaPago": "2025-09-05",
      "tipoPago": "Transferencia",
      "metodoPago": "manual",
      "numeroTransaccion": "REF123456",
      "estado": "completado"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "pages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

#### `GET /api/v1/clientes/me/boletas`
Get billing statements (paginated).

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10, max: 50)
- `estado` (optional): "pendiente" | "pagada"

**Response (200):**
```json
{
  "data": [
    {
      "id": "456",
      "periodo": "Septiembre 2025",
      "periodoDesde": "2025-08-01",
      "periodoHasta": "2025-08-31",
      "fechaEmision": "2025-09-01",
      "fechaVencimiento": "2025-09-15",
      "montoTotal": 45670,
      "montoFormateado": "$45.670",
      "estado": "pendiente",
      "consumoM3": 15.5
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 24,
    "pages": 3
  }
}
```

---

#### `GET /api/v1/clientes/me/boletas/:id`
Get detailed boleta breakdown.

**Response (200):**
```json
{
  "id": "456",
  "numeroCliente": "0001",
  "periodo": "Septiembre 2025",
  "fechaEmision": "2025-09-01",
  "fechaVencimiento": "2025-09-15",
  "consumoM3": 15.5,
  "costos": {
    "agua": 12000,
    "alcantarillado": 8000,
    "cargoFijo": 5000,
    "subtotal": 25000,
    "iva": 4750,
    "saldoAnterior": 15920,
    "total": 45670
  },
  "estado": "pendiente",
  "observaciones": null
}
```

---

### Admin Endpoints (Require `tipo=admin` in JWT)

#### `GET /api/v1/admin/clientes`
Search customers.

**Query Parameters:**
- `q` (required): Search query (RUT, name, or address)
- `limit` (default: 20, max: 50)

**Response (200):**
```json
{
  "resultados": [
    {
      "id": "123",
      "numeroCliente": "0001",
      "nombreCompleto": "Juan Pérez Silva",
      "rut": "12.345.678-9",
      "telefono": "+56912345678",
      "direccion": "Av. Principal 123, Villa Hermosa",
      "saldo": 45670,
      "saldoFormateado": "$45.670",
      "tienePassword": true,
      "esActivo": true
    }
  ],
  "total": 1
}
```

**Search Logic:**
```sql
WHERE
  rut ILIKE '%{q}%' OR
  primer_nombre ILIKE '%{q}%' OR
  primer_apellido ILIKE '%{q}%' OR
  segundo_apellido ILIKE '%{q}%' OR
  EXISTS (
    SELECT 1 FROM direcciones d
    WHERE d.cliente_id = clientes.id
    AND d.direccion_calle ILIKE '%{q}%'
  )
```

---

#### `GET /api/v1/admin/clientes/:id`
Get customer detailed profile.

**Response (200):**
```json
{
  "id": "123",
  "numeroCliente": "0001",
  "primerNombre": "Juan",
  "segundoNombre": null,
  "primerApellido": "Pérez",
  "segundoApellido": "Silva",
  "rut": "12.345.678-9",
  "telefono": "+56912345678",
  "correo": "juan@email.com",
  "fechaCreacion": "2020-01-15",
  "esActivo": true,
  "tienePassword": true,
  "primerLogin": false,
  "ultimoInicioSesion": "2025-10-03T14:30:00Z",
  "direccion": {
    "calle": "Av. Principal",
    "numero": "123",
    "poblacion": "Villa Hermosa",
    "comuna": "Puente Alto"
  },
  "saldo": {
    "actual": 45670,
    "formateado": "$45.670",
    "boletasPendientes": 2,
    "proximoVencimiento": "2025-10-15"
  },
  "estadisticas": {
    "totalPagos": 45,
    "totalPagado": 1250000,
    "ultimoPago": {
      "fecha": "2025-09-05",
      "monto": 25000
    }
  }
}
```

---

#### `GET /api/v1/admin/clientes/:id/pagos`
Get customer payment history (admin view).

**Query Parameters:**
- `page`, `limit` (same as customer endpoint)

**Response:** Same structure as `GET /clientes/me/pagos` but includes additional admin fields:
```json
{
  "data": [
    {
      "id": "789",
      "monto": 25000,
      "fechaPago": "2025-09-05",
      "tipoPago": "Transferencia",
      "operador": "admin@coab.cl",
      "observaciones": "Pago recibido en oficina"
    }
  ]
}
```

---

#### `GET /api/v1/admin/clientes/:id/boletas`
Get customer boletas (admin view).

Same as customer endpoint.

---

#### `POST /api/v1/admin/pagos`
Register manual payment.

**Request:**
```json
{
  "clienteId": "123",
  "monto": 25000,
  "fechaPago": "2025-10-04",         // Optional, defaults to today
  "tipoPago": "Efectivo",            // "Efectivo", "Transferencia", "Cheque"
  "numeroTransaccion": "REF123456",  // Optional
  "observaciones": "Pago en oficina" // Optional
}
```

**Response (201):**
```json
{
  "id": "890",
  "clienteId": "123",
  "numeroCliente": "0001",
  "monto": 25000,
  "fechaPago": "2025-10-04",
  "tipoPago": "Efectivo",
  "metodoPago": "manual",
  "estado": "completado",
  "operador": "admin@coab.cl",
  "creadoEn": "2025-10-04T10:30:00Z"
}
```

**Business Logic:**
1. Validate `clienteId` exists
2. Validate `monto > 0`
3. Default `fechaPago` to today if not provided
4. Insert into `pagos` table with:
   - `metodo_pago = 'manual'`
   - `estado = 'completado'`
   - `procesado = true`
   - `operador = {admin email from JWT}`
5. Return created payment

**Note:** Balance application to boletas is handled by existing balance calculation script (out of scope for MVP).

---

#### `POST /api/v1/admin/clientes/:id/enviar-setup`
Generate and send WhatsApp setup link.

**Response (200):**
```json
{
  "token": "a1b2c3d4e5f6789...",
  "setupUrl": "https://app.coab.cl/configurar/a1b2c3d4e5f6789",
  "telefono": "+56912345678",
  "expiraEn": "2025-10-05T10:30:00Z",
  "whatsappEnviado": false  // true in Phase 2 when Infobip integrated
}
```

**Error Responses:**
- `400 Bad Request`: Customer already has password
- `400 Bad Request`: Customer has no phone number

**Business Logic:**
1. Check `clientes.hash_contrasena IS NULL`
2. Check `clientes.telefono IS NOT NULL`
3. Generate random 32-byte token
4. Insert into `tokens_configuracion`:
   - `cliente_id`
   - `token`
   - `expira_en = now() + 24 hours`
5. Build setup URL: `{FRONTEND_URL}/configurar/{token}`
6. **Phase 2:** Send WhatsApp via Infobip
7. Return token info (for MVP, admin can manually share URL)

---

## Frontend Specifications

### Design System

#### Color Palette (Chilean Water Utility Theme)

```css
/* Primary Colors */
--primary-blue: #0066CC;        /* Main brand color, CTAs */
--primary-dark: #004499;        /* Hover states, headers */
--accent-green: #00AA44;        /* Success, payments, positive actions */
--warning-orange: #FF8800;      /* Pending states, alerts */
--error-red: #CC0000;           /* Errors, overdue */

/* Neutrals */
--gray-50: #F9FAFB;             /* Backgrounds */
--gray-100: #F3F4F6;
--gray-600: #4B5563;            /* Body text */
--gray-900: #111827;            /* Headings */

/* Semantic */
--success: var(--accent-green);
--warning: var(--warning-orange);
--error: var(--error-red);
--info: var(--primary-blue);
```

#### Typography

```css
/* Font Family */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Font Sizes (Mobile-First) */
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;     /* Body text minimum for mobile */
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 30px;

/* Line Heights */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

#### Spacing Scale

```css
/* Mobile-Optimized Spacing */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
```

#### Touch Targets (Critical for Mobile)

```css
/* Minimum Touch Targets (WCAG 2.5.5) */
--touch-min: 44px;      /* Apple HIG, Material Design minimum */
--touch-comfortable: 48px;  /* Preferred for primary actions */

/* Button Heights */
.btn-primary { min-height: 48px; }
.btn-secondary { min-height: 44px; }

/* Input Heights */
input, select { min-height: 44px; }
```

---

### Customer Portal (Mobile-First)

#### Layout Structure

```
┌─────────────────────────────────┐
│  Header (Sticky)                │
│  ┌─────────────────────────┐   │
│  │ COAB Logo | Hola Juan   │   │
│  │           [Cerrar Sesión]│   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│                                 │
│  Main Content Area              │
│  (Scrollable)                   │
│                                 │
│  - Balance Card (Prominent)     │
│  - Action Buttons               │
│  - History Lists                │
│                                 │
├─────────────────────────────────┤
│  Footer (Optional)              │
│  Versión 1.0 | Ayuda           │
└─────────────────────────────────┘
```

---

#### Page: Customer Login (`/login`)

**Layout:**
```
┌─────────────────────────────────┐
│                                 │
│        [COAB Logo]             │
│                                 │
│   Portal Clientes COAB         │
│                                 │
├─────────────────────────────────┤
│                                 │
│   RUT                          │
│   [12.345.678-9________]       │ ← inputMode="numeric"
│                                 │
│   Contraseña                   │
│   [****************___]         │
│                                 │
│   [    Ingresar    ]           │ ← 48px height, full width
│                                 │
│   ¿Olvidó su contraseña?       │ ← (Phase 2)
│   Contacte al administrador     │
│                                 │
└─────────────────────────────────┘
```

**Functional Requirements:**
- RUT input auto-formats as user types: `123456789` → `12.345.678-9`
- Numeric keyboard on mobile (`inputMode="numeric"`)
- Client-side RUT validation before submit (show error if invalid DV)
- Show password toggle (eye icon)
- Loading state on submit button ("Ingresando...")
- Error messages in red below fields
- Remember device checkbox (Phase 2)

**Validation Rules:**
- RUT: Must pass DV validation, 8-9 digits
- Password: Required, min 1 character (server validates)

**Error Handling:**
| Error Code | User Message | UI Treatment |
|------------|--------------|--------------|
| INVALID_CREDENTIALS | "RUT o contraseña incorrecta" | Red text below form |
| ACCOUNT_LOCKED | "Cuenta bloqueada por 15 minutos" | Red alert box with countdown |
| RUT_INVALID | "RUT inválido. Verifique el formato." | Red text below RUT field |
| NETWORK_ERROR | "Error de conexión. Intente nuevamente." | Toast notification |

---

#### Page: Customer Dashboard (`/dashboard`)

**Layout:**
```
┌─────────────────────────────────┐
│  Hola, Juan                [⚙] │ ← Settings icon (logout)
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────────┐ │
│  │  💧 Saldo Actual          │ │
│  │     $45.670               │ │ ← Large, prominent
│  │  Vence: 15 oct 2025       │ │
│  └───────────────────────────┘ │ ← Primary blue background
│                                 │
│  ┌───────────────────────────┐ │
│  │  [💳 Pagar Ahora]         │ │ ← 48px, green, disabled for MVP
│  └───────────────────────────┘ │
│                                 │
│  Historial de Pagos            │
│  ┌───────────────────────────┐ │
│  │ $25.000     05/09/2025    │ │
│  │ Transferencia             │ │
│  ├───────────────────────────┤ │
│  │ $30.000     05/08/2025    │ │
│  │ Efectivo                  │ │
│  └───────────────────────────┘ │
│  [Ver Más]                     │
│                                 │
│  Mis Boletas                   │
│  ┌───────────────────────────┐ │
│  │ Sept 2025   $45.670       │ │
│  │ [Pendiente]               │ │
│  ├───────────────────────────┤ │
│  │ Ago 2025    Pagada        │ │
│  └───────────────────────────┘ │
│  [Ver Todas]                   │
│                                 │
└─────────────────────────────────┘
```

**Component Breakdown:**

1. **Balance Card** (`components/customer/BalanceCard.tsx`)
   - Query: `GET /clientes/me/saldo`
   - Shows: Current balance, due date, days until due
   - Styling: White text on primary-blue background
   - Updates: On pull-to-refresh

2. **Payment History List** (`components/customer/PayosHistoryList.tsx`)
   - Query: `GET /clientes/me/pagos?limit=5`
   - Shows: Last 5 payments
   - Click row: Show payment details modal
   - "Ver Más" → Navigate to `/pagos` (full list)

3. **Boletas List** (`components/customer/BoletasList.tsx`)
   - Query: `GET /clientes/me/boletas?limit=5`
   - Shows: Last 5 boletas
   - Badge colors: Pendiente=orange, Pagada=green
   - Click row → Navigate to `/boletas/:id`

**Mobile Interactions:**
- Pull-to-refresh to reload balance
- Swipe left on payment/boleta for details (Phase 2)
- Skeleton loaders while data fetching

---

#### Page: Payment History (`/pagos`)

Full paginated list of payments.

**Features:**
- Infinite scroll (load more on scroll to bottom)
- Filter by date range (Phase 2)
- Search by transaction number (Phase 2)
- Empty state: "No hay pagos registrados"

---

#### Page: Boleta Detail (`/boletas/:id`)

**Layout:**
```
┌─────────────────────────────────┐
│  ← Boleta Septiembre 2025      │
├─────────────────────────────────┤
│                                 │
│  Periodo: 01/08 - 31/08/2025   │
│  Vencimiento: 15/09/2025        │
│  Estado: [Pendiente]            │
│                                 │
│  Desglose                       │
│  ┌───────────────────────────┐ │
│  │ Consumo: 15.5 m³          │ │
│  ├───────────────────────────┤ │
│  │ Agua potable    $12.000   │ │
│  │ Alcantarillado  $8.000    │ │
│  │ Cargo fijo      $5.000    │ │
│  │                           │ │
│  │ Subtotal        $25.000   │ │
│  │ IVA (19%)       $4.750    │ │
│  │ Saldo anterior  $15.920   │ │
│  ├───────────────────────────┤ │
│  │ TOTAL          $45.670    │ │ ← Bold, large
│  └───────────────────────────┘ │
│                                 │
│  [Descargar PDF]               │ ← Phase 2
│                                 │
└─────────────────────────────────┘
```

---

#### Page: Password Setup (`/configurar/:token`)

**Flow:**
1. User clicks WhatsApp link → Opens this page
2. Token validated (loading state)
3. If valid → Show password form
4. If invalid/expired → Show error with contact info

**Layout:**
```
┌─────────────────────────────────┐
│        [COAB Logo]             │
│                                 │
│   Configura tu Contraseña      │
│                                 │
│   Bienvenido, Juan Pérez       │ ← From token lookup
│   RUT: 12.345.678-9            │
│                                 │
├─────────────────────────────────┤
│                                 │
│   Nueva Contraseña             │
│   [****************___]         │
│   Mínimo 8 caracteres, 1 número│
│                                 │
│   Confirmar Contraseña         │
│   [****************___]         │
│                                 │
│   [  Configurar Contraseña  ]  │
│                                 │
└─────────────────────────────────┘
```

**Validation:**
- Passwords must match
- Min 8 characters
- At least 1 number
- Real-time validation feedback

**Success Flow:**
- Show success message
- Auto-redirect to login after 3 seconds
- Pre-fill RUT on login page

---

### Admin Portal (Desktop-Optimized)

#### Layout Structure

```
┌───────────────────────────────────────────────────────┐
│  Sidebar             │  Main Content Area             │
│  ──────────          │  ─────────────────             │
│  🏠 Inicio           │                                 │
│  👥 Clientes         │  [Content varies by page]      │
│  💰 Pagos            │                                 │
│  📊 Reportes (P2)    │                                 │
│  ⚙️  Configuración   │                                 │
│  ─────────           │                                 │
│  Admin Name          │                                 │
│  [Cerrar Sesión]     │                                 │
└───────────────────────────────────────────────────────┘
```

---

#### Page: Admin Login (`/admin/login`)

Simple email + password form (similar to customer login but desktop-optimized).

---

#### Page: Customer Search (`/admin/clientes`)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Buscar Cliente                                     │
│  ┌─────────────────────────────────────┐ [Buscar]  │
│  │ 12.345.678-9, nombre, o dirección   │           │
│  └─────────────────────────────────────┘           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Resultados (3)                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Juan Pérez Silva                            │   │
│  │ RUT: 12.345.678-9  N°: 0001                │   │
│  │ Saldo: $45.670                              │   │
│  │ Av. Principal 123, Villa Hermosa            │   │
│  │ [Ver Perfil]                                │   │
│  ├─────────────────────────────────────────────┤   │
│  │ María González López                        │   │
│  │ RUT: 98.765.432-1  N°: 0052                │   │
│  │ Saldo: $0 (al día)                          │   │
│  │ [Ver Perfil]                                │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Real-time search (debounced 300ms)
- Search across RUT, names, address
- Show saldo inline for quick reference
- Keyboard navigation (↑↓ to select, Enter to open)
- Empty state: "No se encontraron clientes"

---

#### Page: Customer Profile (`/admin/clientes/:id`)

**Layout (Tabs):**
```
┌─────────────────────────────────────────────────────┐
│  ← Volver a Búsqueda                                │
│                                                     │
│  Juan Pérez Silva                                   │
│  RUT: 12.345.678-9  |  N° Cliente: 0001            │
│  📞 +56912345678    |  ✉️ juan@email.com           │
│  📍 Av. Principal 123, Villa Hermosa, Puente Alto  │
│                                                     │
│  Saldo Actual: $45.670  [Registrar Pago]          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [Info General] [Boletas] [Pagos] [Lecturas]      │ ← Tabs
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Tab Content Here]                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Tab 1: Info General**
- Customer master data
- "Enviar Link Configuración" button (if no password)
- Edit customer info (Phase 2)

**Tab 2: Boletas**
- Table of all boletas (paginated)
- Columns: Periodo, Fecha Venc, Monto, Estado
- Click row → Expand detail

**Tab 3: Pagos**
- Table of all payments (paginated)
- Columns: Fecha, Monto, Tipo, Operador
- [Registrar Pago] button → Opens modal

**Tab 4: Lecturas** (Phase 2)
- Meter reading history

---

#### Modal: Register Payment

**Trigger:** Click "Registrar Pago" button

**Form:**
```
┌───────────────────────────────────┐
│  Registrar Pago                   │
│                                   │
│  Cliente: Juan Pérez (0001)       │
│  Saldo Actual: $45.670            │
│  ─────────────────────────────    │
│                                   │
│  Monto ($):                       │
│  [25000____________]              │
│                                   │
│  Fecha Pago:                      │
│  [04/10/2025____] (hoy)           │
│                                   │
│  Tipo de Pago:                    │
│  [Efectivo ▼]                     │
│    • Efectivo                     │
│    • Transferencia                │
│    • Cheque                       │
│                                   │
│  N° Transacción (opcional):       │
│  [REF123456_____]                 │
│                                   │
│  Observaciones (opcional):        │
│  [Pago en oficina____________]   │
│                                   │
│  [Cancelar] [Registrar Pago]     │
│                                   │
└───────────────────────────────────┘
```

**Validation:**
- Monto: Required, > 0, max 2 decimals
- Fecha: Required, <= today
- Tipo: Required

**Success:**
- Close modal
- Show success toast: "Pago registrado exitosamente"
- Refresh customer balance and payment list

---

#### Modal: Send Setup Link

**Trigger:** Click "Enviar Link Configuración" on customer profile

**Content:**
```
┌───────────────────────────────────────┐
│  Enviar Link de Configuración         │
│                                       │
│  Cliente: Juan Pérez                  │
│  Teléfono: +56912345678               │
│                                       │
│  ¿Desea enviar un link de             │
│  configuración por WhatsApp?          │
│                                       │
│  El cliente recibirá un mensaje con  │
│  un link para configurar su contraseña│
│  El link expira en 24 horas.          │
│                                       │
│  [Cancelar] [Enviar Link]            │
│                                       │
└───────────────────────────────────────┘
```

**Success (MVP):**
```
┌───────────────────────────────────────┐
│  Link Generado                         │
│                                       │
│  Copie este link y compártalo con el  │
│  cliente por WhatsApp manualmente:    │
│                                       │
│  https://app.coab.cl/configurar/...   │
│  [Copiar Link]                        │
│                                       │
│  (Envío automático en próxima versión)│
│                                       │
│  [Cerrar]                             │
│                                       │
└───────────────────────────────────────┘
```

**Phase 2:** Auto-send via Infobip, show "WhatsApp enviado exitosamente"

---

## Security Requirements

### Authentication Security

| Requirement | Implementation | Rationale |
|-------------|---------------|-----------|
| Password Storage | bcrypt with 12 salt rounds | Industry standard, resistant to rainbow tables |
| JWT Secret | Minimum 32 characters, random | Prevents brute-force token signing |
| Access Token Lifetime | 24h (customers), 8h (admins) | Balance between UX and security |
| Refresh Token Lifetime | 30 days (customers), 7 days (admins) | Longer for customers (infrequent access) |
| Refresh Token Storage | SHA-256 hashed in database | Prevents token theft if DB compromised |
| Account Lockout | 5 failed attempts, 15-minute lock | Prevents brute-force attacks |
| Password Requirements | Min 8 chars, 1 number | Basic strength without frustrating users |

### Authorization

**Principle:** Least Privilege
- Customers can ONLY access their own data (validated by `cliente_id` in JWT)
- Admins can access all customer data
- No cross-customer access possible

**Implementation:**
```typescript
// Example middleware
function requireOwnData(req, res, next) {
  const requestedId = req.params.id;
  const authenticatedId = req.user.sub;

  if (req.user.tipo === 'admin') {
    return next(); // Admins can access all
  }

  if (requestedId !== authenticatedId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}
```

### Data Protection

| Data Type | Protection Method | Storage Location |
|-----------|-------------------|------------------|
| Passwords | bcrypt hash (12 rounds) | `clientes.hash_contrasena`, `perfiles.hash_contrasena` |
| JWTs | HS256 with 32+ char secret | Not stored (stateless) |
| Refresh Tokens | SHA-256 hash | `sesiones_refresh.token_hash` |
| RUTs | Plain text (needed for search) | `clientes.rut` (indexed) |
| Payment Data | Plain text | `pagos.*` (historical record) |

**Sensitive Fields:**
- `hash_contrasena`: Never returned in API responses
- `token_hash`: Never returned in API responses
- Credit card data: Never stored (Transbank handles, Phase 2)

### Transport Security

- **HTTPS Only** in production (enforced by Render/Vercel)
- **CORS**: Restrict to frontend domain only
  ```typescript
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
  })
  ```
- **Helmet.js**: Security headers (CSP, X-Frame-Options, etc.)

### Rate Limiting

| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|---------|
| `POST /auth/login` | 5 requests | 15 minutes | Prevent brute-force |
| `POST /auth/configurar/:token` | 3 requests | 5 minutes | Prevent abuse |
| All API endpoints | 100 requests | 1 minute per user | Prevent DoS |

### Input Validation

**Server-Side (Critical):**
- RUT format validation (regex + DV check)
- Email format validation
- SQL injection prevention (Prisma parameterized queries)
- XSS prevention (sanitize inputs, escape outputs)

**Client-Side (UX):**
- Same validations for immediate feedback
- Not trusted for security

---

## Performance Requirements

### Response Time Targets

| Operation | Target | Acceptable | Unacceptable | Measurement |
|-----------|--------|------------|--------------|-------------|
| Login (POST /auth/login) | <300ms | <500ms | >1s | Server logs |
| Dashboard load (3 API calls) | <1s | <2s | >3s | Browser DevTools |
| Customer search | <200ms | <400ms | >800ms | Server logs |
| Payment entry | <300ms | <600ms | >1s | Server logs |
| Page navigation (SPA) | <100ms | <200ms | >500ms | User perception |

### Network Performance (Chilean 4G)

**Target Device:** Mid-range Android (2023), 4G LTE
- **First Contentful Paint (FCP):** <1.5s
- **Time to Interactive (TTI):** <3s
- **Largest Contentful Paint (LCP):** <2.5s

**Optimization Strategies:**
- Code splitting per route (Next.js automatic)
- Image optimization (next/image, WebP format)
- API response caching (React Query, 5min stale time)
- Gzip/Brotli compression (automatic on Vercel)
- Critical CSS inline (Next.js automatic)

### Database Performance

**Query Optimization:**
```sql
-- Required indexes
CREATE INDEX idx_clientes_rut ON clientes(rut);
CREATE INDEX idx_clientes_numero ON clientes(numero_cliente);
CREATE INDEX idx_pagos_cliente_fecha ON pagos(cliente_id, fecha_pago DESC);
CREATE INDEX idx_boletas_cliente_estado ON boletas(cliente_id, estado);
CREATE INDEX idx_direcciones_cliente ON direcciones(cliente_id);
```

**Connection Pooling:**
- Prisma connection limit: 10 (Render free tier)
- Use Supabase pooler for application queries
- Direct connection for migrations only

**Query Limits:**
- Pagination: Max 50 results per page
- Balance calculation: Single aggregate query
- Search: Limit 20 results

---

## Testing Strategy

### Backend Testing

**Unit Tests (Jest):**
- RUT validation edge cases
- Password hashing/verification
- JWT generation/verification
- Business logic (balance calculation, payment application)

**Integration Tests (Supertest):**
```typescript
describe('POST /api/v1/auth/login', () => {
  it('should login customer with valid RUT and password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ rut: '12.345.678-9', password: 'Test1234' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('should return 401 for invalid password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ rut: '12.345.678-9', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('should lock account after 5 failed attempts', async () => {
    // Attempt 5 times with wrong password
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ rut: '12.345.678-9', password: 'wrong' });
    }

    // 6th attempt should be blocked
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ rut: '12.345.678-9', password: 'Test1234' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});
```

### Frontend Testing

**Component Tests (React Testing Library):**
```typescript
describe('LoginPage', () => {
  it('should format RUT as user types', () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('RUT');

    fireEvent.change(input, { target: { value: '123456789' } });

    expect(input.value).toBe('12.345.678-9');
  });

  it('should show error for invalid RUT', async () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('RUT');
    const button = screen.getByText('Ingresar');

    fireEvent.change(input, { target: { value: '12.345.678-0' } }); // Wrong DV
    fireEvent.click(button);

    expect(await screen.findByText('RUT inválido')).toBeInTheDocument();
  });
});
```

**E2E Tests (Playwright - Optional):**
- Full customer login flow
- Payment entry flow
- WhatsApp setup flow

### Manual Testing Checklist

**Mobile (Priority):**
- [ ] Login works on iPhone Safari
- [ ] Login works on Android Chrome
- [ ] RUT keyboard is numeric on mobile
- [ ] All buttons are easily tappable (44px+)
- [ ] Dashboard loads on 3G (throttled DevTools)
- [ ] Pull-to-refresh works

**Desktop:**
- [ ] Admin search returns accurate results
- [ ] Payment form validates inputs
- [ ] Setup link generates correctly

**Security:**
- [ ] Cannot access other customer's data
- [ ] Account locks after 5 failed login attempts
- [ ] Expired setup tokens cannot be used
- [ ] Logged out users redirected to login

---

## Deployment Architecture

### Production Environment

```
┌─────────────────────────────────────────────────────────┐
│                     Users (Chile)                       │
└───────────┬─────────────────────────┬───────────────────┘
            │                         │
            │ HTTPS                   │ HTTPS
            │                         │
┌───────────▼──────────┐   ┌──────────▼─────────────────┐
│  Vercel CDN          │   │  Render                    │
│  (Frontend)          │   │  (Backend API)             │
│  ─────────────       │   │  ────────────              │
│  - Next.js 15        │   │  - Node.js 22              │
│  - Static assets     │   │  - Express                 │
│  - Edge functions    │   │  - Auto-scaling            │
│  - Global CDN        │   │  - Health checks           │
│                      │   │                            │
│  URL:                │   │  URL:                      │
│  app.coab.cl         │   │  api.coab.cl               │
└──────────────────────┘   └─────────┬──────────────────┘
                                     │
                                     │ PostgreSQL
                                     │ Connection
                                     │
                        ┌────────────▼──────────────────┐
                        │  Supabase                     │
                        │  (Database + Storage)         │
                        │  ──────────────────           │
                        │  - PostgreSQL 15              │
                        │  - Connection Pooler          │
                        │  - Automatic Backups          │
                        │  - Row Level Security         │
                        │                               │
                        │  Region: us-east-1            │
                        └───────────────────────────────┘
```

### Environment Variables

**Backend (Render):**
```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://... # Direct connection (migrations)
DATABASE_URL_POOLER=postgresql://... # Pooled (app queries)
JWT_SECRET=<32+ random chars>
JWT_ACCESS_EXPIRY=24h
JWT_REFRESH_EXPIRY=30d
FRONTEND_URL=https://app.coab.cl
INFOBIP_API_KEY=<Phase 2>
INFOBIP_BASE_URL=<Phase 2>
INFOBIP_WHATSAPP_SENDER=<Phase 2>
```

**Frontend (Vercel):**
```bash
NEXT_PUBLIC_API_URL=https://api.coab.cl/api/v1
```

### Deployment Process

**Frontend (Vercel):**
1. Push to `main` branch on GitHub
2. Vercel auto-deploys (build + deploy)
3. Preview URL available immediately
4. Production deployment after checks pass

**Backend (Render):**
1. Push to `main` branch on GitHub
2. Render auto-builds:
   ```bash
   npm install
   npm run build
   npx prisma generate
   ```
3. Render runs migrations (manual step via Render dashboard)
4. Render starts server: `npm start`

**Database Migrations:**
```bash
# Local development
npx prisma migrate dev --name migration_name

# Production (via Render shell or local with prod DATABASE_URL)
npx prisma migrate deploy
```

### Monitoring & Logging

**Render (Backend):**
- Built-in logs (stdout/stderr)
- Health check endpoint: `/health`
- Auto-restart on crash

**Vercel (Frontend):**
- Built-in analytics
- Web Vitals tracking
- Error logging

**Supabase (Database):**
- Query performance insights
- Connection pool monitoring
- Automatic backups (daily)

---

## Out of Scope (Phase 2+)

The following features are explicitly **not included** in MVP:

### Payment Processing
- ❌ Transbank WebPay Plus integration
- ❌ Online payment flow for customers
- ❌ Payment receipt generation (PDF)
- ❌ Automatic payment-to-boleta application

### Communications
- ❌ Automatic WhatsApp sending via Infobip
- ❌ Payment reminder notifications
- ❌ Overdue balance alerts
- ❌ Email notifications

### Document Generation
- ❌ PDF boleta generation (Puppeteer)
- ❌ PDF download for customers
- ❌ Bulk PDF generation for monthly billing

### Advanced Features
- ❌ Service requests (fuga, sin suministro, etc.)
- ❌ Photo upload for service requests
- ❌ Admin analytics dashboard
- ❌ Reporting (collections, outstanding balances)
- ❌ FTP imports from BancoEstado
- ❌ Multi-factor authentication (TOTP)
- ❌ Role-based access control (multiple admin roles)
- ❌ Audit logging
- ❌ Password reset flow
- ❌ Customer profile editing
- ❌ Meter reading display

### Why Deferred?
- Keep MVP focused on core value (account viewing + payment entry)
- Reduce time to market (6 weeks vs 12+ weeks)
- Validate user adoption before investing in advanced features
- Test infrastructure stability with simpler feature set

---

## Implementation Phases

### Phase 1: Core MVP (Weeks 1-6)

**Iteration 1: Setup + Auth (Backend)**
- Project setup (both repos)
- Database migrations
- JWT authentication
- Customer RUT login
- Admin email login

**Iteration 2: Customer Portal (Frontend)**
- Login page
- Dashboard (balance, history)
- Payment history page
- Boleta detail page

**Iteration 3: Admin Portal (Backend + Frontend)**
- Admin APIs (search, profile, payment entry)
- Admin search page
- Customer profile view
- Manual payment entry

**Iteration 4: Onboarding (Backend + Frontend)**
- Setup token generation API
- Password setup page
- WhatsApp link flow (manual copy for MVP)

**Iteration 5: Polish + Deploy**
- Mobile optimization pass
- Error handling polish
- Deploy to production
- Load real customer data

### Phase 2: Payments & Notifications (Weeks 7-10)

- Transbank WebPay Plus integration
- Online payment flow
- Infobip WhatsApp integration
- Automatic setup link sending
- Payment notifications

### Phase 3: Advanced Features (Weeks 11-14)

- PDF generation
- Service requests
- Admin analytics
- Reporting

---

## Acceptance Criteria (MVP Launch)

**Must Have:**
- [ ] 355 customers migrated with RUT and phone number
- [ ] 80% of customers can login successfully (manual password setup)
- [ ] Customer can view current balance and due date
- [ ] Customer can view payment history (all 4,257 payments visible)
- [ ] Customer can view boletas (all 6,880 boletas visible)
- [ ] Admin can search customers by RUT, name, or address in <500ms
- [ ] Admin can register manual payment with all required fields
- [ ] Admin can generate setup link for customers without passwords
- [ ] Mobile dashboard loads in <2s on 4G
- [ ] Zero security vulnerabilities (basic security audit)
- [ ] Zero customer data exposed to wrong users
- [ ] System uptime >99% for first month

**Nice to Have:**
- [ ] Pull-to-refresh on mobile dashboard
- [ ] Keyboard shortcuts for admin search
- [ ] Dark mode (customer portal)

---

**End of PRD**

---

## Appendix A: Chilean RUT Validation Algorithm

```typescript
/**
 * Validates Chilean RUT using modulus 11 algorithm
 * @param rut - RUT string in format XX.XXX.XXX-X or XXXXXXXXX
 * @returns true if valid, false otherwise
 */
function validarRUT(rut: string): boolean {
  // Remove formatting
  const cleaned = rut.replace(/[.-]/g, '').toUpperCase();

  // Must be exactly 9 characters (8 digits + 1 DV)
  if (cleaned.length !== 9) return false;

  // Separate body and verification digit
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  // Calculate expected DV
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = sum % 11;
  const expectedDV = 11 - remainder;

  // Convert expectedDV to string (11 → '0', 10 → 'K')
  let calculatedDV: string;
  if (expectedDV === 11) {
    calculatedDV = '0';
  } else if (expectedDV === 10) {
    calculatedDV = 'K';
  } else {
    calculatedDV = String(expectedDV);
  }

  return dv === calculatedDV;
}
```

**Test Cases:**
```typescript
validarRUT('12.345.678-9'); // true (fictional valid RUT)
validarRUT('12.345.678-0'); // false (wrong DV)
validarRUT('123456789');    // true (accepts unformatted)
validarRUT('1.111.111-K');  // true (DV = K)
validarRUT('12345');        // false (too short)
```

---

## Appendix B: API Error Response Format

All API errors follow this standardized format:

```typescript
{
  "error": {
    "code": "ERROR_CODE",              // Machine-readable error code
    "message": "Mensaje para el usuario", // Human-readable Spanish message
    "details"?: any                     // Optional additional context
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Meaning | Example Message |
|------|-------------|---------|-----------------|
| VALIDATION_ERROR | 400 | Request validation failed | "RUT inválido" |
| INVALID_CREDENTIALS | 401 | Login failed | "Credenciales inválidas" |
| TOKEN_EXPIRED | 401 | JWT or setup token expired | "Sesión expirada" |
| ACCOUNT_LOCKED | 403 | Too many failed login attempts | "Cuenta bloqueada por 15 minutos" |
| FORBIDDEN | 403 | Unauthorized access attempt | "No tiene permisos para esta acción" |
| NOT_FOUND | 404 | Resource not found | "Cliente no encontrado" |
| WEAK_PASSWORD | 400 | Password doesn't meet requirements | "Contraseña debe tener 8 caracteres" |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests | "Demasiadas solicitudes" |
| INTERNAL_ERROR | 500 | Unexpected server error | "Error interno del servidor" |

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **RUT** | Rol Único Tributario - Chilean national ID number, format XX.XXX.XXX-X |
| **DV** | Dígito Verificador - Check digit for RUT validation (0-9 or K) |
| **Boleta** | Water bill/invoice for a billing period |
| **Periodo** | Billing period, usually monthly |
| **Saldo** | Outstanding balance owed by customer |
| **Cargo Fijo** | Fixed monthly charge (independent of consumption) |
| **m³** | Cubic meters of water consumed |
| **Cliente** | Customer (water service subscriber) |
| **Perfil** | Admin user account |
| **COAB** | Comité de Agua Potable (Water Committee - organization name) |

---

**Document Version:** 2.0
**Approval:** Ready for Implementation
**Next Steps:** Proceed to detailed task breakdown for iterative development
