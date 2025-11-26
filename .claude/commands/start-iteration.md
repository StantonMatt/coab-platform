---
description: Start a new iteration from the implementation plan
argument-hint: [iteration-number or name]
allowed-tools: Read, TodoWrite
---

Start iteration: $ARGUMENTS

## 📖 Read Iteration Plan

First, read the iteration document from `.claude/iterations/` to understand:
- Objectives and acceptance criteria
- Dependencies on previous iterations
- Test strategy
- Implementation steps
- Rollback plan

## ✅ Pre-Flight Checklist

### 1. Verify Dependencies
- [ ] Are all previous iterations complete?
- [ ] Is the database schema ready (if needed)?
- [ ] Are environment variables configured?
- [ ] Is the development environment running?

### 2. Understand Context
- [ ] Review PRD_COMPLETE.md for business requirements
- [ ] Check IMPLEMENTATION_PLAN.md for overall context
- [ ] Understand how this iteration fits into the bigger picture

### 3. Set Up Testing Environment
- [ ] Backend: Ensure test database is accessible
- [ ] Frontend: Ensure dev server is running
- [ ] Create test data fixtures if needed
- [ ] Plan testing approach (unit, integration, E2E)

## 📋 Create Task Checklist

Use TodoWrite to break down the iteration into specific tasks:

Example tasks based on common iteration patterns:
- [ ] Read iteration plan and understand requirements
- [ ] Set up database schema/migrations (if applicable)
- [ ] Implement backend endpoints (if applicable)
- [ ] Write backend tests
- [ ] Implement frontend components (if applicable)
- [ ] Write frontend tests
- [ ] Integration testing
- [ ] Chilean data validation (RUT, CLP, dates)
- [ ] Mobile responsiveness check (if frontend)
- [ ] Security review (auth, validation, rate limiting)
- [ ] Performance testing (API <200ms, FCP <1.5s)
- [ ] Documentation updates
- [ ] Run full test suite
- [ ] Mark iteration as complete

## 🏗️ Implementation Approach

### Test-Driven Development (TDD)
1. **Write tests first** (based on acceptance criteria)
2. **Run tests** (they should fail initially)
3. **Implement feature** to make tests pass
4. **Refactor** while keeping tests green
5. **Verify** all tests pass before moving on

### Incremental Development
- Start with smallest working slice
- Test at each step (don't batch testing at end)
- Commit working code frequently
- Don't move to next task until current one is complete

## 🇨🇱 Chilean Standards Checklist

For every iteration, ensure:
- [ ] All UI text in Spanish (es-CL)
- [ ] RUT format: XX.XXX.XXX-X with modulus 11 validation
- [ ] Currency format: $1.234.567 (CLP)
- [ ] Date format: dd/MM/yyyy or Spanish long format
- [ ] Database schema uses Spanish names
- [ ] Error messages in Spanish
- [ ] Mobile-first design (44px touch targets)

## 🚫 Common Mistakes to Avoid

- ❌ Skipping tests until the end
- ❌ Not reading the iteration plan thoroughly
- ❌ Implementing features not in the plan (scope creep)
- ❌ Forgetting to test with Chilean data formats
- ❌ Not checking mobile responsiveness
- ❌ Committing without running full test suite
- ❌ Moving to next task while current one is broken

## 🎯 Definition of Done

An iteration is complete when:
- [ ] All acceptance criteria met
- [ ] All tests pass (no skipped tests)
- [ ] Code coverage meets thresholds (>80%)
- [ ] Chilean standards validated
- [ ] Mobile responsiveness verified (if applicable)
- [ ] Security review passed
- [ ] Performance targets met
- [ ] Documentation updated
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Code committed with descriptive message

## 🔄 If Iteration Fails

Refer to the rollback plan in the iteration document:
1. Identify what went wrong
2. Roll back breaking changes
3. Document the issue
4. Revise approach
5. Try again with lessons learned

## 📊 Progress Tracking

Use TodoWrite to update task status:
- Mark tasks as `in_progress` when starting
- Mark tasks as `completed` immediately when done
- Add new tasks if you discover additional work
- Remove tasks that are no longer relevant

## ✨ When Iteration is Complete

- [ ] Run `/test-before-commit` to verify everything works
- [ ] Update iteration status in tracking document
- [ ] Document any deviations from original plan
- [ ] Note lessons learned for future iterations
- [ ] Prepare for next iteration (review dependencies)
