---
description: Implement a backend task from iteration plan with full standards enforcement
argument-hint: [task description or task number]
allowed-tools: Read, TodoWrite, Glob, Grep
---

Implement backend task: $ARGUMENTS

## 📖 Step 1: Identify Task from Iteration Plan

**First, determine which iteration and task we're implementing:**

1. **If task number provided** (e.g., "2.1" or "Task 2.1"):
   - Read `.claude/iterations/02-customer-auth.md` (match number)
   - Find the specific task section

2. **If description provided** (e.g., "auth service with refresh tokens"):
   - Search across `.claude/iterations/*.md` files
   - Find matching task by description
   - Identify the iteration context

3. **Extract from iteration document:**
   - Task title and time estimate
   - Files to create
   - Implementation details
   - **Acceptance Criteria** (critical!)
   - Test strategy
   - Dependencies on previous tasks

**Ask Matthew for confirmation if task is ambiguous.**

---

## 📋 Step 2: Create Task-Specific Implementation Checklist

Use **TodoWrite** to create a comprehensive checklist combining:

### A. Task Acceptance Criteria (from iteration doc)
- [ ] Extract each checkbox from "**Acceptance Criteria:**" section
- [ ] Add each criterion as a separate todo item
- [ ] Example: "POST /api/v1/auth/login accepts RUT + password"

### B. Backend Implementation Standards
- [ ] Read task requirements and understand scope
- [ ] Create Zod validation schemas in `validators/[feature]/`
- [ ] Implement service layer in `services/[feature]/`
- [ ] Implement controller logic in `controllers/[feature]/`
- [ ] Create routes in `routes/[feature]/`
- [ ] Apply authentication middleware (if needed)
- [ ] Apply rate limiting (if auth/payment endpoint)
- [ ] Write integration tests in `__tests__/`
- [ ] Test Chilean-specific data (RUT, CLP, dates)
- [ ] Update CHANGELOG in `coab-backend/CHANGELOG.md`
- [ ] Run /test-before-commit

### C. File Organization Checklist
Based on "**Files to Create:**" from iteration doc:
- [ ] List each file that needs to be created
- [ ] Verify folder structure follows backend standards
- [ ] Ensure files don't exceed size limits (controllers 300, services 400, routes 150)

---

## ✅ Step 3: Implementation Guidelines (Backend Standards)

Follow ALL standards from `/backend` command:

### 1. Input Validation (REQUIRED)
```typescript
// validators/[feature]/[feature].validator.ts
import { z } from 'zod';

export const loginSchema = z.object({
  rut: z.string()
    .regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, 'Formato de RUT inválido')
    .refine(validarRUT, 'RUT inválido'),
  password: z.string().min(8, 'Contraseña debe tener al menos 8 caracteres')
});

export type LoginInput = z.infer<typeof loginSchema>;
```

**Rules:**
- ✅ Validate ALL inputs (body, params, query) with Zod
- ✅ Spanish error messages
- ✅ Test with invalid inputs to ensure proper rejection
- ✅ Use RUT validation with modulus 11 algorithm

### 2. Database Operations (Prisma)
```typescript
// services/[feature]/[feature].service.ts
import prisma from '../../config/database.js';

export async function createPayment(data: PaymentInput) {
  // Use transaction for multi-step operations
  return await prisma.$transaction(async (tx) => {
    const payment = await tx.transaccionesPago.create({ data: {...} });

    // Apply FIFO to boletas
    const boletas = await tx.boletas.findMany({
      where: { cliente_id: data.clienteId, saldo_pendiente: { gt: 0 } },
      orderBy: { fecha_emision: 'asc' }
    });

    // Update boletas...

    return payment;
  });
}
```

**Rules:**
- ✅ Wrap multi-step operations in `$transaction`
- ✅ Use Spanish table/column names (check `schema.prisma`)
- ✅ Handle unique constraint violations gracefully
- ✅ Add indexes for foreign keys and frequently queried fields

### 3. Error Handling
```typescript
// Standardized error response
{
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'RUT o contraseña incorrectos',
    details?: { ... },
    requestId: string
  }
}
```

**Rules:**
- ✅ Use consistent error format
- ✅ Log errors with Pino (include requestId)
- ✅ Return appropriate HTTP status codes
- ✅ Never expose internal errors to client
- ✅ Spanish error messages

