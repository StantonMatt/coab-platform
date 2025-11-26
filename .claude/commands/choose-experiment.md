---
description: Merge chosen UI experiment variation and cleanup rejected ones
argument-hint: [version-number]
allowed-tools: Bash(git:*)
---

Merge experiment version: $ARGUMENTS

## ✅ Choosing the Winning UI Experiment

**You've selected:** Version $ARGUMENTS

**This command will:**
1. ✅ Merge the winning experiment branch to current branch
2. ❌ Delete all experiment worktrees
3. ❌ Delete all experiment branches
4. 🧹 Verify cleanup is complete

---

## 🔍 Step 1: Pre-Merge Validation

**Before merging, verify the winning variation:**

### **Final checks for Version $ARGUMENTS:**

```bash
# Navigate to winning worktree
cd worktrees/[component]-v$ARGUMENTS

# Ensure all changes committed
git status
# Should show "working tree clean"

# Run final tests
cd coab-frontend
npm run type-check  # No TypeScript errors
npm run lint        # No linting errors
npm test            # All tests pass
npm run build       # Build succeeds
```

**If any check fails:** Fix issues before proceeding

**Verify Chilean standards one more time:**
- [ ] RUT auto-formatting works (XX.XXX.XXX-X)
- [ ] RUT validation with modulus 11
- [ ] Currency displays as $1.234.567
- [ ] Dates in Spanish (dd/MM/yyyy or long format)
- [ ] All UI text in Spanish
- [ ] Mobile-first design (44px touch targets)
- [ ] Accessible (keyboard nav, ARIA labels)

**Get Matthew's final approval** if not already confirmed

---

## 🔀 Step 2: Merge Winner to Current Branch

### **Identify components:**

```bash
# From project root, determine:
COMPONENT_NAME="[extracted-from-branch-name]"
CHOSEN_VERSION="$ARGUMENTS"
WINNING_BRANCH="experiment/${COMPONENT_NAME}-v${CHOSEN_VERSION}"

# Example:
# COMPONENT_NAME="login-page"
# CHOSEN_VERSION="2"
# WINNING_BRANCH="experiment/login-page-v2"
```

### **Perform merge:**

```bash
# Ensure you're on the correct target branch (usually main)
git checkout main  # Or your current working branch

# Verify current branch
git branch --show-current

# Merge winning experiment with no-fast-forward (preserves history)
git merge ${WINNING_BRANCH} --no-ff -m "feat: implement ${COMPONENT_NAME} (version ${CHOSEN_VERSION} design)

Chosen design: [Brief description of winning variation]
- [Key characteristic 1]
- [Key characteristic 2]
- [Key characteristic 3]

Rejected variations: v1, v3 (reasons documented in experiment notes)

🎨 Implemented using parallel UI experiments workflow"
```

**Example commit message:**
```
feat: implement login-page (version 2 design)

Chosen design: Card-based layout with professional aesthetic
- Component wrapped in shadcn/ui Card with subtle shadow
- Two-tone gradient background (primary-blue)
- Logo inside card at top
- Professional, banking-app feel

Rejected variations:
- v1 (Minimalist): Too sparse, less trust-building
- v3 (Split-screen): Too modern for target demographic

🎨 Implemented using parallel UI experiments workflow
```

### **Verify merge:**

```bash
# Check that merge succeeded
git log -1 --oneline
# Should show your merge commit

# Verify files merged correctly
git show --stat
# Should show changed files from winning experiment
```

---

## 🧹 Step 3: Clean Up Rejected Experiments

### **Remove all experiment worktrees:**

```bash
# List current worktrees
git worktree list

# Remove each worktree (all variations, including winner)
git worktree remove worktrees/${COMPONENT_NAME}-v1 --force
git worktree remove worktrees/${COMPONENT_NAME}-v2 --force
git worktree remove worktrees/${COMPONENT_NAME}-v3 --force

# If you had more variations (adjust accordingly)
# git worktree remove worktrees/${COMPONENT_NAME}-v4 --force

# Verify worktrees removed
git worktree list
# Should only show main worktree (project root)
```

**Note:** The `--force` flag is needed because worktrees have uncommitted changes that we're discarding (they were already merged or rejected)

### **Delete all experiment branches:**

