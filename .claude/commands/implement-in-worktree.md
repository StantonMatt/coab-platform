---
description: Implement UI component in current worktree with specified design variation
argument-hint: [component-name] [variation-theme]
allowed-tools: Bash(git:*), Bash(cd:*), Bash(npm:*), Read, Write, Edit, TodoWrite, Glob, Grep
---

Implement in worktree: $ARGUMENTS

## 🎨 Context-Aware Worktree Implementation

**Who uses this:** Each Claude Code instance working in a separate worktree

**Purpose:** Implement the same component with different design variation, working independently from other Claude instances

**Context:** You are ONE of several Claude instances working in parallel. Each Claude has its own worktree directory and implements the same component with a different design theme.

---

## 📍 Step 1: Detect Worktree Context

**Determine where you are:**

```bash
# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Check if in experiment branch
if [[ $CURRENT_BRANCH == experiment/* ]]; then
  echo "✅ In worktree: $CURRENT_BRANCH"
else
  echo "❌ ERROR: Not in a worktree! Must be in experiment/* branch"
  exit 1
fi
```

**Extract information from branch name:**

```bash
# Branch format: experiment/component-vN
# Example: experiment/login-page-v2

# Extract component name and variation number
# experiment/login-page-v2 → component=login-page, variation=2

COMPONENT=$(echo $CURRENT_BRANCH | sed 's/experiment\/\(.*\)-v[0-9]*/\1/')
VARIATION=$(echo $CURRENT_BRANCH | sed 's/.*-v\([0-9]*\)/\1/')

echo "Component: $COMPONENT"
echo "Variation: $VARIATION"
```

**Assign port based on variation number:**

```bash
PORT=$((3000 + VARIATION))
echo "Assigned Port: $PORT"

# v1 → 3001
# v2 → 3002
# v3 → 3003
# v4 → 3004
# v5 → 3005
```

---

## 🎨 Step 2: Parse Design Variation Theme

**Arguments:**
- **Component name:** Verification (should match branch)
- **Variation theme:** Design approach to implement

**Common themes:**
- `minimalist` - Clean, spacious, minimal colors
- `card-based` - Professional, elevated with Card wrapper
- `split-screen` - Modern, visual with branding sidebar
- `material` - Google Material Design with bold colors
- `glassmorphism` - Frosted glass, translucent effects
- `neumorphism` - Soft shadows, subtle depth
- `brutalist` - Bold, stark, high contrast
- `custom:description` - Custom theme with description

**Verify component matches branch:**
```bash
ARG_COMPONENT="$1"
ARG_THEME="$2"

if [[ "$ARG_COMPONENT" != "$COMPONENT" ]]; then
  echo "⚠️  Warning: Argument component '$ARG_COMPONENT' doesn't match branch component '$COMPONENT'"
  echo "Using branch component: $COMPONENT"
fi
```

---

## 📋 Step 3: Create Implementation Checklist

Use **TodoWrite** to track progress:

```markdown
- [ ] Understand design variation theme: ${ARG_THEME}
- [ ] Read iteration task requirements for ${COMPONENT}
- [ ] Implement component with ${ARG_THEME} styling
- [ ] Apply ALL Chilean standards (RUT, CLP, Spanish, mobile-first)
- [ ] Ensure 44px touch targets (mobile)
- [ ] Write component tests
- [ ] Test with /iterate-ui-playwright on port ${PORT}
- [ ] Update CHANGELOG for this variation
- [ ] Commit implementation to branch
- [ ] Start dev server on port ${PORT}
- [ ] Report readiness
```

---

## 🏗️ Step 4: Load Design Guidelines for Theme

