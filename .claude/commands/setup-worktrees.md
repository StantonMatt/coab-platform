---
description: Setup multiple worktrees for parallel UI experimentation with multiple Claude Code instances
argument-hint: [component-name] [number-of-variations (default: 3, max: 5)]
allowed-tools: Bash(git:*), Bash(mkdir:*)
---

Setup worktrees for: $ARGUMENTS

## 🎨 Multi-Claude Parallel UI Experimentation

**Purpose:** Create multiple worktrees so you can open separate Claude Code chat sessions, each implementing the same component with different design variations.

**Your workflow:**
1. **You (once):** Run this command to create all worktrees
2. **You:** Open 3-5 separate Claude Code sessions (one per worktree)
3. **Each Claude:** Implements component with `/implement-in-worktree`
4. **You:** Review all variations side-by-side in browser
5. **Winning Claude:** Runs `/merge-this-worktree`
6. **You (once):** Run `/cleanup-all-worktrees` to clean up

---

## 📋 Step 1: Parse Arguments

**Arguments:**
- **Component name:** First argument (required)
  - Example: `login-page`, `dashboard`, `payment-form`
  - Will be used for directory and branch naming

- **Number of variations:** Second argument (optional, default: 3, max: 5)
  - How many different design variations to create
  - Typically 3-4 is ideal for comparison

**Examples:**
```bash
/setup-worktrees login-page 3
# Creates 3 worktrees: login-v1, login-v2, login-v3

/setup-worktrees dashboard 4
# Creates 4 worktrees: dashboard-v1, v2, v3, v4

/setup-worktrees payment-form
# Creates 3 worktrees (default): payment-form-v1, v2, v3
```

---

## 🌳 Step 2: Create Git Worktrees

**For each variation (1 to N):**

```bash
# Determine component and number from arguments
COMPONENT="$1"  # e.g., "login-page"
NUM_VARIATIONS="${2:-3}"  # Default 3, max 5

# Create worktrees directory if not exists
mkdir -p worktrees

# Create each worktree
for i in $(seq 1 $NUM_VARIATIONS); do
  git worktree add "worktrees/${COMPONENT}-v${i}" -b "experiment/${COMPONENT}-v${i}"
done
```

**Example for `login-page` with 3 variations:**
```bash
git worktree add worktrees/login-v1 -b experiment/login-v1
git worktree add worktrees/login-v2 -b experiment/login-v2
git worktree add worktrees/login-v3 -b experiment/login-v3
```

**What this creates:**
```
coab-platform2/
├── worktrees/
│   ├── login-v1/           # Full repo copy on branch experiment/login-v1
│   ├── login-v2/           # Full repo copy on branch experiment/login-v2
│   └── login-v3/           # Full repo copy on branch experiment/login-v3
└── [rest of main repo]
```

**Verify creation:**
```bash
git worktree list

# Expected output:
# /path/to/coab-platform2                     abcd123 [main]
# /path/to/coab-platform2/worktrees/login-v1  efgh456 [experiment/login-v1]
# /path/to/coab-platform2/worktrees/login-v2  ijkl789 [experiment/login-v2]
# /path/to/coab-platform2/worktrees/login-v3  mnop012 [experiment/login-v3]
```

---

## 📝 Step 3: Create Helper Instructions File

**Create `worktrees/${COMPONENT}-README.md` with:**

