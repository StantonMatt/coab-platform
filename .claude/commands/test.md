---
description: Implement comprehensive tests following COAB project standards
argument-hint: [feature or component to test]
---

Implement tests for: $ARGUMENTS

## 🧪 Testing Philosophy

**Test behavior, not implementation.**
**NO CHEATING TESTS** - Tests must verify real functionality, not mocked shortcuts.

## 📁 Test File Location

### Backend Tests
```
coab-backend/src/
├── routes/[feature]/__tests__/
│   └── [feature].test.ts
├── services/[feature]/__tests__/
│   └── [feature].service.test.ts
└── utils/__tests__/
    └── [utility].test.ts
```

### Frontend Tests
```
coab-frontend/
├── components/[feature]/__tests__/
│   └── [ComponentName].test.tsx
├── hooks/__tests__/
│   └── use[Feature].test.ts
└── lib/utils/__tests__/
    └── [utility].test.ts
```

## ✅ Backend Testing Checklist

### 1. Integration Tests (Routes + Controllers + Services)
- [ ] Use Jest + Supertest
- [ ] Test complete request/response cycle
- [ ] Use real database (test database, not mocked)
- [ ] Clean database before each test (truncate tables)
- [ ] Seed necessary data for tests

### 2. Test Cases to Cover
**Success Cases:**
- [ ] Valid request returns expected response
- [ ] Correct HTTP status code (200, 201, 204)
- [ ] Response matches expected schema
- [ ] Database state changes as expected

**Error Cases:**
- [ ] Invalid input validation (Zod rejection)
- [ ] Missing authentication (401)
- [ ] Missing authorization (403)
- [ ] Resource not found (404)
- [ ] Duplicate resource (409)
- [ ] Server errors (500) with proper logging

**Chilean-Specific:**
- [ ] Valid RUT format accepted
- [ ] Invalid RUT format rejected (wrong DV, bad format)
- [ ] Currency amounts handled as integers
- [ ] Spanish error messages returned

### 3. Test Structure Pattern
```typescript
describe('POST /api/v1/[feature]', () => {
  beforeEach(async () => {
    // Clean database
    await prisma.[table].deleteMany({});
    // Seed necessary data
    await prisma.[table].create({ data: {...} });
  });

  describe('Success cases', () => {
    it('should create [resource] with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/[feature]')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ validData });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ expected });

      // Verify database state
      const dbRecord = await prisma.[table].findUnique({...});
      expect(dbRecord).toBeTruthy();
    });
  });

  describe('Error cases', () => {
    it('should reject invalid RUT format', async () => {
      const response = await request(app)
        .post('/api/v1/[feature]')
        .send({ rut: '12.345.678-0' }); // Invalid DV

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toMatch(/español/);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/[feature]')
        .send({ validData });

      expect(response.status).toBe(401);
    });
  });
});
```

### 4. Mocking Guidelines (Backend)
**DO Mock:**
- [ ] External APIs (Transbank, Infobip, SMTP)
- [ ] File system operations
- [ ] Time-dependent functions (use `jest.useFakeTimers()`)

**DO NOT Mock:**
- [ ] Database operations (use test database)
- [ ] Validation logic (must test real Zod schemas)
- [ ] Business logic (defeats purpose of testing)
- [ ] Authentication/authorization (test with real JWT)

## ✅ Frontend Testing Checklist

### 1. Component Tests (React Testing Library)
- [ ] Render component with expected props
- [ ] Test user interactions (click, type, submit)
- [ ] Test form validation and error messages
- [ ] Test conditional rendering (loading, error, success states)
- [ ] Test accessibility (screen reader, keyboard nav)

### 2. Test Cases to Cover
**Rendering:**
- [ ] Component renders without crashing
- [ ] Displays expected content based on props
- [ ] Shows loading state while fetching data
- [ ] Shows error state when API fails
- [ ] Shows success state with data

**User Interactions:**
- [ ] Buttons respond to clicks
- [ ] Forms validate inputs correctly
- [ ] Form submission triggers API call
- [ ] Success/error messages display correctly
- [ ] Navigation works as expected

**Chilean-Specific:**
- [ ] RUT auto-formats on input (XX.XXX.XXX-X)
- [ ] RUT validation works (invalid DV shows error)
- [ ] Currency displays as $1.234.567
- [ ] Dates format as dd/MM/yyyy or Spanish long format
- [ ] All text is in Spanish

