---
phase: 06-inline-fix
plan: 02
subsystem: routes + views + view-model
tags: [inline-fix, route-order, surface-relative-ids, flat-index, fix-03-categories-only, http-fragment-tests]
dependency_graph:
  requires:
    - 06-01 (pencil button hx-get URLs and surface-relative outer ids; recipe-ingredient-groups partial extracted)
    - phase-3 buildGroceryView attaches libraryEntryId per item (D-31)
    - phase-3 decorateIngredients returns { text, libraryEntryId } per line (D-32)
    - phase-5 lib/render renderSync + injectOob exports
    - phase-5 routes/library.js entryViewById helper, manual-add POST, edit GET/POST
    - phase-2 lib/categorize normalizeIngredientText / recipeCategoryOf / groceryCategoryOf
  provides:
    - Fix-editor-fragment (GET /library/:id/categories-edit; categories-only; surface-relative outer id)
    - Categorize-editor-fragment (GET /library/categorize-edit?text=...; pre-filled name + heuristic dropdowns; surface-relative outer id)
    - Cancel-restore (GET /library/cancel-fix?surface=grocery|recipe; re-renders the original surface row from current state)
    - flatIndex (cross-group, render-order-stable per-line index attached by decorateIngredients; consumed by Cancel recipe round-trip and ready for Plan 04 OOB targeting)
    - 06-04 hooks: editor partials carry hidden surface/itemId/recipeId/index inputs so Plan 04 can branch HX-Current-URL and re-render the editor on 400-conflict with the correct outer id
  affects:
    - routes/library.js (3 new GET handlers appended; imports extended)
    - lib/calc.js (decorateIngredients now emits flatIndex per item)
    - views/partials/library-fix-editor.njk (new)
    - views/partials/library-categorize-editor.njk (new)
    - views/partials/recipe-ingredient-groups.njk (sources index from ing.flatIndex)
    - test/library-categories-routes.test.js (new — 19 tests)
    - test/calc.test.js (decorateIngredients shape assertions extended for flatIndex)
tech_stack:
  added: []
  patterns:
    - surface-relative outer ids on editor partials (`library-fix-{surfaceItemId}` / `library-categorize-{surfaceItemId}`) — outerHTML toggle returns to the SOURCE row, not a Library-tab row (RESEARCH Pitfall 2)
    - Express first-match route ordering — static-segment routes (`/library/categorize-edit`, `/library/cancel-fix`) registered BEFORE the `/library/:id` wildcard so they are not captured as `:id`
    - hidden form inputs (`surface`, `itemId`, `recipeId`, `index`, `surfaceItemId`) round-trip the source-row context so the eventual POST 400-conflict handler in Plan 04 can re-render the editor with the matching outer id
    - server-computed flat index (decorateIngredients) used in place of a Nunjucks loop counter that cannot thread across nested {% for group %}{% for ing %} loops
    - Nunjucks autoescape default ON for all user-controlled values (`entry.name`, `prefilledName`, `categorizeError`); no `|safe` filter applied (T-06-02-01 mitigation)
key_files:
  created:
    - views/partials/library-fix-editor.njk
    - views/partials/library-categorize-editor.njk
    - test/library-categories-routes.test.js
  modified:
    - routes/library.js
    - lib/calc.js
    - views/partials/recipe-ingredient-groups.njk
    - test/calc.test.js
decisions:
  - "Inserted the 3 new GET routes after the existing GET /library handler (line ~22) and BEFORE GET /library/:id (now at line ~136). Verified with grep -n 'router.get': categorize-edit @36 < cancel-fix @64 < categories-edit @114 < /library/:id @136. The categories-edit route uses the :id wildcard but is /library/:id/categories-edit and is registered before the bare /library/:id, so it cannot be shadowed."
  - "flatIndex is attached to every emitted decorateIngredients item (skipped non-string / empty entries do NOT consume a slot — the counter only ticks for items that actually go into a bucket). This matches what the cancel-fix recipe branch does when it walks groups and looks for ing.flatIndex === index."
  - "Cancel route returns 400 for unknown surface (anything other than 'grocery' / 'recipe'). The existing test 'GET /library/cancel-fix is NOT swallowed by GET /library/:id' uses this 400 path as a positive proof that route ordering puts cancel-fix ahead of the :id wildcard (which would have returned 404)."
  - "test/calc.test.js: rather than rewriting the deepStrictEqual assertions to be field-by-field, the existing array literals were extended in-place with `flatIndex: <n>`. Five tests touched; new field is numeric and stable so hardcoded indices (0, 1, 2, ...) match the input array order. Per the plan's 'minimal authorized line edits' guidance."
  - "Added a 'flatIndex out of range' (`index=99`) test to the cancel-fix recipe branch in addition to the unknown-recipeId 404. That guards against a regression where the cancel-fix loop continues past the last group with foundIng undefined and falls through to the wrong status code."
  - "Editor partials use `{% if index or index == 0 %}` instead of bare `{% if index %}` because Nunjucks treats numeric 0 as falsy (Plan snippet called this out explicitly; preserved verbatim to keep the index=0 case correct)."
