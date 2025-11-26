---
description: Implement a frontend feature following COAB project standards
argument-hint: [feature description]
---

Implement frontend feature: $ARGUMENTS

## 📁 Folder Structure
```
coab-frontend/
├── app/                           # Next.js 15 App Router
│   ├── (customer)/               # Customer portal routes
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (admin)/                  # Admin portal routes
│   │   ├── clientes/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   └── api/                      # API routes (if needed)
├── components/                    # Reusable components
│   ├── ui/                       # shadcn/ui components
│   ├── [feature]/                # Feature-specific components
│   │   ├── [ComponentName].tsx
│   │   └── __tests__/
│   │       └── [ComponentName].test.tsx
│   └── layout/                   # Layout components (header, nav, etc.)
├── lib/                          # Utilities and configs
│   ├── api.ts                    # Axios client with interceptors
│   ├── auth.ts                   # Auth helpers
│   ├── validators/               # Zod schemas (shared with backend)
│   └── utils/                    # Helper functions
│       ├── rut.ts                # Chilean RUT utilities
│       ├── currency.ts           # CLP formatting
│       └── dates.ts              # Chilean date formatting
├── hooks/                        # Custom React hooks
│   └── use[Feature].ts
├── types/                        # TypeScript types
│   └── [feature].ts
└── styles/                       # Global styles
    └── globals.css
```

## ✅ Implementation Checklist

### 1. Component Structure (React + TypeScript)
- [ ] Use functional components with TypeScript strict mode
- [ ] Define prop interfaces (no `any` types)
- [ ] Use proper semantic HTML (accessibility)
- [ ] Extract reusable logic into custom hooks
- [ ] Keep components focused (single responsibility)
- [ ] Spanish comments for business logic

### 2. Styling (Mobile-First)
- [ ] Use shadcn/ui components from `components/ui/`
- [ ] Tailwind CSS for custom styling
- [ ] Chilean theme colors:
  - `primary-blue`: #0066CC
  - `accent-green`: #00AA44
  - `error-red`: #DC2626
  - `warning-yellow`: #F59E0B
- [ ] Mobile-first breakpoints: `sm:`, `md:`, `lg:`
- [ ] Minimum 44px touch targets for interactive elements
- [ ] Test responsive design at 375px, 768px, 1024px

### 3. Forms & Validation
- [ ] Use `react-hook-form` for form state management
- [ ] Zod schemas for validation (reuse from backend if possible)
- [ ] Spanish error messages
- [ ] Chilean RUT auto-formatting on input
- [ ] Show validation errors inline (below field)
- [ ] Disable submit button while submitting
- [ ] Show loading states during submission
- [ ] Handle success/error responses

### 4. API Integration
- [ ] Use React Query (`@tanstack/react-query`) for server state
- [ ] Axios client from `lib/api.ts` (has auth interceptors)
- [ ] Handle loading, error, and success states
- [ ] Show user-friendly error messages in Spanish
- [ ] Implement optimistic updates where appropriate
- [ ] Set proper cache invalidation on mutations

### 5. Chilean Localization
- [ ] All UI text in Spanish (es-CL)
- [ ] RUT inputs with format `XX.XXX.XXX-X`
  - Use `formatRut()` from `lib/utils/rut.ts`
  - Use `validarRUT()` for validation
  - Use `inputmode="numeric"` on mobile
- [ ] Currency formatted as `$1.234.567` (CLP)
  - Use `formatCLP()` from `lib/utils/currency.ts`
- [ ] Dates with `date-fns` and `es` locale
  - Short: `dd/MM/yyyy`
  - Long: `d 'de' MMMM 'a las' HH:mm`
  - Use `formatFechaCL()` from `lib/utils/dates.ts`

### 6. Authentication & Authorization
- [ ] Check auth state using `useAuth()` hook
- [ ] Redirect unauthenticated users to login
- [ ] Show/hide features based on user role
- [ ] Handle 401 responses (auto-refresh or redirect to login)
- [ ] Clear auth state on logout

