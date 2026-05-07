---
plan: 04-01
phase: 04-auto-extract-backfill
status: complete
completed: 2026-05-07
requirements: [EXTR-03]
tasks_completed: 2
files_changed:
  - lib/backfill.js (created)
  - test/backfill.test.js (created)
tests_added: 10
tests_total_after: 294
self_check: PASSED
---

# Plan 04-01 Summary — Pure runBackfill helper + tests

## Objective

Deliver EXTR-03's pure orchestration layer: `runBackfill(state)` walks
`state.recipes` and calls `extractAndSeed` per recipe to seed unmatched
ingredient strings as `curated:false` library entries, sets
`state.libraryMigratedAt` on completion, idempotent on re-run.

## Tasks

### Task 1 — RED tests
Created `test/backfill.test.js` with 10 pure node:test tests:

| # | Test | Coverage |
|---|------|----------|
| 1 | seeds entries on first run with populated recipes | SC#2a |
| 2 | sets libraryMigratedAt to ISO timestamp on first run | SC#2b |
| 3 | flips timestamp on empty state.recipes | SC#2c, D-42 |
| 4 | idempotent on libraryMigratedAt truthy | SC#3, D-38 |
| 5 | seeds peanut butter as Aisle | SC#4, D-01 flow-through |
| 6 | skips non-array recipe.ingredients with warn | D-40 |
| 7 | catches per-recipe extractAndSeed throws and continues | D-41 |
| 8 | proceeds when libraryMigratedAt is empty string | Pitfall 4 |
| 9 | defensive against non-array state.recipes | Pitfall 5 |
| 10 | returns alreadyRan:true on null/undefined state | algorithm line 18 |

Committed at `24ab1b9`. Failed with module-not-found as expected.

### Task 2 — GREEN implementation
Created `lib/backfill.js` (60 lines) implementing `runBackfill(state)` per
04-RESEARCH.md's algorithm. Pure: only requires `./library`. No fs, no http,
no `./storage`. Committed at `72aaf4a`.

## Return-shape contract for downstream plans

```javascript
function runBackfill(state) → { alreadyRan: boolean, added: Array, aliasesAppended: Array }
```

- `alreadyRan: true` when the function short-circuits (truthy
  `libraryMigratedAt`, or null/non-object state). `added` and
  `aliasesAppended` are empty in this case — caller must not call
  `storage.save()`.
- `alreadyRan: false` after a first run regardless of `added.length` (D-42).
  `state.libraryMigratedAt` is now an ISO timestamp; caller must call
  `storage.save()` to persist.

This matches the conditional save pattern Plan 04-02 implements:

```javascript
const result = runBackfill(state);
if (!result.alreadyRan) {
  storage.save();
  console.log(`Backfilled ${result.added.length} library entries from ${state.recipes.length} recipes`);
}
```

## Grep-verifiable invariants

| Check | Expected | Confirmed |
|-------|----------|-----------|
| `require\('\./library'\)` in lib/backfill.js | 1 match | ✓ |
| `function runBackfill\(state\)` | 1 match | ✓ |
| `module\.exports = \{ runBackfill \}` | 1 match | ✓ |
| `require\('node:fs'\)` in lib/backfill.js | 0 matches | ✓ |
| `require\('node:http'\)` in lib/backfill.js | 0 matches | ✓ |
| `require\('\./storage'\)` in lib/backfill.js | 0 matches | ✓ |
| `libraryMigratedAt = new Date\(\)\.toISOString\(\)` | 1 match | ✓ |
| `console\.warn\('\[backfill\]` | 1 match | ✓ |
| `console\.error\('\[backfill\]` | 1 match | ✓ |
| `if \(!Array\.isArray\(state\.recipes\)\)` | 1 match | ✓ |
| `if \(state\.libraryMigratedAt\)` (truthy short-circuit) | 1 match | ✓ |
| `npm test` exit code | 0 | ✓ (294/294) |

## Deviation

**`lib/backfill.js` uses `const libraryMod = require('./library')` (module
reference) instead of `const { extractAndSeed } = require('./library')`
(destructured) per PATTERNS.md Section 1.**

**Reason:** A destructured import captures the function reference at module
load time. The D-41 test (Test #7) monkey-patches
`libraryMod.extractAndSeed = ...` to force a per-recipe throw; with
destructured imports the patched function is never called by
`runBackfill`. This pattern matches `routes/recipes.js`'s
`const scrapeMod = require('../lib/scrape'); /* ... */ scrapeMod.scrape(...)`
idiom — the canonical test-friendly require pattern in the codebase.

**Acceptance impact:** None. The plan's grep checks for
`require\('\./library'\)`, which still matches. The module's runtime
behavior is identical for production.

## Self-Check

- [x] All 10 backfill tests pass
- [x] Full suite green (284 existing + 10 new = 294)
- [x] No regression in any prior phase
- [x] No imports of node:fs / node:http / ./storage
- [x] Atomic commits per task (RED at 24ab1b9, GREEN at 72aaf4a)

**Self-Check: PASSED**
