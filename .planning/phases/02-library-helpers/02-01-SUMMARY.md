---
phase: 02-library-helpers
plan: 01
subsystem: lib/library
tags: [normalization, validation, helpers, foundation]
requires:
  - lib/library.js (Phase 1 newLibraryId, newLibraryEntry, aliasConflict, aliasKey shim)
  - lib/categorize.js (RECIPE_CATEGORIES, GROCERY_CATEGORIES)
provides:
  - lib/library.js#normalizeIngredientText (5-step locked pipeline)
  - lib/library.js#escapeRegex (inlined; available to Wave 2 findEntryByText)
  - lib/library.js#UNIT_TOKENS (shared quantity-strip token list)
  - lib/library.js#newLibraryEntry (now throws on invalid input; defensive aliases copy; within-entry dedup)
  - lib/library.js#aliasKey (now full-pipeline normalization via shim repoint)
affects:
  - lib/library.js#aliasConflict (inherits full normalization through aliasKey shim -- D-05 follow-through)
tech-stack:
  added: []
  patterns:
    - throw-on-invalid-input factory (programmer-error contract for newLibraryEntry)
    - inline-copy across module boundaries to enforce import-direction constraints (escapeRegex)
    - module-load-time regex precompilation (UNIT_PATTERN sorted longest-first)
key-files:
  created: []
  modified:
    - lib/library.js
    - test/library.test.js
decisions:
  - "Inlined escapeRegex into lib/library.js (do NOT import from categorize.js): preserves library -> categorize import direction so Phase 3's planned widening of categorize to take a library param stays clean."
  - "Paren strip uses iterated bracket-class regex /\\([^()]*\\)/g (NOT /\\(.*?\\)/) so nested groups collapse across passes and the regex is ReDoS-safe."
  - "UNIT_PATTERN sorted longest-first at build time so 'tablespoons' beats 'tbs' (mirrors lib/categorize.js#buildIndex pattern)."
  - "newLibraryEntry validation throws (does not return result objects): callers passing bad categories or bad name are programmer errors, not user-input errors. extractAndSeed (Plan 3) and route handlers will validate user input before calling."
  - "Within-entry alias dedup keeps first-occurrence form so curator-visible casing/wording is preserved (e.g. ['Garlic', 'garlic'] -> ['Garlic'])."
  - "Test corpus assertion for the synthetic 'a (b (c)) d' case corrected from 'a d' to 'd' -- the article 'a' is documented as a quantity prefix and the locked operation order (paren-strip THEN quantity-strip) makes 'd' the correct output."
metrics:
  duration: ~25 min
  completed: 2026-05-06
tasks_completed: 3
tasks_total: 3
---

# Phase 2 Plan 1: Normalize + Validate Library Helpers Summary

Land the locked normalization pipeline in `lib/library.js`, repoint `aliasKey` onto it so `aliasConflict` automatically inherits the full normalization, inline `escapeRegex` for Wave 2's regex builder, and close Phase 1 review carryovers WR-04 (category validation), IN-01 (defensive aliases copy), IN-02 (require/trim name), plus WR-03 (within-entry alias dedup).

## What Shipped

### Public API additions to `lib/library.js`

- **`normalizeIngredientText(s)`** — exported. Returns the canonical match key for an ingredient string. Five-step locked order: (1) lowercase + initial trim, (2) strip parentheticals (D-14, iterated for nested groups), (3) strip trailing-comma tail (D-15, first comma wins), (4) strip leading quantity/unit/of chunk (D-13), (5) collapse whitespace + final trim. No singular/plural stemming (D-16). Empty/whitespace/non-string input returns `''`.
- **`newLibraryEntry({...})`** — same signature, now throws on:
  - missing/whitespace/non-string `name` (IN-02)
  - `recipeCategory` not in `RECIPE_CATEGORIES` (WR-04)
  - `groceryCategory` not in `GROCERY_CATEGORIES` (WR-04)
  - Side effects: trims `name` before storage (IN-02), defensively copies `aliases` (IN-01), dedupes within-entry aliases by normalized key (WR-03 closure).

