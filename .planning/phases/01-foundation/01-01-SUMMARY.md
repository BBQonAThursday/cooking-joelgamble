---
phase: 01-foundation
plan: "01"
subsystem: storage, categorize, library
tags: [foundation, migration, pea-bug-fix, library-skeleton, atomic-commit]
dependency_graph:
  requires: []
  provides: [state.library, state.libraryMigratedAt, lib/library.js, pea-bug-fix]
  affects: [lib/storage.js, lib/categorize.js]
tech_stack:
  added: [lib/library.js]
  patterns: [factory-function, explicit-plural-keywords, bilateral-word-boundary-regex]
key_files:
  created:
    - lib/library.js
    - test/library.test.js
  modified:
    - lib/storage.js
    - lib/categorize.js
    - test/storage.test.js
    - test/categorize.test.js
decisions:
  - "D-01: Bilateral \\b{kw}\\b regex in buildIndex eliminates entire class of prefix-misfires"
  - "D-02: Explicit plural keywords added to RECIPE_KEYWORDS and GROCERY_KEYWORDS for deterministic matching"
  - "D-03: Test renamed from 'handles plurals via prefix match' to 'handles plurals via explicit keywords'"
  - "D-04: aliasConflict uses trim+toLowerCase only; full normalizeIngredientText is Phase 2"
  - "D-05: Phase 1 tests use clean alias inputs only; messy-input tests deferred to Phase 2"
  - "D-06: newLibraryEntry factory returns exact 7-field shape as single source of truth"
  - "D-07: JSDoc @typedef LibraryEntry documents shape; no frozen template constant"
  - "D-08: No nutrition placeholder in v1 entry shape; confirmed by explicit test"
  - "D-09: migrate() uses Array.isArray mirror pattern for library; no per-entry validation"
  - "D-10: libraryMigratedAt preserves ISO string; coerces all non-string values to null"
  - "D-11: newLibraryId mirrors newGroceryId pattern with lb_ prefix + 8 base36 chars"
  - "D-12: All six files ship in ONE atomic commit; no intermediate state"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-05"
  tasks_completed: 3
  files_changed: 6
---

# Phase 1 Plan 01: Foundation Summary

**One-liner:** State schema extended with library/libraryMigratedAt, pea-prefix regex bug fixed with bilateral word boundaries and explicit plural keywords, and lib/library.js skeleton (newLibraryId, newLibraryEntry, aliasConflict) shipped atomically in one commit.

## Files Modified

### lib/storage.js
- `defaultState()` extended: added `library: []` and `libraryMigratedAt: null`
- `migrate()` extended: added `Array.isArray(merged.library)` coercion and `typeof merged.libraryMigratedAt !== 'string'` coercion
- `module.exports` unchanged (still exports `get, save, replace, reset, defaultState, migrateForTest, _resetForTest`)

### lib/categorize.js
- `buildIndex` regex fixed: changed from `'\\b' + escapeRegex(kw.toLowerCase())` to `'\\b' + escapeRegex(kw.toLowerCase()) + '\\b'` (bilateral word boundary)
- `RECIPE_KEYWORDS.Protein`: added `eggs, lentils, chickpeas, peanut, peanuts, sausages, shrimps, prawns, crabs, scallops, oysters, mussels, clams, sardines, anchovies, beans`
- `RECIPE_KEYWORDS.Veg`: added `onions, shallots, leeks, scallions, green onions, tomatoes, potatoes, sweet potatoes, yams, carrots, bell peppers, jalapenos, habaneros, mushrooms, green beans, peas, beets, radishes, turnips, parsnips, artichokes, brussels sprouts, lemons, limes, oranges, apples, mangoes, bananas, avocados, raisins, dates, cranberries, peppers` (and more)
- `RECIPE_KEYWORDS.Seasoning`: added `peppercorns, cloves, bay leaves`
- `GROCERY_KEYWORDS.Produce`: added plural forms for all produce keywords
- `GROCERY_KEYWORDS.Meat`: added plural forms for all seafood/meat keywords
- `GROCERY_KEYWORDS.Dairy`: added `eggs`
- `GROCERY_KEYWORDS.Aisle`: added `noodles, tortillas, lentils, chickpeas, cloves, beans`

