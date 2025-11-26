---
description: Review code quality, find dead code, check file sizes, and verify structure
argument-hint: [path to review (file or directory)]
allowed-tools: Read, Glob, Grep
---

Review code quality for: $ARGUMENTS

## 🔍 Code Quality Review Checklist

### 1. File Size Analysis
**Backend Limits:**
- Controllers: max 300 lines
- Services: max 400 lines
- Routes: max 150 lines
- Utils: max 200 lines

**Frontend Limits:**
- Components: max 250 lines
- Pages: max 300 lines
- Hooks: max 150 lines
- Utils: max 200 lines

**Action Items:**
- [ ] List all files exceeding size limits
- [ ] Suggest how to split oversized files
- [ ] Identify logical boundaries for splitting

### 2. Dead Code Detection

**Look for:**
- [ ] **Unused imports:**
  - Search for imports that are never referenced
  - Check for duplicate imports
  - Identify unused type imports

- [ ] **Commented-out code:**
  - Find blocks of commented code
  - Identify TODO/FIXME comments without action items
  - Look for debug comments (console.log, debugger)

- [ ] **Unused exports:**
  - Functions exported but never imported elsewhere
  - Types/interfaces defined but not used
  - Components created but not used

- [ ] **Unreachable code:**
  - Code after return statements
  - Unreachable branches in conditionals
  - Dead error handlers

- [ ] **Unused variables/functions:**
  - Variables declared but never read
  - Functions defined but never called
  - State variables that are set but never used

### 3. Code Duplication Analysis

**Identify:**
- [ ] **Copy-pasted code blocks:**
  - Similar functions in multiple files
  - Repeated JSX patterns (frontend)
  - Repeated validation logic (backend)

- [ ] **Opportunities for extraction:**
  - Common utility functions
  - Reusable React components
  - Shared validation schemas
  - Common middleware patterns

**Suggest:**
- Where to extract duplicated code
- What to name the extracted utility/component
- Where to place it in folder structure

### 4. Folder Structure Review

**Backend Structure Check:**
```
coab-backend/src/
├── routes/[feature]/
├── controllers/[feature]/
├── services/[feature]/
├── middleware/
├── validators/[feature]/
└── utils/
```

**Frontend Structure Check:**
```
coab-frontend/
├── app/(customer|admin)/[feature]/
├── components/[feature]/
│   └── __tests__/
├── hooks/
├── lib/utils/
└── types/
```

**Verify:**
- [ ] Files are in correct feature folders
- [ ] No deeply nested structures (max 3 levels)
- [ ] Tests are co-located with components
- [ ] Barrel exports (index.ts) are used correctly
- [ ] No orphaned files in root directories

### 5. Component/Module Quality (Frontend)

**Check for:**
- [ ] **Single Responsibility:**
  - Each component does one thing well
  - No "god components" with too much logic

- [ ] **Props Drilling:**
  - No props passed more than 2 levels deep
  - Context used appropriately for global state

- [ ] **Reusability:**
  - Generic components vs. feature-specific
  - Proper use of composition
  - Clear prop interfaces

- [ ] **Hooks Usage:**
  - Complex logic extracted to custom hooks
  - Hooks follow React rules
  - No unnecessary re-renders

### 6. Service/Controller Quality (Backend)

**Check for:**
- [ ] **Separation of Concerns:**
  - Routes only handle HTTP
  - Controllers handle business logic
  - Services handle database operations

- [ ] **Error Handling:**
  - Consistent error response format
  - Proper error logging
  - No exposed internal errors

- [ ] **Transaction Usage:**
  - Multi-step DB operations in transactions
  - Proper rollback on errors

### 7. Code Smells

**Red Flags:**
- [ ] Files with `any` types (TypeScript)
- [ ] console.log or console.error in production code
- [ ] Hardcoded values (API URLs, secrets, magic numbers)
- [ ] Long parameter lists (>4 parameters)
- [ ] Deeply nested conditionals (>3 levels)
- [ ] Functions with multiple return points (>3)
- [ ] Missing error handling (try/catch, .catch())
- [ ] No input validation on endpoints
- [ ] Missing TypeScript types on functions

### 8. Chilean Standards Compliance

**Verify:**
- [ ] RUT validation uses modulus 11 algorithm
- [ ] RUT format displayed as XX.XXX.XXX-X
- [ ] Currency amounts as integers (CLP cents)
- [ ] Currency displayed as $1.234.567
- [ ] Dates use date-fns with es locale
- [ ] All UI text in Spanish
- [ ] Error messages in Spanish
- [ ] Database schema uses Spanish names

### 9. Performance Issues

**Look for:**
- [ ] Missing database indexes on foreign keys
- [ ] N+1 query problems (missing includes/joins)
- [ ] Large API responses without pagination
- [ ] Missing lazy loading (frontend)
- [ ] Unnecessary re-renders (React)
- [ ] Large bundle imports (frontend)
- [ ] Synchronous operations that should be async

### 10. Security Issues

**Check for:**
- [ ] Secrets in code (API keys, passwords)
- [ ] Missing input validation
- [ ] SQL injection vulnerabilities (raw queries)
- [ ] XSS vulnerabilities (dangerouslySetInnerHTML)
- [ ] Missing authentication on protected routes
- [ ] Missing authorization checks
- [ ] Sensitive data in logs
- [ ] CORS misconfigurations

## 📊 Review Output Format

For each issue found, provide:

1. **Issue Type:** (Dead Code | File Size | Duplication | Structure | Code Smell | Performance | Security)
2. **Severity:** (Critical | High | Medium | Low)
3. **Location:** File path and line numbers
4. **Description:** What's wrong
5. **Recommendation:** How to fix it
6. **Example:** Show before/after code if applicable

**Example:**
```
🔴 CRITICAL - Security Issue
File: coab-backend/src/routes/auth/login.routes.ts:45
Problem: No input validation on login endpoint
Impact: Vulnerable to injection attacks
Fix: Add Zod validation schema:

// Before
app.post('/login', loginController);

// After
app.post('/login', validate(loginSchema), loginController);
```

## ✅ Summary Report

At the end, provide:
- Total files reviewed
- Total issues found (by severity)
- Top 3 priorities to fix
- Estimated time to address all issues
- Overall code health score (1-10)

## 🎯 Actionable Next Steps

Provide a prioritized list of:
1. Critical fixes (do immediately)
2. High-priority improvements (do this week)
3. Medium-priority refactoring (do this iteration)
4. Low-priority cleanup (do when convenient)
