# Piano UI3 implementation plan

> **For agentic workers:** Use superpowers:executing-plans, inline, task by task.

**Goal:** implement the approved monthly Piano in the existing UI3 pilot without changing UI2, rollout, account data or experimental monthlyPlans.
**Architecture:** pure cent-based selectors; canonical monthly snapshots and revision-checked atomic writes; isolated controlled editor; UI3 route facade and real-component offline preview.
**Tech Stack:** React/TypeScript, existing V4 forecast, Firebase transactions/Rules, Vitest, local preview browser.
**Spec:** docs/product/2026-10-10-piano-redesign.md (binding).

## Global constraints

- No merge/main push/deploy. No production data access, migration or deletion.
- Calendar-local dates; explicit zero differs from unreviewed input. No production demo fallback.
- Preserve legacy investment targets; cash targets are additive. No changes to UID/gates.
- Tests and screenshots are synthetic/local only.

## Review focus

- Concurrent initialization and legacy writers must not erase V3 or overwrite a newer draft.
- Refund timing and duplicate series occurrences must not inflate monthly availability.
- Archived/unknown categories and hidden investments must not disappear from totals.
- Failed writes, user/month changes and editing an empty number must retain drafts safely.
- Future/past months must not mutate the current mirror or claim unsupported forecasts.

## Task 1: calculations

Files: monthlyPlanSelectors.ts/.test.ts; monthlyBudget.ts/.test.ts.
Interface: selectMonthlyPlan({month, now, plan, transactions, categories, forecast?}) returns cent-based totals, categories, upcoming, decisions.
- [ ] Write failing acceptance tests for formulas 1–13, 19, 26, 28, recurrence identity, annual dates and refund timing.
- [ ] Implement and run targeted tests in UTC and Europe/Rome.
- [ ] Commit selectors and model tests.

## Task 2: persistence

Files: monthlyBudgetStore.ts/.test.ts, useBudget.ts, types.ts, firestore.rules, firestore-tests.
Interface: saveMonthlyBudget(month,draft,expectedRevision) Promise; null revision means absent; revision increments for every writer. Current-month snapshot+mirror atomic, other months snapshot only.
- [ ] Test revision conflict, unknown-field preservation, initial creation race, legacy invalidation and current mirror routing.
- [ ] Replace separate writes with a transaction repository; reset subscriptions on uid/calendar changes; expose loading/error.
- [ ] Validate new metadata and bounded cash amounts in client/Rules; test ownership and malformed values with emulator.
- [ ] Commit persistence.

## Task 3: editor

Files: planDraft.ts/.test.ts, PlanEditor.tsx, PlanDialog.tsx.
Interfaces: uid/month-scoped local drafts with original expected revision; onSave awaitable; cancel never writes.
- [ ] Test Italian decimals, empty input, zero intent, category transfer, copy review, draft isolation.
- [ ] Implement three steps/context entry, before/after preview, copy, explicit deficit choice, conflict/retry and discard.
- [ ] Commit editor.

## Task 4: page

Files: useMonthlyPlan.ts, PlanScreen.tsx, plan.css, BudgetScreenV2.tsx; AppRoutes/useTransactionEditing/App for scheduled add.
- [ ] Compose real transactions, canonical plan and current-only V4; no formulas in components.
- [ ] Implement summary, prioritized actions, categories/detail/transfer, upcoming, forecast, archive and gated secondary coach.
- [ ] Reuse existing modal for future expense, no write until save. Keep legacy screen and gates.
- [ ] Commit page.

## Task 5: verification and handoff

Files: ui-preview fixtures/main/regressions and evidence report.
- [ ] Baseline and final tsc/tests/build; UTC and Rome financial tests; Rules emulator.
- [ ] Browser 390/768/1440, both themes, keyboard/focus/reduced motion, empty/zero/deficit, cancel/save/error/conflict, month/user boundaries.
- [ ] Save screenshots and report real outcomes; independent whole-branch review and regression fixes.
- [ ] Commit result on implementation branch only.
