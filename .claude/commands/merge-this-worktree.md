---
description: Merge this worktree's implementation to main (winning variation only)
allowed-tools: Bash(git:*), Bash(cd:*), Bash(npm:*), Edit
---

Merge this worktree to main

## ✅ Congratulations - This Variation Won!

**Who uses this:** The Claude instance whose variation Matthew chose as the winner

**Purpose:** Merge your implementation from the experiment branch to main branch

**Context:** Matthew reviewed all variations and chose YOUR design. Now merge it to main and help with cleanup.

---

## 🔍 Step 1: Detect Worktree Context

```bash
# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Verify in experiment branch
if [[ $CURRENT_BRANCH != experiment/* ]]; then
  echo "❌ ERROR: Not in an experiment branch!"
  echo "This command must be run from a worktree."
  exit 1
fi

# Extract component and variation
COMPONENT=$(echo $CURRENT_BRANCH | sed 's/experiment\/\(.*\)-v[0-9]*/\1/')
VARIATION=$(echo $CURRENT_BRANCH | sed 's/.*-v\([0-9]*\)/\1/')

echo "✅ Merging Variation ${VARIATION} of ${COMPONENT}"
```

---

## ✅ Step 2: Pre-Merge Validation

**Run final checks:**

```bash
cd coab-frontend  # or coab-backend

# Type checking
npm run type-check
# Must pass with 0 errors

# Linting
npm run lint
# Must pass with 0 errors/warnings

# Tests
npm test
# All tests must pass

# Build
npm run build
# Must succeed
```

**If any check fails:** Fix issues before proceeding!

**Verify Chilean standards:**
- [ ] RUT auto-formatting works (XX.XXX.XXX-X)
- [ ] RUT validation with modulus 11
- [ ] Currency displays as $1.234.567
- [ ] Dates in Spanish
- [ ] All UI text in Spanish
- [ ] Mobile-first (44px touch targets)
- [ ] Accessible (keyboard nav, ARIA)

**Ensure working tree clean:**
```bash
git status
# Should show "nothing to commit, working tree clean"
```

---

## 🔀 Step 3: Merge to Main

**Navigate to main project root:**

```bash
# Go back to main project (2 levels up from worktree)
cd ../..

# Verify you're in main project
pwd
# Should show: .../coab-platform2 (NOT .../worktrees/...)
```

**Checkout main branch:**

```bash
git checkout main

# Verify
git branch --show-current
# Should show: main
```

**Merge winning experiment branch:**

```bash
git merge ${CURRENT_BRANCH} --no-ff -m "feat(${COMPONENT}): implement winning design variation

Variation ${VARIATION} chosen after parallel experimentation.

Design approach: [${THEME} - add brief description]
- [Key characteristic 1]
- [Key characteristic 2]
- [Key characteristic 3]

Chilean standards applied:
- RUT auto-formatting (XX.XXX.XXX-X)
- Spanish UI text
- Mobile-first design (44px touch targets)
- Accessibility compliant

Tested at: http://localhost:$((3000 + VARIATION))
Alternatives tested: [Other variation numbers]

🎨 Implemented via multi-Claude parallel experimentation workflow"
```

**Verify merge succeeded:**

```bash
git log -1 --oneline
# Should show your merge commit

git show --stat
# Should show changed files
```

---

## 📝 Step 4: Update CHANGELOG (if not already done)

**Ensure CHANGELOG has entry:**

```bash
# Check if CHANGELOG was updated
git show HEAD:coab-frontend/CHANGELOG.md | head -20

# If missing, add entry now
```

**Example entry:**
```markdown
## [Unreleased]

### Added
- Componente ${COMPONENT} con diseño [theme-name]
  - [Design characteristic 1]
  - [Design characteristic 2]
  - Auto-formateo de RUT chileno
  - Diseño mobile-first con touch targets de 44px
  - Validación con Zod

### Changed
- [Any changes to existing features]
```

**If CHANGELOG needs update:**
```bash
# Edit CHANGELOG
# Add entry
# Commit
git add coab-frontend/CHANGELOG.md
git commit -m "docs: update CHANGELOG for ${COMPONENT}"
```

---

## 📢 Step 5: Provide Cleanup Instructions for Matthew

**Print clear next steps:**

```
✅ SUCCESS! This variation (${VARIATION}) merged to main!

📊 Merge Summary:
   Component: ${COMPONENT}
   Variation: ${VARIATION}
   Branch: ${CURRENT_BRANCH}
   Merged to: main

🧹 CLEANUP REQUIRED

Matthew, to clean up all worktrees and experiment branches, run:

   /cleanup-all-worktrees ${COMPONENT}

Or manually:
   git worktree remove worktrees/${COMPONENT}-v1 --force
   git worktree remove worktrees/${COMPONENT}-v2 --force
   git worktree remove worktrees/${COMPONENT}-v3 --force
   [...]

   git branch -D experiment/${COMPONENT}-v1
   git branch -D experiment/${COMPONENT}-v2
   git branch -D experiment/${COMPONENT}-v3
   [...]

📋 Optional: Tell other Claude chats to run:
   /abandon-this-worktree

(Or just close those chats)

✅ Next Steps:
   1. Run cleanup command above
   2. Verify: git worktree list (should only show main)
   3. Verify: npm run dev works in main project
   4. Continue with next component/task

🎉 Winning variation now on main branch!
```

---

## ✅ Step 6: Verification

**Verify clean state:**

```bash
# From main project
git status
# Should be clean (or only CHANGELOG uncommitted)

# Check current branch
git branch --show-current
# Should be: main

# Recent commits
git log --oneline -3
# Should show:
# 1. (Maybe) CHANGELOG update
# 2. Merge commit
# 3. Previous commits
```

---

## 💡 What Happens Next

**Matthew will:**
1. Run `/cleanup-all-worktrees ${COMPONENT}`
2. Delete all worktree directories
3. Delete all experiment branches
4. Verify clean state

**Other Claude instances:**
- Can run `/abandon-this-worktree` (optional)
- Or Matthew will just close those chats
- Their work is saved in git history (for reference)

**Your work:**
- ✅ Merged to main
- ✅ Now part of the project
- ✅ Will be in production
- 🎉 You won!

---

## 🚨 Troubleshooting

### **Problem: Merge conflicts**
```bash
# If conflicts occur
git status  # See conflicting files

# Resolve in editor, then:
git add [resolved-files]
git merge --continue
```

### **Problem: Not in main project**
```bash
# If cd ../.. didn't work
cd /path/to/coab-platform2  # Use absolute path

# Or on Windows:
cd C:/Users/stant/OneDrive/Programming/coab-platform2
```

### **Problem: Tests failing**
```bash
# Fix issues first
cd coab-frontend
npm test -- --verbose

# Fix code
# Re-run tests until passing
# Then try merge again
```

---

## 🎯 Success Criteria

Merge complete when:
- ✅ All pre-merge checks passed
- ✅ Winning branch merged to main
- ✅ CHANGELOG updated
- ✅ Cleanup instructions provided
- ✅ Git working tree clean
- ✅ Ready for Matthew to cleanup worktrees

---

## 🎉 Congratulations!

Your design variation won! It will now be part of the COAB platform.

**What made your variation win?**
- [Consider documenting why Matthew chose this one]
- [Apply learnings to future components]
- [Use similar patterns for consistency]

**Great work! 🚀**
