---
description: Implement a frontend task from iteration plan with full standards enforcement
argument-hint: [task description or task number]
allowed-tools: Read, TodoWrite, Glob, Grep
---

Implement frontend task: $ARGUMENTS

## 📖 Step 1: Identify Task from Iteration Plan

**First, determine which iteration and task we're implementing:**

1. **If task number provided** (e.g., "2.3" or "Task 2.3"):
   - Read `.claude/iterations/02-customer-auth.md` (match number)
   - Find the specific frontend task section

2. **If description provided** (e.g., "login page with RUT input"):
   - Search across `.claude/iterations/*.md` files
   - Find matching task by description
   - Identify the iteration context

3. **Extract from iteration document:**
   - Task title and time estimate
   - Components to create
   - Implementation details
   - **Acceptance Criteria** (critical!)
   - Test strategy
   - Dependencies (backend endpoints needed)

**Ask Matthew for confirmation if task is ambiguous.**

---

## 📋 Step 2: Create Task-Specific Implementation Checklist

Use **TodoWrite** to create a comprehensive checklist combining:

### A. Task Acceptance Criteria (from iteration doc)
- [ ] Extract each checkbox from "**Acceptance Criteria:**" section
- [ ] Add each criterion as a separate todo item
- [ ] Example: "Login form displays RUT input with auto-formatting"

### B. Frontend Implementation Standards
- [ ] Read task requirements and understand scope
- [ ] Create component structure in `components/[feature]/`
- [ ] Set up forms with `react-hook-form` + Zod validation
- [ ] Implement API integration with React Query
- [ ] Apply Chilean formatting (RUT, CLP, dates)
- [ ] Ensure mobile-first design (44px touch targets)
- [ ] Test accessibility (keyboard nav, screen readers)
- [ ] Write component tests in `__tests__/`
- [ ] Test with Playwright using `/iterate-ui-playwright`
- [ ] Update CHANGELOG in `coab-frontend/CHANGELOG.md`
- [ ] Run `/test-before-commit`

### C. Component Organization Checklist
Based on task requirements:
- [ ] List each component/page that needs to be created
- [ ] Verify folder structure follows frontend standards
- [ ] Ensure components don't exceed size limits (250 lines, pages 300 lines)

---

## ✅ Step 3: Implementation Guidelines (Frontend Standards)

Follow ALL standards from `/frontend` command:

### 1. Component Structure (React + TypeScript)
```typescript
// components/auth/LoginForm.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRut, validarRUT } from '@/lib/utils/rut';

const loginSchema = z.object({
  rut: z.string()
    .min(1, 'RUT es requerido')
    .refine(validarRUT, 'RUT inválido'),
  password: z.string().min(8, 'Contraseña debe tener al menos 8 caracteres')
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSubmit: (data: LoginFormData) => void;
  isLoading?: boolean;
}

export function LoginForm({ onSubmit, isLoading = false }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  });

  // Auto-format RUT on input
  const rut = watch('rut');
  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatRut(e.target.value);
    setValue('rut', formatted);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="rut" className="block text-sm font-medium mb-1">
          RUT
        </label>
        <Input
          id="rut"
          type="text"
          inputMode="numeric"
          placeholder="12.345.678-9"
          {...register('rut')}
          onChange={handleRutChange}
          aria-invalid={errors.rut ? 'true' : 'false'}
          className="min-h-[44px]" // Mobile touch target
        />
        {errors.rut && (
          <p className="text-sm text-error-red mt-1" role="alert">
            {errors.rut.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Contraseña
        </label>
        <Input
          id="password"
          type="password"
          {...register('password')}
          aria-invalid={errors.password ? 'true' : 'false'}
          className="min-h-[44px]"
        />
        {errors.password && (
          <p className="text-sm text-error-red mt-1" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full min-h-[44px]"
      >
        {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
      </Button>
    </form>
  );
}
```

**Rules:**
- ✅ Functional components with TypeScript strict mode
- ✅ Props interface clearly defined at top
- ✅ Use semantic HTML (labels, proper input types)
- ✅ Extract complex logic to custom hooks
- ✅ Spanish comments for business logic
- ✅ Min 44px touch targets for mobile

### 2. Forms & Validation
```typescript
// Using react-hook-form + Zod
const schema = z.object({
  rut: z.string().refine(validarRUT, 'RUT inválido'),
  monto: z.number().min(1000, 'Monto mínimo $1.000')
});

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema)
});
```