```markdown
# ${COMPONENT} UI Experimentation

**Created:** [Current date]
**Variations:** ${NUM_VARIATIONS}

## Port Assignments
- Variation 1: http://localhost:3001
- Variation 2: http://localhost:3002
- Variation 3: http://localhost:3003
[- Variation 4: http://localhost:3004]
[- Variation 5: http://localhost:3005]

## Suggested Design Themes

### Variation 1: Minimalist Design
- Clean, spacious layout
- Minimal colors (primary-blue only)
- Maximum whitespace
- Single column centered
- Large form fields

### Variation 2: Card-Based Layout
- Professional aesthetic
- shadcn/ui Card wrapper
- Subtle shadow and border
- Two-tone gradient background
- Trustworthy, banking-app feel

### Variation 3: Split-Screen Design
- Modern, visual approach
- Left side: branding/image (desktop)
- Right side: form
- Single column on mobile
- App-like aesthetic

[### Variation 4: Material Design]
[- Bold colors and depth]
[- Elevation and shadows]
[- Google Material guidelines]
[- Vibrant, modern feel]

[### Variation 5: Glassmorphism]
[- Frosted glass effect]
[- Backdrop blur]
[- Translucent elements]
[- Modern, trendy aesthetic]

## How to Use

### Step 1: Open Claude Code Sessions
Open ${NUM_VARIATIONS} separate VS Code windows with Claude Code:

\`\`\`bash
# Terminal 1
cd worktrees/${COMPONENT}-v1 && code .

# Terminal 2
cd worktrees/${COMPONENT}-v2 && code .

# Terminal 3
cd worktrees/${COMPONENT}-v3 && code .
[...]
\`\`\`

### Step 2: In Each Claude Code Chat

Run the implementation command with the suggested theme:

**Claude 1 (v1 - Minimalist):**
\`\`\`bash
/implement-in-worktree ${COMPONENT} minimalist
\`\`\`

**Claude 2 (v2 - Card-based):**
\`\`\`bash
/implement-in-worktree ${COMPONENT} card-based
\`\`\`

**Claude 3 (v3 - Split-screen):**
\`\`\`bash
/implement-in-worktree ${COMPONENT} split-screen
\`\`\`

[**Claude 4 (v4 - Material):**]
[\`\`\`bash]
[/implement-in-worktree ${COMPONENT} material]
[\`\`\`]

### Step 3: Review Variations

Each Claude will start a dev server on its assigned port.

Visit each URL to compare:
- http://localhost:3001 (Variation 1)
- http://localhost:3002 (Variation 2)
- http://localhost:3003 (Variation 3)
[- http://localhost:3004 (Variation 4)]
[- http://localhost:3005 (Variation 5)]

Test each on:
- Desktop (1024px+)
- Tablet (768px)
- Mobile (375px)
- Real mobile device

### Step 4: Choose Winner

After reviewing all variations, choose your favorite.

**In the winning Claude chat, run:**
\`\`\`bash
/merge-this-worktree
\`\`\`

**In the losing Claude chats (optional):**
\`\`\`bash
/abandon-this-worktree
\`\`\`
(Or just close the chats)

### Step 5: Cleanup

**From main project directory:**
\`\`\`bash
/cleanup-all-worktrees ${COMPONENT}
\`\`\`

This removes all worktrees and experiment branches.

## Status Tracking

- [ ] Variation 1 (Minimalist) - Port 3001
- [ ] Variation 2 (Card-based) - Port 3002
- [ ] Variation 3 (Split-screen) - Port 3003
[- [ ] Variation 4 (Material) - Port 3004]
[- [ ] Variation 5 (Glassmorphism) - Port 3005]

**Winner:** [To be determined]

**Reasoning:** [Why this variation won]
```

**Save this file:**
```bash
cat > "worktrees/${COMPONENT}-README.md" << 'EOF'
[content above]
EOF
```

---

## 📢 Step 4: Print Instructions for Matthew

**Display clear next steps:**

```
✅ Worktrees created successfully!

📁 Created ${NUM_VARIATIONS} worktrees for ${COMPONENT}:
   - worktrees/${COMPONENT}-v1 (experiment/${COMPONENT}-v1)
   - worktrees/${COMPONENT}-v2 (experiment/${COMPONENT}-v2)
   - worktrees/${COMPONENT}-v3 (experiment/${COMPONENT}-v3)
   [...]

📖 Instructions saved to: worktrees/${COMPONENT}-README.md

🚀 Next Steps:

1. Open ${NUM_VARIATIONS} separate Claude Code sessions:

   Terminal/CMD 1:
   cd worktrees/${COMPONENT}-v1 && code .

   Terminal/CMD 2:
   cd worktrees/${COMPONENT}-v2 && code .

   Terminal/CMD 3:
   cd worktrees/${COMPONENT}-v3 && code .
   [...]

2. In each Claude Code chat, run:

   Claude 1: /implement-in-worktree ${COMPONENT} minimalist
   Claude 2: /implement-in-worktree ${COMPONENT} card-based
   Claude 3: /implement-in-worktree ${COMPONENT} split-screen
   [...]

3. Each Claude will implement and start dev server:
   - Variation 1: http://localhost:3001
   - Variation 2: http://localhost:3002
   - Variation 3: http://localhost:3003
   [...]

4. Review all variations in browser and choose winner

5. In winning Claude chat: /merge-this-worktree

6. Cleanup: /cleanup-all-worktrees ${COMPONENT}

📋 See worktrees/${COMPONENT}-README.md for detailed instructions!
```