metrics:
  duration: ~18 min
  completed: 2026-05-07
  tasks_completed: 3
  files_modified: 7
  tests_added: 19
  tests_total: 379
---

# Phase 6 Plan 02: Inline-Editor GET Routes Summary

Wave 2 wires the three GET routes that hand back inline editor fragments, plus the two new editor partials they render. The pencil buttons shipped in Plan 01 now resolve to working endpoints — clicking a pencil expands the row inline; clicking Cancel collapses it back. Save buttons still 404 (POST endpoints land in Plan 04). 379 / 379 tests pass (baseline 360 + 19 new).

## Goal Achieved

The inline-Fix flow's read path is complete:

- **`GET /library/:id/categories-edit`** returns a categories-only Fix editor fragment (FIX-03 invariant — no name input, no aliases input). Header reads `Library entry: {entry.name}`; an "Edit full entry →" link points at `/library?q={entry.name|urlencode}` so the full Library-tab editor stays one click away (D-71, D-74).
- **`GET /library/categorize-edit?text=...`** returns the Categorize editor fragment for unmatched items: name pre-filled via `normalizeIngredientText`, recipe-category and grocery-category dropdowns pre-selected via the existing heuristic functions, error slot reserved for Plan 04's name-conflict path (D-75, D-76, D-77).
- **`GET /library/cancel-fix?surface=...`** re-renders the original `grocery-item.njk` or `recipe-ingredient-line.njk` partial from current state so the editor's outerHTML swap restores the pre-edit row (UI-SPEC § Interaction Contract — Cancel option B).

Both editor outer `<li>` ids are surface-relative (`library-fix-{surfaceItemId}` / `library-categorize-{surfaceItemId}`) so HTMX `outerHTML` toggles back to the SOURCE row, not a Library-tab row (RESEARCH Pitfall 2).

A small but load-bearing extension: `decorateIngredients` now emits a `flatIndex` per item. This cross-group, render-order-stable index lets the recipe-side `cancel-fix` round-trip from a single ingredient `<li>` back through `decorateIngredients` to the same item. Nunjucks `{% set %}` is loop-local and cannot thread a counter across the nested `{% for group %}{% for ing %}` loops in `recipe-ingredient-groups.njk`, so the counter is computed server-side instead.

## What Shipped

### New files

- **`views/partials/library-fix-editor.njk`** (38 lines): outer `<li id="library-fix-{{ surfaceItemId }}">`; header with strong-tagged entry name + "Edit full entry" link; form `hx-post="/library/{{ entry.id }}/categories"` (POST endpoint lands in Plan 04); five hidden inputs (`surfaceItemId`, `surface`, `itemId`, conditional `recipeId`, conditional `index`) for 400-conflict round-trip; two `<select>` dropdowns; Save + Cancel buttons. NO `<input name="name">` and NO `<input name="aliases">` (FIX-03 invariant).
- **`views/partials/library-categorize-editor.njk`** (49 lines): outer `<li id="library-categorize-{{ surfaceItemId }}">`; header `New library entry` (no name interpolation per D-71); form `hx-post="/library"` (reuses Phase 5 manual-add endpoint per D-75); same five hidden inputs; `<input name="name" value="{{ prefilledName }}" required maxlength="200" autofocus>`; `<div class="library-categorize-error" role="alert">{{ categorizeError }}</div>` slot for Plan 04's 400-conflict UX (D-77 mirrors Phase 5 D-61); two `<select>` dropdowns; Save + Cancel. NO `<input name="aliases">` (D-76 keeps scope tight).
- **`test/library-categories-routes.test.js`** (227 lines, 19 tests): scaffold copied from `test/library-routes.test.js` (1-53); covers all 3 GET endpoints, FIX-03 categories-only invariant, 404 paths, surface-relative outer id correctness, prefill normalization, heuristic dropdown pre-selection, route-order verification (2 dedicated tests confirm `categorize-edit` and `cancel-fix` are NOT shadowed by the `/library/:id` wildcard).

### Modified files

