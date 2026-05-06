---
phase: 03-categorization-layering
verified: 2026-05-06T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 3: Categorization Layering Verification Report

**Phase Goal:** Every render of a recipe ingredient list or grocery item uses library aliases first, falls back to the heuristic keyword tables, and attaches the matched library entry id to grocery items so the Fix shortcut knows which entry to open.
**Verified:** 2026-05-06
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### ROADMAP Success Criteria Verdict

| SC  | Description | Status | Evidence |
| --- | ----------- | ------ | -------- |
| SC#1 | `recipeCategoryOf('peanut butter', state.library)` returns the library entry's `recipeCategory` when the library has a curated "peanut butter" entry — not the heuristic | VERIFIED | `lib/categorize.js:303-323` (libraryOrIndex first-match-wins, returns `match.recipeCategory` directly per D-26/D-27); behavioral probe with curated entry returned `Flavor` (library) vs heuristic `Protein`; both raw-library and pre-built-index forms produce identical result; `test/categorize.test.js` test "recipeCategoryOf SC#1 ergonomics: library array form works (peanut butter)" |
| SC#2 | `recipeCategoryOf('peanut butter')` (no library arg) still returns the heuristic result — existing callers unaffected | VERIFIED | Single-arg path at `lib/categorize.js:322` falls through to `matchCategory(RECIPE_INDEX, text)` when libraryOrIndex is falsy; behavioral probe returned `Protein` (heuristic); 25 pre-existing categorize tests are byte-identical and pass |
| SC#3 | `buildGroceryView(state)` attaches `libraryEntryId` (non-null id string) to each item matching a library entry, and `null` for items with no library match | VERIFIED | `lib/calc.js:81-127` — both unchecked-loop (line 102) and closedItems map (line 112-115) attach `libraryEntryId`; behavioral probe: matched item `g_a` → `lb_onion`, unmatched item `g_b` → `null` (strict `=== null`); test `buildGroceryView D-32: library hit attaches libraryEntryId and library-driven category` and `buildGroceryView D-32: checked (closed) items also carry libraryEntryId` both pass |
| SC#4 | `decorateIngredients(ingredients, state.library)` returns ingredients grouped by the library-first category — a recipe re-render after editing a library entry immediately reflects the updated category | VERIFIED | `lib/calc.js:151-175` — index built fresh per call (D-33 at line 153-155); behavioral probe simulating user-edit: same input `'1 onion'` returned `Other` (first lib) then `Veg` (updated lib) without intermediate caching; `routes/recipes.js:64` passes `state.library` per render; `views/recipe.njk:24` reads `ing.text` so per-render results flow to the page |
| SC#5 | All existing `test/categorize.test.js` and `test/calc.test.js` tests pass without modification (with formally-evolved exception: 6 authorized line edits in calc.test.js per SC#5/D-31 resolution 2026-05-06) | VERIFIED | `npm test` passes 284/284. `git diff c41ea29..HEAD -- test/categorize.test.js` shows zero deletions (only one import-line addition + entirely new test blocks). `git diff c41ea29..HEAD -- test/calc.test.js` shows exactly 6 deletions matching the authorized assertion edits. `git diff c41ea29..HEAD -- test/library.test.js` shows ONLY one cosmetic comma+newline import-list reformat (no test logic deleted). The 12 pre-existing findEntryByText tests and 12 pre-existing normalizeIngredientText tests in library.test.js are byte-identical |

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `normalizeIngredientText` is MOVED to `lib/categorize.js` (source-of-truth); `lib/library.js` imports + re-exports for back-compat (per 03-REVISION-1 Approach A) | VERIFIED | `grep "function normalizeIngredientText" lib/categorize.js` → 1 match (line 132); `grep "function normalizeIngredientText" lib/library.js` → 0 matches; `node -e "require('./lib/library').normalizeIngredientText === require('./lib/categorize').normalizeIngredientText"` returns `true` |
| 2 | `buildLibraryIndex(library)` returns rows sorted (length DESC, curated DESC, arrayIndex ASC) carrying `{ regex, length, curated, arrayIndex, entry, recipeCategory, groceryCategory }` | VERIFIED | `lib/library.js:185-213`; tests "buildLibraryIndex builds one row per non-empty alias with the documented shape" and "buildLibraryIndex sort order: length DESC, curated DESC, arrayIndex ASC" both pass; comparator at line 165-169 |
| 3 | `findEntryInIndex(index, text)` returns the matched entry on first hit (first-match-wins) or undefined on no match / non-string / empty text | VERIFIED | `lib/library.js:226-233`; 6 dedicated tests including "findEntryInIndex returns the matched entry with id, recipeCategory, groceryCategory (MATCH-03)" |
| 4 | `findEntryByText(state, text)` is rewritten as a thin wrapper over `findEntryInIndex(buildLibraryIndex(library), text)` — public contract preserved | VERIFIED | `lib/library.js:259-264` (4-line wrapper); 12 pre-existing Phase 2 findEntryByText tests pass without modification |
| 5 | `recipeCategoryOf` and `groceryCategoryOf` accept optional `libraryOrIndex` (raw array OR pre-built index) — single-arg form behaves byte-identically | VERIFIED | `lib/categorize.js:303-323` (recipeCategoryOf), `lib/categorize.js:330-347` (groceryCategoryOf); discriminator `isPreBuiltLibraryIndex` at line 233-235 distinguishes shapes; 15 new tests cover both forms; 25 pre-existing tests pass |
| 6 | Library hit returns entry's category directly even when `'Other'` (D-28: does NOT fall through to heuristic) | VERIFIED | `lib/categorize.js:317-319` — returns `match.recipeCategory` whenever it's a string (no value-filter); test "recipeCategoryOf D-28: library 'Other' does NOT fall through to heuristic" passes |
| 7 | D-35 keyword regression closure: `'pepper'`/`'peppers'` removed from RECIPE_KEYWORDS.Veg; bare `'pepper'` removed from GROCERY_KEYWORDS.Aisle; `'pepper'`/`'peppers'` added to GROCERY_KEYWORDS.Produce | VERIFIED | `lib/categorize.js:27-29` (Veg comment-only entry showing removal); `lib/categorize.js:177` (Produce now contains `'pepper','peppers'`); `lib/categorize.js:198` (Aisle reads `'salt','sugar','brown sugar'...` — bare `'pepper'` gone); behavioral probe: black pepper → Seasoning, peppers → Produce, bell peppers → Veg/Produce |
| 8 | `lib/categorize.js` does NOT require `lib/library.js` (import-direction rule preserved) | VERIFIED | `grep "require\(['\"]\./library['\"]\)" lib/categorize.js` → 0 matches; only `lib/calc.js` requires `./library` (line 3) |
| 9 | `buildGroceryView` builds the library index ONCE per render via `buildLibraryIndex(state.library)` (D-33); D-34 defensive guard skips build when library missing/empty/non-array | VERIFIED | `lib/calc.js:89-91` (single build with defensive guard); shared `libraryIndex` reused for unchecked loop (line 96) and closedItems map (line 113); test "buildGroceryView D-34 defensive guard: undefined / null / non-array library does not crash" passes |
| 10 | `decorateIngredients(ingredients, library?)` builds index once at top, returns `{ text, libraryEntryId }` items (NOT bare strings); `libraryEntryId` is null on no library / no match | VERIFIED | `lib/calc.js:151-175` — single index build at lines 153-155, item shape at line 167; tests "decorateIngredients D-31: items with library match are { text, libraryEntryId }" and "decorateIngredients D-31: empty library produces { text, libraryEntryId: null } items" both pass |
| 11 | `routes/recipes.js#GET /recipes/:id` passes `state.library` to `decorateIngredients` | VERIFIED | `routes/recipes.js:64` reads `decorateIngredients(recipe.ingredients, state.library)`; `state` already in scope from line 52 |
| 12 | `views/recipe.njk` line 24 reads `{{ ing.text }}` (was `{{ ing }}`) so the new item-object shape renders as expected | VERIFIED | `views/recipe.njk:24` reads `<li>{{ ing.text }}</li>`; `grep "{{ ing }}" views/` → 0 matches across all templates |
| 13 | MATCH-03: `findEntryInIndex` returns the matched entry including its `id` so the Fix shortcut knows which entry to open | VERIFIED | `lib/library.js:226-233` returns `row.entry` (the full library entry, with `id` + categories); behavioral probe confirmed `match.id === 'lb_garlic'` and `match.recipeCategory`/`groceryCategory` accessible |