### 4. Authentication & Authorization
```typescript
// Apply middleware to protected routes
fastify.get('/profile',
  { preHandler: [requireAuth] },
  async (request, reply) => {
    const userId = request.user.userId; // from JWT payload
    // ...
  }
);

// Role-based access
fastify.post('/admin/unlock',
  { preHandler: [requireAuth, requireRole(['admin'])] },
  async (request, reply) => {
    // ...
  }
);
```

**Rules:**
- ✅ Apply `requireAuth` middleware if endpoint needs auth
- ✅ Apply `requireRole` for admin/supervisor endpoints
- ✅ Extract user info from `req.user` (set by auth middleware)
- ✅ **Never trust client-provided user IDs**, use token payload

### 5. Security
- ✅ Rate limiting on auth endpoints (5 attempts / 15 min)
- ✅ Rate limiting on payment endpoints (100 req / 15 min)
- ✅ Audit log for sensitive operations (use `logs_auditoria` table)
- ✅ Use Argon2id for password hashing (not bcrypt)
- ✅ Store refresh tokens as SHA-256 hash (never plain text)
- ✅ Validate Chilean RUT format with modulus 11

### 6. Chilean Localization
- ✅ All error messages in Spanish
- ✅ RUT format: `XX.XXX.XXX-X` (validate with modulus 11)
- ✅ Currency amounts stored as **integers** (cents of CLP)
  - Example: $1.234.567 CLP = 1234567000 cents (multiply by 1000)
- ✅ Dates stored as ISO 8601 (formatted on frontend)
- ✅ Spanish in code comments for business logic

### 7. Performance
- ✅ Use cursor-based pagination for list endpoints (default 50 items)
- ✅ Add database indexes for foreign keys and filter fields
- ✅ Target <200ms response time for basic operations
- ✅ Use Prisma `select` to limit returned fields if needed

---

## 🧪 Step 4: Testing Strategy (DO NOT SKIP)

### Integration Tests (Required)
```typescript
// __tests__/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { build } from '../app.js';
import prisma from '../config/database.js';

describe('POST /api/v1/auth/login', () => {
  let app;

  beforeEach(async () => {
    app = await build();
    // Clean database
    await prisma.cliente.deleteMany({});
    // Seed test data
    await prisma.cliente.create({
      data: {
        rut: '12.345.678-5',
        hash_contrasena: await hash('Test1234'),
        // ...
      }
    });
  });

  it('should login with valid RUT and password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        rut: '12.345.678-5',
        password: 'Test1234'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('accessToken');
    expect(response.json()).toHaveProperty('refreshToken');
  });

  it('should reject invalid RUT format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        rut: '12.345.678-0', // Invalid DV
        password: 'Test1234'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('should lock account after 5 failed attempts', async () => {
    // Attempt login 5 times with wrong password
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { rut: '12.345.678-5', password: 'WrongPass' }
      });
    }

    // 6th attempt should be locked
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { rut: '12.345.678-5', password: 'Test1234' }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('ACCOUNT_LOCKED');
  });
});
```

### What to Test
- [ ] **Success cases:** Valid inputs return expected responses
- [ ] **Error cases:** Invalid inputs rejected with proper error codes
- [ ] **Chilean data:** Valid/invalid RUTs, CLP amounts, dates
- [ ] **Authentication:** Protected routes require valid JWT
- [ ] **Authorization:** Role-based access enforced
- [ ] **Edge cases:** Account lockout, duplicate records, etc.

### Test with Real Database
- ✅ Use Vitest with test database (not mocked)
- ✅ Clean database before each test
- ✅ Seed necessary test data
- ✅ **NO CHEATING TESTS** - test real behavior, not mocked shortcuts

---

## 📝 Step 5: Code Quality & File Structure

### File Size Limits
- **Controllers:** max 300 lines
- **Services:** max 400 lines
- **Routes:** max 150 lines
- **If exceeding:** Split into smaller focused modules

### Remove Dead Code
- [ ] Delete unused imports
- [ ] Remove commented-out code
- [ ] Delete unused functions/variables
- [ ] Remove debug `console.log` statements

### Reusable Patterns
- [ ] Extract common logic into `utils/`
- [ ] Create shared middleware for repeated functionality
- [ ] Avoid copy-paste code (DRY principle)

