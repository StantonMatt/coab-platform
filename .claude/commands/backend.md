---
description: Implement a backend feature following COAB project standards
argument-hint: [feature description]
---

Implement backend feature: $ARGUMENTS

## 📁 Folder Structure
```
coab-backend/src/
├── routes/[feature]/        # Route handlers
│   ├── index.ts            # Route registration
│   └── [feature].routes.ts # Endpoint definitions
├── controllers/[feature]/   # Business logic
│   └── [feature].controller.ts
├── services/[feature]/      # Database operations
│   └── [feature].service.ts
├── middleware/              # Auth, validation, etc.
├── validators/[feature]/    # Zod schemas
│   └── [feature].validator.ts
└── utils/                   # Helper functions
```

## ✅ Implementation Checklist

### 1. Input Validation (REQUIRED)
- [ ] Create Zod schemas in `validators/[feature]/`
- [ ] Validate all inputs: body, params, query
- [ ] Spanish error messages in validation schemas
- [ ] Test with invalid inputs to ensure proper rejection

### 2. Database Layer
- [ ] Use Prisma Client in `services/[feature]/`
- [ ] Wrap multi-step operations in `$transaction`
- [ ] Use Spanish column/table names (check schema.prisma)
- [ ] Add proper indexes for queries
- [ ] Handle unique constraint violations gracefully

### 3. Authentication & Authorization
- [ ] Apply `requireAuth` middleware if endpoint needs auth
- [ ] Apply `requireRole(['admin', 'supervisor'])` if role-specific
- [ ] Extract user info from `req.user` (set by auth middleware)
- [ ] Never trust client-provided user IDs, use token payload

### 4. Error Handling
- [ ] Use standardized error response format:
  ```typescript
  {
    error: {
      code: 'ERROR_CODE',
      message: 'Mensaje en español',
      details?: any,
      requestId: string
    }
  }
  ```
- [ ] Log errors with Winston (include requestId)
- [ ] Return appropriate HTTP status codes
- [ ] Never expose internal errors to client

### 5. Security
- [ ] Apply rate limiting on sensitive endpoints (auth, payment)
- [ ] Sanitize user inputs (Zod handles this)
- [ ] Use parameterized queries (Prisma handles this)
- [ ] Audit log for sensitive operations (payments, user updates)
- [ ] Check for Chilean RUT validation where applicable

### 6. Chilean Localization
- [ ] All error messages in Spanish
- [ ] Handle Chilean RUT format (XX.XXX.XXX-X)
- [ ] Currency amounts as integers (cents of CLP)
- [ ] Dates stored as ISO 8601, formatted on frontend
- [ ] Use Spanish in code comments for business logic

### 7. Testing (DO NOT SKIP)
- [ ] Create `__tests__/[feature].test.ts`
- [ ] Integration tests with supertest
- [ ] Test success cases with valid data
- [ ] Test error cases (invalid input, auth failures, not found)
- [ ] Test Chilean-specific data (valid/invalid RUTs)
- [ ] Mock external services (Transbank, Infobip)
- [ ] Run tests and ensure 100% pass: `npm test`
- [ ] **NO CHEATING TESTS** - don't skip validation in test helpers

### 8. Performance
- [ ] Use cursor-based pagination for list endpoints (default 50 items)
- [ ] Add database indexes for foreign keys and filter fields
- [ ] Target <200ms response time for basic operations
- [ ] Use `select` to limit returned fields if needed

### 9. Code Quality & Structure
- [ ] **File Size Limits:**
  - Controllers: max 300 lines
  - Services: max 400 lines
  - Routes: max 150 lines
  - If exceeding, split into smaller focused modules
- [ ] **Remove Dead Code:**
  - Delete unused imports
  - Remove commented-out code
  - Delete unused functions/variables
  - Remove debug console.logs
- [ ] **Reusable Patterns:**
  - Extract common logic into utils/
  - Create shared middleware for repeated functionality
  - Use inheritance/composition for similar services
  - Avoid copy-paste code (DRY principle)
- [ ] **Clean Folder Structure:**
  - Group related files in feature folders
  - Keep flat hierarchy (max 3 levels deep)
  - Use index.ts for clean exports
  - Consistent naming conventions

### 10. Documentation & Changelog
- [ ] Add JSDoc comments for public functions
- [ ] Document expected request/response formats
- [ ] Add examples of error responses
- [ ] **Update CHANGELOG:** Add entry to `coab-backend/CHANGELOG.md`:
  ```markdown
  ## [Unreleased]
  ### Added
  - [Feature name]: Brief description in Spanish

  ### Changed
  - [What changed]: Brief description

  ### Fixed
  - [Bug fix]: Brief description
  ```

## 🚫 Common Mistakes to Avoid
- ❌ Using `any` type instead of proper TypeScript interfaces
- ❌ Forgetting to validate inputs with Zod
- ❌ Mixing English and Spanish (pick Spanish for user-facing text)
- ❌ Not wrapping multi-step DB operations in transactions
- ❌ Trusting client-provided user IDs instead of token payload
- ❌ Writing tests that always pass (testing implementation, not behavior)
- ❌ Returning detailed error messages that expose internals
- ❌ Leaving dead code or commented-out blocks
- ❌ Creating files longer than 400 lines (split them!)
- ❌ Copy-pasting code instead of extracting to utils
- ❌ Forgetting to update CHANGELOG.md

## 📦 Before Installing Dependencies
- [ ] Use `/check-mcp-docs [package-name]` to review latest documentation
- [ ] Verify Node.js 22 compatibility
- [ ] Check bundle size impact
- [ ] Ensure no security vulnerabilities

## ✨ Before Committing
- [ ] Run `/test-before-commit` to verify all tests pass
- [ ] Type check: `npm run type-check`
- [ ] Lint: `npm run lint`
- [ ] Review changes for hardcoded values or secrets
- [ ] **CHANGELOG updated** with changes in `coab-backend/CHANGELOG.md`
- [ ] No dead code or commented-out blocks
- [ ] No files exceeding size limits (300-400 lines)
- [ ] No debug console.logs remaining