---

## ✅ Step 5: Verification

**Verify worktrees created correctly:**

```bash
# List all worktrees
git worktree list

# Check branches created
git branch | grep "experiment/${COMPONENT}"

# Verify directory structure
ls -la worktrees/

# Verify README created
cat worktrees/${COMPONENT}-README.md
```

**Expected state:**
- ✅ ${NUM_VARIATIONS} worktree directories created
- ✅ ${NUM_VARIATIONS} experiment branches created
- ✅ README file with instructions
- ✅ All worktrees on separate branches
- ✅ Main project unchanged

---

## 💡 Tips for Success

### **Choosing Number of Variations:**
- **3 variations:** Quick comparison (recommended for most)
- **4 variations:** When unsure of direction
- **5 variations:** Maximum diversity (can be overwhelming)

### **Design Theme Suggestions:**
- **Variation 1:** Always minimalist (baseline)
- **Variation 2:** Always card-based (professional)
- **Variation 3:** Always split-screen (modern)
- **Variation 4:** Experimental (material, glassmorphism, etc.)
- **Variation 5:** Wild card (unusual approach)

### **Performance Considerations:**
- Each worktree needs ~500MB disk space (node_modules)
- Each dev server uses ~200MB RAM
- 5 variations = ~2.5GB disk + ~1GB RAM
- Close unused dev servers to free RAM

### **When to Use This Workflow:**
- ✅ Critical customer-facing UIs (login, dashboard, payments)
- ✅ First-time component patterns
- ✅ Design direction uncertain
- ✅ Want to show options before deciding
- ❌ Don't use for simple utility components
- ❌ Don't use when design is already established

---

## 🛠️ Troubleshooting

### **Problem: "fatal: 'worktrees/X' already exists"**
```bash
# Worktree already exists from previous experiment
# Clean it up first:
git worktree remove worktrees/${COMPONENT}-v1 --force
git branch -D experiment/${COMPONENT}-v1

# Then re-run setup command
```

### **Problem: Git says branch already exists**
```bash
# Delete existing experiment branches
git branch -D experiment/${COMPONENT}-v1
git branch -D experiment/${COMPONENT}-v2
git branch -D experiment/${COMPONENT}-v3

# Then re-run setup command
```

### **Problem: Can't cd into worktree directory**
```bash
# On Windows, use forward slashes or quotes:
cd "worktrees/${COMPONENT}-v1"

# Or use absolute path:
cd C:/Users/stant/OneDrive/Programming/coab-platform2/worktrees/${COMPONENT}-v1
```

---

## 📚 Example: Login Page with 3 Variations

**Command:**
```bash
/setup-worktrees login-page 3
```

**Creates:**
```
worktrees/
├── login-v1/           # Minimalist design
├── login-v2/           # Card-based layout
└── login-v3/           # Split-screen design
```

**Next steps printed:**
```
✅ Worktrees created for login-page!

Open 3 Claude Code sessions:
1. cd worktrees/login-v1 && code .
2. cd worktrees/login-v2 && code .
3. cd worktrees/login-v3 && code .

In each chat:
Claude 1: /implement-in-worktree login-page minimalist
Claude 2: /implement-in-worktree login-page card-based
Claude 3: /implement-in-worktree login-page split-screen

Review at:
- http://localhost:3001
- http://localhost:3002
- http://localhost:3003
```

**Matthew reviews all 3, chooses card-based (v2)**

**In Claude 2 chat:**
```bash
/merge-this-worktree
```

**Back in main project:**
```bash
/cleanup-all-worktrees login-page
```

**Done! 🎉**

---

## 🎯 Success Criteria

Command completed successfully when:
- ✅ All worktree directories created
- ✅ All experiment branches created
- ✅ README file with instructions saved
- ✅ Clear instructions printed for Matthew
- ✅ Ready to open multiple Claude Code sessions

---

## 🚀 Next Command

After running this, you'll use:
- `/implement-in-worktree` in each Claude chat
- `/merge-this-worktree` in winning Claude
- `/cleanup-all-worktrees` from main project

**Ready to experiment! 🎨**
