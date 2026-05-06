---
phase: 03-categorization-layering
plan: 02
subsystem: lib/categorize
tags: [feature, categorize, library, match-01, d-35, d-36, phase-3]
dependency-graph:
  requires:
    - 03-01-SUMMARY (canonical normalizeIngredientText in categorize; buildLibraryIndex / findEntryInIndex in library)
  provides:
    - library-aware-recipeCategoryOf (optional libraryOrIndex 2nd arg; D-26 / D-27 / D-28 contract)
    - library-aware-groceryCategoryOf (mirrors recipe; D-26 / D-27 / D-28 contract)
    - overload-sniffing (raw library array vs pre-built index discriminated by row[0].regex)
    - matchRawLibrary (module-private inline walker; mirrors buildLibraryIndex shape without importing library)
    - d-35-pepper-fixes (RECIPE Veg trim + GROCERY Produce additions + GROCERY Aisle stale token removal)
    - d-36-blocker-closure (matchRawLibrary normalizes via canonical normalizeIngredientText; raw + index paths byte-equivalent)
  affects:
    - lib/categorize.js (extends signatures; adds 2 module-private helpers; D-35 keyword-table edits; +1 keyword for Rule 1 fix)
    - test/categorize.test.js (15 new tests; existing 25 byte-identical)
tech-stack:
  added: []
  patterns:
    - Optional-arg overload sniffing (Array.isArray + element shape check)
    - Library-first / heuristic-fallback chain (D-26..D-28)
    - Inline regex walker mirroring an external builder's shape (matchRawLibrary mirrors buildLibraryIndex)
key-files:
  created: []
  modified:
    - lib/categorize.js (Task 1 + Rule 1 fix)
    - test/categorize.test.js (Task 2)
decisions:
  - libraryOrIndex-overload-sniffing: Discriminator is "first row has .regex property" (Array.isArray + arg[0].regex instanceof RegExp). Both raw library arrays and pre-built indexes are arrays at runtime; the regex property is the only shape difference.
  - library-Other-wins: D-28 implemented as "match && typeof match.recipeCategory === 'string'" guard. 'Other' is a valid string -> wins. Falls through to heuristic only when match is undefined OR the entry's category field is non-string (defensive).
  - matchRawLibrary-uses-module-local-normalizer: 03-REVISION-1 BLOCKER closure. normalizeIngredientText was moved to lib/categorize.js by Plan 03-01, so matchRawLibrary calls it directly without importing library.js. Raw-library path and pre-built-index path now produce byte-equivalent regex compilation.
  - d-35-w-2-aisle-pepper-removed: Removed bare 'pepper' from GROCERY_KEYWORDS.Aisle (per 03-REVISION-1 W-2). Stale spice-aisle entry would collide at length 6 with the newly-added Produce entry. Stable-sort + insertion order makes Produce win today, but a future refactor could silently regress; remove the bare token now.
  - red-pepper-flakes-plural-added: Rule 1 deviation. The plan's Task 2 test asserted recipeCategoryOf('1 tsp red pepper flakes') === 'Seasoning' but with bare 'pepper'/'peppers' removed from RECIPE_KEYWORDS.Veg per D-35 the plural form no longer matched anything ('red pepper flake' singular doesn't word-boundary-match 'flakes'). Added 'red pepper flakes' (plural) to RECIPE Seasoning alongside the existing singular. Mirrors the singular/plural pair pattern used elsewhere.
  - sc5-zero-existing-test-edits: All 25 pre-existing tests in test/categorize.test.js are byte-identical (no whitespace, reordering, or content changes). Verified by direct file read.
metrics:
  duration: ~12 minutes
  tasks-completed: 2
  tests-added: 15
  tests-total: 273 (258 baseline + 15)
  files-modified: 2
  files-created: 0
  completed-date: 2026-05-06
---

# Phase 3 Plan 02: Library-aware recipeCategoryOf / groceryCategoryOf + D-35 pepper fixes Summary

