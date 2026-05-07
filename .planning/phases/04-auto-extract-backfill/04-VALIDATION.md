---
phase: 4
slug: auto-extract-backfill
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, Node 24.12.0) |
| **Config file** | none — `package.json` script `"test": "node --test \"test/**/*.test.js\""` |
| **Quick run command** | `npm test -- test/backfill.test.js` (single file) or `npm test -- test/recipes.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5–10 seconds (existing 284-test suite + ~10 new tests) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- test/backfill.test.js` (Wave 1 task) or `npm test -- test/recipes.test.js` (Wave 2 task) — narrow scope, fast.
- **After every plan wave:** Run `npm test` — full ~294-test suite.
- **Before `/gsd-verify-work`:** Full suite must be green. Manual `node server.js` start must populate `state.library` and a non-null `state.libraryMigratedAt` in `state.json`.
- **Max feedback latency:** ~10 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-XX | 01 (runBackfill) | 1 | EXTR-03 / SC#2a | — | First run on populated state seeds entries | unit (pure) | `npm test -- test/backfill.test.js` | ❌ W0 | ⬜ pending |
| 4-01-XX | 01 (runBackfill) | 1 | EXTR-03 / SC#2b | — | First run sets libraryMigratedAt to ISO timestamp | unit (pure) | `npm test -- test/backfill.test.js` | ❌ W0 | ⬜ pending |
| 4-01-XX | 01 (runBackfill) | 1 | EXTR-03 / SC#2c | — | First run on empty state.recipes still flips timestamp | unit (pure) | `npm test -- test/backfill.test.js` | ❌ W0 | ⬜ pending |
| 4-01-XX | 01 (runBackfill) | 1 | EXTR-03 / SC#3 | — | Second runBackfill(state) short-circuits — count + timestamp unchanged | unit (pure) | `npm test -- test/backfill.test.js` | ❌ W0 | ⬜ pending |
| 4-01-XX | 01 (runBackfill) | 1 | EXTR-03 / SC#4 | — | Backfilled "peanut butter" entries have groceryCategory: 'Aisle' | unit (pure) | `npm test -- test/backfill.test.js` | ❌ W0 | ⬜ pending |
| 4-01-XX | 01 (runBackfill) | 1 | D-40 edge | — | Non-array recipe.ingredients triggers console.warn and continues loop | unit (pure) | `npm test -- test/backfill.test.js` | ❌ W0 | ⬜ pending |
| 4-01-XX | 01 (runBackfill) | 1 | D-41 edge | — | Per-recipe throw is caught; subsequent recipes still seed; timestamp committed | unit (pure, monkey-patched extractAndSeed) | `npm test -- test/backfill.test.js` | ❌ W0 | ⬜ pending |
| 4-02-XX | 02 (server bootstrap) | 2 | EXTR-03 / SC#5 | — | Bootstrap call ordering: runBackfill runs before app.listen() | code review (no HTTP test per D-50) | n/a — verified by reading server.js diff + SC#3 idempotency proof | n/a | ⬜ pending |
| 4-03-XX | 03 (POST hook) | 2 | EXTR-01 / SC#1a | — | New recipe save grows state.library | HTTP integration | `npm test -- test/recipes.test.js` | ❌ W0 (extends) | ⬜ pending |
| 4-03-XX | 03 (POST hook) | 2 | EXTR-01 / SC#1b | — | No second storage.save() when all ingredients matched (re-save same URL) | HTTP integration | `npm test -- test/recipes.test.js` | ❌ W0 (extends) | ⬜ pending |
| 4-03-XX | 03 (POST hook) | 2 | EXTR-01 / SC#1c | T-Saved-Toast-Trust | extractAndSeed throws → recipe still saves; toast unchanged (D-48) | HTTP integration with monkey-patch | `npm test -- test/recipes.test.js` | ❌ W0 (extends) | ⬜ pending |
| (regression) | all | all | D-51 carryover | — | All 284 existing tests still pass without modification | full-suite regression | `npm test` | ✅ in tree | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are placeholders — replace with actual `{padded_phase}-{plan}-{task}` IDs after planner emits PLAN.md files.*

---

## Wave 0 Requirements

- [ ] `test/backfill.test.js` — NEW file. Covers SC#2 / SC#3 / SC#4 + D-40 + D-41 + empty-recipes edge case. ~8–10 tests, pure plain-state fixtures (mirrors `test/library.test.js` style).
- [ ] No new framework install — `node:test` is built in.
- [ ] No new fixtures or shared helpers — inline plain-state objects per `test/library.test.js` style.
- [ ] No `conftest` equivalent — `beforeEach`/`afterEach` not required for pure tests.

`test/recipes.test.js` already exists and only needs additive extension in Wave 2.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SC#5 — Bootstrap call ordering | EXTR-03 | Synchronous call ordering inside `if (require.main === module)` cannot be HTTP-tested without spinning a real server, which would rebind a port and risk flakes; D-50 explicitly excludes a new HTTP test for SC#5. | (1) Read `server.js` diff: confirm `runBackfill(storage.get())` precedes `app.listen(...)` inside the `require.main === module` block. (2) Confirm SC#3 idempotency test in `test/backfill.test.js` is green (proves second-run short-circuit is the call-ordering invariant). |
| Live first-startup smoke | EXTR-03 | Confirms backfill end-to-end against a real `data/state.json` once before merge. | (1) Back up `data/state.json`. (2) Set `state.libraryMigratedAt = null` in the file. (3) Run `node server.js`. (4) Observe console: `Backfilled N library entries from M recipes`. (5) Observe `state.json`: `state.libraryMigratedAt` is a non-null ISO string; `state.library.length > 0`. (6) Restart server. (7) Observe NO new "Backfilled..." log line; library count is unchanged. (8) Restore backup. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (SC#5 + Live first-startup smoke acknowledged as manual-only per D-50)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (each plan ends with a green test run)
- [ ] Wave 0 covers all MISSING references (`test/backfill.test.js`)
- [ ] No watch-mode flags (`npm test` runs once and exits)
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner emits actual task IDs and the per-task table is finalized)

**Approval:** pending