**Rules:**
- ✅ Use `react-hook-form` for form state
- ✅ Zod schemas for validation (reuse from backend if possible)
- ✅ Spanish error messages
- ✅ Chilean RUT auto-formatting on input
- ✅ Show validation errors inline (below field)
- ✅ Disable submit button while submitting
- ✅ Show loading states during submission

### 3. API Integration (React Query)
```typescript
// hooks/useAuth.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { rut: string; password: string }) => {
      const { data } = await apiClient.post('/auth/login', credentials);
      return data;
    },
    onSuccess: (data) => {
      // Save tokens
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      // Invalidate user query
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: any) => {
      // Handle error (show toast, etc.)
      console.error('Login failed:', error);
    }
  });
}

// Usage in component
function LoginPage() {
  const { mutate: login, isPending, error } = useLogin();

  const handleSubmit = (data: LoginFormData) => {
    login(data);
  };

  return (
    <div>
      <LoginForm onSubmit={handleSubmit} isLoading={isPending} />
      {error && (
        <p className="text-error-red mt-2">
          {error.response?.data?.error?.message || 'Error al iniciar sesión'}
        </p>
      )}
    </div>
  );
}
```

**Rules:**
- ✅ Use React Query for server state
- ✅ Axios client from `lib/api.ts` (has auth interceptors)
- ✅ Handle loading, error, and success states
- ✅ Show user-friendly error messages in Spanish
- ✅ Implement optimistic updates where appropriate
- ✅ Set proper cache invalidation on mutations

### 4. Chilean Localization

#### RUT Formatting
```typescript
// lib/utils/rut.ts
export function formatRut(value: string): string {
  const cleaned = value.replace(/[^0-9kK]/g, '');
  if (cleaned.length <= 1) return cleaned;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1).toUpperCase();

  // Add dots: 12345678 -> 12.345.678
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formatted}-${dv}`;
}