### Module-internal additions

- **`UNIT_TOKENS`** (module-level constant) — initial set of unit/measure words and count words (`'cup'`, `'tablespoons'`, `'cloves'`, `'pinch'`, etc.) that the quantity-strip step removes after a leading numeric chunk. Bare articles `'a'`/`'an'` also count as quantity prefixes.
- **`escapeRegex(s)`** — inlined copy of `lib/categorize.js`'s helper. **Not** imported. Phase 1's "import direction enforced" rule keeps the library -> categorize edge unidirectional.
- **`UNIT_PATTERN`** + **`QTY_RE`** — precompiled at module load. `UNIT_PATTERN` sorts UNIT_TOKENS longest-first so `'tablespoons'` matches before `'tbs'`. `QTY_RE` is anchored at start with bounded alternations (no nested quantifiers — ReDoS-safe).
- **`aliasKey(s)`** — repointed to a one-line shim over `normalizeIngredientText`. Existing `aliasConflict` body unchanged; it now automatically uses the full pipeline.

### `module.exports` shape

Phase 1: `{ newLibraryId, newLibraryEntry, aliasConflict }`
Phase 2 Plan 1: `{ newLibraryId, newLibraryEntry, normalizeIngredientText, aliasConflict }`

(Plans 2 and 3 will further grow this to include `findEntryByText` and `extractAndSeed`.)

## Tests Added

- **21 new tests** in `test/library.test.js` (15 -> 36):
  - `normalizeIngredientText`: empty/non-string handling (5 cases), lowercase+trim, paren strip (incl. nested), comma cut (first-wins), leading qty/unit/of (8 forms), no singular/plural stemming, whitespace collapse, full-pipeline locked-order proof, SC#1 equivalence, paren-then-quantity, ~12-case real-world corpus.
  - `newLibraryEntry` validation: WR-04 throws on bad recipeCategory + bad groceryCategory (incl. undefined/empty/numeric), IN-02 throws on missing/whitespace/non-string name, IN-02 trims stored name, IN-01 defensive aliases copy, WR-03 within-entry dedup by normalized key.
  - `aliasConflict` messy-input cases (D-05 deferred from Phase 1): query normalization, stored-alias normalization, distinguishing `'garlic'` from `'garlic powder'` (no stemming collisions).
- **Whole-suite count:** 198 -> 219 tests, 0 failures.

## Carryovers Closed

| ID | From | What it was | Closed by |
|---|---|---|---|
| WR-03 | 01-REVIEW.md | within-entry alias dedup not enforced in `newLibraryEntry` | Set-keyed dedup in Task 2; first-occurrence preserved for display. |
| WR-04 | 01-REVIEW.md | `newLibraryEntry` accepted any string for recipeCategory/groceryCategory | `RECIPE_CATEGORIES.includes(...)` + `GROCERY_CATEGORIES.includes(...)` validation throws Error. |
| IN-01 | 01-REVIEW.md | aliases stored by reference, caller post-construction mutation leaked | Defensive copy via dedup loop produces a fresh array. |
| IN-02 | 01-REVIEW.md | name not trimmed, no required-name check | `(typeof name === 'string' ? name : '').trim()` + throw on empty. |
| D-05 deferred | 01-CONTEXT.md | aliasConflict normalization was trim+lowercase only -- messy input cases not exercised | aliasKey shim repoint + new messy-input tests. |

## Commits

| Hash | Type | Description |
|---|---|---|
| `b76c0a6` | feat | add normalizeIngredientText pipeline + repoint aliasKey shim |
| `61fb258` | feat | validate newLibraryEntry input + IN-01 alias copy + IN-02 name trim |
| `58ae499` | test | add normalizeIngredientText corpus + WR-04 validation + messy aliasConflict tests |

## Verification

