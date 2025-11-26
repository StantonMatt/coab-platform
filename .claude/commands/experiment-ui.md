---
description: Create parallel UI experiments using git worktrees for side-by-side comparison
argument-hint: [component-name] [number-of-variations (default: 3)]
allowed-tools: Bash(git:*), Bash(cd:*), Bash(npm:*), TodoWrite
---

Create UI experiments for: $ARGUMENTS

## 🎨 Parallel UI Experimentation with Git Worktrees

**Concept:** Create multiple design variations simultaneously, run them on different ports, compare side-by-side in browser, choose the best.

**Example:**
```bash
/experiment-ui login-page 3

# Creates:
# - worktrees/login-v1 (localhost:3001) - Minimalist design
# - worktrees/login-v2 (localhost:3002) - Card-based layout
# - worktrees/login-v3 (localhost:3003) - Split-screen design

# Choose winner with:
/choose-experiment 2
```

---

## 🌳 Step 1: Create Git Worktrees

**Parse arguments:**
- Component name: First argument (e.g., "login-page")
- Number of variations: Second argument (default: 3)

**For each variation, create:**

```bash
# Create worktree directories and branches
git worktree add worktrees/[component]-v1 -b experiment/[component]-v1
git worktree add worktrees/[component]-v2 -b experiment/[component]-v2
git worktree add worktrees/[component]-v3 -b experiment/[component]-v3

# Example for login-page:
git worktree add worktrees/login-v1 -b experiment/login-v1
git worktree add worktrees/login-v2 -b experiment/login-v2
git worktree add worktrees/login-v3 -b experiment/login-v3
```

**What this does:**
- Creates `worktrees/` directory in project root (if not exists)
- Each worktree is a full copy of the repo in separate directory
- Each has its own branch (`experiment/[component]-vN`)
- All share same `.git` database (efficient)

**Verify creation:**
```bash
git worktree list

# Output:
# /path/to/coab-platform2              abcd123 [main]
# /path/to/coab-platform2/worktrees/login-v1  efgh456 [experiment/login-v1]
# /path/to/coab-platform2/worktrees/login-v2  ijkl789 [experiment/login-v2]
# /path/to/coab-platform2/worktrees/login-v3  mnop012 [experiment/login-v3]
```

---

## 📋 Step 2: Create Implementation Checklist

Use **TodoWrite** to track progress:

```markdown
- [ ] Install dependencies in each worktree (if needed)
- [ ] Implement Variation 1: Minimalist Design (port 3001)
- [ ] Test v1 with /iterate-ui-playwright
- [ ] Implement Variation 2: Card-Based Layout (port 3002)
- [ ] Test v2 with /iterate-ui-playwright
- [ ] Implement Variation 3: Split-Screen Design (port 3003)
- [ ] Test v3 with /iterate-ui-playwright
- [ ] Compare all variations side-by-side in browser
- [ ] Get Matthew's feedback on preferred design
- [ ] Choose winning version with /choose-experiment [N]
```

---

## 🎨 Step 3: Define Design Variations

**Provide clear prompts for each variation based on COAB Chilean standards:**

### **Variation 1: Minimalist Design** 🟦
**Theme:** Clean, spacious, trust-building