### Folder Structure
```
coab-backend/src/
├── routes/[feature]/
│   ├── index.ts            # Route registration
│   └── [feature].routes.ts # Endpoint definitions
├── controllers/[feature]/
│   └── [feature].controller.ts
├── services/[feature]/
│   └── [feature].service.ts
├── validators/[feature]/
│   └── [feature].validator.ts
├── middleware/
└── utils/
```

---

## 📚 Step 6: Documentation & CHANGELOG

### CHANGELOG Entry (REQUIRED)
Update `coab-backend/CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- Autenticación de clientes con RUT y contraseña (Argon2id)
- Refresh token rotation para mayor seguridad
- Rate limiting en endpoints de autenticación (5 intentos / 15 min)
- Validación de RUT chileno con módulo 11

### Fixed
- [Any bug fixes from this task]
```

**Format:**
- ✅ Use Spanish for user-facing changes
- ✅ Start with verb (Agregado, Corregido, Mejorado)
- ✅ Be specific but concise
- ✅ Follow Keep a Changelog format

### Code Documentation
- [ ] Add JSDoc comments for public functions
- [ ] Document expected request/response formats
- [ ] Add examples of error responses

---

## 🚫 Common Mistakes to Avoid

- ❌ Using `any` type instead of proper TypeScript interfaces
- ❌ Forgetting to validate inputs with Zod
- ❌ Mixing English and Spanish (use Spanish for user-facing text)
- ❌ Not wrapping multi-step DB operations in transactions
- ❌ Trusting client-provided user IDs instead of token payload
- ❌ Writing tests that always pass (testing implementation, not behavior)
- ❌ Returning detailed error messages that expose internals
- ❌ Leaving dead code or commented-out blocks
- ❌ Creating files longer than 400 lines (split them!)
- ❌ Copy-pasting code instead of extracting to utils
- ❌ Forgetting to update CHANGELOG.md

---

## ✅ Step 7: Definition of Task Complete

**A backend task is ONLY complete when:**

- [ ] **All acceptance criteria** from iteration doc are met
- [ ] **All tests pass** (100%, no skipped tests)
- [ ] **Integration tests** cover success + error cases
- [ ] **Chilean standards validated:**
  - RUT validation with modulus 11
  - RUT format: XX.XXX.XXX-X
  - Currency as integers (CLP cents × 1000)
  - Spanish error messages
  - Database schema in Spanish
- [ ] **Code quality checks:**
  - No dead code or commented-out blocks
  - Files within size limits (300-400 lines)
  - No debug console.logs
  - No `any` types
  - Reusable patterns extracted
- [ ] **Security checks:**
  - Input validation with Zod
  - Authentication/authorization applied
  - Rate limiting configured (if applicable)
  - Audit logging (if sensitive operation)
- [ ] **CHANGELOG updated** with Spanish entry
- [ ] **Type check passes:** `npm run type-check`
- [ ] **Linting passes:** `npm run lint`
- [ ] **Pre-commit checks pass:** Run `/test-before-commit`

---

## 🎯 Step 8: Pre-Commit Checklist

Before committing your implementation:

```bash
# 1. Run comprehensive tests
/test-before-commit auth implementation

# 2. Verify output
✅ All backend tests pass
✅ No TypeScript errors
✅ No linting errors
✅ CHANGELOG updated
✅ No dead code
✅ File sizes within limits
✅ Chilean standards validated
```

**If all checks pass, commit:**
```bash
git add coab-backend/
git commit -m "feat: agregado autenticación de clientes con RUT y refresh tokens"
```

**If any check fails, fix it first. DO NOT commit broken code.**

---

## 💡 Tips for Success

1. **Read iteration doc thoroughly** - Don't miss acceptance criteria
2. **Write tests first (TDD)** - Ensures you meet requirements
3. **Test with Chilean data** - Use real RUT formats, not mock data
4. **Keep files small** - Split into focused modules if >300-400 lines
5. **Update CHANGELOG immediately** - Don't forget at the end
6. **Ask for clarification** - If task is ambiguous, ask Matthew
7. **Use existing patterns** - Check similar implementations in codebase
8. **Security first** - Validate inputs, protect routes, log sensitive ops

---

## 🚀 Next Steps After Task Complete

1. Mark task as complete in TodoWrite
2. Review code with `/review-code coab-backend/src/[feature]`
3. Move to next task in iteration
4. When all iteration tasks complete, run `/start-iteration [next-iteration]`
