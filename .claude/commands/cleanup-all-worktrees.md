---
description: Clean up all worktrees and experiment branches for a component (run from main project)
argument-hint: [component-name]
allowed-tools: Bash(git:*), Bash(rm:*)
---

Cleanup all worktrees for: $ARGUMENTS

## 🧹 Clean Up Experiment Worktrees

**Who uses this:** You (Matthew) - run from main project directory after choosing winner

**Purpose:** Delete all worktree directories and experiment branches for a component

**When to run:** After winning variation has been merged to main

---

## 🔍 Step 1: Verify Context

**Must be run from main project directory (NOT from within a worktree):**

```bash
# Check current directory
CURRENT_DIR=$(basename "$PWD")

if [[ "$CURRENT_DIR" == worktrees* ]] || [[ "$PWD" == */worktrees/* ]]; then
  echo "❌ ERROR: You are inside a worktree directory!"
  echo "Navigate to main project first: cd ../.."
  exit 1
fi

# Verify on main branch (recommended)
CURRENT_BRANCH=$(git branch --show-current)

if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "⚠️  Warning: Not on main branch (current: $CURRENT_BRANCH)"
  echo "It's recommended to be on main branch for cleanup"
  read -p "Continue anyway? (y/N) " -n 1 -r
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
```

---

## 📋 Step 2: List Worktrees for Component

**Find all worktrees matching component:**

```bash
COMPONENT="$1"

if [[ -z "$COMPONENT" ]]; then
  echo "❌ ERROR: Component name required"
  echo "Usage: /cleanup-all-worktrees [component-name]"
  exit 1
fi

echo "🔍 Finding worktrees for component: ${COMPONENT}"

# List all worktrees
git worktree list

# Filter for this component
WORKTREES=$(git worktree list | grep "${COMPONENT}-v" | awk '{print $1}')

if [[ -z "$WORKTREES" ]]; then
  echo "ℹ️  No worktrees found for ${COMPONENT}"
  echo "Already cleaned up?"
else
  echo ""
  echo "Found worktrees to remove:"
  echo "$WORKTREES"
fi
```

---

## 🗑️ Step 3: Remove All Worktrees

**Remove each worktree directory:**

```bash
# Remove each worktree
for worktree in $WORKTREES; do
  echo "Removing worktree: $worktree"
  git worktree remove "$worktree" --force 2>&1 || {
    echo "⚠️  Failed to remove via git, trying manual deletion..."
    rm -rf "$worktree"
  }
done

echo "✅ All worktrees removed"
```

**Force flag explained:**
- `--force` removes worktrees even if they have uncommitted changes
- Safe because winner is already merged, losers are rejected

---

## 🌿 Step 4: Delete All Experiment Branches

**Delete branches for this component:**

```bash
echo ""
echo "🔍 Finding experiment branches for: ${COMPONENT}"

# List all experiment branches for this component
BRANCHES=$(git branch | grep "experiment/${COMPONENT}-v" | sed 's/^[ \t]*//')

if [[ -z "$BRANCHES" ]]; then
  echo "ℹ️  No experiment branches found for ${COMPONENT}"
else
  echo "Found branches to delete:"
  echo "$BRANCHES"
  echo ""

  # Delete each branch
  for branch in $BRANCHES; do
    echo "Deleting branch: $branch"
    git branch -D "$branch"
  done

  echo "✅ All experiment branches deleted"
fi
```

**Why -D (force delete)?**
- Branches may not be fully merged to current branch
- Winner is merged to main (safe)
- Losers are intentionally rejected (safe to delete)

---

## 📁 Step 5: Clean Worktrees Directory

**Remove component worktree directories:**

```bash
echo ""
echo "🧹 Cleaning worktrees directory..."

# Remove all directories for this component
if [ -d "worktrees" ]; then
  rm -rf worktrees/${COMPONENT}-v*

  # If worktrees directory is now empty, optionally remove it
  if [ -z "$(ls -A worktrees 2>/dev/null)" ]; then
    echo "Worktrees directory is empty, removing it"
    rmdir worktrees
  fi
fi

echo "✅ Worktrees directory cleaned"
```

---

## ✅ Step 6: Verify Cleanup

**Verify everything is clean:**

```bash
echo ""
echo "🔍 Verification:"
echo ""

# Check worktrees
echo "Remaining worktrees:"
git worktree list
echo ""

# Check experiment branches
REMAINING=$(git branch | grep "experiment/${COMPONENT}" || echo "None")
echo "Remaining experiment branches:"
echo "$REMAINING"
echo ""

# Check worktrees directory
if [ -d "worktrees" ]; then
  echo "Worktrees directory contents:"
  ls -la worktrees/
else
  echo "Worktrees directory: removed (was empty)"
fi
```