**Characteristics:**
- Maximum whitespace
- Single column centered layout (max-width: 400px)
- Primary-blue (#0066CC) accents only
- Large, clear form fields (min-h-[56px] for extra comfort)
- Minimal text, maximum clarity
- Logo at top center
- No card wrapper, just elements on white background
- Focus on RUT input with prominent formatting hint

**Best for:** Users who want simple, no-nonsense interface

**Component structure:**
```tsx
<div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
  <div className="w-full max-w-sm space-y-8">
    <Logo className="mx-auto h-12 w-auto" />
    <h1 className="text-2xl font-bold text-center text-gray-900">
      Iniciar Sesión
    </h1>
    <form className="space-y-6">
      {/* Large, clear form fields */}
    </form>
  </div>
</div>
```

---

### **Variation 2: Card-Based Layout** 🟩
**Theme:** Modern, professional, trustworthy

**Characteristics:**
- Component wrapped in shadcn/ui Card
- Subtle shadow and border
- Logo inside card at top
- Two-tone background (gradient from primary-blue to lighter blue)
- Card floats on background (elevated feel)
- Clear visual hierarchy
- Chilean-themed accent colors (subtle flag colors?)
- Professional, banking-app aesthetic

**Best for:** Users who expect polished, professional interface

**Component structure:**
```tsx
<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-blue to-blue-300 p-4">
  <Card className="w-full max-w-md shadow-xl">
    <CardHeader className="text-center space-y-2 pb-4">
      <Logo className="mx-auto h-10 w-auto mb-2" />
      <CardTitle className="text-2xl">Bienvenido</CardTitle>
      <CardDescription>
        Ingresa tu RUT para acceder
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form className="space-y-4">
        {/* Form fields */}
      </form>
    </CardContent>
  </Card>
</div>
```

---

### **Variation 3: Split-Screen Design** 🟨
**Theme:** Modern, visual, engaging

**Characteristics:**
- **Desktop (≥768px):**
  - Left 40%: Branding/image (Chilean water theme? Blue abstract?)
  - Right 60%: Form
- **Mobile (<768px):**
  - Single column (form only, logo at top)
- Modern, app-like feel
- Visual storytelling (water imagery, Chilean landscape?)
- Premium aesthetic
- Smooth transitions

**Best for:** Users who appreciate modern, visually-rich interfaces

**Component structure:**
```tsx
<div className="min-h-screen grid md:grid-cols-[40%_60%]">
  {/* Left side - Branding (hidden on mobile) */}
  <div className="hidden md:flex flex-col justify-center items-center bg-primary-blue text-white p-12">
    <Logo className="h-16 w-auto mb-8" />
    <h2 className="text-3xl font-bold mb-4">COAB</h2>
    <p className="text-lg text-center opacity-90">
      Gestión de Servicios de Agua
    </p>
  </div>

  {/* Right side - Form */}
  <div className="flex items-center justify-center p-4 md:p-12">
    <div className="w-full max-w-md space-y-6">
      {/* Mobile logo */}
      <Logo className="md:hidden mx-auto h-10 w-auto mb-6" />
      <form className="space-y-4">
        {/* Form fields */}
      </form>
    </div>
  </div>
</div>
```

---

## 🚀 Step 4: Start Dev Servers on Different Ports

**Important:** Each worktree needs its own dev server on a unique port.

### **Option A: Manual (3 separate terminals)**

**Terminal 1:**
```bash
cd worktrees/[component]-v1/coab-frontend
npm install  # If dependencies not installed
npm run dev -- --port 3001
```

**Terminal 2:**
```bash
cd worktrees/[component]-v2/coab-frontend
npm install
npm run dev -- --port 3002
```

**Terminal 3:**
```bash
cd worktrees/[component]-v3/coab-frontend
npm install
npm run dev -- --port 3003
```

### **Option B: Automated (background processes)**

```bash
# From project root
cd worktrees/[component]-v1/coab-frontend && npm run dev -- --port 3001 &
cd worktrees/[component]-v2/coab-frontend && npm run dev -- --port 3002 &
cd worktrees/[component]-v3/coab-frontend && npm run dev -- --port 3003 &

# Note: Use 'jobs' to see running processes, 'kill %1 %2 %3' to stop
```

### **Access URLs:**
- 🟦 **Variation 1 (Minimalist):** http://localhost:3001/[route]
- 🟩 **Variation 2 (Card-Based):** http://localhost:3002/[route]
- 🟨 **Variation 3 (Split-Screen):** http://localhost:3003/[route]

**Tip:** Open all 3 in separate browser windows side-by-side for comparison

---

## 🔧 Step 5: Implement Each Variation

**For each worktree, apply the same task but with different design approach:**

### **Workflow per variation:**

1. **Navigate to worktree:**
   ```bash
   cd worktrees/[component]-v1
   ```

2. **Implement the component** following the design variation prompt
   - Use `/implement-frontend-task [task-name]` for standards
   - Apply variation-specific design characteristics
   - Keep same functionality across all (only styling differs)

3. **Apply Chilean standards** (ALL variations):
   - ✅ RUT auto-formatting (XX.XXX.XXX-X)
   - ✅ RUT validation with modulus 11
   - ✅ Spanish UI text
   - ✅ Mobile-first approach
   - ✅ 44px touch targets
   - ✅ Accessibility (keyboard nav, ARIA labels)

4. **Test with Playwright:**
   ```bash
   /iterate-ui-playwright [component] on port 300X
   ```

5. **Iterate and refine** based on Playwright feedback

6. **Commit in worktree:**
   ```bash
   git add .
   git commit -m "feat: implement [component] - variation X design"
   ```

---

## 🎭 Step 6: Use Playwright to Refine Each Variation

**Test each variation thoroughly:**

```bash
# Test variation 1
cd worktrees/[component]-v1/coab-frontend
/iterate-ui-playwright [component] on localhost:3001

# Test variation 2
cd worktrees/[component]-v2/coab-frontend
/iterate-ui-playwright [component] on localhost:3002

# Test variation 3
cd worktrees/[component]-v3/coab-frontend
/iterate-ui-playwright [component] on localhost:3003
```

**What to verify:**
- [ ] **Mobile responsiveness:** Test at 375px, 768px, 1024px
- [ ] **Touch targets:** All buttons/inputs ≥ 44px
- [ ] **Chilean data:** RUT formatting, CLP currency, dates
- [ ] **Accessibility:** Tab navigation, screen reader labels
- [ ] **Visual polish:** Spacing, colors, alignment
- [ ] **User flow:** Can complete task easily?

**Iterate on each until polished.**

---

## 📊 Step 7: Compare Side-by-Side & Choose Winner

### **Comparison Checklist:**

Open all 3 URLs in browser:
- http://localhost:3001 (Minimalist)
- http://localhost:3002 (Card-based)
- http://localhost:3003 (Split-screen)

**Evaluate each on:**

#### **User Experience** (Most Important)
- [ ] Which feels most intuitive?
- [ ] Which requires least cognitive load?
- [ ] Which guides user through task best?
- [ ] Which feels right for Chilean water utility customers?

#### **Visual Appeal**
- [ ] Which looks most polished?
- [ ] Which feels most professional?
- [ ] Which has best visual hierarchy?
- [ ] Which uses Chilean theme colors best?

#### **Mobile-First**
- [ ] Which works best at 375px?
- [ ] Which has most comfortable touch targets?
- [ ] Which adapts best to different screen sizes?

#### **Accessibility**
- [ ] Which is easiest to navigate with keyboard?
- [ ] Which has clearest labels for screen readers?
- [ ] Which has best color contrast?

#### **Brand Fit**
- [ ] Which feels right for COAB brand?
- [ ] Which builds most trust?
- [ ] Which matches Chilean expectations?

### **Get Feedback:**
- Share URLs with Matthew
- Test on real mobile device (if possible)
- Ask for preference and reasoning

### **Decision Criteria:**
**Choose the variation that:**
1. ✅ Provides best user experience
2. ✅ Works best on mobile (primary platform)
3. ✅ Feels right for Chilean water utility context
4. ✅ Matthew prefers

**Record decision:**
```markdown
**Winner: Variation [N]**
**Reasoning:** [Brief explanation why this one won]
**Rejected:** V1 because [reason], V2 because [reason]
```

---

## ✅ Step 8: Merge Winner & Cleanup

**When ready to commit to winning design:**

```bash
# Use the choose-experiment command
/choose-experiment [winning-version-number]

# This will:
# 1. Merge winning branch to current branch
# 2. Delete rejected worktrees
# 3. Delete rejected branches
# 4. Verify clean state
```

**Manual alternative** (if not using slash command):

```bash
# From project root (main branch)
cd ../..  # Return to main project

# Merge winner (e.g., version 2)
git merge experiment/[component]-v2 --no-ff -m "feat: implement [component] (card-based design)"

# Clean up all worktrees
git worktree remove worktrees/[component]-v1 --force
git worktree remove worktrees/[component]-v2 --force
git worktree remove worktrees/[component]-v3 --force

# Delete experiment branches
git branch -D experiment/[component]-v1
git branch -D experiment/[component]-v2
git branch -D experiment/[component]-v3

# Verify cleanup
git worktree list  # Should only show main worktree
git branch  # Experiment branches should be gone
```

---

## 🧹 Cleanup & Verification

**After merging winner:**

1. **Update CHANGELOG:**
   ```bash
   /create-changelog frontend Added [component] con diseño [variation-name]
   ```

2. **Run tests:**
   ```bash
   /test-before-commit [component] implementation
   ```

3. **Verify directory clean:**
   ```bash
   ls worktrees/  # Should be empty or non-existent
   ```

4. **Commit CHANGELOG:**
   ```bash
   git add coab-frontend/CHANGELOG.md
   git commit -m "docs: update changelog for [component]"
   ```

---

## 💡 Tips for Success

### **Design Variation Tips:**
- Keep functionality identical across all variations (only styling differs)
- Test all variations on real mobile device if possible
- Don't over-engineer any single variation initially - iterate
- Use Playwright heavily to refine each

### **Performance Tips:**
- Each worktree shares `.git` (efficient)
- Each has its own `node_modules` (disk space usage)
- Consider running only 2 variations if RAM limited
- Kill dev servers when not actively comparing

### **Workflow Tips:**
- Use separate terminal windows for each dev server
- Name terminal tabs clearly (v1, v2, v3)
- Take screenshots of each variation for reference
- Document why you chose winner (learning for next time)

### **Common Pitfalls to Avoid:**
- ❌ Forgetting to install dependencies in each worktree
- ❌ Changing functionality between variations (keep consistent)
- ❌ Not testing mobile-first in all variations
- ❌ Choosing based on desktop appearance only
- ❌ Forgetting to cleanup rejected worktrees (disk space)
- ❌ Not committing in each worktree before comparison

---

## 🚦 When to Use This Workflow

**✅ USE for:**
- Critical UI components (login, dashboard, payment forms)
- When design direction is uncertain
- When Matthew wants to see options before deciding
- Components with strong visual/UX impact
- Public-facing customer portal pages

**❌ DON'T USE for:**
- Simple utility components (buttons, inputs)
- Backend-heavy features with minimal UI
- Admin-only internal tools (unless requested)
- Quick iterations on existing components
- Components with established design patterns

---

## 📚 Example: Login Page Experiment

**Command:**
```bash
/experiment-ui login-page 3
```

**Variations Created:**
1. **Minimalist:** Clean, spacious, minimal colors
2. **Card-based:** Professional, elevated, polished
3. **Split-screen:** Modern, visual, engaging

**Comparison:**
- Tested all 3 at localhost:3001, :3002, :3003
- All had RUT auto-formatting, Chilean validation
- All passed mobile responsiveness tests
- Matthew preferred Card-based (professional feel for utility company)

**Result:**
```bash
/choose-experiment 2
# Merged card-based design to main
# Deleted minimalist and split-screen experiments
```

**Learning:**
- Chilean water utility customers prefer professional, trustworthy aesthetic
- Card design builds trust better than minimalist
- Split-screen too modern/app-like for target demographic

**Applied to future components:**
- Start with card-based as baseline
- Only experiment if significantly different context

---

## 🎯 Next Steps After Choosing Winner

1. ✅ Winner merged to main
2. ✅ Rejected experiments deleted
3. ✅ CHANGELOG updated
4. ✅ Tests passing

**Continue development:**
- Move to next component/task
- Apply learnings from this experiment
- Consider creating similar experiments for other critical UIs
- Document design decisions for consistency
