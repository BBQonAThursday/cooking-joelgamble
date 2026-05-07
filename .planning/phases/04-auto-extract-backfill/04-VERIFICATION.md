---
phase: 04-auto-extract-backfill
status: passed
verified: 2026-05-07
verifier: gsd-execute-phase orchestrator (inline)
plans_complete: 3 / 3
must_haves_verified: 5 / 5
requirements_closed: [EXTR-01, EXTR-03]
tests_total: 297
tests_passed: 297
tests_failed: 0
human_verification:
  - smoke test boot/restart confirms SC#3 idempotency end-to-end (manual, completed)
---

# Phase 4 Verification — Auto-Extract & Backfill

## Phase goal (ROADMAP.md)

> The library populates itself: new recipe saves automatically seed
> unmatched ingredients as `curated: false` entries, and all pre-existing
> recipes are backfilled exactly once on first startup after deploy.

## Must-haves (Success Criteria)

### SC#1 — POST /recipes auto-extract hook

**Spec:** Saving a new recipe via `POST /recipes` results in `state.library`
gaining entries for any ingredient strings not already matched by an
existing alias — and no second `storage.save()` is called if all
ingredients were already matched.

**Verified:**
- `routes/recipes.js:48-56` — nested try/catch hook calls
  `libraryMod.extractAndSeed(state, entry.ingredients)` after the
  recipe-save and conditionally re-saves only on
  `extractResult.added.length || extractResult.aliasesAppended.length`.
- `test/recipes.test.js` — 3 new tests pass:
  - `POST /recipes seeds state.library via auto-extract hook (SC#1a)` — first
    POST seeds at least one entry (state.library.length ≥ 1 after one POST).
  - `POST /recipes second save with same URL does NOT regrow library
    (SC#1b)` — two POSTs with the same URL keep library length stable
    (library-first match path; conditional second save path).
  - `POST /recipes still saves and toasts Saved when extractAndSeed throws
    (D-48)` — monkey-patched throw is absorbed, recipe persists, toast
    matches `Saved: ...`.

**Status:** ✓ PASSED

---

### SC#2 — Startup backfill walks recipes and persists timestamp

**Spec:** On first startup after deploy (when `state.libraryMigratedAt` is
`null`), the backfill walks all existing recipes and seeds library entries;
`state.libraryMigratedAt` is set to an ISO timestamp and persisted.

**Verified:**
- `lib/backfill.js#runBackfill(state)` — walks `state.recipes` in insertion
  order (D-39), calls `extractAndSeed` per recipe, sets
  `state.libraryMigratedAt = new Date().toISOString()` after the loop.
- `server.js:48-56` — bootstrap-only `runBackfill` call; on
  `alreadyRan === false` calls `storage.save()` (atomic temp-rename
  persistence via `lib/storage.js#persist`).
- `test/backfill.test.js` — 3 tests cover SC#2:
  - `runBackfill seeds entries on first run with populated recipes (SC#2a)`
  - `runBackfill sets libraryMigratedAt to an ISO timestamp on first run
    (SC#2b)`
  - `runBackfill flips timestamp on empty state.recipes (SC#2c)` — D-42
    edge case.
- **End-to-end smoke** — fresh state.json with 1 recipe → first boot logged
  `Backfilled 2 library entries from 1 recipes` and persisted
  `libraryMigratedAt` ISO string to disk.

**Status:** ✓ PASSED

---

### SC#3 — Restart does not re-run backfill (idempotency)

**Spec:** Restarting the server a second time does not re-run the backfill
— `state.library` entry count is identical before and after the second
restart.

**Verified:**
- `lib/backfill.js:21-23` — truthy short-circuit on
  `state.libraryMigratedAt` returns `{ alreadyRan: true, added: [],
  aliasesAppended: [] }`.
- `test/backfill.test.js` — `runBackfill is idempotent on libraryMigratedAt
  truthy (SC#3)` confirms a second call returns `alreadyRan: true` with
  empty `added` and `aliasesAppended`, and `state.library.length` +
  `state.libraryMigratedAt` are unchanged.
- **End-to-end smoke** — second boot of the same data dir reported
  `Already ran`, library length stayed at 2, `libraryMigratedAt` unchanged.

**Status:** ✓ PASSED

---

### SC#4 — peanut butter groceryCategory = 'Aisle' after backfill

**Spec:** After backfill, "peanut butter" entries in `state.library` have
`groceryCategory: 'Aisle'` (not `'Produce'`) — the heuristic fix from
Phase 1 is reflected in all seeded entries.

**Verified:**
- `lib/categorize.js` — Phase 1 D-01 `\bpea` word-boundary fix (already
  shipped pre-Phase 4); `groceryCategoryOf('peanut butter')` returns
  `'Aisle'`.