### 3. Test Structure Pattern
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('renders component with expected content', () => {
    render(<ComponentName prop="value" />, { wrapper });

    expect(screen.getByText(/texto esperado/i)).toBeInTheDocument();
  });

  it('handles user interaction correctly', async () => {
    const user = userEvent.setup();
    render(<ComponentName />, { wrapper });

    const input = screen.getByLabelText(/rut/i);
    await user.type(input, '12345678');

    expect(input).toHaveValue('12.345.678');
  });

  it('displays error message on validation failure', async () => {
    const user = userEvent.setup();
    render(<ComponentName />, { wrapper });

    const input = screen.getByLabelText(/rut/i);
    await user.type(input, '12.345.678-0'); // Invalid DV

    await waitFor(() => {
      expect(screen.getByText(/rut inválido/i)).toBeInTheDocument();
    });
  });
});
```

### 4. Mocking Guidelines (Frontend)
**DO Mock:**
- [ ] API calls (use MSW - Mock Service Worker)
- [ ] Browser APIs (localStorage, sessionStorage)
- [ ] Next.js router (use `jest.mock('next/navigation')`)

**DO NOT Mock:**
- [ ] React hooks (test with real hooks)
- [ ] Validation logic (test real Zod schemas)
- [ ] Formatting functions (test real RUT/CLP/date formatting)
- [ ] User interactions (test real click/type events)

### 5. MSW Setup for API Mocking
```typescript
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.post('/api/v1/auth/login', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ accessToken: 'mock-token', user: {...} })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## ✅ Utility Function Testing

### RUT Validation Tests
- [ ] Valid RUT passes (multiple examples)
- [ ] Invalid RUT fails (wrong DV, bad format, too short/long)
- [ ] Edge cases (RUT with K, leading zeros)

### Currency Formatting Tests
- [ ] Formats integers correctly ($1.234.567)
- [ ] Handles zero and negative amounts
- [ ] Handles large amounts (millions, billions)

### Date Formatting Tests
- [ ] Short format (dd/MM/yyyy)
- [ ] Long format in Spanish
- [ ] Timezone handling (Chile is UTC-3 or UTC-4)

## 🚫 Test Anti-Patterns (NO CHEATING!)

**❌ Bad Test:**
```typescript
// Mocking the thing you're testing
jest.mock('../validators/rut', () => ({
  validarRUT: jest.fn(() => true) // Always returns true!
}));

it('validates RUT', () => {
  expect(validarRUT('invalid')).toBe(true); // Meaningless test
});
```

**✅ Good Test:**
```typescript
// Testing real implementation
import { validarRUT } from '../validators/rut';

it('rejects RUT with invalid verification digit', () => {
  expect(validarRUT('12.345.678-0')).toBe(false); // Tests real logic
});

it('accepts valid RUT', () => {
  expect(validarRUT('12.345.678-5')).toBe(true); // Real validation
});
```

**❌ Bad Test:**
```typescript
// Testing implementation details
it('calls setState', () => {
  const setStateSpy = jest.spyOn(React, 'useState');
  render(<Component />);
  expect(setStateSpy).toHaveBeenCalled(); // Who cares?
});
```

**✅ Good Test:**
```typescript
// Testing user-facing behavior
it('displays error message when form is invalid', async () => {
  render(<Component />);
  fireEvent.click(screen.getByText(/enviar/i));

  expect(await screen.findByText(/campo requerido/i)).toBeInTheDocument();
});
```

## 🎯 Coverage Goals
- [ ] Overall coverage: >80%
- [ ] Critical paths (auth, payments): >95%
- [ ] Edge cases covered (error handling, validation)
- [ ] Chilean-specific logic: 100% coverage

## ✨ Running Tests

**Backend:**
```bash
cd coab-backend
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # With coverage report
```

**Frontend:**
```bash
cd coab-frontend
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # With coverage report
```

## 🔍 Before Committing
- [ ] All tests pass (no skipped tests without explanation)
- [ ] Coverage meets minimum thresholds
- [ ] No console.log or debugging code left in tests
- [ ] Test names clearly describe what they test
- [ ] Tests are deterministic (no random failures)