**Score:** 13/13 supporting truths verified | 5/5 ROADMAP success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/categorize.js` | normalizeIngredientText source-of-truth + library-aware signatures + D-35 fixes | VERIFIED | 355 lines; UNIT_TOKENS / UNIT_PATTERN / QTY_RE / normalizeIngredientText present (lines 65-152); isPreBuiltLibraryIndex + matchRawLibrary helpers (lines 233-279); recipeCategoryOf + groceryCategoryOf extended (lines 303-347); D-35 keyword tables edits all in place; module.exports includes normalizeIngredientText |
| `lib/library.js` | buildLibraryIndex + findEntryInIndex exports; findEntryByText wrapper; D-36 normalize at index-build site | VERIFIED | 398 lines; imports normalizeIngredientText from ./categorize (line 20); buildLibraryIndex at 185-213 calls normalizeIngredientText(alias) at line 198; findEntryInIndex at 226-233; findEntryByText wrapper at 259-264; module.exports has all 8 expected symbols |
| `lib/calc.js` | View-builders thread library; index built once per render | VERIFIED | 177 lines; imports buildLibraryIndex + findEntryInIndex (line 3); buildGroceryView library-aware (lines 81-127); decorateIngredients accepts optional library arg (lines 151-175); module.exports unchanged |
| `routes/recipes.js` | GET /recipes/:id passes state.library to decorateIngredients | VERIFIED | Line 64: `ingredientGroups: decorateIngredients(recipe.ingredients, state.library)` |
| `views/recipe.njk` | Ingredient loop reads ing.text | VERIFIED | Line 24: `{% for ing in group.items %}<li>{{ ing.text }}</li>{% endfor %}` |
| `test/library.test.js` | +12 new tests for buildLibraryIndex (6) + findEntryInIndex (6); existing tests byte-identical | VERIFIED | 75 total tests (was 63 in Phase 2); only diff to existing tests is one cosmetic import-list reformat (`aliasConflict` → `aliasConflict,` to allow new imports on next line); 12 pre-existing normalizeIngredientText tests + 12 pre-existing findEntryByText tests intact and passing |
| `test/categorize.test.js` | +15 new library-priority + heuristic-fallback + D-35 + D-36 tests; existing 25 byte-identical | VERIFIED | 40 total tests (was 25); zero deletions in diff against c41ea29; only addition is one new import line + new test blocks at end |
| `test/calc.test.js` | +11 new tests; 6 authorized line edits per SC#5/D-31 resolution | VERIFIED | 35 total tests (was 24); diff shows exactly 6 deletions matching the authorized evolved assertions (5 in canonical-order test + 1 in preserves-order test); all assertions now use `{ text, libraryEntryId: null }` shape; minor note: actual line numbers in current file are 238-242 + 258 (off-by-one from plan's stated 237-241 + 257), but the 6 specific assertions targeted are exactly those documented in the SC#5/D-31 authorization |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `lib/library.js` | `lib/categorize.js#normalizeIngredientText` | module-load require | WIRED | `lib/library.js:20` destructures normalizeIngredientText alongside RECIPE_CATEGORIES etc. |
| `lib/library.js#findEntryByText` | `lib/library.js#buildLibraryIndex + findEntryInIndex` | wrapper composition | WIRED | `lib/library.js:263` reads `return findEntryInIndex(buildLibraryIndex(library), text);` |
| `lib/library.js#buildLibraryIndex` | `lib/categorize.js#normalizeIngredientText` | alias normalization at index-build site | WIRED | `lib/library.js:198` reads `const normalized = normalizeIngredientText(alias);` |
| `lib/categorize.js#recipeCategoryOf` | library index rows (.regex / .recipeCategory) | iterating the passed index | WIRED | `lib/categorize.js:309-310` iterates pre-built index; `lib/categorize.js:317-319` returns `match.recipeCategory` |
| `lib/categorize.js` | `lib/library.js` | NO require (import-direction rule) | NOT_WIRED (intentional) | `grep "require\(['\"]\./library['\"]\)" lib/categorize.js` → 0 matches. The library is supplied by the caller, mirroring shape via inline `matchRawLibrary` |
| `lib/calc.js` | `lib/library.js#buildLibraryIndex + findEntryInIndex` | module-load require + per-render call | WIRED | `lib/calc.js:3` imports both; `lib/calc.js:90` invokes buildLibraryIndex inside buildGroceryView; `lib/calc.js:154` invokes inside decorateIngredients |
| `lib/calc.js#buildGroceryView` | library-attached views | `{ ...item, libraryEntryId }` and `{ ...g, libraryEntryId }` spreads | WIRED | `lib/calc.js:102` (unchecked items) and `lib/calc.js:115` (closedItems) — both code paths attach the field |
| `lib/calc.js#decorateIngredients` | `{ text, libraryEntryId }` items | per-iteration push | WIRED | `lib/calc.js:167` reads `buckets.get(category).push({ text, libraryEntryId });` |
| `routes/recipes.js#GET /recipes/:id` | `lib/calc.js#decorateIngredients` | passing state.library as second arg | WIRED | `routes/recipes.js:64` |
| `views/recipe.njk` | decorateIngredients output shape | `ing.text` in the group.items loop | WIRED | `views/recipe.njk:24` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `views/recipe.njk` ingredient list | `recipe.ingredientGroups` | `decorateIngredients(recipe.ingredients, state.library)` from `routes/recipes.js:64` — reads from `storage.get()` which loads `state.recipes[].ingredients` and `state.library` from `data/state.json` | Yes — real recipes feed real ingredients into a real library | FLOWING |
| Grocery view (rendered via `routes/grocery.js`) | `view.categorizedGroups` + `view.closedItems` | `buildGroceryView(state)` reads `state.grocery` and `state.library` from disk-loaded state; library index built per render | Yes — real grocery items match against real library entries | FLOWING |
| `libraryEntryId` field on grocery items | `match.id` from `findEntryInIndex` | Library index built from real `state.library` array | Yes — non-null id when match found, null otherwise (verified by behavioral probe) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| SC#1 raw-library form | `recipeCategoryOf('peanut butter', state.library)` with curated 'peanut butter' Flavor entry | `Flavor` (library wins over heuristic `Protein`) | PASS |
| SC#1 pre-built-index form | `recipeCategoryOf('peanut butter', buildLibraryIndex(state.library))` | `Flavor` (identical to raw form) | PASS |
| SC#2 single-arg | `recipeCategoryOf('peanut butter')` | `Protein` (heuristic) | PASS |
| SC#3 matched item | `buildGroceryView(state)` with one matching grocery item | `libraryEntryId === 'lb_onion'` | PASS |
| SC#3 unmatched item | `buildGroceryView(state)` with one unmatched grocery item | `libraryEntryId === null` (strict equality) | PASS |
| SC#4 re-render reflects library edit | `decorateIngredients(['1 onion'], lib1)` then `decorateIngredients(['1 onion'], lib2)` with different recipeCategory | First call → group `Other`; second call → group `Veg` (no caching across calls) | PASS |
| SC#5 test suite | `npm test` | 284 passing, 0 failing | PASS |
| MATCH-03 entry shape | `findEntryInIndex(idx, '2 cloves garlic, minced')` | Returns `{ id: 'lb_garlic', name, aliases, recipeCategory, groceryCategory, curated, createdAt }` (full entry with id) | PASS |
| D-35 black pepper | `recipeCategoryOf('1 tsp black pepper')` | `Seasoning` (no longer false-Veg) | PASS |
| D-35 plain pepper | `groceryCategoryOf('peppers')` | `Produce` | PASS |
| D-35 bell peppers preserved | `recipeCategoryOf('2 red bell peppers')` | `Veg` | PASS |
| Import-direction rule | `grep "require\(['\"]\./library['\"]\)" lib/categorize.js` | 0 matches | PASS |
| Back-compat re-export | `lib.normalizeIngredientText === cat.normalizeIngredientText` | `true` (same function reference) | PASS |
| Server load | `node -e "process.env.RECIPE_BOX_DATA_DIR='./tmp_phase3_verify'; require('fs').mkdirSync('./tmp_phase3_verify', { recursive: true }); const app = require('./server'); console.log('ok');"` | `server loaded ok, type: object` (no crash) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| MATCH-01 | 03-02-PLAN | `recipeCategoryOf` and `groceryCategoryOf` accept optional `library` parameter; library aliases checked first; on no library hit, fall back to keyword tables; on no match, return 'Other' | SATISFIED | `lib/categorize.js:303-347`; 15 new categorize tests cover library-priority + heuristic-fallback + D-35 + D-36 BLOCKER closure; behavioral spot-checks pass; REQUIREMENTS.md line 19 marked closed by Plan 03-02 |
| MATCH-02 | 03-03-PLAN | `decorateIngredients(ingredients, library)` and `buildGroceryView(state)` thread the library through to the matcher; categorization computed fresh on every render (no precomputed category storage) | SATISFIED | `lib/calc.js:81-127, 151-175` (per-render index build at top of each builder); `routes/recipes.js:64` (state.library wired); `views/recipe.njk:24` (ing.text); 11 new calc tests including D-33 per-render-build invariant; REQUIREMENTS.md line 20 marked closed by Plan 03-03 |
| MATCH-03 | 03-01-PLAN | `lib/library.js#findEntryByText` returns the matched entry id (not just a category) so the inline Fix shortcut knows which entry to open | SATISFIED | `lib/library.js:226-233` (findEntryInIndex returns `row.entry`); `lib/library.js:259-264` (findEntryByText wrapper); behavioral probe confirms `match.id === 'lb_garlic'` accessible; libraryEntryId attached to grocery and recipe ingredient view items via Plan 03-03 wiring; REQUIREMENTS.md line 21 marked closed |