- `lib/backfill.js` → `lib/library.js#extractAndSeed` →
  `newLibraryEntry({..., groceryCategory: groceryCategoryOf(original)})` —
  unchanged from Phase 2; the fix flows through.
- `test/backfill.test.js` — `runBackfill seeds peanut butter as
  groceryCategory: Aisle (SC#4)` asserts the seeded entry has
  `groceryCategory === 'Aisle'`.
- **End-to-end smoke** — peanut butter ingredient string seeded with
  `pb_aisle=Aisle`.

**Status:** ✓ PASSED

---

### SC#5 — Backfill synchronous before app.listen

**Spec:** Backfill completes synchronously before the server begins
accepting requests — no partial-library state is served on the first
request.

**Verified by structural call ordering** (no test required per D-50):

`server.js:46-60` (the `if (require.main === module)` block):

1. `createApp()` — synchronous, returns app object.
2. `storage.get()` — synchronous, returns state.
3. `runBackfill(state)` — synchronous (verified by `lib/backfill.js`: no
   `await`, no `Promise`, no `setTimeout`).
4. `if (!result.alreadyRan) { storage.save(); console.log(...); }` — both
   synchronous calls.
5. `app.listen(PORT, HOST, ...)` — FIRST async-binding call. No socket
   bound until this point.

There is no `await`, no `.then`, no `setTimeout`, no `setImmediate`, no
`process.nextTick` between `createApp()` and `app.listen()`. Reading the
diff is sufficient to confirm SC#5.

**Status:** ✓ PASSED (structural)

---

## Requirement traceability

| REQ-ID | Coverage | Status |
|--------|----------|--------|
| EXTR-01 | Plan 04-03 — `routes/recipes.js` POST hook + 3 SC#1 tests in `test/recipes.test.js` | ✓ Closed |
| EXTR-03 | Plan 04-01 (`lib/backfill.js`) + Plan 04-02 (`server.js` bootstrap) + 10 tests in `test/backfill.test.js` | ✓ Closed |

Both Phase 4 requirements are now closed. No EXTR-01 or EXTR-03 gap items
carry into Phase 5.

## Test summary

| Test file | Pre-Phase-4 | Post-Phase-4 | Δ |
|-----------|-------------|--------------|---|
| test/backfill.test.js | 0 (file new) | 10 | +10 |
| test/recipes.test.js | 13 | 16 | +3 |
| All other test files | 271 | 271 | 0 |
| **Total** | **284** | **297** | **+13** |

`npm test` exit code: 0 — all 297 tests green.

## Plan SUMMARY references

- `.planning/phases/04-auto-extract-backfill/04-01-SUMMARY.md` — runBackfill
  helper + 10 tests (commits 24ab1b9, 72aaf4a, a415646)
- `.planning/phases/04-auto-extract-backfill/04-02-SUMMARY.md` — server.js
  bootstrap wiring (commits 69fbfbf, 276f546)
- `.planning/phases/04-auto-extract-backfill/04-03-SUMMARY.md` — POST hook +
  3 SC#1 tests (commits 2835544, 2fac444, 6d1db3d)

## Cross-phase regression check

Prior-phase tests still pass (no regression detected):

- Phase 1 / FND tests (in `test/storage.test.js`, `test/categorize.test.js`):
  pass.
- Phase 2 / EXTR-02, EXTR-04 tests (in `test/library.test.js`): pass.
- Phase 3 / MATCH-01, MATCH-02, MATCH-03 tests (in `test/categorize.test.js`,
  `test/calc.test.js`): pass.

Total prior-phase tests: 271. All pass.

## Deviations recorded across plans

1. **04-01:** `lib/backfill.js` uses `const libraryMod = require('./library')`
   (module reference) instead of `const { extractAndSeed } = require(...)`
   (destructured) so the test's monkey-patch takes effect. Documented in
   04-01-SUMMARY.md.

2. **04-02:** Plan acceptance criterion `grep -c "runBackfill" server.js`
   should equal 1 contradicts the plan's own snippet (which has 2
   references). Followed the snippet. Documented in 04-02-SUMMARY.md as a
   planning defect to fix in future plans.

3. **04-03:** Same module-reference deviation as 04-01 — `routes/recipes.js`
   uses `const libraryMod = require('../lib/library')`. Mirrors the existing
   `scrapeMod` idiom at line 3 of the same file. Documented in 04-03-SUMMARY.md.

None of the deviations alter the public contract, the success criteria
coverage, or the existing test outcomes.

## Decision

**Verification status:** ✓ PASSED

All 5 success criteria verified. Both requirements (EXTR-01, EXTR-03)
closed. 297/297 tests passing, no regression in 271 prior-phase tests.
End-to-end smoke confirms SC#2/SC#3/SC#4 in production. SC#5 is
structurally enforced by call ordering in `server.js`.

Phase 4 ready to mark complete in ROADMAP.md / STATE.md.
