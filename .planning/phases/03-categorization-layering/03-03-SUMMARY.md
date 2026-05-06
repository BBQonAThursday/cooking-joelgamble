---
phase: 03-categorization-layering
plan: 03
subsystem: lib/calc.js (view-models) + recipe render path
tags: [match-02, render-time-categorization, library-threading, view-model, d-31, d-32, d-33, d-34]
dependency_graph:
  requires:
    - 03-01 (lib/library.js#buildLibraryIndex + findEntryInIndex)
    - 03-02 (lib/categorize.js#recipeCategoryOf/groceryCategoryOf accept libraryOrIndex)
  provides:
    - lib/calc.js#buildGroceryView attaches libraryEntryId to every item view (unchecked + closed) and bucketizes via library-aware groceryCategoryOf
    - lib/calc.js#decorateIngredients(ingredients, library?) emits { text, libraryEntryId } items and bucketizes via library-aware recipeCategoryOf
    - routes/recipes.js#GET /recipes/:id passes state.library into decorateIngredients
    - views/recipe.njk ingredient loop reads ing.text
  affects:
    - All recipe detail pages (now library-first categorized)
    - Grocery list page (already used buildGroceryView; now library-first categorized + libraryEntryId on every item view)
tech-stack:
  added: []
  patterns:
    - Render-time index build (D-33): buildLibraryIndex called once at the top of each view-builder; per-item findEntryInIndex + library-aware categorize calls reuse the index
    - Defensive state guard (D-34): Array.isArray(state.library) && state.library.length > 0 — when missing/empty/non-array, skip the build and call categorize with no library arg, preserving pre-Phase-3 behavior byte-identically
    - null-vs-undefined normalization (D-31): findEntryInIndex returns undefined on no match; view-builders coerce match ? match.id : null so templates can reliably write {% if ing.libraryEntryId %}
key-files:
  created: []
  modified:
    - lib/calc.js (imports buildLibraryIndex/findEntryInIndex; buildGroceryView and decorateIngredients now library-aware)
    - routes/recipes.js (line 64: decorateIngredients(recipe.ingredients, state.library))
    - views/recipe.njk (line 24: {{ ing.text }} replaces {{ ing }})
    - test/calc.test.js (+11 new tests at end; 6 authorized assertion edits at lines 237-241 + 257 per SC#5/D-31 resolution)
decisions:
  - D-31: decorateIngredients items are { text, libraryEntryId } objects (not bare strings); libraryEntryId is null on no match
  - D-32: closed (checked) grocery items also carry libraryEntryId for Phase 6 FIX affordance
  - D-33: per-render index build at the top of each view-builder; O(library_size) build + O(items × library_size) match
  - D-34: defensive guard skips index build when state.library is missing/empty/non-array
metrics:
  duration_seconds: 211
  duration_human: "3m31s"
  tasks_completed: 4
  commits: 4
  tests_added: 11
  tests_modified: 6
  total_tests_passing: 284
  files_modified: 4
  completed: "2026-05-06T22:09:24Z"
---

# Phase 3 Plan 03: Library-Aware Render Path Summary

**One-liner:** lib/calc.js view-builders thread state.library through buildGroceryView and decorateIngredients with a once-per-render index build, attaching libraryEntryId to every grocery item view and emitting { text, libraryEntryId } recipe-ingredient items — the user-visible payoff for MATCH-02.

## What Shipped

### lib/calc.js — view-builders are library-aware

- New imports: `const { buildLibraryIndex, findEntryInIndex } = require('./library');`. First time `lib/calc.js` requires `lib/library.js`. Acyclic: `calc → library → categorize` (categorize stays library-free per the locked import direction rule).
- `buildGroceryView(state)` builds the library index ONCE at the top of the function via `buildLibraryIndex(state.library)` (D-33). The D-34 defensive guard (`Array.isArray(state.library) && state.library.length > 0`) skips the build when library is missing/empty/non-array, falling through to the heuristic-only categorize call (byte-identical to pre-Phase-3).
- Each unchecked item: `findEntryInIndex(libraryIndex, item.text)` → `match ? match.id : null` → spread as `{ ...item, libraryEntryId }`. Library-aware `groceryCategoryOf(item.text, libraryIndex)` when index built; legacy single-arg form when not.
- Each closed (checked) item: same shape per D-32. The Phase 6 FIX-01 affordance can render against checked items too.
- `decorateIngredients(ingredients, library)` accepts optional second arg in the raw `state.library` array form (matches SC#1 ergonomics). Builds the index once at top with the same D-34 guard, emits `{ text, libraryEntryId }` items per D-31 (NOT bare strings), categorizes via library-aware `recipeCategoryOf`.
- `module.exports` unchanged: `{ buildView, sourceDomain, formatTotalTime, buildWeeklyView, buildGroceryView, buildHistoryView, decorateIngredients }`. Signatures grew; symbol set is identical.

### routes/recipes.js — single-line call-site update

Line 64: `ingredientGroups: decorateIngredients(recipe.ingredients, state.library)`. `state` was already in scope at line 52 (`const state = storage.get();`); `decorateIngredients` was already imported at line 6. No new imports required. routes/grocery.js was untouched: `buildGroceryView(state)` reads `state.library` internally.

### views/recipe.njk — single-line template update

Line 24: `{% for ing in group.items %}<li>{{ ing.text }}</li>{% endfor %}`. `group.items` now contain `{ text, libraryEntryId }` objects per D-31. The `group` shape itself is unchanged. Phase 6 FIX-02 will later read `ing.libraryEntryId` on this same iteration to render the Fix affordance — already populated.

### test/calc.test.js — 11 new tests + 6 authorized line edits

**11 new tests appended at end:**

- 5 buildGroceryView tests: D-32 library hit attaches libraryEntryId + library-driven category beats heuristic; D-31 empty library yields null on every item; D-32 checked items carry libraryEntryId; D-34 defensive guard for undefined/null/non-array library; D-33 per-render index covers multiple items.
- 6 decorateIngredients tests: D-31 library match emits `{ text, libraryEntryId }`; D-31 empty library yields null; D-31 undefined library identical to single-arg call; D-28 'Other' library category beats heuristic Veg; null contract on bad/non-string ingredient entries; D-33 per-render-build invariant across multiple items + identical-output across consecutive calls.

**6 authorized line edits (per the SC#5/D-31 resolution, USER-AUTHORIZED 2026-05-06):**

The user explicitly authorized treating these 6 specific assertions as the one allowed test-shape evolution mandated by D-31. Every OTHER existing assertion in `test/calc.test.js`, every test in `test/categorize.test.js`, and every test in `test/library.test.js` remained byte-identical.

| Line | Test | Before | After |
|------|------|--------|-------|
| 237 | `decorateIngredients groups ingredients by recipe category in canonical order` | `assert.deepStrictEqual(groups[0].items, ['500g chicken thighs']);` | `assert.deepStrictEqual(groups[0].items, [{ text: '500g chicken thighs', libraryEntryId: null }]);` |
| 238 | (same test) | `['1 medium onion']` | `[{ text: '1 medium onion', libraryEntryId: null }]` |
| 239 | (same test) | `['1 tsp salt']` | `[{ text: '1 tsp salt', libraryEntryId: null }]` |
| 240 | (same test) | `['2 tbsp olive oil']` | `[{ text: '2 tbsp olive oil', libraryEntryId: null }]` |
| 241 | (same test) | `['something-uncategorized']` | `[{ text: 'something-uncategorized', libraryEntryId: null }]` |
| 257 | `decorateIngredients preserves item order within a group` | `['1 onion', '1 carrot', '1 tomato']` | `[{ text: '1 onion', libraryEntryId: null }, { text: '1 carrot', libraryEntryId: null }, { text: '1 tomato', libraryEntryId: null }]` |

The other assertions in those tests (`groups.map(g => g.category)`, `groups.length`, `decorateIngredients omits empty categories` body, `decorateIngredients tolerates empty/missing input` body) were not touched.

## Render-Time Index Build Pattern (D-33)

The most load-bearing structural decision in this plan. Mirror of `lib/categorize.js#buildIndex` but at render scope, not module scope:

- **Where:** at the top of `buildGroceryView` and `decorateIngredients`.
- **Cost:** `O(library_size)` for the index build + `O(items × library_size)` for matching. Same complexity profile as the existing heuristic path (just a slightly larger constant for the library walk).
- **Why per render and not per module:** `state.library` mutates (extractAndSeed will land in Phase 4; the Library tab in Phase 5 lets the user edit entries). A module-level cache would race with state mutations; the keyword tables in `lib/categorize.js` don't mutate, hence the difference in scope.
- **Why the defensive guard (D-34) matters:** uninitialized state files, legacy state files predating Phase 1, or transient empty libraries during testing. The guard `Array.isArray(state.library) && state.library.length > 0` ensures pre-Phase-3 behavior is preserved byte-identically when the library is absent — `npm test`'s pre-Phase-2 tests still passed without modification (modulo the 6 authorized D-31 line edits).

## D-34 Defensive Guard Confirmation

Both view-builders honor D-34 across four shapes:

| state.library | buildLibraryIndex called? | libraryEntryId on items |
|---|---|---|
| `undefined` (field missing) | No | `null` |
| `null` | No | `null` |
| `'not-an-array'` (or any non-array) | No | `null` |
| `[]` (empty array) | No | `null` |
| `[{...}]` (non-empty) | Yes | matched id, or `null` on no match |

Categorization in the first four cases falls through to the existing heuristic call (byte-identical to pre-Phase-3 behavior). This satisfies SC#5: every `buildGroceryView` test that doesn't include a `library` field continues to pass without modification.

## Authorized Test Evolution (SC#5/D-31)

`test/calc.test.js` is the only test file with shape-changing edits in this plan. The six edits listed above are the one explicit authorization the user gave for SC#5 (USER-AUTHORIZED 2026-05-06) — they are required by D-31's contract change (items in decorateIngredients groups are objects, not strings).

Confirmation:
- `test/categorize.test.js`: zero edits (all 28+15 tests from prior phases pass without modification).
- `test/library.test.js`: zero edits (all 12+12 tests from prior phases pass without modification).
- `test/calc.test.js` outside the 6 lines + 11 new tests: every other byte unchanged.

## Test Count Delta

- Pre-plan baseline: 273 (Phase 2 baseline 246 + Plan 03-01 +12 + Plan 03-02 +15).
- Plan 03-03 additions: +11 (5 buildGroceryView + 6 decorateIngredients).
- Plan 03-03 modifications: 6 assertions evolved in shape; test count unchanged.
- **Total after this plan:** 284 passing.

## Phase 3 Status

This plan closes the bulk of Phase 3:
- **MATCH-01:** closed (Plan 03-02).
- **MATCH-02:** closed (Plan 03-03).
- **MATCH-03:** closed (carry-forward — `findEntryByText` already returned the entry id with Phase 2; Plan 03-01's `findEntryInIndex` preserves the contract; this plan exposes `libraryEntryId` end-to-end through both view-builders and the recipe template).
- **D-35** (Phase 1 categorize regressions): closed in Plan 03-02 (pepper keyword fixes + 'red pepper flakes' plural addition).
- **D-36** (02-REVIEW WR-01 raw-alias divergence): closed in Plan 03-01 (alias normalization at index-build site).
- **02-REVIEW WR-04** (untrimmed length sort): partially closed in Plan 03-01 (post-normalize length now used for sort); the remaining edge cases (single-letter unit fragility, untested step-5 fallback) stay deferred per 03-CONTEXT `<deferred>`.

The project memory entry "Phase 1 categorize regressions to fix in Phase 3" (`memory/project_phase1_categorize_regressions.md`) can now be archived — its WR-01/WR-02 carryovers were closed in Plan 03-02.

## Deviations from Plan

None — plan executed exactly as written. The 4 tasks, 4 commits, 11 new tests, and 6 authorized line edits all landed per the plan's `<action>` blocks. No Rule 1/2/3 deviations.

## Forward-Prep for Phase 6

`ing.libraryEntryId` is now exposed on every recipe ingredient view item via `decorateIngredients` and on every grocery item view via `buildGroceryView` (both unchecked and closed). Phase 6 FIX-01 (grocery-side) and FIX-02 (recipe-side) need only add Nunjucks markup that reads this field — no further view-model changes required.

## Self-Check: PASSED

- [x] lib/calc.js modified (verified via `grep require('./library')` returns one match).
- [x] routes/recipes.js line 64 contains `decorateIngredients(recipe.ingredients, state.library)`.
- [x] views/recipe.njk line 24 contains `{{ ing.text }}`.
- [x] No `{{ ing }}` in views/.
- [x] test/calc.test.js: 35 tests, 11 new, 6 authorized assertion edits applied.
- [x] Commit 93b6bc8 (feat 03-03 calc.js library threading) verified in git log.
- [x] Commit 820d08a (feat 03-03 routes/recipes.js + views/recipe.njk) verified in git log.
- [x] Commit 8789055 (test 03-03 +11 new tests) verified in git log.
- [x] Commit 18d79b4 (test 03-03 6 authorized line edits) verified in git log.
- [x] `npm test` exits 0 with 284 tests passing.
- [x] Server smoke check passes (`require('./server')` loads cleanly).
- [x] E2E smoke: buildGroceryView with library entry returns library-driven category + libraryEntryId; decorateIngredients with same library returns library-driven category + { text, libraryEntryId } shape.
