---
phase: 06-inline-fix
plan: 04
subsystem: routes/library + views
tags: [post-save, oob-swap, hx-current-url, categorize-branch, FIX-01, FIX-02, FIX-03]
dependency_graph:
  requires: [06-01, 06-02]
  provides: [POST-categories-route, Categorize-save-branch, recipe-OOB-wrapper]
  affects: [routes/library.js, views/partials/recipe-ingredient-groups-oob.njk, test/library-categories-routes.test.js]
tech_stack:
  added: []
  patterns:
    - respondPerSurface helper (HX-Current-URL -> one of three OOB shapes)
    - HX-Current-URL regex routing for /recipes/:id (substring would false-match the index)
    - OOB-only response via injectOob(renderSync(...))
    - Categorize-mode branch keyed off hidden surfaceItemId field
    - Phase 5 plain-text 400 / library-panel success contract preserved when not in Categorize mode
key_files:
  created:
    - views/partials/recipe-ingredient-groups-oob.njk
  modified:
    - routes/library.js
    - test/library-categories-routes.test.js
decisions:
  - "respondPerSurface returns boolean; caller handles /library default branch (keeps the helper focused on the two OOB-only surfaces)."
  - "Recipe-id regex broadened from /([a-z0-9]+)/ to /([^/?#]+)/ to accept any path segment; charset validation is not the route layer's job (Rule 1 auto-fix)."
  - "Stale recipeId in HX-Current-URL (recipe was deleted) falls through to /library default branch -- the entry mutation succeeded, refreshing a stale tab is recoverable; no 404."
  - "Categorize 400 helper renderCategorizeError uses prefilledName/prefilledRecipeCategory/prefilledGroceryCategory keys to match the partial's template variables (Plan 02 contract)."
  - "POST /library/:id/categories falls back to surfaceItemId='library-{id}' when the body field is absent, so a Library-tab POST without the hidden field still produces a valid editor outer id on 400 re-render."
metrics:
  duration: ~25 minutes
  completed: 2026-05-07
  tasks_completed: 2
  files_modified: 3
  tests_added: 14
  tests_total: 392
---

# Phase 6 Plan 04: Save Endpoints Summary

POST endpoints for inline Fix and Categorize: `POST /library/:id/categories` saves categories-only with `curated:true` and `Saved categories` toast; `POST /library` extended with a Categorize-mode branch keyed off hidden `surfaceItemId`. Both routes pick one of three OOB shapes from `HX-Current-URL` via a shared `respondPerSurface` helper -- closing the click-edit-save round-trip introduced in Plans 01/02/03.

## Goal Achieved

Click pencil on a grocery item -> Plan 03 editor opens -> change categories -> Save -> the grocery list re-buckets the item into its new category in real time, with the editor `<li>` evaporating thanks to the OOB-only response pattern. The same flow works on recipe detail pages with the OOB target swapping the `<section id="recipe-ingredient-groups-{recipeId}">`. On the Library tab the Save returns a row fragment + OOB footer (Phase 5 D-63 idiom).

## What Shipped

### Task 1: route + extension + OOB partial (commit `2ad920d`)

**`views/partials/recipe-ingredient-groups-oob.njk`** (NEW, 4 lines): wraps the existing inner `recipe-ingredient-groups.njk` partial with `<section class="recipe-ingredients" id="recipe-ingredient-groups-{{ recipe.id }}">` so `injectOob` attaches `hx-swap-oob="true"` to a single root element. The non-OOB version in `views/recipe.njk` already inlines the same `<section>` wrapper around the include, so the OOB swap drops directly into the same DOM target.

**`routes/library.js`** (modified, +180 lines):

- New helper `respondPerSurface(req, res, state)`:
  - `/grocery*` (substring) -> OOB-only `<section id="grocery-list" hx-swap-oob="true">` via `buildGroceryView`.
  - `/recipes/{id}` (regex, capture segment) -> OOB-only `<section id="recipe-ingredient-groups-{id}" hx-swap-oob="true">` via `decorateIngredients(recipe.ingredients, state.library)` rendered through the new OOB wrapper partial.
  - Anything else -> returns false; caller handles the `/library` default branch (row fragment + OOB footer for `/library/:id/categories`; `respondWithUpdates(library-panel)` for `/library`).

