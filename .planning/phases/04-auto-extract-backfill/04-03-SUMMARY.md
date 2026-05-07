---
plan: 04-03
phase: 04-auto-extract-backfill
status: complete
completed: 2026-05-07
requirements: [EXTR-01]
tasks_completed: 2
files_changed:
  - routes/recipes.js (modified — POST hook + new import)
  - test/recipes.test.js (extended — 3 new SC#1 tests appended)
tests_added: 3
tests_total_after: 297
self_check: PASSED
---

# Plan 04-03 Summary — POST /recipes auto-extract hook

## Objective

Wire `extractAndSeed` into the live `POST /recipes` handler. Insert a
nested try/catch hook between the existing `storage.save()` and `setToast`
(D-46). The hook calls `libraryMod.extractAndSeed(state, entry.ingredients)`,
triggers a SECOND `storage.save()` ONLY when added or aliases were appended
(D-47, SC#1), and absorbs any throw via `console.error('[extract] ...')` so
the recipe-save success toast is preserved (D-48). Hook fires on BOTH the
create branch (`existingIdx < 0`) and the update branch (`existingIdx >= 0`)
because it's placed after the if/else block (D-49).

## Tasks

### Task 1 — RED tests (3 new SC#1 tests)

Appended at the end of `test/recipes.test.js` (after the existing 13 tests
which remain byte-identical per D-51):

| Test | SC | Coverage |
|------|----|----------|
| POST /recipes seeds state.library via auto-extract hook | SC#1a | new save grows library |
| POST /recipes second save with same URL does NOT regrow library | SC#1b | D-49 update-path symmetry, D-47 conditional save |
| POST /recipes still saves and toasts Saved when extractAndSeed throws | D-48 | best-effort failure mode |

Committed at `2835544`. RED state: 295/297 passing — SC#1a and SC#1b fail
as expected (POST hook not yet implemented).

### Task 2 — GREEN implementation

Two edits to `routes/recipes.js`:

1. **New import (line 7-10)** — module reference idiom:
   ```javascript
   // Module reference (not destructured) so test/recipes.test.js's D-48
   // monkey-patch (libraryMod.extractAndSeed = ...) takes effect — mirrors
   // the scrapeMod idiom used at line 3 of this file.
   const libraryMod = require('../lib/library');
   ```

2. **Nested try/catch hook (lines 48-56)** — between the existing
   `storage.save()` at line 46 and `setToast(...)` at line 58:
   ```javascript
       // [PHASE 4 EXTR-01] Auto-extract: synchronous, best-effort (D-46/D-47/D-48).
       try {
         const extractResult = libraryMod.extractAndSeed(state, entry.ingredients);
         if (extractResult.added.length || extractResult.aliasesAppended.length) {
           storage.save();
         }
       } catch (err) {
         console.error('[extract] failed for recipe', entry.id, err.message);
       }
   ```

Committed at `2fac444`. GREEN state: 297/297 passing.

## Acceptance criteria — verification

| Check | Result |
|-------|--------|
| `require\('\.\./lib/library'\)` in routes/recipes.js | 1 match ✓ |
| `extractAndSeed\(state, entry\.ingredients\)` (call site, accessed via `libraryMod`) | 1 match ✓ |
| `extractResult\.added\.length \|\| extractResult\.aliasesAppended\.length` | 1 match ✓ |
| `const result = extractAndSeed` (Pitfall 2 — variable shadowing) | 0 matches ✓ |
| `console\.error\('\[extract\] failed for recipe'` | 1 match ✓ |
| `grep -c "storage.save()"` | 3 ✓ (2 in POST + 1 in DELETE) |
| `grep -c "next(err)"` | 1 ✓ (only outer catch) |
| `grep -c "^\s*} catch"` | 2 ✓ (inner + outer) |
| `setToast(res, \`${toastVerb}: ${entry.title}\`)` unchanged | confirmed ✓ |
| `npm test` exit code | 0 (297/297) ✓ |
| Test count in test/recipes.test.js | 16 ✓ (13 + 3 new) |
| GET and DELETE handlers byte-identical | confirmed ✓ |

## Deviation

**`routes/recipes.js` uses `const libraryMod = require('../lib/library')`
(module reference) instead of `const { extractAndSeed } = require(...)`
(destructured) per PATTERNS.md Section 3.**

**Reason:** The SC#1c (D-48) test monkey-patches
`libraryMod.extractAndSeed = () => { throw ... }`. With destructured imports,
the patched function is never called by the route handler — the test would
pass vacuously without actually exercising the inner catch path. The
module-reference pattern mirrors the established `scrapeMod` idiom at line 3
of the same file, where the same test pattern (mutating the cached export)
is already in production use for `scrapeMod.scrape`.

**Acceptance impact:** None. The plan's grep checks for
`require\('\.\./lib/library'\)` (matches), and there is no plan check for
"extractAndSeed must be a destructured import" — only that the call site
uses `extractAndSeed(state, entry.ingredients)`, which it does (via
`libraryMod.extractAndSeed(...)`).

## Inner catch scope (Pitfall 3 honored)

The inner `try { ... } catch { ... }` block contains exactly:
- One call to `libraryMod.extractAndSeed`
- One conditional `storage.save()`

`setToast`, `respondWithUpdates`, and the recipe-save `storage.save()` at
line 46 are all OUTSIDE the inner try. Pre-line-46 throws (scrape,
validation) and post-hook throws (render-time failures) still hit the
outer catch and route to `next(err)` → HTTP 500. The success toast at
line 58 can ONLY be reached when the recipe-save at line 46 succeeded.

## Test counts

- **test/recipes.test.js:** 16 (13 existing + 3 appended)
- **test/backfill.test.js:** 10 (from Plan 04-01)
- **Full suite:** 297/297 passing

## Self-Check

- [x] POST /recipes calls extractAndSeed with nested try/catch
- [x] Second `storage.save()` is conditional on
  `extractResult.added.length || extractResult.aliasesAppended.length`
- [x] Throws absorbed via `console.error` — outer 200/toast preserved
- [x] New local named `extractResult` (Pitfall 2 — no shadowing of `result`)
- [x] GET and DELETE handlers unchanged
- [x] Existing 13 recipes.test.js tests byte-identical (D-51)
- [x] Atomic commits per task (RED at 2835544, GREEN at 2fac444)

**Self-Check: PASSED**