- **`routes/library.js`**: imports extended (`buildGroceryView`, `decorateIngredients`, `recipeCategoryOf`, `groceryCategoryOf`, `normalizeIngredientText`); 3 new GET handlers appended in the correct order — `categorize-edit` (line 36) and `cancel-fix` (line 64) before the existing `/library/:id` wildcard (now line 136), `categories-edit` (line 114, also before because the `/library/:id/categories-edit` path is more specific than `/library/:id` even though both use `:id`). Existing routes untouched.
- **`lib/calc.js`**: `decorateIngredients` now attaches `flatIndex: number` per emitted item. The counter ticks only for items that actually go into a bucket (empty / non-string / whitespace entries do not consume a slot). Comment block explains why server-side computation is necessary.
- **`views/partials/recipe-ingredient-groups.njk`**: changed `{% set index = loop.index0 %}` to `{% set index = ing.flatIndex %}`. The downstream `recipe-ingredient-line.njk` partial reads `index` unchanged (Plan 01 contract preserved); the per-line `<li>` id format `recipe-ing-{recipe.id}-{group.category}-{index}` now uses the cross-group flat index instead of the per-group loop index.
- **`test/calc.test.js`**: five `decorateIngredients` shape assertions extended in-place to accept `flatIndex: <n>` on each item. New field is numeric and stable in render order so hardcoded `flatIndex: 0, 1, 2, ...` lines up with the input arrays. Comments added to clarify that skipped entries don't consume slots.

## Decisions & Deviations

No deviations from the plan snippets — code was written verbatim from the action blocks. The pragmatic choices documented in frontmatter `decisions`:

1. **Route ordering verified** — `grep -n 'router.get' routes/library.js` confirms: `/library` (line 18), `/library/categorize-edit` (line 36), `/library/cancel-fix` (line 64), `/library/:id/categories-edit` (line 114), `/library/:id` (line 136), `/library/:id/edit` (line 150). Express first-match resolves correctly: the static segments come before the bare `:id` wildcard. The `categories-edit` route uses `:id` but its path is `/library/:id/categories-edit` — strictly more specific than `/library/:id`, so registration order between them does not matter (and registering categories-edit first is fine regardless).

2. **flatIndex slot semantics** — only emitted items consume a slot. The plan snippet computed `flatIndex` inside the loop body after the `if (typeof text !== 'string' || !text.trim()) continue;` guard, which means skipped entries don't tick the counter. A `decorateIngredients null contract` test in `calc.test.js` was extended with a comment locking this in, and the assertion now reads `{ text: '1 onion', libraryEntryId: null, flatIndex: 0 }` for input `['', '   ', null, undefined, '1 onion']` (only the last entry survives, gets flatIndex 0).