### **Theme: Minimalist**
**Characteristics:**
- Maximum whitespace
- Single column centered layout (max-w-sm)
- Primary-blue (#0066CC) accents only
- Large form fields (min-h-[56px])
- Minimal text, clear hierarchy
- Logo at top center
- No card wrapper
- Light gray background (bg-gray-50)

**Component pattern:**
```tsx
<div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
  <div className="w-full max-w-sm space-y-8">
    <Logo className="mx-auto h-12 w-auto" />
    <h1 className="text-2xl font-bold text-center">Title</h1>
    <form className="space-y-6">{/* Form fields */}</form>
  </div>
</div>
```

---

### **Theme: Card-Based**
**Characteristics:**
- Component in shadcn/ui Card
- Subtle shadow (shadow-xl)
- Gradient background
- Logo inside card
- Professional, trustworthy
- Elevated feel
- CardHeader + CardContent structure

**Component pattern:**
```tsx
<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-blue to-blue-300 p-4">
  <Card className="w-full max-w-md shadow-xl">
    <CardHeader className="text-center space-y-2">
      <Logo className="mx-auto h-10 w-auto mb-2" />
      <CardTitle>Title</CardTitle>
      <CardDescription>Subtitle</CardDescription>
    </CardHeader>
    <CardContent>
      <form className="space-y-4">{/* Form */}</form>
    </CardContent>
  </Card>
</div>
```

---

### **Theme: Split-Screen**
**Characteristics:**
- Desktop: Left 40% branding, Right 60% form
- Mobile: Single column (stacked)
- Visual storytelling
- Modern, app-like
- Smooth transitions
- Chilean water/blue theme on left

**Component pattern:**
```tsx
<div className="min-h-screen grid md:grid-cols-[40%_60%]">
  {/* Left - Branding (hidden mobile) */}
  <div className="hidden md:flex flex-col justify-center items-center bg-primary-blue text-white p-12">
    <Logo className="h-16 w-auto mb-8" />
    <h2 className="text-3xl font-bold mb-4">COAB</h2>
    <p className="text-lg text-center opacity-90">
      Gestión de Servicios de Agua
    </p>
  </div>

  {/* Right - Form */}
  <div className="flex items-center justify-center p-4 md:p-12">
    <div className="w-full max-w-md space-y-6">
      <Logo className="md:hidden mx-auto h-10 w-auto mb-6" />
      <form className="space-y-4">{/* Form */}</form>
    </div>
  </div>
</div>
```

---

### **Theme: Material**
**Characteristics:**
- Google Material Design guidelines
- Bold primary colors
- Elevation with shadow-md, shadow-lg
- Ripple effects (use shadcn/ui animations)
- High contrast
- Vibrant feel

---

### **Theme: Glassmorphism**
**Characteristics:**
- Backdrop blur effect
- Translucent backgrounds
- Light borders
- Frosted glass aesthetic
- Modern, trendy

**CSS pattern:**
```css
backdrop-blur-xl bg-white/30 border border-white/20
```

---

## ✅ Step 5: Implement Component Following Theme

**Use `/implement-frontend-task` standards but apply theme styling:**

1. **Read iteration requirements:**
   - Check `.claude/iterations/*.md` for component task
   - Extract acceptance criteria
   - Understand functionality requirements

2. **Create component structure:**
   - Follow folder structure: `coab-frontend/app/` or `components/`
   - Apply theme-specific styling from Step 4
   - **Keep functionality identical to other variations**

3. **Apply Chilean standards (CRITICAL):**
   - ✅ RUT auto-formatting on input (XX.XXX.XXX-X)
   - ✅ RUT validation with modulus 11
   - ✅ All UI text in Spanish (es-CL)
   - ✅ Currency format: $1.234.567 (CLP)
   - ✅ Dates with date-fns + es locale
   - ✅ Mobile-first design
   - ✅ **44px minimum touch targets**

4. **React best practices:**
   - react-hook-form for forms
   - Zod for validation
   - React Query for API calls
   - Proper TypeScript types
   - Accessibility (ARIA labels, keyboard nav)

5. **Keep files focused:**
   - Components: max 250 lines
   - Pages: max 300 lines
   - Extract complex logic to hooks
   - No prop drilling (max 2 levels)

---

## 🧪 Step 6: Write Tests

**Create component tests:**

```bash
# Create test file
components/${COMPONENT}/__tests__/${ComponentName}.test.tsx
```

**Test coverage:**
- [ ] Component renders without errors
- [ ] User interactions work (click, type, submit)
- [ ] Form validation (invalid inputs show errors)
- [ ] Chilean data formatting (RUT, CLP, dates)
- [ ] API integration (loading, success, error states)
- [ ] Accessibility (keyboard nav, screen reader)
- [ ] Mobile responsiveness

**Run tests:**
```bash
cd coab-frontend
npm test
```

**All tests must pass before continuing!**

---

## 🎭 Step 7: Iterate with Playwright

**Test in real browser:**

```bash
/iterate-ui-playwright ${COMPONENT} on localhost:${PORT}
```

**What to check:**
- [ ] Design matches theme guidelines
- [ ] Mobile responsive at 375px
- [ ] Touch targets ≥ 44px
- [ ] Chilean data renders correctly
- [ ] Keyboard navigation works
- [ ] Visual polish (spacing, alignment, colors)

**Iterate and refine based on Playwright feedback**

---

## 📝 Step 8: Update CHANGELOG

**Add entry to `coab-frontend/CHANGELOG.md`:**

```markdown
## [Unreleased]

### Added
- Componente ${COMPONENT} con diseño ${ARG_THEME}
  - [Key feature 1]
  - [Key feature 2]
  - Auto-formateo de RUT chileno
  - Diseño mobile-first (44px touch targets)
  - Validación con Zod
```

---

## 💾 Step 9: Commit Implementation

**Commit to your experiment branch:**

```bash
cd coab-frontend  # or coab-backend if applicable

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "feat(${COMPONENT}): implement ${ARG_THEME} variation

Design characteristics:
- [Key visual trait 1]
- [Key visual trait 2]
- [Key visual trait 3]

Chilean standards applied:
- RUT auto-formatting (XX.XXX.XXX-X)
- Spanish UI text
- Mobile-first (44px touch targets)
- Accessibility compliant

Variation ${VARIATION} on port ${PORT}"
```

---

## 🚀 Step 10: Start Dev Server

**Start on assigned port:**

```bash
cd coab-frontend

# Start dev server on variation-specific port
npm run dev -- --port ${PORT}

# Keep server running in background or separate terminal
```

**Verify server started:**
```bash
# Should see:
# VITE ready in [X]ms
# ➜  Local:   http://localhost:${PORT}/
```

---

## 📢 Step 11: Report Readiness

**Print completion message:**

```
✅ Variation ${VARIATION} (${ARG_THEME}) implementation complete!

🌐 Dev server running at:
   http://localhost:${PORT}

📱 Test the component:
   Navigate to [component-route] in browser

✅ Checklist:
   - Component implemented with ${ARG_THEME} design
   - All Chilean standards applied (RUT, CLP, Spanish, mobile-first)
   - Tests passing (npm test)
   - Playwright tested
   - CHANGELOG updated
   - Committed to branch: ${CURRENT_BRANCH}
   - Dev server on port ${PORT}

🎨 Ready for Matthew's review!

⏳ Waiting for comparison with other variations...

When Matthew chooses this variation:
   Run: /merge-this-worktree

If Matthew chooses a different variation:
   Run: /abandon-this-worktree
   (Or just close this chat)
```

---

## 🎯 Success Criteria

Implementation complete when:
- ✅ Component matches theme design guidelines
- ✅ All Chilean standards applied (RUT, CLP, Spanish, 44px targets)
- ✅ All tests passing
- ✅ Playwright testing completed
- ✅ CHANGELOG updated
- ✅ Committed to experiment branch
- ✅ Dev server running on assigned port
- ✅ Ready for Matthew's review

---

## 💡 Tips for This Claude Instance

### **Remember:**
- You are ONE of several Claude instances
- Each Claude implements the SAME component
- **Only styling differs** (functionality identical)
- Don't communicate with other Claudes
- Work independently in your worktree
- Matthew will review all variations and choose winner

### **Focus on:**
- Design variation theme consistency
- Chilean standards (RUT, CLP, Spanish)
- Mobile-first approach (44px touch targets)
- Professional polish
- User experience

### **Don't:**
- Try to merge to main (Matthew/winning Claude does that)
- Delete other worktrees (Matthew does cleanup)
- Change functionality between variations
- Skip Chilean standards
- Rush - polish this variation!

---

## 🚨 Troubleshooting

### **Problem: Not in worktree**
```
❌ ERROR: Not in a worktree! Must be in experiment/* branch

This command must be run from a worktree directory.
Ask Matthew to run: /setup-worktrees ${COMPONENT} [N]
Then open VS Code in worktrees/${COMPONENT}-v${N}/
```

### **Problem: Port already in use**
```bash
# Kill process on port
npx kill-port ${PORT}

# Or use different port temporarily
npm run dev -- --port $((PORT + 10))
```

### **Problem: Dependencies not installed**
```bash
cd coab-frontend
npm install

# Or if using backend
cd coab-backend
npm install
```

---

## 📚 Example: Claude 2 Implementing Card-Based Login

**Matthew ran:** `/setup-worktrees login-page 3`

**Matthew opened VS Code in** `worktrees/login-v2/`

**This Claude (instance 2) runs:**
```bash
/implement-in-worktree login-page card-based
```

**What happens:**
1. Detects: Branch `experiment/login-page-v2`
2. Extracts: Component `login-page`, Variation `2`
3. Assigns: Port `3002`
4. Loads: Card-based design guidelines
5. Implements: Login component with Card wrapper, gradient background
6. Applies: RUT auto-format, Spanish text, 44px targets
7. Tests: All passing
8. Commits: To `experiment/login-page-v2`
9. Starts: Dev server on `localhost:3002`
10. Reports: "Ready at http://localhost:3002"

**Claude 1** does same with minimalist theme on port 3001
**Claude 3** does same with split-screen theme on port 3003

**Matthew reviews all 3, chooses Claude 2's card-based design**

**This Claude (winner) runs:**
```bash
/merge-this-worktree
```

**Done! 🎉**