No orphaned requirements: REQUIREMENTS.md and ROADMAP.md both list exactly MATCH-01/MATCH-02/MATCH-03 for Phase 3. All three plan-declared requirement IDs are accounted for and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `lib/calc.js` | 102, 167 | `buckets.get(category).push(...)` without checking if bucket exists | Warning | If a library entry has an off-list category (e.g. from hand-edited state.json), the render would 500 — already flagged in 03-REVIEW.md WR-01. Not a Phase 3 goal blocker because the goal is library-first categorization, not robustness against malformed disk state |
| `routes/recipes.js` | 57-58 | `week.recipeIds.includes(...)` without Array.isArray guard | Warning | Pre-existing bug (not introduced by Phase 3) — flagged in 03-REVIEW.md WR-02. Would crash GET /recipes/:id only if state.json has a malformed week record |
| `lib/calc.js` | 96-101, 162-166 | Per-item double iteration (findEntryInIndex + categoryOf both walk the index) | Info | Performance optimization opportunity; flagged in 03-REVIEW.md IN-01. v1 scope explicitly defers performance work. Both walks return consistent results today (single-thread, no mid-render mutation) |
| `lib/library.js` | 316 | extractAndSeed rebuilds library index per ingredient | Info | Pre-existing; flagged in 03-REVIEW.md IN-02. Out of Phase 3 scope (touches Phase 4 callsite) |
| `lib/categorize.js` | 233-235 | `isPreBuiltLibraryIndex` uses structural-only discriminator (`.regex instanceof RegExp`) | Info | Flagged in 03-REVIEW.md IN-03. Future-schema risk only |
| `lib/library.js` | 32-34 | Inlined `escapeRegex` duplicates `lib/categorize.js#escapeRegex` | Info | Flagged in 03-REVIEW.md IN-04. Style nit; comment already documents intentional duplication |