Extended `recipeCategoryOf` and `groceryCategoryOf` in `lib/categorize.js` with an optional second argument (`libraryOrIndex`) that accepts either a raw `state.library` array or a pre-built index from `lib/library.js#buildLibraryIndex`. When the library matches, the entry's stored category wins (including `'Other'`); when omitted/empty/no-match, the existing heuristic-table path runs unchanged. Applied the D-35 pepper-keyword regressions: removed bare `'pepper'`/`'peppers'` from `RECIPE_KEYWORDS.Veg`, added `'pepper'`/`'peppers'` to `GROCERY_KEYWORDS.Produce`, removed stale bare `'pepper'` from `GROCERY_KEYWORDS.Aisle` (per 03-REVISION-1 W-2). Closed the 03-REVISION-1 BLOCKER on D-36 by routing `matchRawLibrary` through the canonical `normalizeIngredientText` (now module-local thanks to Plan 03-01). Added 15 new tests; all 25 pre-existing tests stay byte-identical.

## What Was Built

### Task 1 — Extend public functions + D-35 keyword fixes (commit `9336d89`)

**`lib/categorize.js` keyword-table edits:**

- `RECIPE_KEYWORDS.Veg` (line 27): removed bare `'pepper','peppers'`; replaced with a comment block explaining what was removed and why. Bell variants (`'bell pepper'`, `'bell peppers'`, `'jalapeno'`, etc. on the line above) stay intact. Seasoning entries (`'black pepper'`, `'white pepper'`, `'peppercorn'`, `'peppercorns'`) stay and now win without colliding against the bare Veg tokens.
- `GROCERY_KEYWORDS.Produce` (line 177): appended `'pepper','peppers'` to the line containing the bell variants. Bell variants keep winning via the existing length-DESC sort (longer keyword wins). The bare tokens cover plain `'pepper'` / `'peppers'` inputs that currently fall through to 'Other'.
- `GROCERY_KEYWORDS.Aisle` (line 198): removed bare `'pepper'`. Per 03-REVISION-1 W-2, the bare Aisle token would collide at length 6 with the newly-added Produce entry; stable-sort + insertion order makes Produce win today, but a future refactor could silently regress. Removed proactively. `'salt'`, `'sugar'`, `'brown sugar'`, `'vanilla'`, `'baking powder'`, `'baking soda'`, `'yeast'` stay byte-identical.

**`lib/categorize.js` function additions:**

- `isPreBuiltLibraryIndex(arg)` — module-private discriminator. Returns `true` iff arg is a non-empty array AND `arg[0].regex` is a `RegExp`. Both raw library arrays and pre-built indexes are arrays at runtime; the regex property on row[0] is the only shape difference.
- `matchRawLibrary(library, text)` — module-private inline walker. Builds the alias-regex array on demand from a raw `state.library` array, sorts by `(length DESC, curated DESC, arrayIndex ASC)` (same comparator as `lib/library.js#compareIndexRows`), and returns the first matching entry or `undefined`. **D-36 closure:** uses the canonical `normalizeIngredientText` (module-local thanks to Plan 03-01) for byte-equivalent regex compilation with `buildLibraryIndex`. Stored aliases like `'  GARLIC  '` produce a regex matching `'1 clove garlic, minced'` in BOTH the raw-library and pre-built-index paths.

**`lib/categorize.js` public function rewrites:**

- `recipeCategoryOf(text, libraryOrIndex)` — single-arg form (no `libraryOrIndex`) returns identical result to today (SC#5 backwards compat). When `libraryOrIndex` is provided AND non-empty, dispatches to either the pre-built-index walker (if `isPreBuiltLibraryIndex` returns true) OR `matchRawLibrary` (raw library form). On library hit, returns `match.recipeCategory` directly — no further validation, no second lookup (D-27). On library miss (or empty/null arg), falls through to `matchCategory(RECIPE_INDEX, text)` (D-26).
- `groceryCategoryOf(text, libraryOrIndex)` — mirrors `recipeCategoryOf`. Reads `match.groceryCategory` on library hit; falls through to `matchCategory(GROCERY_INDEX, text)` on miss.

**Library 'Other' wins (D-28):** the `match && typeof match.recipeCategory === 'string'` guard treats `'Other'` as a valid string and returns it directly. Falls through to heuristic only when `match` is `undefined` (no library hit).

**Import direction preserved:** `lib/categorize.js` does NOT require `lib/library.js`. The library/index argument is supplied by the caller. Verified by grep returning 0 matches for `require('./library')` in `lib/categorize.js`.

### Task 1 deviation — Rule 1 fix: 'red pepper flakes' plural (commit `57a30b3`)

**Trigger:** Test failure during Task 2 verification. The plan's Task 2 explicitly asserts `recipeCategoryOf('1 tsp red pepper flakes') === 'Seasoning'`. With bare `'pepper'`/`'peppers'` removed from `RECIPE_KEYWORDS.Veg` per D-35, and only `'red pepper flake'` (singular) in `RECIPE_KEYWORDS.Seasoning`, the plural input no longer matched any RECIPE keyword (bilateral `\b` regex doesn't match plural against singular alias). Pre-D-35 it incidentally matched bare `'pepper'` as Veg (wrong category, exactly the bug the plan was fixing); post-D-35 it returned 'Other'.

