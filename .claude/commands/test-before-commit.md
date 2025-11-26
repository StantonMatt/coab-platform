---
description: Run comprehensive tests before committing code
allowed-tools: Bash(npm:*), Bash(cd:*)
---

Run comprehensive pre-commit tests

Context: $ARGUMENTS

## 🧪 Backend Tests

### 1. Run Test Suite
```bash
cd coab-backend && npm test
```

**Requirements:**
- [ ] All tests pass (0 failures)
- [ ] No skipped tests without documented reason
- [ ] Coverage >80% for new code
- [ ] Integration tests pass with real database

### 2. Type Checking
```bash
cd coab-backend && npm run type-check
```

**Requirements:**
- [ ] Zero TypeScript errors
- [ ] No `any` types in new code
- [ ] Proper type definitions for all functions

### 3. Linting
```bash
cd coab-backend && npm run lint
```

**Requirements:**
- [ ] Zero linting errors
- [ ] Zero warnings in production code
- [ ] Code follows project style guide

## 🎨 Frontend Tests

### 1. Run Test Suite
```bash
cd coab-frontend && npm test
```

**Requirements:**
- [ ] All tests pass (0 failures)
- [ ] Component tests cover user interactions
- [ ] API mocking works correctly (MSW)
- [ ] Accessibility tests pass

### 2. Type Checking
```bash
cd coab-frontend && npm run type-check
```

**Requirements:**
- [ ] Zero TypeScript errors
- [ ] Proper prop types defined
- [ ] No implicit `any` types

### 3. Linting
```bash
cd coab-frontend && npm run lint
```

**Requirements:**
- [ ] Zero ESLint errors
- [ ] Zero warnings
- [ ] React hooks rules followed

### 4. Build Verification
```bash
cd coab-frontend && npm run build
```

**Requirements:**
- [ ] Build completes without errors
- [ ] No build warnings for new code
- [ ] Bundle size is reasonable (check output)

## 🇨🇱 Chilean Data Validation

### Manual Verification Checklist
- [ ] RUT validation works with valid formats
  - Test: `12.345.678-5` (valid)
  - Test: `12.345.678-0` (invalid DV)
  - Test: `1234567` (missing format)
- [ ] Currency displays as `$1.234.567`
  - Test: 1000 → `$1.000`
  - Test: 1234567 → `$1.234.567`
- [ ] Dates format correctly
  - Short: `05/10/2025`
  - Long: `5 de octubre a las 14:30`
- [ ] All UI text is in Spanish
- [ ] Error messages are in Spanish

## 🔒 Security Checks

### Backend Security
- [ ] No secrets in code (API keys, passwords)
- [ ] Environment variables used correctly
- [ ] Input validation with Zod on all endpoints
- [ ] Authentication middleware applied to protected routes
- [ ] Rate limiting configured on sensitive endpoints
- [ ] SQL injection prevention (Prisma parameterized queries)
- [ ] XSS prevention (proper input sanitization)

### Frontend Security
- [ ] No API keys in client code
- [ ] NEXT_PUBLIC_* env vars used correctly
- [ ] Auth tokens stored securely (not in cookies with HttpOnly false)
- [ ] User input sanitized before rendering
- [ ] Sensitive data not logged to console

## 📱 Mobile Responsiveness (Frontend)

If frontend changes were made:
- [ ] Use `/iterate-ui-playwright` to test at 375px width
- [ ] Touch targets are minimum 44px
- [ ] Text is readable without zooming
- [ ] Forms work on mobile (proper input types)
- [ ] Navigation works on mobile

## 🎯 Performance Checks

### Backend Performance
- [ ] API endpoints respond in <200ms for basic operations
- [ ] Database queries use indexes (check with EXPLAIN)
- [ ] Pagination implemented for list endpoints
- [ ] No N+1 query problems

### Frontend Performance
- [ ] Run Lighthouse on key pages (target >85 mobile score)
- [ ] Images optimized (using next/image)
- [ ] No unnecessary re-renders
- [ ] Lazy loading for off-screen content

## 🚫 Pre-Commit Blockers

**DO NOT commit if:**
- ❌ Any tests are failing
- ❌ TypeScript errors exist
- ❌ Linting errors exist
- ❌ Build fails (frontend)
- ❌ Secrets are in code
- ❌ Chilean data formats are broken
- ❌ Mobile responsiveness is broken
- ❌ New code lacks tests

**Fix the root cause, don't:**
- ❌ Skip tests
- ❌ Mock away real functionality
- ❌ Add `@ts-ignore` or `eslint-disable`
- ❌ Comment out failing code

## ✅ All Clear - Ready to Commit

If all checks pass:

1. **Review your changes:**
   ```bash
   git diff
   ```

2. **Stage files:**
   ```bash
   git add [files]
   ```

3. **Commit with descriptive message:**
   ```bash
   git commit -m "feat: [descriptive message in Spanish]"
   ```

4. **Consider pushing** (if ready):
   ```bash
   git push
   ```

## 📊 Final Checklist

- [ ] All backend tests pass
- [ ] All frontend tests pass
- [ ] No TypeScript errors (both services)
- [ ] No linting errors (both services)
- [ ] Frontend builds successfully
- [ ] Chilean data formats validated
- [ ] Security checks passed
- [ ] Mobile responsiveness verified (if applicable)
- [ ] Performance targets met
- [ ] Code reviewed for secrets/sensitive data
- [ ] Commit message is descriptive

**If all boxes are checked, you're good to commit! 🎉**

**If any box is unchecked, fix the issue first. 🛠️**