3. **Two route-order tests** — added as dedicated coverage. The first uses `categorize-edit` and asserts the response body contains `class="library-categorize-editor"` (the editor markup, not a 404). The second uses `cancel-fix` with no surface and asserts a 400 'Unknown surface' response (cancel-fix's own validation), which positively confirms the cancel-fix handler ran rather than the `/library/:id` wildcard returning a 404.

4. **`{% if index or index == 0 %}` for hidden index input** — Nunjucks treats numeric 0 as falsy, so the bare `{% if index %}` would have hidden the input for the first ingredient on a recipe page. The plan snippet flagged this; preserved verbatim.

5. **Cancel `surface=recipe` 404 on out-of-range index** — added a test (`index=99` with a 1-ingredient recipe) in addition to the unknown-recipeId test. Guards against a regression where the cancel-fix loop fails to short-circuit and accidentally renders an undefined ingredient.

## Tests Added

**19 tests in `test/library-categories-routes.test.js`:**

GET /library/:id/categories-edit (5):
1. Returns Fix editor fragment with both dropdowns + Edit-full-entry link.
2. Fragment is categories-only (no name/aliases inputs) per FIX-03.
3. Returns 404 on unknown id (plain text 'Not found').
4. Pre-selects current entry categories in dropdowns.
5. Recipe surface produces recipe-relative outer id (`library-fix-recipe-{recipeId}-{index}`).

GET /library/categorize-edit (6):
6. Returns Categorize editor with name pre-filled and dropdowns set.
7. Normalizes the prefilled name (strips quantity tokens — `2 cups of Garlic Cloves` → `garlic cloves`).
8. Reflects heuristic category guesses in pre-selected dropdown options (`peanut butter` → Aisle).
9. With empty text returns editor with empty prefilled name (`value=""`).
10. Recipe surface produces recipe-relative outer id.
11. Produces no `x-status-toast` header (silent GET).

GET /library/cancel-fix (6):
12. `surface=grocery` returns the original grocery-item fragment with grocery-pencil button.
13. `surface=grocery` returns 404 on unknown itemId.
14. `surface=recipe` returns the original recipe-ingredient-line fragment with recipe-pencil button.
15. `surface=recipe` returns 404 on unknown recipeId.
16. `surface=recipe` returns 404 on flatIndex out of range.
17. Returns 400 on unknown surface.

Route order verification (2):
18. GET /library/categorize-edit is NOT swallowed by GET /library/:id.
19. GET /library/cancel-fix is NOT swallowed by GET /library/:id.

## Verification

- `npm test` → `tests 379, pass 379, fail 0` (baseline 360 + 19 new).
- `node --test test/library-categories-routes.test.js` → 19 / 19 pass.
- `node --test test/calc.test.js` → 49 / 49 pass (5 shape assertions updated for flatIndex; no regressions).
- `node --test test/recipes.test.js` → 22 / 22 pass (recipe-ingredient-groups.njk change preserved per-line id format because flatIndex is still numeric and the test matches `recipe-ing-{recipe.id}-{group.category}-{index}` — Plan 01 tests didn't pin the index value).
- `node -e "require('./routes/library')"` → exits 0 (route file loads cleanly).
- `grep -n 'router.get' routes/library.js` → categorize-edit and cancel-fix both before /library/:id wildcard.
- Page-presence assertions for the Fix editor: 2 `<select>` (recipeCategory, groceryCategory), 1 `<input name="surfaceItemId">`, 0 `<input name="name">`, 0 `<input name="aliases">` — all confirmed by tests #1, #2, #4.
- Page-presence assertions for the Categorize editor: 1 `<input name="name">`, 2 `<select>`, 0 `<input name="aliases">`, 1 `<div role="alert">` (categorize-error slot, even when empty body) — confirmed by tests #6, #11.

## Next Plan Hooks

- **Plan 03 / 04 (POST `/library/:id/categories`)**: consumes the hidden `surface`, `itemId`, `recipeId`, `index`, `surfaceItemId` inputs from the Fix editor partial. On 400 (invalid enum), re-render `library-fix-editor.njk` with the user's typed values + `categorizeError` slot text — surfaceItemId round-trips so the outer id matches the existing DOM target. On success, branch on `HX-Current-URL` per D-73 and emit the per-surface OOB shape (full grocery panel / recipe-ingredient-groups partial / library row).
- **Plan 04 (POST `/library` Categorize branch)**: same hidden-input round-trip via `library-categorize-editor.njk`. The `categorizeError` slot exists and is wired (`role="alert"`) — Plan 04 just needs to re-render with `categorizeError = "Name '{typed}' is already used by entry '{owning}'..."` per D-77.
- **flatIndex consumers (Plans 03+)**: the cancel-fix recipe branch already round-trips on flatIndex; the Plan 04 OOB swap on `/recipes/:id` will re-render `recipe-ingredient-groups.njk` and the partial automatically picks up the updated flatIndex from the new decorateIngredients output. No further changes needed in `recipe-ingredient-line.njk`.
- **Cancel route 400 path (`Unknown surface`)**: cancel-fix's defensive 400 makes the route-order regression surface as a different status code (400 vs 404) — Plan 04+ can lean on this signal in tests if the file gets refactored.

## Self-Check: PASSED

- `views/partials/library-fix-editor.njk` — FOUND (categories-only, surface-relative outer id, header + Edit-full-entry link present, no name/aliases inputs).
- `views/partials/library-categorize-editor.njk` — FOUND (name input + 2 selects + role=alert error slot, no aliases input, surface-relative outer id).
- `routes/library.js` — modified (3 new routes registered in correct order; existing routes untouched).
- `lib/calc.js` — modified (decorateIngredients emits flatIndex; comment block explains rationale).
- `views/partials/recipe-ingredient-groups.njk` — modified (sources index from ing.flatIndex).
- `test/library-categories-routes.test.js` — 19 / 19 tests pass.
- `test/calc.test.js` — 49 / 49 tests pass (flatIndex shape assertions accepted).
- Commits: `5eaf337` (Task 1), `46f4010` (Task 2), `5a838de` (Task 3) — all present in `git log --oneline`.
- `npm test`: 379 / 379 pass; baseline 360 + 19 new.

## Threat Flags

None. Plan strictly extends an existing route file with read-only GETs; no new mutations, no new auth surfaces, no new file-access patterns. T-06-02-01 (XSS via reflected `?text=`) is mitigated as planned: Nunjucks autoescape default ON, no `|safe` filter on `prefilledName` / `categorizeError` / `entry.name`. T-06-02-02 (forged surfaceItemId) is accepted under single-user LAN trust model — server-side state lookups (entryViewById, buildGroceryView item lookup, recipe lookup) gate every response. T-06-02-03 (large `?text=` DoS) is bounded by Express's default body-parser limit and the bounded normalizeIngredientText regex pipeline.