- `npm test` -> 219/219 pass (was 198 before this plan; +21 new library tests).
- `lib/library.js` contains `function normalizeIngredientText(`, `function escapeRegex(`, and `const UNIT_TOKENS` (verified via grep).
- `lib/library.js` requires only `RECIPE_CATEGORIES, GROCERY_CATEGORIES` from `./categorize` -- escapeRegex is NOT imported (verified: only one `require('./categorize')` occurrence, on line 20, destructuring the two category constants).
- `aliasKey` is a one-line shim: `function aliasKey(s) { return normalizeIngredientText(s); }`.
- `module.exports` lists `normalizeIngredientText` alongside Phase 1 exports.
- Existing Phase 1 `aliasConflict` tests at `test/library.test.js:72-136` still pass after the shim repoint -- regression-free.
- SC#1 equivalence assertion present (`normalizeIngredientText('2 cups of Garlic Cloves (minced)') === normalizeIngredientText('garlic cloves')` -> both = `'garlic cloves'`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected synthetic-corpus test expectation for nested-paren case**
- **Found during:** Task 1 smoke-testing the implementation.
- **Issue:** The plan's Task 3 specified `assert.strictEqual(normalizeIngredientText('a (b (c)) d'), 'a d')`. The locked operation order (paren-strip then quantity-strip) makes the actual output `'d'` because the article `'a'` is a documented quantity prefix in `UNIT_TOKENS` (CONTEXT D-13: bare `'a'`/`'an'` count as quantity prefixes), so step (4) consumes `'a '` as a leading quantity chunk, leaving `'d'`. The implementation is correct -- the planner's expectation didn't account for the article-strip interaction with the synthetic test string.
- **Fix:** Updated the test to assert the correct value `'d'` and added an inline comment explaining the interaction. The synthetic case was retained because it still proves the iterated nested-paren strip works (both `(c)` and `(b )` get collapsed across passes).
- **Files modified:** `test/library.test.js` (one assertion + comment block in the "strips parentheticals" test).
- **Commit:** `58ae499`.
- **Why this is Rule 1 not Rule 4:** The fix is a one-line test-assertion correction that aligns the test with the documented and implemented contract. No architectural change; no scope expansion. The behavior is what the plan's behavior list and CONTEXT D-13 actually specify.

No other deviations.

## Authentication Gates

None encountered. Plan 1 is a pure helper module with no I/O, no auth surface.

## Known Stubs

None. All functions added are fully implemented and tested.

## Threat Flags

None. Plan 1's threat register (T-02-01-01 ReDoS, T-02-01-02 off-list categories, T-02-01-03 alias mutation leakage) is fully mitigated:
- ReDoS: paren-strip uses bounded `\([^()]*\)` (no nested quantifiers); QTY_RE has bounded alternations; both regexes anchored or globally non-backtracking.
- Off-list categories: WR-04 validation in `newLibraryEntry` throws.
- Alias mutation leakage: IN-01 defensive copy via dedup loop produces a fresh array.

No new security-relevant surface introduced beyond the plan's threat model.

## Next Up

- **Wave 2 (Plan 02-02):** `findEntryByText` -- builds `escapeRegex`-based per-entry regexes from each library entry's normalized aliases. Will use `UNIT_TOKENS`, `escapeRegex`, and `normalizeIngredientText` from this plan.
- **Wave 3 (Plan 02-03):** `extractAndSeed` -- becomes the first auto-caller of `newLibraryEntry`. The WR-04 validation landed here protects it from creating off-list-category entries.

## Self-Check: PASSED

Verified:
- `lib/library.js` exists at `.claude/worktrees/agent-a8d8e658b663a7b27/lib/library.js` and contains `normalizeIngredientText`, `escapeRegex`, `UNIT_TOKENS`, validated `newLibraryEntry`.
- `test/library.test.js` exists at the same worktree path with 36 tests (15 Phase 1 + 21 Phase 2 Plan 1).
- Commits `b76c0a6`, `61fb258`, `58ae499` all present in `git log` of the worktree branch `worktree-agent-a8d8e658b663a7b27`.
- `npm test` exits 0 with 219/219 passing.