**Expected result:**
- ✅ `git worktree list` shows only main project
- ✅ No `experiment/${COMPONENT}*` branches
- ✅ No `worktrees/${COMPONENT}*` directories

---

## 📊 Step 7: Print Summary

```
✅ CLEANUP COMPLETE

📊 Summary:
   Component: ${COMPONENT}
   Worktrees removed: [count]
   Branches deleted: [count]

✨ Clean state achieved:
   ✅ Only main worktree remains
   ✅ All experiment branches deleted
   ✅ Worktrees directory cleaned

📋 Git status:
   Current branch: $(git branch --show-current)
   Worktrees: $(git worktree list | wc -l) (should be 1 - main only)

🚀 Next steps:
   - Winner variation is on main branch
   - Ready to continue development
   - Run: npm run dev (in main project)

🎉 Experimentation complete! Ready for next component.
```

---

## 🔧 Optional: Verify Main Project Works

**Quick sanity check:**

```bash
echo ""
echo "🔍 Optional: Verify main project works"
echo ""

cd coab-frontend

echo "Type checking..."
npm run type-check || echo "⚠️  Type errors found"

echo "Linting..."
npm run lint || echo "⚠️  Lint errors found"

echo "Building..."
npm run build || echo "⚠️  Build failed"

echo ""
echo "If all passed, you're good to go! ✅"
echo "If any failed, fix them before continuing."
```

---

## 🚨 Troubleshooting

### **Problem: Worktree won't remove**
```bash
# Try manual deletion
rm -rf worktrees/${COMPONENT}-v*

# Clean up git metadata
git worktree prune
```

### **Problem: Branch deletion fails**
```bash
# Check if branch is current branch
git branch --show-current

# If on experiment branch, switch first
git checkout main

# Then delete
git branch -D experiment/${COMPONENT}-v*
```

### **Problem: Permission denied**
```bash
# On Windows, might need to close VS Code instances first
# Close all VS Code windows that were in worktree directories

# Then try cleanup again
/cleanup-all-worktrees ${COMPONENT}
```

---

## 💡 Tips

**When to run:**
- After winning Claude ran `/merge-this-worktree`
- After you've reviewed the merge
- When you're done with experimentation

**What gets deleted:**
- ✅ All worktree directories for component
- ✅ All experiment branches for component
- ❌ Winner's code (already merged to main)

**What's preserved:**
- ✅ Winner's code on main branch
- ✅ Git commit history (losers' commits still in git DB)
- ✅ Main project completely unaffected

**Safe to run multiple times:**
- Command is idempotent
- Won't error if already cleaned
- Just reports "nothing to clean"

---

## 📚 Example: Cleanup Login Page Experiments

**Command:**
```bash
/cleanup-all-worktrees login-page
```

**What happens:**
```
🔍 Finding worktrees for component: login-page

Found worktrees to remove:
/path/to/coab-platform2/worktrees/login-v1
/path/to/coab-platform2/worktrees/login-v2
/path/to/coab-platform2/worktrees/login-v3

Removing worktree: /path/to/coab-platform2/worktrees/login-v1
Removing worktree: /path/to/coab-platform2/worktrees/login-v2
Removing worktree: /path/to/coab-platform2/worktrees/login-v3
✅ All worktrees removed

🔍 Finding experiment branches for: login-page

Found branches to delete:
experiment/login-page-v1
experiment/login-page-v2
experiment/login-page-v3

Deleting branch: experiment/login-page-v1
Deleting branch: experiment/login-page-v2
Deleting branch: experiment/login-page-v3
✅ All experiment branches deleted

🧹 Cleaning worktrees directory...
Worktrees directory is empty, removing it
✅ Worktrees directory cleaned

✅ CLEANUP COMPLETE
```

**Result:**
- All worktrees gone
- All branches gone
- Winner (e.g., v2) code on main
- Clean slate for next component

---

## ✅ Success Criteria

Cleanup complete when:
- ✅ All component worktrees removed
- ✅ All component experiment branches deleted
- ✅ Worktrees directory cleaned (or removed if empty)
- ✅ Only main worktree in `git worktree list`
- ✅ No `experiment/*` branches for component
- ✅ Main project works (npm run dev)

---

## 🎉 Clean Slate!

All experimentation artifacts removed. Ready for:
- Next component experimentation
- Continuing normal development
- Deploying winning design

**Experimentation workflow complete! 🚀**
