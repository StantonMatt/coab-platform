---
description: Check package documentation using Context7 MCP before installation
argument-hint: [package-name]
---

Check documentation for package: $ARGUMENTS

## 📚 Documentation Lookup Process

1. **Resolve Library ID:**
   - Use `mcp__context7__resolve-library-id` to find the package
   - Verify it's the correct package (check description, stars, trust score)

2. **Get Documentation:**
   - Use `mcp__context7__get-library-docs` to fetch latest docs
   - Focus on: installation, usage patterns, TypeScript support

3. **Evaluate for COAB Project:**

### ✅ Compatibility Checks
- [ ] **Node.js 22 compatibility** (backend)
- [ ] **Next.js 15 compatibility** (frontend)
- [ ] **TypeScript support** (has type definitions)
- [ ] **Active maintenance** (updated within last 6 months)
- [ ] **Security** (no critical vulnerabilities)

### 🇨🇱 Chilean Localization Support
- [ ] **Spanish (es-CL) locale** support
- [ ] **Date formatting** with date-fns compatibility
- [ ] **Currency formatting** for CLP
- [ ] **Phone number** formatting (+56 9 XXXX XXXX)

### 📦 Bundle Size & Performance
- [ ] Check bundle size (use bundlephobia if needed)
- [ ] Will it impact mobile performance? (target <1.5s FCP)
- [ ] Can it be lazy-loaded with Next.js dynamic imports?

### 🔒 Security & Privacy
- [ ] Check npm audit for vulnerabilities
- [ ] Review package dependencies (avoid bloated dependency trees)
- [ ] Check for known security issues

### 🎯 Project Fit
- [ ] Does it solve the problem better than existing solutions?
- [ ] Is it worth adding another dependency?
- [ ] Can we implement this ourselves in <1 hour?
- [ ] Does it align with our stack (React, Prisma, etc.)?

## 🚦 Decision Criteria

**✅ INSTALL if:**
- Actively maintained (recent commits)
- Good TypeScript support
- No critical security issues
- Fits architecture and performance budget
- Saves significant development time

**⚠️ EVALUATE ALTERNATIVES if:**
- Large bundle size (>50kb gzipped for frontend)
- Abandoned package (no updates in 1+ year)
- Many dependencies (potential security risk)
- Poor TypeScript support

**❌ DO NOT INSTALL if:**
- Critical security vulnerabilities
- Incompatible with Node.js 22 or Next.js 15
- No TypeScript definitions
- Duplicates existing functionality

## 📋 After Evaluation

If approved for installation:
- Document why we chose this package (comment in package.json or README)
- Add to appropriate service (backend or frontend)
- Update dependencies documentation
- Consider adding to `.npmrc` if specific config needed

If rejected:
- Document the decision (why it was rejected)
- Suggest alternative approaches
- Consider implementing custom solution