### 7. Accessibility
- [ ] Proper ARIA labels for interactive elements
- [ ] Keyboard navigation support (Tab, Enter, Escape)
- [ ] Focus management (modals, forms)
- [ ] Screen reader friendly (alt text, ARIA roles)
- [ ] Color contrast meets WCAG AA standards
- [ ] Error messages announced to screen readers

### 8. Performance
- [ ] Use Next.js dynamic imports for large components
- [ ] Optimize images with next/image
- [ ] Lazy load off-screen content
- [ ] Debounce search inputs (300ms)
- [ ] Target Lighthouse score >85 on mobile
- [ ] Test on 3G network simulation (FCP <1.5s)

### 9. Testing (DO NOT SKIP)
- [ ] Create `__tests__/[ComponentName].test.tsx`
- [ ] Use React Testing Library
- [ ] Test user interactions (click, type, submit)
- [ ] Test error states and edge cases
- [ ] Test Chilean data formatting (RUT, CLP, dates)
- [ ] Mock API calls with MSW (Mock Service Worker)
- [ ] Test accessibility (screen reader, keyboard nav)
- [ ] Run tests: `npm test`
- [ ] **NO CHEATING TESTS** - test real user behavior

### 10. Code Quality & Structure
- [ ] **File Size Limits:**
  - Components: max 250 lines
  - Pages: max 300 lines
  - Hooks: max 150 lines
  - If exceeding, split into smaller focused modules
- [ ] **Remove Dead Code:**
  - Delete unused imports
  - Remove commented-out code
  - Delete unused state/props/functions
  - Remove debug console.logs/debuggers
- [ ] **Reusable Components:**
  - Extract repeated JSX into components
  - Create custom hooks for repeated logic
  - Use composition over duplication
  - Build generic components (e.g., DataTable, FormField)
- [ ] **Clean Folder Structure:**
  - Group related components in feature folders
  - Keep component files focused (one component per file)
  - Use barrel exports (index.ts) for clean imports
  - Co-locate tests with components (__tests__ folder)
- [ ] **Component Best Practices:**
  - Single Responsibility Principle (one purpose per component)
  - Props interface clearly defined at top
  - Extract complex logic to custom hooks
  - Avoid prop drilling (use context if >2 levels)

### 11. UI/UX Iteration
- [ ] Use `/iterate-ui-playwright` to test in real browser
- [ ] Check mobile responsiveness (375px width minimum)
- [ ] Verify touch targets are 44px minimum
- [ ] Test with real Chilean data (RUTs, amounts, dates)
- [ ] Get feedback from Matthew before finalizing

### 12. Documentation & Changelog
- [ ] Add JSDoc comments for exported components/hooks
- [ ] Document complex props with descriptions
- [ ] Add usage examples for reusable components
- [ ] **Update CHANGELOG:** Add entry to `coab-frontend/CHANGELOG.md`:
  ```markdown
  ## [Unreleased]
  ### Added
  - [Component/Feature name]: Brief description in Spanish

  ### Changed
  - [What changed]: Brief description

  ### Fixed
  - [Bug fix]: Brief description
  ```

## 🎨 shadcn/ui Components Available
Check `components/ui/` for installed components:
- Button, Input, Label, Form
- Card, Table, Dialog, Dropdown
- Toast, Alert, Badge
- Skeleton (loading states)

If you need a new component, install with:
```bash
npx shadcn-ui@latest add [component-name]
```

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

## 📦 Before Installing Dependencies
- [ ] Use `/check-mcp-docs [package-name]` to review latest docs
- [ ] Verify Next.js 15 compatibility
- [ ] Check bundle size impact (use `next/dynamic` for large packages)
- [ ] Ensure no security vulnerabilities

## ✨ Before Committing
- [ ] Run `/test-before-commit` to verify all tests pass
- [ ] Type check: `npm run type-check`
- [ ] Lint: `npm run lint`
- [ ] Build: `npm run build` (ensure no errors)
- [ ] Test on mobile viewport (375px width)
- [ ] Verify Chilean data formats render correctly
- [ ] **CHANGELOG updated** with changes in `coab-frontend/CHANGELOG.md`
- [ ] No dead code or commented-out blocks
- [ ] No files exceeding size limits (250-300 lines)
- [ ] No debug console.logs or debugger statements
- [ ] No prop drilling (max 2 levels)
