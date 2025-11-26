---
description: Mark this worktree as rejected (losing variation)
allowed-tools: Bash(git:*)
---

Abandon this worktree

## ❌ This Variation Not Selected

**Who uses this:** Claude instances whose variations were NOT chosen (optional - Matthew can also just close chats)

**Purpose:** Save your work for reference and mark as rejected

**Context:** Matthew reviewed all variations and chose a different design. Your work will be saved but not merged to main.

---

## 💾 Step 1: Save Work for Reference

**Commit any uncommitted changes:**

```bash
# Check status
git status

# If there are uncommitted changes, save them
git add .

git commit -m "wip: variation rejected (not chosen by Matthew)

This ${THEME} variation was not selected.
Preserved for future reference.

Reason: [Matthew chose different variation]" || true
```

**Why save?**
- Your work might be useful later
- Ideas can be reused for other components
- Reference for "what not to do" or "alternative approaches"

---

## 🏷️ Step 2: Mark as Rejected

**Create marker file:**

```bash
echo "This variation was rejected during parallel experimentation.

Variation: ${VARIATION}
Theme: ${THEME}
Rejected: $(date)

Reason: Matthew chose a different variation

This branch preserved for reference but will be deleted during cleanup." > .rejected

git add .rejected
git commit -m "mark: variation rejected" || true
```

---

## 🛑 Step 3: Stop Dev Server (if running)

**Kill dev server process:**

```bash
# Get port number
PORT=$((3000 + VARIATION))

# Kill process on port (if running)
npx kill-port ${PORT} 2>/dev/null || true

echo "Dev server on port ${PORT} stopped"
```

---

## 📢 Step 4: Report Status

**Print message:**

```
❌ This variation (${VARIATION}) marked as rejected

💾 Work saved to git:
   Branch: ${CURRENT_BRANCH}
   Status: Rejected but preserved for reference

🛑 Dev server stopped (port ${PORT})

✅ Safe to close this Claude Code chat

📋 Matthew will clean up with:
   /cleanup-all-worktrees ${COMPONENT}

Or manual cleanup:
   git worktree remove worktrees/${COMPONENT}-v${VARIATION} --force
   git branch -D ${CURRENT_BRANCH}

💡 Your work is saved in git history if needed later

Thank you for participating in the experimentation! 🎨
```

---

## 💭 Optional: Reflection

**Consider documenting why this variation wasn't chosen:**

```markdown
Variation ${VARIATION} (${THEME}) - Not Selected

Possible reasons:
- [ ] Too modern/trendy for target demographic?
- [ ] Less trust-building than winner?
- [ ] Mobile experience not as good?
- [ ] Visual complexity too high?
- [ ] Didn't fit Chilean water utility context?
- [ ] Other: [specific reason]

Learnings:
- [What worked well]
- [What didn't work]
- [Apply to future components]
```

---

## 🎯 What This Command Does

**Simple summary:**
1. ✅ Commits any unsaved work
2. 🏷️ Marks variation as rejected
3. 🛑 Stops dev server
4. 📋 Tells you it's safe to close chat

**What it DOESN'T do:**
- ❌ Delete worktree (Matthew does that)
- ❌ Delete branch (Matthew does that)
- ❌ Merge anything (only winner merges)

---

## 💡 Alternative: Just Close Chat

**You don't have to run this command!**

If Matthew is going to run `/cleanup-all-worktrees`, you can simply:
1. Close this Claude Code chat
2. Let Matthew clean up everything

This command is optional - mainly for:
- Documenting why rejected
- Cleanly stopping dev server
- Preserving work with commit message

---

## ✅ Success Criteria

Command complete when:
- ✅ Work committed (if any changes)
- ✅ Marked as rejected with `.rejected` file
- ✅ Dev server stopped
- ✅ Message printed
- ✅ Safe to close chat

---

## 🎨 Better Luck Next Component!

Your variation wasn't chosen this time, but:
- Your work is preserved
- Learnings can be applied
- Next component might use your approach
- Experimentation helps find best design

**Thank you for contributing to the design exploration! 🚀**