export function validarRUT(rutStr: string): boolean {
  const cleaned = rutStr.replace(/[.-]/g, '');
  if (cleaned.length < 8 || cleaned.length > 9) return false;

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

#### Currency Formatting
```typescript
// lib/utils/currency.ts
export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
  }).format(amount);
}

// Usage: formatCLP(1234567) → "$1.234.567"
```

#### Date Formatting
```typescript
// lib/utils/dates.ts
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatFechaCL(date: Date | string, formatStr: string = 'dd/MM/yyyy'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, formatStr, { locale: es });
}

export function formatFechaLarga(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, "d 'de' MMMM 'a las' HH:mm", { locale: es });
}

// Usage:
// formatFechaCL('2025-10-05') → "05/10/2025"
// formatFechaLarga('2025-10-05T14:30:00') → "5 de octubre a las 14:30"
```

**Rules:**
- ✅ All UI text in Spanish (es-CL)
- ✅ RUT inputs with format `XX.XXX.XXX-X` and auto-formatting
- ✅ Use `inputmode="numeric"` on mobile for RUT inputs
- ✅ Currency formatted as `$1.234.567` (CLP)
- ✅ Dates with `date-fns` and `es` locale

### 5. Mobile-First Design (Tailwind CSS)
```typescript
// Mobile-first approach
<div className="
  w-full
  p-4
  space-y-4
  sm:max-w-md
  sm:mx-auto
  md:max-w-lg
  lg:max-w-xl
">
  <Button className="
    w-full
    min-h-[44px]  // Touch target
    text-base
    sm:text-lg
  ">
    Iniciar Sesión
  </Button>
</div>
```

**Rules:**
- ✅ Use shadcn/ui components from `components/ui/`
- ✅ Tailwind CSS for custom styling
- ✅ Chilean theme colors:
  - `primary-blue`: #0066CC
  - `accent-green`: #00AA44
  - `error-red`: #DC2626
  - `warning-yellow`: #F59E0B
- ✅ Mobile-first breakpoints: `sm:`, `md:`, `lg:`
- ✅ **Minimum 44px touch targets** for interactive elements
- ✅ Test responsive design at 375px, 768px, 1024px

### 6. Accessibility
```typescript
<button
  type="button"
  aria-label="Cerrar modal"
  aria-pressed={isOpen}
  onClick={handleClose}
  className="min-h-[44px] min-w-[44px]"
>
  <X className="h-6 w-6" />
</button>

<input
  id="rut"
  type="text"
  aria-invalid={errors.rut ? 'true' : 'false'}
  aria-describedby={errors.rut ? 'rut-error' : undefined}
/>
{errors.rut && (
  <p id="rut-error" className="text-error-red" role="alert">
    {errors.rut.message}
  </p>
)}
```

**Rules:**
- ✅ Proper ARIA labels for interactive elements
- ✅ Keyboard navigation support (Tab, Enter, Escape)
- ✅ Focus management (modals, forms)
- ✅ Screen reader friendly (alt text, ARIA roles)
- ✅ Color contrast meets WCAG AA standards
- ✅ Error messages announced to screen readers

---

## 🧪 Step 4: Testing Strategy (DO NOT SKIP)

### Component Tests (React Testing Library)
```typescript
// components/auth/__tests__/LoginForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../LoginForm';

describe('LoginForm', () => {
  it('renders login form with RUT and password fields', () => {
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    expect(screen.getByLabelText(/rut/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('auto-formats RUT as user types', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    const rutInput = screen.getByLabelText(/rut/i);
    await user.type(rutInput, '123456785');

    expect(rutInput).toHaveValue('12.345.678-5');
  });

  it('displays error for invalid RUT', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    const rutInput = screen.getByLabelText(/rut/i);
    await user.type(rutInput, '12.345.678-0'); // Invalid DV

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/rut inválido/i)).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits form with valid credentials', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    const rutInput = screen.getByLabelText(/rut/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);

    await user.type(rutInput, '12.345.678-5');
    await user.type(passwordInput, 'Test1234');

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        rut: '12.345.678-5',
        password: 'Test1234'
      });
    });
  });

  it('is keyboard accessible', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    const rutInput = screen.getByLabelText(/rut/i);

    // Tab to RUT field
    await user.tab();
    expect(rutInput).toHaveFocus();

    // Tab to password field
    await user.tab();
    expect(screen.getByLabelText(/contraseña/i)).toHaveFocus();

    // Tab to submit button
    await user.tab();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toHaveFocus();
  });
});
```

### What to Test
- [ ] **Rendering:** Component renders without crashing
- [ ] **User Interactions:** Click, type, submit work correctly
- [ ] **Form Validation:** Invalid inputs show errors
- [ ] **Chilean Formatting:** RUT auto-formats, currency displays correctly
- [ ] **API Integration:** Loading states, error handling (use MSW to mock)
- [ ] **Accessibility:** Keyboard navigation, screen reader support

### Mock API Calls (MSW)
```typescript
// lib/test/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer(
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json();

    if (body.rut === '12.345.678-5' && body.password === 'Test1234') {
      return HttpResponse.json({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: { id: 1, rut: '12.345.678-5', nombre: 'Test User' }
      });
    }

    return HttpResponse.json(
      { error: { code: 'INVALID_CREDENTIALS', message: 'RUT o contraseña incorrectos' } },
      { status: 401 }
    );
  })
);
```

---

## 🎨 Step 5: UI/UX Iteration with Playwright

Use `/iterate-ui-playwright` to test in real browser:

```bash
/iterate-ui-playwright login page
```

**What to check:**
- [ ] Mobile responsiveness at 375px width
- [ ] Touch targets are 44px minimum
- [ ] RUT auto-formatting works in real browser
- [ ] Forms submit correctly
- [ ] Error messages display properly
- [ ] Chilean data renders correctly (RUT, CLP, dates)

---

## 📝 Step 6: Code Quality & File Structure

### File Size Limits
- **Components:** max 250 lines
- **Pages:** max 300 lines
- **Hooks:** max 150 lines
- **If exceeding:** Split into smaller focused components

### Remove Dead Code
- [ ] Delete unused imports
- [ ] Remove commented-out code
- [ ] Delete unused state/props/functions
- [ ] Remove debug `console.log` or `debugger` statements

### Reusable Components
- [ ] Extract repeated JSX into components
- [ ] Create custom hooks for repeated logic
- [ ] Use composition over duplication
- [ ] Build generic components (e.g., `DataTable`, `FormField`)

### Component Best Practices
- [ ] Single Responsibility Principle (one purpose per component)
- [ ] Props interface clearly defined at top
- [ ] Extract complex logic to custom hooks
- [ ] **Avoid prop drilling** (max 2 levels, use context if needed)

### Folder Structure
```
coab-frontend/
├── app/
│   ├── (customer)/          # Customer portal routes
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── dashboard/
│   │       └── page.tsx
│   └── (admin)/             # Admin portal routes
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── auth/                # Auth-related components
│   │   ├── LoginForm.tsx
│   │   └── __tests__/
│   │       └── LoginForm.test.tsx
│   └── layout/              # Layout components
├── hooks/
│   └── useAuth.ts
├── lib/
│   ├── api.ts
│   └── utils/
│       ├── rut.ts
│       ├── currency.ts
│       └── dates.ts
└── types/
    └── auth.ts
```

---

## 📚 Step 7: Documentation & CHANGELOG

### CHANGELOG Entry (REQUIRED)
Update `coab-frontend/CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- Página de inicio de sesión con validación de RUT chileno
- Auto-formateo de RUT al escribir (XX.XXX.XXX-X)
- Interceptor de auto-refresh para tokens JWT
- Diseño mobile-first con touch targets de 44px

### Fixed
- [Any bug fixes from this task]
```

**Format:**
- ✅ Use Spanish for user-facing changes
- ✅ Start with verb (Agregado, Corregido, Mejorado)
- ✅ Be specific but concise
- ✅ Follow Keep a Changelog format

### Component Documentation
- [ ] Add JSDoc comments for exported components/hooks
- [ ] Document complex props with descriptions
- [ ] Add usage examples for reusable components

---

## 🚫 Common Mistakes to Avoid

- ❌ Using `any` type instead of proper interfaces
- ❌ Not handling loading/error states
- ❌ Hardcoding API URLs (use `NEXT_PUBLIC_API_URL` from env)
- ❌ Forgetting mobile-first approach
- ❌ Touch targets smaller than 44px
- ❌ Not validating RUT format properly
- ❌ English text in UI (use Spanish)
- ❌ Not testing on mobile viewport
- ❌ Skipping accessibility considerations
- ❌ Leaving dead code or commented-out blocks
- ❌ Creating components longer than 250 lines (split them!)
- ❌ Copy-pasting JSX instead of extracting components
- ❌ Prop drilling more than 2 levels (use context)
- ❌ Forgetting to update CHANGELOG.md

---

## ✅ Step 8: Definition of Task Complete

**A frontend task is ONLY complete when:**

- [ ] **All acceptance criteria** from iteration doc are met
- [ ] **All tests pass** (100%, no skipped tests)
- [ ] **Component tests** cover user interactions + edge cases
- [ ] **Chilean standards validated:**
  - RUT auto-formatting works
  - RUT validation with modulus 11
  - Currency displays as $1.234.567
  - Dates format as dd/MM/yyyy or Spanish long
  - All text in Spanish
- [ ] **Mobile-first design:**
  - Touch targets ≥ 44px
  - Responsive at 375px, 768px, 1024px
  - Tested with `/iterate-ui-playwright`
- [ ] **Accessibility:**
  - Keyboard navigation works
  - Screen reader friendly
  - ARIA labels present
  - Color contrast meets WCAG AA
- [ ] **Code quality checks:**
  - No dead code or commented-out blocks
  - Files within size limits (250-300 lines)
  - No debug console.logs or debuggers
  - No prop drilling (max 2 levels)
  - Reusable patterns extracted
- [ ] **CHANGELOG updated** with Spanish entry
- [ ] **Type check passes:** `npm run type-check`
- [ ] **Linting passes:** `npm run lint`
- [ ] **Build succeeds:** `npm run build`
- [ ] **Pre-commit checks pass:** Run `/test-before-commit`

---

## 🎯 Step 9: Pre-Commit Checklist

Before committing your implementation:

```bash
# 1. Run comprehensive tests
/test-before-commit login page implementation

# 2. Verify output
✅ All frontend tests pass
✅ No TypeScript errors
✅ No linting errors
✅ Build succeeds
✅ Mobile viewport tested
✅ Chilean data formats validated
✅ CHANGELOG updated
✅ No dead code
✅ File sizes within limits
```

**If all checks pass, commit:**
```bash
git add coab-frontend/
git commit -m "feat: agregado página de inicio de sesión con validación RUT"
```

**If any check fails, fix it first. DO NOT commit broken code.**

---

## 💡 Tips for Success

1. **Read iteration doc thoroughly** - Don't miss acceptance criteria
2. **Mobile-first always** - Start with 375px viewport
3. **Test with Chilean data** - Use real RUT formats, CLP amounts
4. **Use Playwright early** - Don't wait until end to test UI
5. **Keep components small** - Split into focused pieces if >250 lines
6. **Update CHANGELOG immediately** - Don't forget at the end
7. **Accessibility matters** - Test keyboard nav and screen readers
8. **Ask for clarification** - If task is ambiguous, ask Matthew
9. **Reuse existing patterns** - Check similar components in codebase
10. **Test on real mobile device** - Simulator is not enough

---

## 🚀 Next Steps After Task Complete

1. Mark task as complete in TodoWrite
2. Review code with `/review-code coab-frontend/components/[feature]`
3. Move to next task in iteration
4. When all iteration tasks complete, run `/start-iteration [next-iteration]`