```bash
# Delete all experiment branches (including winner, since it's now merged)
git branch -D experiment/${COMPONENT_NAME}-v1
git branch -D experiment/${COMPONENT_NAME}-v2
git branch -D experiment/${COMPONENT_NAME}-v3

# Verify branches deleted
git branch | grep "experiment/${COMPONENT_NAME}"
# Should return nothing
```

### **Clean up worktrees directory:**

```bash
# Check if worktrees directory is empty
ls worktrees/

# If empty, optionally remove directory
rmdir worktrees/  # Only works if empty

# Or keep directory for future experiments (recommended)
```

---

## 📝 Step 4: Update CHANGELOG

**Add entry to `coab-frontend/CHANGELOG.md`:**

```markdown
## [Unreleased]

### Added
- Página de ${COMPONENT_NAME} con diseño [variation-description]
  - [Key feature 1 from winning design]
  - [Key feature 2 from winning design]
  - Auto-formateo de RUT chileno (XX.XXX.XXX-X)
  - Diseño mobile-first con touch targets de 44px
  - Validación con Zod y React Hook Form
```

**Example:**
```markdown
## [Unreleased]

### Added
- Página de inicio de sesión con diseño card-based profesional
  - Componente envuelto en Card de shadcn/ui con sombra sutil
  - Fondo con gradiente de azul (primary-blue)
  - Estética profesional tipo aplicación bancaria
  - Auto-formateo de RUT chileno (XX.XXX.XXX-X)
  - Diseño mobile-first con touch targets de 44px
  - Validación con Zod y React Hook Form
```

**Commit CHANGELOG:**

```bash
git add coab-frontend/CHANGELOG.md
git commit -m "docs: update changelog for ${COMPONENT_NAME} implementation"
```

---

## ✅ Step 5: Final Verification

### **Run comprehensive tests:**

```bash
# From project root
cd coab-frontend

# Type checking
npm run type-check
# ✅ Should pass with 0 errors

# Linting
npm run lint
# ✅ Should pass with 0 errors

# Tests
npm test
# ✅ All tests should pass

# Build
npm run build
# ✅ Build should succeed
```

### **Verify git state:**

```bash
# From project root
cd ../..

# Check git status
git status
# Should show clean working tree (or only CHANGELOG if not committed)

# Verify worktrees
git worktree list
# Should show only main worktree:
# /path/to/coab-platform2  abcd123 [main]

# Verify no experiment branches remain
git branch | grep experiment
# Should return nothing

# Check recent commits
git log --oneline -3
# Should show:
# 1. CHANGELOG commit (if made)
# 2. Merge commit with winning experiment
# 3. Previous commits
```

### **Visual verification:**

```bash
# Start dev server on main branch
cd coab-frontend
npm run dev

# Visit component at normal URL (not port 3001/3002/3003)
# http://localhost:5173/[route]

# Verify:
# - Winning design is now live
# - All functionality works
# - Chilean standards applied
# - Mobile responsive
```

---

## 📊 Step 6: Document Decision (Optional but Recommended)

**Create brief experiment notes for future reference:**

```markdown
# UI Experiment: ${COMPONENT_NAME}

**Date:** [Current date]

**Variations Tested:**
1. Minimalist Design
2. Card-Based Layout ✅ **WINNER**
3. Split-Screen Design

**Winner:** Variation 2 (Card-Based Layout)

**Reasoning:**
- Most professional aesthetic for Chilean water utility
- Builds trust with elevated card design
- Clean visual hierarchy
- Works exceptionally well on mobile
- Matthew's preferred choice

**Rejected Variations:**
- **V1 (Minimalist):** Too sparse, felt incomplete, less trust-building for utility company context
- **V3 (Split-screen):** Too modern/app-like for target demographic (older users), desktop-biased

**Learnings for Future Components:**
- Chilean water utility customers prefer professional, trustworthy aesthetics
- Card-based designs build more trust than minimalist
- Target demographic (35-65 years old) prefers familiar, professional layouts
- Mobile-first is critical but shouldn't sacrifice professionalism

**Applied Standards:**
- ✅ RUT auto-formatting (XX.XXX.XXX-X)
- ✅ RUT validation with modulus 11
- ✅ Spanish UI text
- ✅ 44px touch targets
- ✅ Mobile-first design
- ✅ Accessibility (keyboard nav, ARIA)
```