### lib/library.js (NEW)
- Exports `newLibraryId`, `newLibraryEntry`, `aliasConflict` (Phase 1 scope only)
- Pure module: no fs/http imports, no module-level state, no `_resetForTest` needed
- `newLibraryId()` mirrors `newGroceryId()`: `'lb_' + Math.random().toString(36).slice(2, 10)`
- `newLibraryEntry()` factory returns canonical 7-field shape with defaults for `aliases` and `curated`
- `aliasConflict()` uses trim+toLowerCase normalization; supports `excludingId` for edit-without-self-conflict
- JSDoc `@typedef LibraryEntry` documents shape for editor tooling

### test/storage.test.js
- Appended 7 new migration tests covering library/libraryMigratedAt default, preservation, coercion, and pre-Phase-1 state backward compatibility

### test/categorize.test.js
- Renamed test: "handles plurals via prefix match" -> "handles plurals via explicit keywords" (added mushrooms, carrots, peas assertions)
- Appended 5 pea-bug regression tests: `peanut butter -> Aisle`, `peanut butter not Veg`, `peanuts -> Protein`, `pea does not match peanut`, `plurals still work after fix`

### test/library.test.js (NEW)
- 15 unit tests covering newLibraryId (format, uniqueness), newLibraryEntry (shape, defaults, no-nutrition, timestamp), and aliasConflict (positive conflict, case/whitespace insensitivity, no match, excludingId-only returns falsy, excludingId-still-finds-other, no-library-array tolerance, empty alias input)

## Test Counts

| File | New Tests | Notes |
|------|-----------|-------|
| test/storage.test.js | +7 | library/libraryMigratedAt migration cases |
| test/categorize.test.js | +5 | pea-bug regression + plural-via-explicit-keywords |
| test/library.test.js | +15 (new file) | newLibraryId, newLibraryEntry, aliasConflict |
| **Total** | **+27** | All 198 tests pass (npm test exits 0) |

## Requirements Satisfied

| Requirement | Status | Notes |
|-------------|--------|-------|
| FND-01 | Complete | state.library and libraryMigratedAt in defaultState + migrate |
| FND-02 | Complete | lib/library.js exports newLibraryId, newLibraryEntry, aliasConflict |
| FND-03 | Partial (Phase 1 scope) | aliasConflict + newLibraryEntry only; normalizeIngredientText/findEntryByText/extractAndSeed deferred to Phase 2 |
| FND-04 | Complete | Pea-prefix bug fixed; groceryCategoryOf('peanut butter') === 'Aisle' verified by regression test |

## Decision Coverage (D-01..D-12)

All 12 decisions satisfied. See frontmatter `decisions` field for per-decision notes.

## Atomicity (D-12)

All six source/test files ship in ONE git commit as required by D-12. No intermediate commits.

## ROADMAP Success Criteria

| SC | Description | Status |
|----|-------------|--------|
| SC#1 | migrate() adds library:[] and libraryMigratedAt:null without destroying existing data | PASS (7 storage tests) |
| SC#2 | lib/library.js exports newLibraryId, newLibraryEntry (factory), aliasConflict | PASS (15 library tests) |
| SC#3 | aliasConflict returns truthy on collision; falsy when only match is excludingId | PASS (dedicated tests) |
| SC#4 | groceryCategoryOf('peanut butter') === 'Aisle' | PASS (explicit regression test) |
| SC#5 | Server starts cleanly against pre-migration state | PASS (storage test + manual verification) |

## Deviations from Plan

None - plan executed exactly as written. All 27 new tests added as specified. Regex fix applied to exactly one line as specified. No extra exports or fields added.

## Phase 2 Notes

Phase 2 must implement:
- `normalizeIngredientText` (full normalization: strip quantities, parens, extra words)
- `findEntryByText(state, text)` - looks up an ingredient string against library entries
- `extractAndSeed(state, ingredients)` - auto-seeds library from recipe ingredients
- Replace trivial `aliasKey` (trim+toLowerCase) in `aliasConflict` with full `normalizeIngredientText`
- Add messy-input test cases for `aliasConflict` (e.g. `'2 cloves garlic, minced'`)
- Add optional `library` parameter to `recipeCategoryOf`/`groceryCategoryOf` for library-first matching (Phase 3)

## Self-Check

Files created/modified:
- lib/storage.js - FOUND
- lib/categorize.js - FOUND
- lib/library.js - FOUND (new)
- test/storage.test.js - FOUND
- test/categorize.test.js - FOUND
- test/library.test.js - FOUND (new)
- .planning/phases/01-foundation/01-01-SUMMARY.md - FOUND (this file)

npm test: 198 tests, 0 failures - PASSED

Manual SC#5 verification: {"recipes":1,"library":[],"libraryMigratedAt":null} - PASSED

## Self-Check: PASSED