**Fix:** Added `'red pepper flakes'` (plural) to `RECIPE_KEYWORDS.Seasoning` alongside the existing `'red pepper flake'` (singular). Mirrors the singular/plural pair pattern used elsewhere (`'clove'`/`'cloves'`, `'peppercorn'`/`'peppercorns'`, `'tomato'`/`'tomatoes'`).

**Why Rule 1 (auto-fix bug) not Rule 4 (architectural):** the plan author prescribed the test expectation; the fix is a one-keyword addition that satisfies the plan's stated intent. No structural change, no schema change, no new abstraction. Documented as a deviation but not a blocker.

### Task 2 — 15 new tests (commit `6a248ac`)

Appended 15 new tests to `test/categorize.test.js` (after line 168, the existing pea-prefix-bug-fix test block). Existing 25 tests stay byte-identical (SC#5 verified).

**One new import line** added below the existing `groceryCategoryOf` import (line 70 in original): `const { buildLibraryIndex } = require('../lib/library');`. The first time `lib/library.js` is consumed by `test/categorize.test.js`. The pre-existing two destructure imports (lines 3 and 70) stay byte-identical.

**Library-aware tests (9 tests, MATCH-01 + D-26..D-28):**

1. `recipeCategoryOf` library priority overrides heuristic — raw-library form ('black pepper' alias overrides Seasoning -> Flavor).
2. `groceryCategoryOf` library priority overrides heuristic — raw-library form (overrides Aisle -> entry's groceryCategory).
3. Pre-built-index form via `buildLibraryIndex` — both `recipeCategoryOf` and `groceryCategoryOf` accept the index directly.
4. SC#1 ergonomics — `recipeCategoryOf('peanut butter', state.library)` returns library's category (the exact wording from ROADMAP SC#1).
5. D-28 — library 'Other' does NOT fall through. 'onion' aliased to 'Other' returns 'Other' even though heuristic says 'Veg'.
6. Fallback empty array — `recipeCategoryOf(text, [])` byte-equal to single-arg call.
7. Fallback null / undefined — `recipeCategoryOf(text, null)` and `(text, undefined)` use heuristic.
8. Fallback no-match — library has unrelated entry, heuristic still wins.
9. `groceryCategoryOf` fallback parity — empty / null / no-match all use heuristic.

**D-35 pepper-regression tests (5 tests):**

10. RECIPE: black pepper / white pepper / peppercorns -> Seasoning (was Veg before D-35).
11. RECIPE: red pepper flakes -> Seasoning (Rule 1 fix verified).
12. RECIPE: red bell peppers / jalapeno -> Veg (bell variants intact).
13. GROCERY: bare pepper / peppers -> Produce (newly added plural+singular).
14. GROCERY: red bell peppers -> Produce (bell variant intact).

**D-36 BLOCKER closure test (1 test):**

15. Alias `'  GARLIC  '` (whitespace + uppercase noise) matches `'1 clove garlic'` in BOTH the raw-library form AND the pre-built-index form. Verifies the canonical-normalizer parity that closes the 03-REVISION-1 BLOCKER.

## Test Results

- Baseline before plan: **258 tests passing** (246 original + 12 from plan 03-01).
- After plan: **273 tests passing** (258 + 15 new).
- 0 failures, 0 skipped, 0 cancelled.
- Smoke checks (acceptance criteria):

  ```
  $ node -e "const c = require('./lib/categorize'); console.log(c.recipeCategoryOf('1 tsp black pepper'), c.recipeCategoryOf('2 red bell peppers'), c.groceryCategoryOf('peppers'), c.groceryCategoryOf('1 red pepper'));"
  Seasoning Veg Produce Produce

  $ node -e "const c = require('./lib/categorize'); const lib = [{ id: 'lb_a', name: 'g', aliases: ['  GARLIC  '], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true }]; console.log(c.recipeCategoryOf('1 clove garlic', lib), c.groceryCategoryOf('1 clove garlic', lib));"
  Veg Produce

  $ node -e "const c = require('./lib/categorize'); const lib = [{ id: 'lb_a', name: 'o', aliases: ['onion'], recipeCategory: 'Other', groceryCategory: 'Other', curated: true }]; console.log(c.recipeCategoryOf('1 onion', lib), c.groceryCategoryOf('1 onion', lib));"
  Other Other
  ```

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `lib/categorize.js` does NOT require `lib/library.js` | PASS — grep returns 0 |
| 2 | Bare `'pepper','peppers'` removed from RECIPE Veg array (token, not comment) | PASS — only the comment-line reference remains |
| 3 | Bell variants on RECIPE Veg intact (`'bell peppers','jalapeno'`) | PASS — grep returns 1 |
| 4 | `'pepper','peppers'` added to GROCERY Produce | PASS — grep returns 1 array occurrence |
| 5 | RECIPE Seasoning intact (`'black pepper','white pepper','peppercorn'`) | PASS — grep returns 1 |
| 6 | Bare `'pepper'` removed from GROCERY Aisle (`'salt','pepper','sugar'`) | PASS — grep returns 0 |
| 7 | Post-removal Aisle line intact (`'salt','sugar','brown sugar'`) | PASS — grep returns 1 |
| 8 | `function isPreBuiltLibraryIndex` defined | PASS |
| 9 | `function matchRawLibrary` defined | PASS |
| 10 | `function recipeCategoryOf(text, libraryOrIndex)` signature | PASS |
| 11 | `function groceryCategoryOf(text, libraryOrIndex)` signature | PASS |
| 12 | Smoke test D-35: `'1 tsp black pepper'` -> Seasoning, `'2 red bell peppers'` -> Veg, `'peppers'` -> Produce, `'1 red pepper'` -> Produce | PASS |
| 13 | Smoke test D-26 raw-library priority: 'black pepper' alias -> 'Flavor'/'Aisle' | PASS |
| 14 | Smoke test D-28: library 'Other' wins (does NOT fall through) | PASS |
| 15 | Smoke test D-36 BLOCKER closure: `'  GARLIC  '` alias matches in BOTH forms | PASS |
| 16 | `normalizeIngredientText(alias)` site exists exactly once in matchRawLibrary | PASS — grep returns 1 |
| 17 | Divergent normalization (`alias.toLowerCase().trim()`) absent | PASS — grep returns 0 |
| 18 | Test file: `^test\(` count = 40 (25 + 15) | PASS — grep returns 40 |
| 19 | Test file: new `require('../lib/library')` import added | PASS |
| 20 | Test file: D-35 mentions = 5+ | PASS — grep returns 6 |
| 21 | Test file: D-36 BLOCKER closure test present | PASS — grep returns 1 |
| 22 | All 25 existing tests byte-identical (SC#5) | PASS — verified by direct file read |
| 23 | `npm test` exits 0 | PASS |
| 24 | Total test count = 273 | PASS |

## Decisions Made

- **D-26 / D-27 / D-28 implemented as a single "match && typeof match.recipeCategory === 'string' -> return directly" guard.** The chain is: `if libraryOrIndex non-empty -> walk -> if match -> return entry's category (any string, including 'Other') -> else fall through to heuristic`. No second lookup, no validation against `RECIPE_CATEGORIES`. Phase 2 already validates entry categories at `newLibraryEntry` time (WR-04 closure), so anything that reaches here is already a valid category.
- **Discriminator design:** "first row has `.regex` property" was chosen over alternative discriminators (presence of `.aliases` on the entry, presence of `.length` on the row, etc.) because it's a single property check that is unambiguous: library entries do not have a `.regex` field, and index rows always do. The check is `Array.isArray(arg) && arg.length > 0 && arg[0] && typeof arg[0] === 'object' && arg[0].regex instanceof RegExp` — defensive against null elements and non-RegExp `.regex` impostors.
- **`matchRawLibrary` is module-private**, not exported. The hot path (`lib/calc.js`) passes the pre-built index built by `lib/library.js#buildLibraryIndex`. The raw-library form exists for SC#1's user-facing wording (ad-hoc / test calls). Keeping `matchRawLibrary` private avoids growing the public API surface for an inline-walk that mirrors a library helper.
- **D-35 W-2 (Aisle 'pepper' removal):** Removed proactively rather than waiting for the regression. The bell-pepper distinction is now explicit; the produce form is in `GROCERY_KEYWORDS.Produce`; the bare Aisle token has no remaining purpose. Stable-sort + insertion order would make Produce win today (Produce comes before Aisle in `Object.entries(table)` iteration), but a future refactor could silently regress. The 03-REVISION-1 W-2 watch-item is closed by removal.
- **'red pepper flakes' plural addition (Rule 1):** documented as a deviation. The plan author's Task 2 test expectation was correct (the plural form *should* map to Seasoning); the plan's keyword edits just happened to leave the plural without a matching keyword once the bare `'pepper'`/`'peppers'` Veg fallback was removed. The minimum fix is a one-keyword addition that mirrors the existing singular/plural pair convention.
- **No edits to `matchCategory`, `escapeRegex`, `buildIndex`, `RECIPE_INDEX`, `GROCERY_INDEX`, or any of the symbols added by Plan 03-01.** The new code lives entirely in two new module-private helpers + the two rewritten public functions. The plan's "do NOT modify" list was followed.

## Carryovers Closed

- **03-REVISION-1 BLOCKER (D-36 raw-library form divergence):** CLOSED. `matchRawLibrary` calls `normalizeIngredientText(alias)` before regex compile, exactly mirroring `buildLibraryIndex`'s normalization in `lib/library.js`. The two paths produce byte-equivalent regex compilation. Verified by the new D-36 test (test 15 above) which exercises BOTH forms against the same noisy alias and asserts identical results.
- **D-35 (Phase 1 carryover — bare `'pepper'`/`'peppers'` regressions):** CLOSED. Three keyword-table edits applied (RECIPE Veg trim + GROCERY Produce additions + GROCERY Aisle stale token removal). 5 new tests verify the closure across all four input forms ('black pepper', 'red pepper flakes', 'red bell peppers', 'peppers', '1 red pepper').
- **03-REVISION-1 W-2 (Aisle bare 'pepper' collision):** CLOSED. Bare `'pepper'` removed from `GROCERY_KEYWORDS.Aisle` proactively; future refactors cannot silently regress the Produce vs Aisle ordering for the bare 'pepper' input.
- **Memory entry "Phase 1 categorize regressions to fix in Phase 3" (`memory/project_phase1_categorize_regressions.md`):** READY TO ARCHIVE. Both regressions (WR-01: bare `'pepper'`/`'peppers'` in RECIPE Veg; WR-02: missing grocery plural) are closed by D-35.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added 'red pepper flakes' (plural) to RECIPE Seasoning**

- **Found during:** Task 2 verification (`npm test` after appending the 15 new tests).
- **Issue:** The plan's Task 2 explicitly asserts `recipeCategoryOf('1 tsp red pepper flakes') === 'Seasoning'`. With bare `'pepper'`/`'peppers'` removed from `RECIPE_KEYWORDS.Veg` per D-35, and only `'red pepper flake'` (singular) in `RECIPE_KEYWORDS.Seasoning`, the plural input no longer matched any RECIPE keyword (bilateral `\b\b` regex doesn't match plural input against singular alias). Pre-D-35 it incidentally matched bare `'pepper'` as Veg (wrong category — exactly the bug D-35 was fixing); post-D-35 it returned 'Other'.
- **Fix:** Added `'red pepper flakes'` (plural) to `RECIPE_KEYWORDS.Seasoning` alongside the existing `'red pepper flake'` (singular). Mirrors the singular/plural pair pattern used elsewhere in the keyword tables (`'clove'`/`'cloves'`, `'peppercorn'`/`'peppercorns'`, `'tomato'`/`'tomatoes'`).
- **Files modified:** `lib/categorize.js` (line 34: appended `'red pepper flakes'` after `'red pepper flake'`).
- **Commit:** `57a30b3`.

### Soft acceptance-criterion drift

The plan's Task 1 acceptance criterion at line 333 reads: `grep -n "'pepper','peppers'" lib/categorize.js returns exactly one match (the appended pair on the GROCERY_KEYWORDS.Produce line)`. This grep returns **two** matches — line 27 (the comment block prescribed by the plan at action-step 2 explaining what was removed and why, which itself contains the literal string `'pepper','peppers'`) and line 177 (the actual array entry). The criterion's intent (no array entry of bare `'pepper'`/`'peppers'` in `RECIPE_KEYWORDS.Veg`) is satisfied; the grep just doesn't distinguish comment from array. Documented for transparency. Not a blocker; the underlying behavior is correct and the test suite verifies it.

## Authentication Gates

None encountered. Pure local refactor + keyword-table edits + tests. No fs / http / external state.

## Files Touched

| File | Change | Lines (before -> after) |
|------|--------|------------------------|
| `lib/categorize.js` | +isPreBuiltLibraryIndex / +matchRawLibrary / rewrote recipeCategoryOf+groceryCategoryOf with overload sniffing; D-35 keyword edits (3 sites); +1 keyword for Rule 1 fix | 242 -> 356 |
| `test/categorize.test.js` | +15 tests appended; +1 import line for buildLibraryIndex | 168 -> 300 |

## Known Stubs

None. No empty-data, placeholder, or "coming soon" patterns introduced. Both new helpers are fully wired and exercised by tests; D-35 keyword edits are immediately consumed by both render-time paths (existing single-arg callers continue to work via the heuristic-only path).

## Threat Flags

None. This plan does not introduce new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Pure in-memory refactor of pre-existing logic; no external IO; no new attack surface. Library data is in-memory only and never crosses a trust boundary in this plan.

## Notes for Future Plans (Phase 3)

- **Plan 03-03** (`lib/calc.js` library threading) should call `buildLibraryIndex(state.library)` ONCE at the top of each view-builder (D-33), then pass the index into every per-item `recipeCategoryOf(text, idx)` / `groceryCategoryOf(text, idx)` call. The pre-built-index path in `recipeCategoryOf` / `groceryCategoryOf` is already wired and tested. Per-render cost: `O(library_size)` build + `O(items * library_size)` match — same complexity profile as the existing heuristic-only path.
- **Plan 03-03's `decorateIngredients`** should also build the index once and pass it through to the per-ingredient categorize calls. The current `routes/recipes.js` call site (`decorateIngredients(recipe.ingredients)`) needs to be updated to `decorateIngredients(recipe.ingredients, state.library)` (or the index, depending on Plan 03-03's signature decision).
- **Phase 4** (`extractAndSeed` POST hook + startup backfill): the keyword-table edits in this plan are now permanent. New library entries seeded via `extractAndSeed` will see the corrected `recipeCategoryOf`/`groceryCategoryOf` heuristic — `'black pepper'` seeds as Seasoning, `'1 red pepper'` seeds as Produce. No backfill correction needed; the heuristic-only path runs through the same fixed keyword tables.
- **Memory entry archival:** `memory/project_phase1_categorize_regressions.md` ("Phase 1 categorize regressions to fix in Phase 3") is now closed. Both WR-01 and WR-02 are addressed by D-35. Safe to archive.

## Self-Check: PASSED

- File `lib/categorize.js` exists; contains `function isPreBuiltLibraryIndex` (1 occurrence), `function matchRawLibrary` (1), `function recipeCategoryOf(text, libraryOrIndex)` (1), `function groceryCategoryOf(text, libraryOrIndex)` (1), `normalizeIngredientText(alias)` site inside matchRawLibrary (1) — verified by grep.
- File `test/categorize.test.js` exists; `^test\(` count = 40 (25 baseline + 15 new) — verified by grep.
- File `.planning/phases/03-categorization-layering/03-02-SUMMARY.md` exists at the canonical path.
- Commit `9336d89` exists in git log (Task 1 + D-35 keyword edits) — verified by `git log --oneline`.
- Commit `57a30b3` exists in git log (Rule 1 fix: red pepper flakes plural) — verified by `git log --oneline`.
- Commit `6a248ac` exists in git log (Task 2: 15 new tests) — verified by `git log --oneline`.
- All acceptance criteria verified via greps + 3 smoke checks (see Acceptance Criteria table above).
- `npm test` exit 0; 273 tests passing; 0 failures.
- Import-direction rule preserved: `lib/categorize.js` does NOT require `./library` — verified by grep returning 0 matches.
- All 25 pre-existing tests in `test/categorize.test.js` byte-identical (SC#5 satisfied) — verified by direct file read.