- New route `POST /library/:id/categories`:
  - 404 plain-text on unknown id (silent toast).
  - Validates `recipeCategory` and `groceryCategory` against `RECIPE_CATEGORIES` / `GROCERY_CATEGORIES`. Either invalid -> 400 + `library-fix-editor.njk` re-rendered with a synthetic entry view that preserves the user's typed values. NO toast on 400 (D-78).
  - On success: ELS-spread mutation preserving name/aliases/createdAt; `curated:true` (D-74); `storage.save()`; `setToast(res, 'Saved categories')`; per-surface OOB via `respondPerSurface`; `/library` default = row fragment + OOB footer.
  - Hidden surface fields (`surface`, `itemId`, `recipeId`, `index`, `surfaceItemId`) round-trip through the editor so a 400 re-render targets the correct outer id; `surfaceItemId` falls back to `library-{id}` if the body field is empty (Library-tab POST without the editor harness).

- Extended `POST /library`:
  - Categorize mode detected via `!!body.surfaceItemId` (the hidden field that Plan 02's `library-categorize-editor.njk` renders).
  - In Categorize mode, all four 400 paths (name required, invalid recipeCategory, invalid groceryCategory, alias conflict, newLibraryEntry throw) re-render `library-categorize-editor.njk` with `categorizeError` slot and preserved typed values (`prefilledName`, `prefilledRecipeCategory`, `prefilledGroceryCategory`). NO toast.
  - New name-conflict block (Categorize mode only): case-insensitive equality scan on `state.library` -> 400; `aliasConflict(state, name)` against the typed name -> 400. Mirrors Phase 5 D-61 alias-conflict UX exactly. Conflict message: `Name "X" is already used by entry "Y". Open it in the Library tab.`
  - On success: branches on `respondPerSurface` for `/grocery` and `/recipes/:id`; falls back to existing `respondWithUpdates(library-panel)` for `/library` and missing-header cases. Phase 5 plain-text 400 contract preserved when `surfaceItemId` is absent (LIB-04 regression-free).

### Task 2: HTTP tests (commit `096ee5b`)

**`test/library-categories-routes.test.js`** (modified, +14 tests, 218 inserted lines):

POST /library/:id/categories tests:
1. 200 + `Saved categories` toast + `curated:true` set on entry (Library tab surface).
2. 200 + OOB grocery-list fragment from `/grocery`.
3. 200 + OOB recipe-ingredient-groups fragment from `/recipes/r_test01`.
4. 200 + row fragment + OOB footer from `/library` (default branch).
5. 400 + `library-fix-editor` fragment on invalid `recipeCategory` (no toast).
6. 400 + `library-fix-editor` fragment on invalid `groceryCategory` (no toast).
7. 404 + plain text `Not found` on unknown id (no toast).

POST /library Categorize-mode tests:
8. 200 + OOB grocery-list + `Added entry` toast + `curated:true` from `/grocery`.
9. 400 + `library-categorize-editor` + `library-categorize-error` on case-insensitive name collision (`APPLE` vs existing `apple`); preserved `value="APPLE"`; conflict message uses Nunjucks autoescape (`&#34;` or `&quot;`).
10. 400 + `library-categorize-editor` on alias conflict (typed name matches an existing alias).
11. 200 + OOB recipe-ingredient-groups from `/recipes/r_test01`.

Phase 5 regression tests (Categorize mode NOT triggered):
12. POST /library WITHOUT `surfaceItemId` returns plain-text `Name required` 400 (LIB-04 contract preserved).
13. POST /library WITHOUT `surfaceItemId` returns full `library-panel` 200 with `Added entry` toast (Phase 5 contract preserved).

## Decisions and Deviations

### Auto-fixed Issues

**1. [Rule 1 - Bug] Broadened recipe-id regex to accept any path segment**
- **Found during:** Task 2 -- the test using fixture id `r_test01` failed against the original `/([a-z0-9]+)/` regex because the underscore was excluded.
- **Issue:** The original regex from RESEARCH limited the captured recipe id to lowercase alphanumerics. Production recipe ids generated by `lib/id.js` are 10-char base36 (no underscores), but test fixtures and any future id-generation change could include `_` or `-`. Express's `:id` param has no charset restriction; the regex's job is to differentiate `/recipes/{id}` from `/recipes` (the index) and capture the segment, not to validate the id charset.
- **Fix:** Changed `/^[^?#]*\/recipes\/([a-z0-9]+)/i` to `/^[^?#]*\/recipes\/([^/?#]+)/`. Captures any path segment up to the next `/`, `?`, or `#`. Comment in the route file documents the rationale.
- **Files modified:** `routes/library.js`
- **Commit:** `096ee5b` (committed alongside Task 2 since the failing test surfaced it)

### Pragmatic Choices (NOT deviations)

- **`respondPerSurface` returns boolean.** The plan-supplied helper signature was `function respondPerSurface(req, res, state)` returning `true` if a response was written. I kept that signature and shape so the caller pattern `if (respondPerSurface(...)) return;` works for both `POST /library/:id/categories` and `POST /library` Categorize success.
- **Stale-recipe fallback.** If `HX-Current-URL` matches `/recipes/{deletedId}`, `respondPerSurface` returns false and the caller's `/library` default branch handles it. Per RESEARCH §line 332, "the entry mutation succeeded; failure to refresh a stale-tab surface is recoverable" -- no 404 emitted.
- **`surfaceItemId` fallback in POST /library/:id/categories.** When the body field is empty (e.g., a manual cURL POST or future Library-tab usage), the handler synthesizes `library-{id}` so the 400-rerender editor still has a valid outer id. The Library-tab full-form Save endpoint at `POST /library/:id` does not use surfaceItemId, so this is forward-compatible without coupling the routes.
- **Reused Phase 5 `'Added entry'` toast verbatim.** D-78 explicitly says Categorize success toast is the existing Phase 5 string; no new toast needed.

## Tests Added

14 new POST tests in `test/library-categories-routes.test.js` (placed after the existing GET tests from Plan 02). Test count: file went from 18 -> 32 tests; full suite went from 379 -> 392.

## Verification

- `node -e "require('./routes/library')"` -> exits 0 (module loads).
- `grep -c 'router\.post' routes/library.js` -> 3 (existing POST /library, POST /library/:id, NEW POST /library/:id/categories).
- `grep -q 'respondPerSurface' routes/library.js` -> succeeds.
- `grep -q 'renderCategorizeError' routes/library.js` -> succeeds.
- `grep -q "'Saved categories'" routes/library.js` -> succeeds (D-78 toast).
- `grep -q "isCategorizeMode" routes/library.js` -> succeeds.
- `views/partials/recipe-ingredient-groups-oob.njk` exists with the `<section class="recipe-ingredients" id="recipe-ingredient-groups-{{ recipe.id }}">` wrapper.
- `node --test test/library-categories-routes.test.js` -> 32/32 pass.
- `npm test` -> 392/392 pass (379 baseline + 14 new POST tests; 1 baseline test absorbed into the new file). All success criteria met.

## Next Plan Hooks

**Plan 05 (round-trip integration tests + smoke)**: Plan 04 ships the unit-level POST coverage but the full click-edit-save flow across surfaces still needs integration tests:
- GET pencil-affordance -> GET editor fragment -> POST save -> assert OOB target structure swaps the original surface DOM.
- Cancel-after-save flow (open editor, change values, cancel, re-open editor: typed values are gone, dropdown reflects the saved-not-cancelled categories).
- Cross-surface stale-render (open editor on /grocery, save from another tab on /recipes -- /grocery's render reflects the new categorization on next page navigation; the inline-Fix flow does NOT need cross-tab live sync).
- D-77 inline-error UX: typed name -> conflict -> form stays open with `value="..."` preserved -> change name to a non-conflicting one -> Save succeeds.

The full FIX-04 invariant test (rename a library entry's name; assert grocery / recipe surfaces still show original `item.text` / `ing.text`) is a Plan 05 deliverable per RESEARCH §line 743.

## Self-Check: PASSED

- `routes/library.js` modified -> FOUND (commits `2ad920d` + `096ee5b`).
- `views/partials/recipe-ingredient-groups-oob.njk` -> FOUND.
- `test/library-categories-routes.test.js` modified -> FOUND.
- Commit `2ad920d` -> FOUND.
- Commit `096ee5b` -> FOUND.
- 392/392 tests pass.
- `grep -c 'router\.post' routes/library.js` = 3.