**Save to:** `.claude/experiments/${COMPONENT_NAME}-notes.md` (optional)

---

## 🎯 Success Criteria

**Experiment successfully concluded when:**

- ✅ Winning variation merged to main branch
- ✅ All experiment worktrees removed
- ✅ All experiment branches deleted
- ✅ CHANGELOG updated with implementation
- ✅ All tests passing (type-check, lint, tests, build)
- ✅ Git working tree clean
- ✅ Component works correctly on main branch
- ✅ Decision documented (optional)

---

## 🚀 Next Steps

**After successful merge and cleanup:**

1. **Continue development:**
   - Move to next component/task
   - Apply learnings from this experiment to future work

2. **Consider design system:**
   - If this component sets a pattern, document it
   - Use similar design approach for related components
   - Build consistency across customer portal

3. **Share learnings:**
   - Document key insights from experiment
   - Use winning patterns as baseline for future UIs
   - Iterate only when significantly different context

4. **Optional: Create new experiments:**
   - Run `/experiment-ui [next-component]` for other critical UIs
   - Apply same workflow to other customer-facing pages

---

## 🛠️ Troubleshooting

### **Problem: Merge conflicts**

```bash
# If merge conflicts occur
git status  # See conflicting files

# Resolve conflicts manually in editor
# Then:
git add [resolved-files]
git commit -m "resolve merge conflicts from experiment/${COMPONENT_NAME}-v${CHOSEN_VERSION}"
```

### **Problem: Worktree won't remove**

```bash
# If worktree removal fails
git worktree remove worktrees/${COMPONENT_NAME}-v1 --force

# If still fails, manually delete and cleanup
rm -rf worktrees/${COMPONENT_NAME}-v1
git worktree prune  # Clean up git metadata
```

### **Problem: Branch deletion fails**

```bash
# If branch has uncommitted work
git branch -D experiment/${COMPONENT_NAME}-v1  # Force delete

# If branch is current branch
git checkout main  # Switch to main first
git branch -D experiment/${COMPONENT_NAME}-v1  # Then delete
```

### **Problem: Tests failing after merge**

```bash
# Investigate what broke
npm test -- --reporter=verbose

# Fix issues in merged code
# Re-run tests until passing
npm test

# Commit fixes
git add .
git commit -m "fix: resolve test failures from ${COMPONENT_NAME} merge"
```

---

## 💡 Tips

### **Before Choosing:**
- Sleep on the decision (don't rush)
- Test all variations on real mobile device
- Get second opinion from Matthew
- Consider target user demographic

### **During Merge:**
- Write descriptive commit message
- Document why this variation won
- Note what was rejected and why

### **After Cleanup:**
- Verify everything works before continuing
- Document learnings for future
- Apply insights to upcoming components
- Don't re-experiment same patterns

### **General Workflow:**
- Use experiments for critical UIs only
- Don't experiment with every component
- Trust winning patterns for similar contexts
- Iterate on established patterns when needed

---

## 📚 Example: Choosing Login Page Winner

```bash
# We tested 3 login page variations
# After comparison, chose variation 2 (card-based)

/choose-experiment 2

# Executed:
# 1. Merged experiment/login-page-v2 to main
# 2. Removed worktrees/login-page-v1, v2, v3
# 3. Deleted branches experiment/login-page-v1, v2, v3
# 4. Updated CHANGELOG
# 5. Verified all tests pass

# Result:
# ✅ Card-based login page now on main branch
# ✅ Clean git state
# ✅ Ready to continue development

# Learning:
# Chilean users prefer professional, trustworthy card design
# Will use similar approach for dashboard and payment pages
```

---

## ✅ Completion Checklist

Before marking this step complete:

- [ ] Winning variation merged to main
- [ ] All worktrees removed (`git worktree list` shows only main)
- [ ] All experiment branches deleted (no `experiment/*` branches)
- [ ] CHANGELOG updated
- [ ] Tests passing (`npm run type-check && npm run lint && npm test && npm run build`)
- [ ] Git working tree clean
- [ ] Component works on main branch dev server
- [ ] Decision documented (optional but recommended)
- [ ] Learnings applied to future work

**If all checked, experiment successfully concluded! 🎉**