None of the anti-patterns block the Phase 3 goal. They were already triaged in `03-REVIEW.md` (0 critical, 2 warning, 4 info).

### Human Verification Required

None. Phase 3 changes are pure data-shape and categorization logic verifiable through the test suite + behavioral probes. There is no new UI — `views/recipe.njk:24` is a single-token swap (`ing` → `ing.text`) verified by template grep + server-load smoke check; the `libraryEntryId` field is added to data structures but the FIX affordance that consumes it ships in Phase 6. Visual verification deferred until Phase 6 surface.

---

## Gaps Summary

No gaps. Every ROADMAP success criterion is satisfied with concrete evidence. Every requirement ID declared by a Phase 3 plan (MATCH-01, MATCH-02, MATCH-03) is satisfied. Every key link is wired. The full test suite passes (284/284, +38 vs Phase 2 baseline as predicted). The import-direction rule (`lib/categorize.js` does NOT require `lib/library.js`) is preserved. Render-time categorization is honored — the library index is built per render via `buildLibraryIndex(state.library)` in both `buildGroceryView` and `decorateIngredients`, with no precomputed category storage on items (per `CLAUDE.md` constraint).

The SC#5 formal evolution (6 authorized line edits in `test/calc.test.js`) is verified to be exactly the 6 documented assertions and nothing more — git diff against the pre-phase commit `c41ea29` shows zero deletions in `test/categorize.test.js`, only a cosmetic import-list reformat (no test-logic change) in `test/library.test.js`, and exactly the 6 expected `assert.deepStrictEqual` evolutions in `test/calc.test.js` (located at lines 238-242 + 258 in the current file, off-by-one from the plan's documented 237-241 + 257 line numbers — but the targeted assertions match exactly).

The 03-REVIEW.md warnings (WR-01, WR-02) are robustness concerns about malformed disk state (hand-edited `state.json`), not Phase 3 goal blockers. They are pre-existing trust-model assumptions ("single user, LAN-only") and do not affect any of the 5 ROADMAP success criteria.

---

_Verified: 2026-05-06T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
