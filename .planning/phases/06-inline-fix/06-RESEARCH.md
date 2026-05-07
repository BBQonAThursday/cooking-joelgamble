# Phase 6: Inline Fix - Research

**Researched:** 2026-05-07
**Domain:** Express 4 routes + HTMX 2.0.4 outerHTML row-toggle + Nunjucks 3 fragments + per-surface OOB-swap from `HX-Current-URL`
**Confidence:** HIGH (all claims verified against the live codebase, including completed Phase 5 routes and tests)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-68:** Icon-only, always-visible pencil button on every grocery item row and every recipe ingredient line. Same pixel size as the existing `.grocery-delete` button (`24x24`). No labels, no hover-only reveal.
- **D-69:** Same pencil icon for both Fix (matched) and Categorize (unmatched) states. Distinguished only by `aria-label` and the `hx-get` target. Server determines behavior from the row's `libraryEntryId` presence.
- **D-70:** Inline row-toggle expand. Click pencil -> `hx-get` returns the editor fragment -> HTMX `outerHTML` swaps the row's `<li>` with the editor's `<li>` (same outer DOM id). CSS class on the expanded `<li>` is `library-fix-editor` (Fix mode) or `library-categorize-editor` (Categorize mode).
- **D-71:** Compact `Library entry: {name}` header at the top of the Fix editor — canonical name appears ONCE per editor, clearly labelled as metadata. Aliases NOT shown. Categorize editor uses `New library entry` header.
- **D-72:** Full panel re-render on Save. Server returns the entire `#grocery-list`, `#recipe-ingredient-groups-{recipeId}`, or `#library-panel` as the OOB target — whichever surface initiated the request.
- **D-73:** `HX-Current-URL` header drives OOB target selection. Path mapping: `/grocery*` -> re-render `#grocery-list` via `buildGroceryView`; `/recipes/:id` -> re-render `#recipe-ingredient-groups-{id}` via `decorateIngredients`; `/library*` -> re-render `#library-panel` via `buildLibraryView`.
- **D-74:** Two new endpoints for the categories-only Fix flow: `GET /library/:id/categories-edit` (returns `library-fix-editor.njk` fragment) and `POST /library/:id/categories` (saves categories only, sets `curated: true`, returns the per-surface OOB fragment). Toast: `Saved categories`.
- **D-75:** Categorize submission reuses existing `POST /library`. New `GET /library/categorize-edit?text=...` returns `library-categorize-editor.njk` fragment with name + categories pre-filled. Submit posts to existing `POST /library`. Toast: `Added entry`.
- **D-76:** Categorize editor pre-fills: name = `normalizeIngredientText(item.text)`; aliases = empty (no UI); recipe-category dropdown pre-selected via `recipeCategoryOf(item.text)`; grocery-category dropdown pre-selected via `groceryCategoryOf(item.text)`.
- **D-77:** Inline error + form stays open on Categorize-name conflict. HTTP 400, body = same `library-categorize-editor.njk` fragment with an error `<div>` slotted under the name input. Form preserves user's typed values. Mirrors Phase 5 D-61 alias-conflict UX exactly.
- **D-78:** Toast strings are verb-only literal ASCII strings, no name interpolation. Save Fix -> `Saved categories`. Save Categorize -> `Added entry`. 400 paths and 404 paths -> silent (no toast).
- **D-79:** HTMX 4xx-swap meta tag is in place (Plan 05-01) — Categorize-conflict 400 path inherits.
- **D-80:** `renderSync` and `injectOob` are exported from `lib/render.js`. Phase 6 routes use these directly, NOT `respondWithUpdates` (which would inject `hx-swap-oob` on the primary row swap target).
- **D-81:** Render-time categorization. Saved `recipeCategory` / `groceryCategory` on the library entry are the source-of-truth.
- **D-82:** Per-render walk for categorization continues. The full-panel-re-render OOB on Save is exactly this re-render — no separate categorization update path.

### Claude's Discretion

- **Pencil icon SVG vs Unicode glyph:** Recommend SVG inline. Single shared `views/partials/icon-pencil.njk`. (Settled to SVG by 06-UI-SPEC.md.)
- **"Edit full entry" link target:** Recommend `/library?q={encodeURIComponent(entry.name)}`. (Settled to `?q=` form by 06-UI-SPEC.md.)
- **Recipe ingredient line id format:** Recommend `id="recipe-ing-{recipe.id}-{loop.index0}"`. (Settled by 06-UI-SPEC.md.)
- **Recipe page ingredient OOB target id:** Recommend `id="recipe-ingredient-groups-{recipe.id}"` on the `<section class="recipe-ingredients">` element.
- **Cancel button behavior:** Two viable options. Settled by 06-UI-SPEC.md to client-side reset via per-surface lightweight `GET` endpoint.
- **CSS class naming:** New classes prefixed `library-fix-*` / `library-categorize-*`.
- **Test scaffolding:** New `test/library-categories-routes.test.js` for the categories-only Fix endpoints AND the Categorize flow, OR extend `test/library-routes.test.js`. Planner picks.
- **`POST /library/:id/categories` reuse from /library tab:** When `HX-Current-URL` is `/library`, recommend row-fragment swap (Phase 5 row-level convention) vs full panel for `/grocery` or `/recipes/:id`.

### Deferred Ideas (OUT OF SCOPE)

- Smart auto-link on Categorize-name conflict ("you meant garlic? Use it for this item?")
- Auto-add item text as alias on Categorize
- Hover-only / responsive pencil affordance
- Modal / popover Fix editor
- Per-group / targeted OOB swaps (only swap source + destination groups)
- PATCH HTTP verb for `/library/:id/categories`
- Per-line edit in Library tab table (popover / cell-level)
- Categorize-from-search ("Create entry for 'foo'" inline in empty state)
- Recipe-string mutation (renaming `ingredient.text` on recipe page)
- `updatedAt` field on library entries
- Concurrent-edit prevention for Fix
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIX-01 | Each grocery item row has a "Fix" affordance (matched) or "Categorize" affordance (unmatched); editor opens inline; saving updates entry + sets `curated:true` + OOB-swaps grocery list to reflect new categorization | `views/partials/grocery-item.njk` already has `item.libraryEntryId`; `buildGroceryView` already attaches it (lines 95-115 of `lib/calc.js`). New routes `GET /library/:id/categories-edit`, `POST /library/:id/categories`, `GET /library/categorize-edit?text=...` extend `routes/library.js`. Per-surface OOB rendering via existing `buildGroceryView` |
| FIX-02 | Each recipe-page ingredient line has the same affordance + behavior; OOB-swaps `#recipe-ingredient-groups-{recipeId}` | `views/recipe.njk` line 24 currently renders `{{ ing.text }}` only — extend to flex layout + pencil button. Per-line id `recipe-ing-{recipe.id}-{loop.index0}` for outerHTML toggle target. OOB section needs a stable id (`recipe-ingredient-groups-{recipe.id}`) on `<section class="recipe-ingredients">`. `decorateIngredients` already attaches `ing.libraryEntryId` (lines 235-242 of `lib/calc.js`) |
| FIX-03 | Fix editor edits **categories only**; "Edit full entry" link navigates to Library tab | Two new partials, `library-fix-editor.njk` (categories only) and `library-categorize-editor.njk` (name + categories). `library-fix-editor.njk` includes header link `<a href="/library?q={{ entry.name|urlencode }}">Edit full entry</a>` — Nunjucks 3 ships `urlencode` filter in core |
| FIX-04 | Fix never displays canonical name in place of `ingredient.text`; recipe pages always show `ingredient.text` | Editor's `Library entry: {name}` header is the ONLY surface where canonical name appears. Verified by FIX-04 invariant test: rename entry name -> recipe page text unchanged. Confined per D-71 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

| # | Constraint | How Phase 6 Honors It |
|---|------------|------------------------|
| C-01 | Tech stack: Node 18+, Express 4, Nunjucks 3, HTMX 2, no build step, CommonJS, `node:test` | Phase 6 uses HTMX outerHTML + Nunjucks partials only. No new deps |
| C-02 | Persistence: JSON state file with atomic rename | NO new collections. Phase 6 only mutates existing `state.library[].recipeCategory` / `state.library[].groceryCategory` / `curated` |
| C-03 | Categorization layering: library overrides heuristic; keyword tables stay as fallback | Save handler updates the library entry's two category fields; next render walks library-first via `buildGroceryView` / `decorateIngredients` (already implemented in Phase 3) |
| C-04 | HTTP-header ASCII safety: toast strings ASCII-only | All toasts in Phase 6 are verb-only literals (`Saved categories`, `Added entry`). Inline error message contains user input but lives in HTML body, not header (safe per Phase 5 D-61 precedent) |
| C-05 | No auth (single user, LAN-only) | No new auth concerns introduced |
| C-06 | Render-time categorization: do NOT pre-compute/store categories on grocery items or recipe ingredients | Phase 6 NEVER writes computed categories anywhere except on the library entry itself (D-81). Save -> next render reads the new categories |

## Summary

Phase 6 ships an icon-only pencil affordance on every grocery item row and every recipe ingredient line. Click expands a row-toggle inline editor: **Fix** (categories-only, matched items) or **Categorize** (name + categories, unmatched items). Save returns a full-panel OOB re-render driven by `HX-Current-URL`. The architecture extends Phase 5 patterns verbatim: `renderSync + injectOob` for compound responses, the HTMX 4xx-swap meta tag from Plan 05-01, `aliasConflict` from `lib/library.js`, and the established outerHTML row-toggle vocabulary from `library-row.njk` + `library-row-edit.njk`.

The implementation is architecturally low-risk: every required helper, view-builder, route convention, and test idiom already exists and is tested. Three new routes and two new editor partials extend `routes/library.js` and `views/partials/`. The grocery item template gains a third button; the recipe template's ingredient `<li>` gains a pencil button and a per-line stable id; the recipe-ingredients `<section>` gains a stable id (`recipe-ingredient-groups-{recipe.id}`) for OOB targeting. CSS additions are pure visual; no new design tokens.

**Primary recommendation:** Land Phase 6 in 4 sequential waves: (1) `views/partials/icon-pencil.njk` + recipe-template id additions + grocery-item pencil button + tests for HTML presence; (2) the three new routes (Fix-edit GET, Categories POST, Categorize-edit GET) + per-surface tests; (3) the two new editor partials + CSS + Cancel-fragment GET endpoint; (4) integration tests covering the three OOB surface shapes via `HX-Current-URL`.

**HX-Current-URL pattern note (correction to 06-CONTEXT.md):** The CONTEXT.md references "the existing `routes/recipes.js` `HX-Current-URL`-conditional rendering pattern for the delete-button affordance." That pattern actually lives in **`routes/weeks.js` lines 38-42** (used to control whether `views/partials/recipe-card.njk` renders the `delete-btn` based on `context != 'this-week'`). The route reads `req.headers['hx-current-url']`, derives a `context` string, and threads it into the template `extra`. Phase 6's Save handler mirrors this exact pattern. [VERIFIED: `routes/weeks.js:38-42`, `views/partials/recipe-card.njk:20-26`, `test/weeks-routes.test.js:107-128`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pencil button render on grocery / recipe rows | Frontend (Nunjucks) | API/Backend (view-model `libraryEntryId` already attached) | Conditional `hx-get` target picked at render time from `item.libraryEntryId` / `ing.libraryEntryId` (Phase 3 D-31..D-32 already exposes these) |
| Open editor (matched / Fix) | Browser (HTMX outerHTML) | API/Backend (fragment render) | Click pencil -> HTMX requests `library-fix-editor.njk` -> server renders -> HTMX swaps |
| Open editor (unmatched / Categorize) | Browser (HTMX outerHTML) | API/Backend (fragment render with heuristic prefill) | Same row-toggle; server runs `normalizeIngredientText` + `recipeCategoryOf` + `groceryCategoryOf` for prefill |
| Save categories (Fix) | API/Backend | Browser (OOB swap) | Server validates enum, mutates `state.library[idx]`, persists, picks OOB target via `HX-Current-URL`, renders surface |
| Save name+categories (Categorize) | API/Backend | Browser (OOB swap) | Server runs `aliasConflict`, calls `newLibraryEntry`, persists, picks OOB target via `HX-Current-URL`, renders surface |
| OOB target selection | API/Backend | — | Server reads `HX-Current-URL` header, picks among 3 view-builder + 3 partial paths |
| Cancel (close editor without state change) | Browser (HTMX outerHTML) | API/Backend (re-fetch original row markup) | Per-surface GET endpoint that rebuilds the original row from `state` (server-authoritative; matches Phase 5 D-62 idiom) |
| Inline 400-conflict error rendering (Categorize) | API/Backend | Browser (HTMX 4xx-swap meta) | Server returns 400 + same fragment with error slot; HTMX 2.0.4 `responseHandling` override (Plan 05-01) makes 400 swap |
| Render-time categorization (no precomputation) | API/Backend | — | `buildGroceryView` / `decorateIngredients` rebucket on every render — mutating the library entry is sufficient (CLAUDE.md C-06; D-81/D-82) |

## Existing-Code Analogs (every pattern Phase 6 needs already exists)

### A1. `HX-Current-URL`-conditional response rendering — `routes/weeks.js:38-42`

```javascript
// routes/weeks.js — POST /this-week/recipes/:id, lines 38-43
const currentUrl = req.headers['hx-current-url'] || '';
const context = currentUrl.includes('/this-week') ? 'this-week' : 'recipes';
respondWithUpdates(req, res, {
  panels: ['partials/recipe-card.njk', 'partials/tag-toggle.njk'],
  extra: { r: decoratedRecipe, id: decoratedRecipe.id, isTagged: result.isTagged, context }
});
```

The pattern Phase 6 mirrors:
1. Read header with lowercase key (`hx-current-url`) — Node normalizes incoming header keys to lowercase. [VERIFIED: Node http docs; `test/weeks-routes.test.js:112` sends header as `'hx-current-url'`]
2. `String#includes` substring check on path (not exact match — `/grocery?q=foo` and `/grocery` both contain `/grocery`).
3. Default to a sensible value if header missing (empty string -> falsey -> default branch).

**Phase 6 application:**

```javascript
// In POST /library/:id/categories handler:
const currentUrl = req.headers['hx-current-url'] || '';
let surface;
if (currentUrl.includes('/grocery')) surface = 'grocery';
else if (/\/recipes\/[a-z0-9]+/i.test(currentUrl)) surface = 'recipe';
else surface = 'library'; // Default — matches /library, /library?q=..., or any other origin
```

**Robustness note:** The `String#includes('/recipes')` check would false-match `/recipes` (the recipes index page). Phase 6's recipe-detail surface is `/recipes/:id` — the regex `/\/recipes\/[a-z0-9]+/` (or `currentUrl.match(/^[^?#]*\/recipes\/([a-z0-9]+)/)`) is required to (a) distinguish the detail page from the index, and (b) extract the recipe id for the OOB target id (`recipe-ingredient-groups-{recipeId}`). [VERIFIED: `lib/id.js` produces 10-char base36 ids; Express route param regex would be `[a-z0-9]+`]

### A2. Compound row + OOB-panel response — `routes/library.js:200-212`

```javascript
// Phase 5 success path — POST /library/:id, lines 200-212
setToast(res, 'Saved entry');
const updatedView = buildLibraryView(state);
const updatedEntry = updatedView.entries.find(e => e.id === id);
const rowHtml = renderSync(req, 'partials/library-row.njk', {
  entry: updatedEntry, RECIPE_CATEGORIES, GROCERY_CATEGORIES
});
const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', updatedView));
res.type('html').send(rowHtml + '\n' + footerHtml);
```

The pattern: primary row fragment (no `hx-swap-oob`) + OOB fragment (`hx-swap-oob` injected). Phase 6 uses the same shape but the "row" varies by surface:
- `/grocery` -> primary body is empty (or just whitespace) + OOB `#grocery-list`
- `/recipes/:id` -> primary body is empty + OOB `#recipe-ingredient-groups-{recipeId}`
- `/library` -> primary row is `library-row.njk` for the saved entry + OOB footer (Phase 5 idiom). Note: the editor `<li>` had a different DOM id (`library-fix-{id}`) so the row primary swap target needs careful id alignment — see Pitfall #2 below.

### A3. Empty-primary + OOB-panel response — `routes/library.js:243-245`

```javascript
// Phase 5 DELETE /library/:id — lines 243-245
const updatedView = buildLibraryView(state);
const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', updatedView));
res.type('html').send(footerHtml);
```

When the response has only an OOB fragment (no primary swap content), HTMX:
1. Extracts the OOB fragments by matching `hx-swap-oob="true"` -> swaps them by `id` into the DOM.
2. The primary swap target (whatever `hx-target` pointed to) gets replaced with the remaining body — which in this case is empty.

Result: the original `<li>` (the editor row) is removed from the DOM. **This is the cleanest pattern for Phase 6 Save**: editor `<li>` is the primary swap target (via the form's `hx-target="closest li"`), the response is just the OOB panel fragment, and the editor row evaporates while the panel re-paints. [VERIFIED: `routes/library.js:243-245` already does this for DELETE; `test/library-routes.test.js:478-489` tests the behavior]

### A4. Two-fragment partials sharing the same outer DOM id — `library-row.njk` + `library-row-edit.njk`

```nunjucks
{# library-row.njk #}             {# library-row-edit.njk #}
<li id="library-row-{id}"          <li id="library-row-{id}"
    class="library-row">               class="library-row library-row-edit">
  ...read-only content...            <form ...>...edit form...</form>
</li>                              </li>
```

Same `id` -> outerHTML toggle works bidirectionally. Phase 6 Fix editor uses `id="library-fix-{surfaceItemId}"` where `surfaceItemId` is `grocery-item-{item.id}` or `recipe-ing-{recipe.id}-{idx}` — NOT the library-entry id, because the editor must toggle back to the SURFACE row (grocery item / recipe ingredient line), not to a Library-tab row. [VERIFIED: 06-UI-SPEC.md line 162]

### A5. HTMX 4xx-swap meta tag — `views/layout.njk:6`

```html
<meta name="htmx-config" content='{"responseHandling":[
  {"code":"204","swap":false},
  {"code":"400","swap":true},
  {"code":"[23]..","swap":true},
  {"code":"[45]..","swap":false,"error":true}
]}'>
```

Plan 05-01 added this. Phase 6 Categorize-conflict 400 path uses it without modification. The override is critical: HTMX 2.0.4's default behavior on 4xx is `swap:false, error:true`, which would suppress the inline-error fragment and fire a generic "Error" toast instead. The `{"code":"400","swap":true}` rule (no `error:true`) makes 400 responses (a) swap their body into the target, and (b) NOT fire `htmx:responseError` (so the layout.njk listener does not show "Error"). [VERIFIED: `views/layout.njk:6`; `test/library-routes.test.js:160-165`]

### A6. Render-time `libraryEntryId` exposure — `lib/calc.js`

`buildGroceryView` (lines 81-127) and `decorateIngredients` (lines 226-250) already attach `libraryEntryId` per item / per ingredient — null when no library match. Phase 6's templates branch directly on this:

```nunjucks
{# grocery-item.njk — extension #}
{% if item.libraryEntryId %}
  <button class="grocery-pencil"
          hx-get="/library/{{ item.libraryEntryId }}/categories-edit"
          ...
{% else %}
  <button class="grocery-pencil"
          hx-get="/library/categorize-edit?text={{ item.text|urlencode }}"
          ...
{% endif %}
```

No view-model changes needed in `lib/calc.js`. [VERIFIED: `lib/calc.js:96-115` for grocery; `lib/calc.js:235-242` for recipe; the comment at `lib/calc.js:111` says "closed (checked) items also carry libraryEntryId so the Phase 6 FIX affordance can render against checked items too" — Phase 3 explicitly anticipated Phase 6]

### A7. Test idiom for `HX-Current-URL`-driven response shape — `test/weeks-routes.test.js:107-128`

```javascript
test('POST /this-week/recipes/:id omits the delete button when HX-Current-URL is /this-week', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-ctx-1');
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/this-week/recipes/${id}`,
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/this-week' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, new RegExp(`id="recipe-card-${id}"`));
  assert.doesNotMatch(res.body, /class="delete-btn"/);
});
```

`helpers.request` accepts a `headers` object that gets merged into the outgoing request. The server reads `req.headers['hx-current-url']` (lowercase). Phase 6 tests use the same idiom with three sentinel URL strings:
- `http://127.0.0.1:3003/grocery` -> assert `id="grocery-list"` and `hx-swap-oob="true"`
- `http://127.0.0.1:3003/recipes/{recipeId}` -> assert `id="recipe-ingredient-groups-{recipeId}"` and `hx-swap-oob="true"`
- `http://127.0.0.1:3003/library` -> assert `id="library-row-{entryId}"` (or `id="library-panel"` if planner picks full panel re-render — recommended row-fragment for /library per CONTEXT.md last bullet)

[VERIFIED: `test/_helpers.js:46-69`]

### A8. Fragment-only response for Cancel — `routes/library.js:34-44`

```javascript
// Phase 5 GET /library/:id — Cancel target
router.get('/library/:id', (req, res) => {
  const state = storage.get();
  const entry = entryViewById(state, req.params.id);
  if (!entry) return res.status(404).type('text').send('Not found');
  const html = renderSync(req, 'partials/library-row.njk', {
    entry, RECIPE_CATEGORIES, GROCERY_CATEGORIES
  });
  res.type('html').send(html);
});
```

Phase 6 needs a per-surface variant (or one consolidated endpoint with a `surface` query param). UI-SPEC.md line 260-265 recommends a single endpoint:

```javascript
// PROPOSAL — GET /library/cancel-fix?surface={grocery|recipe}&itemId={id}&recipeId={rid}
// or for unmatched (Categorize) Cancel:
//   GET /library/cancel-categorize?surface={grocery|recipe}&itemId={id}&recipeId={rid}
```

The endpoint reloads state, finds the original surface item (grocery item by `itemId`, or recipe ingredient by `recipeId` + index), and re-renders the appropriate surface partial (`partials/grocery-item.njk` for grocery — needs the same view-model the original render used, including `libraryEntryId`; or a new lightweight `partials/recipe-ingredient-line.njk` factored out from `views/recipe.njk` for the recipe surface).

**Caveat:** `views/recipe.njk` currently inlines the ingredient line; there is no `partials/recipe-ingredient-line.njk`. Phase 6 should factor the line out into a partial during the template-extension wave so both the initial render AND the Cancel fragment endpoint can include the same partial.

## Implementation Approach

### Files to create

| File | Purpose | Notes |
|------|---------|-------|
| `views/partials/icon-pencil.njk` | Shared SVG markup for the pencil icon (~120 bytes) | Single source so `grocery-item.njk` and `recipe.njk` reuse identical bytes |
| `views/partials/library-fix-editor.njk` | Categories-only editor for matched items (Fix) | Outer `<li id="library-fix-{{ surfaceItemId }}">`; passes header link to Library tab |
| `views/partials/library-categorize-editor.njk` | Name + categories editor for unmatched items | Outer `<li id="library-categorize-{{ surfaceItemId }}">`; pre-fills name via `normalizeIngredientText`, dropdowns via heuristic |
| `views/partials/recipe-ingredient-line.njk` | Factored ingredient `<li>` (text + pencil + per-line id) | NEEDED for Cancel-fragment endpoint to re-render a single line; included from `views/recipe.njk` |
| `test/library-categories-routes.test.js` (or extend `test/library-routes.test.js`) | HTTP coverage of the 3 new routes + Categorize POST path | Planner picks; recommend NEW file to keep `test/library-routes.test.js` under ~700 lines |

### Files to extend

| File | Change | Notes |
|------|--------|-------|
| `routes/library.js` | Add 4 new routes (3 GETs + 1 POST) | All routes use `setToast` helper already in file |
| `views/partials/grocery-item.njk` | Add pencil button between `.grocery-text` span and `.grocery-delete` button | Conditional `hx-get` based on `item.libraryEntryId` |
| `views/recipe.njk` | Wrap each ingredient `<li>` with new partial; add stable per-line id; add stable section id for OOB target | Section gains `id="recipe-ingredient-groups-{{ recipe.id }}"` |
| `public/styles.css` | Append `library-fix-*` / `library-categorize-*` classes per UI-SPEC.md | ~140 lines; no new design tokens |
| `test/grocery-routes.test.js` | Add tests for pencil button HTML presence + conditional `hx-get` | Matched vs unmatched fixture |
| `test/recipes.test.js` | Add tests for pencil button + per-line id + OOB section id | New fixture: recipe with library entry match for one ingredient, no match for another |

### Routes (in route registration order — Express matches first match)

```javascript
// Order matters: more-specific paths BEFORE :id patterns to avoid matching
// /library/categorize-edit as :id == 'categorize-edit'.

// 1. GET /library/categorize-edit?text=... — Categorize editor fragment for unmatched items
//    Reads ?text= query param. Pre-fills name via normalizeIngredientText, categories
//    via recipeCategoryOf / groceryCategoryOf heuristics. Returns library-categorize-editor.njk.

// 2. GET /library/cancel-fix?surface={grocery|recipe}&itemId={id}&recipeId={rid}&index={idx}
//    Cancel target. Re-renders the original surface row from current state.
//    For grocery: looks up state.grocery by itemId, runs through buildGroceryView's per-item
//    decoration to attach libraryEntryId, renders partials/grocery-item.njk.
//    For recipe: looks up state.recipes by recipeId, runs decorateIngredients, picks
//    the line by index, renders partials/recipe-ingredient-line.njk.

// 3. GET /library/:id/categories-edit — Fix editor fragment for matched items
//    Looks up entry by id; 404 if not found. Returns library-fix-editor.njk with
//    entry's current name + categories pre-filled in the dropdowns.
//    The view passes a {{ surfaceItemId }} from a query param (or path param) so
//    the editor's outer <li> gets the correct id for outerHTML toggling.

// 4. POST /library/:id/categories — Save categories only
//    Accepts { recipeCategory, groceryCategory }. Validates each is in
//    RECIPE_CATEGORIES / GROCERY_CATEGORIES. 400 + edit-form fragment with inline
//    error if not. On success: mutates state.library[idx], sets curated:true, saves,
//    sets toast 'Saved categories', reads HX-Current-URL to pick one of three OOB
//    response shapes.
```

### Per-surface OOB response shapes for `POST /library/:id/categories`

```javascript
function respondPerSurface(req, res, state) {
  const currentUrl = req.headers['hx-current-url'] || '';
  if (currentUrl.includes('/grocery')) {
    // OOB the entire grocery list; primary body empty -> editor <li> evaporates
    const view = buildGroceryView(state);
    const html = injectOob(renderSync(req, 'partials/grocery-list.njk', view));
    return res.type('html').send(html);
  }
  const recipeMatch = currentUrl.match(/^[^?#]*\/recipes\/([a-z0-9]+)/i);
  if (recipeMatch) {
    const recipeId = recipeMatch[1];
    const recipe = (state.recipes || []).find(r => r.id === recipeId);
    if (!recipe) {
      // Surface unknown — fall through to library default. Don't 404 — the entry
      // edit succeeded; failure to refresh a stale-tab surface is recoverable.
      // Or: send empty body + toast (planner's call).
    } else {
      const groups = decorateIngredients(recipe.ingredients, state.library);
      // The OOB target is <section id="recipe-ingredient-groups-{recipeId}">.
      // Render a small wrapper partial that emits that section.
      const html = injectOob(renderSync(req, 'partials/recipe-ingredient-groups.njk', {
        recipe: { id: recipe.id, ingredientGroups: groups }
      }));
      return res.type('html').send(html);
    }
  }
  // Default: /library or any other URL. Phase 5 row-fragment + OOB-footer pattern.
  const updatedView = buildLibraryView(state);
  const updatedEntry = updatedView.entries.find(e => e.id === req.params.id);
  const rowHtml = renderSync(req, 'partials/library-row.njk', {
    entry: updatedEntry, RECIPE_CATEGORIES, GROCERY_CATEGORIES
  });
  const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', updatedView));
  res.type('html').send(rowHtml + '\n' + footerHtml);
}
```

**A new tiny partial `partials/recipe-ingredient-groups.njk` is needed** to emit just the OOB target section without the surrounding `<section class="recipe-ingredients">` wrapper from `views/recipe.njk`. Or: refactor `views/recipe.njk` to `{% include "partials/recipe-ingredient-groups.njk" %}` so both the initial render and the OOB swap use the same partial. Recommend the include refactor — single source of truth.

### Editor fragment shape (Fix — categories-only)

```nunjucks
{# views/partials/library-fix-editor.njk #}
<li id="library-fix-{{ surfaceItemId }}" class="library-fix-editor">
  <div class="library-fix-header">
    <span>Library entry: <strong>{{ entry.name }}</strong></span>
    <a class="library-fix-link" href="/library?q={{ entry.name|urlencode }}">Edit full entry &rarr;</a>
  </div>
  <form class="library-fix-form"
        hx-post="/library/{{ entry.id }}/categories"
        hx-target="#library-fix-{{ surfaceItemId }}"
        hx-swap="outerHTML">
    <input type="hidden" name="surfaceItemId" value="{{ surfaceItemId }}">
    <div class="library-fix-fields">
      <div class="library-fix-field">
        <label for="library-fix-recipe-{{ surfaceItemId }}">Recipe category</label>
        <select id="library-fix-recipe-{{ surfaceItemId }}" name="recipeCategory" autofocus>
          {% for cat in RECIPE_CATEGORIES %}
            <option value="{{ cat }}"{% if cat == entry.recipeCategory %} selected{% endif %}>{{ cat }}</option>
          {% endfor %}
        </select>
      </div>
      <div class="library-fix-field">
        <label for="library-fix-grocery-{{ surfaceItemId }}">Grocery category</label>
        <select id="library-fix-grocery-{{ surfaceItemId }}" name="groceryCategory">
          {% for cat in GROCERY_CATEGORIES %}
            <option value="{{ cat }}"{% if cat == entry.groceryCategory %} selected{% endif %}>{{ cat }}</option>
          {% endfor %}
        </select>
      </div>
    </div>
    <div class="library-fix-actions">
      <button type="submit" class="library-fix-save">Save</button>
      <button type="button" class="library-fix-cancel"
              hx-get="/library/cancel-fix?surface={{ surface }}&itemId={{ itemId }}{% if recipeId %}&recipeId={{ recipeId }}&index={{ index }}{% endif %}"
              hx-target="#library-fix-{{ surfaceItemId }}"
              hx-swap="outerHTML">Cancel</button>
    </div>
  </form>
</li>
```

The `surfaceItemId`, `surface`, `itemId`, `recipeId`, `index` values must be passed in via the route handler's view context. The `GET /library/:id/categories-edit` endpoint receives query params or reads them from referrer hints — recommend explicit query params so behavior is deterministic and testable:

```
GET /library/{entry.id}/categories-edit?surface=grocery&itemId=g_abc123
GET /library/{entry.id}/categories-edit?surface=recipe&recipeId=r_xyz&index=3
```

### Editor fragment shape (Categorize — name + categories)

```nunjucks
{# views/partials/library-categorize-editor.njk #}
<li id="library-categorize-{{ surfaceItemId }}" class="library-categorize-editor">
  <div class="library-categorize-header">New library entry</div>
  <form class="library-categorize-form"
        hx-post="/library"
        hx-target="#library-categorize-{{ surfaceItemId }}"
        hx-swap="outerHTML">
    <input type="hidden" name="surfaceItemId" value="{{ surfaceItemId }}">
    <div class="library-categorize-field">
      <label for="library-categorize-name-{{ surfaceItemId }}">Name</label>
      <input id="library-categorize-name-{{ surfaceItemId }}" type="text"
             name="name" value="{{ prefilledName }}" required maxlength="200"
             autocomplete="off" autofocus>
      {% if categorizeError %}
        <div class="library-categorize-error" role="alert">{{ categorizeError }}</div>
      {% endif %}
    </div>
    <div class="library-categorize-fields">
      <div class="library-categorize-field">
        <label for="library-categorize-recipe-{{ surfaceItemId }}">Recipe category</label>
        <select id="library-categorize-recipe-{{ surfaceItemId }}" name="recipeCategory">
          {% for cat in RECIPE_CATEGORIES %}
            <option value="{{ cat }}"{% if cat == prefilledRecipeCategory %} selected{% endif %}>{{ cat }}</option>
          {% endfor %}
        </select>
      </div>
      <div class="library-categorize-field">
        <label for="library-categorize-grocery-{{ surfaceItemId }}">Grocery category</label>
        <select id="library-categorize-grocery-{{ surfaceItemId }}" name="groceryCategory">
          {% for cat in GROCERY_CATEGORIES %}
            <option value="{{ cat }}"{% if cat == prefilledGroceryCategory %} selected{% endif %}>{{ cat }}</option>
          {% endfor %}
        </select>
      </div>
    </div>
    <div class="library-categorize-actions">
      <button type="submit" class="library-categorize-save">Save</button>
      <button type="button" class="library-categorize-cancel"
              hx-get="/library/cancel-fix?surface={{ surface }}&itemId={{ itemId }}{% if recipeId %}&recipeId={{ recipeId }}&index={{ index }}{% endif %}"
              hx-target="#library-categorize-{{ surfaceItemId }}"
              hx-swap="outerHTML">Cancel</button>
    </div>
  </form>
</li>
```

### Categorize POST flow — extending `POST /library`

The existing `POST /library` (Phase 5 LIB-04) already creates entries with `curated:true`, validates aliases via `aliasConflict`, and renders the full Library panel via `respondWithUpdates`. Phase 6 needs to:

1. Detect the Categorize submission (presence of `surfaceItemId` in the form body, or — cleaner — make this distinction via `HX-Current-URL` not being `/library`).
2. Validate the `name` against `aliasConflict` AS IF it were an alias (D-77 specifies "existing entry name match (case-insensitive equality on `entry.name`) OR existing entry alias match"). The existing route only checks aliases via `aliasConflict` — Phase 6 must add a name-equality check (case-insensitive, normalized).
3. On 400 conflict, return 400 + the categorize-editor fragment with `categorizeError` set, preserving user-typed values.
4. On success, instead of `respondWithUpdates(panels: ['partials/library-panel.njk'])`, switch to per-surface OOB based on `HX-Current-URL`.

**Recommendation:** Branch the existing `POST /library` near the top: if `req.headers['hx-current-url']` indicates `/grocery` or `/recipes/:id`, fork into a Categorize-specific helper that returns the per-surface OOB. If `/library` (or no header), keep existing behavior. Alternatively: split into a new endpoint `POST /library/categorize` to keep the existing `POST /library` untouched. **I recommend the branch-in-existing approach** because:
- D-75 explicitly says "Categorize submission reuses existing `POST /library`".
- The toast (`Added entry`) is identical.
- The validation logic is shared.

The branch is a single `if (currentUrl.includes('/grocery') || /\/recipes\/[a-z0-9]+/.test(currentUrl)) { ... }` at the response-shape stage.

### Server-side name conflict check (D-77)

```javascript
function nameConflict(state, name) {
  const norm = name.trim().toLowerCase();
  if (!norm) return undefined;
  const library = (state && Array.isArray(state.library)) ? state.library : [];
  for (const entry of library) {
    if ((entry.name || '').trim().toLowerCase() === norm) return entry;
  }
  return undefined;
}
```

D-77 says "case-insensitive equality on `entry.name` OR alias match via `aliasConflict`". The aliasConflict path uses normalized matching (`normalizeIngredientText`) — same path the existing `POST /library` already runs. Phase 6 only adds the name-equality check to the existing `POST /library` validation — pure addition, no Phase 5 regression.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL encoding for `?text=...` query param | `encodeURIComponent` in Nunjucks | `{{ item.text \| urlencode }}` (Nunjucks built-in core filter) | `urlencode` ships in Nunjucks 3 core; tested; handles edge cases. [VERIFIED: Nunjucks 3.2.4 docs core filters list] |
| Library-entry name-equality check | Custom loop | Tiny helper colocated in `routes/library.js` (5 lines) | Keep `lib/library.js` API surface stable; the check is route-layer concern (D-77) |
| `recipeCategoryOf` / `groceryCategoryOf` heuristic prefill | Re-derive from keyword tables | Call existing exports from `lib/categorize.js` | Already exported (line 350-351 of `lib/categorize.js`) |
| `normalizeIngredientText` for Categorize name prefill | Re-implement strip-quantity logic | Call `lib/library.js#normalizeIngredientText` (re-exported from categorize) | Already battle-tested in extractAndSeed |
| OOB attribute injection on response | Manual `<section ... hx-swap-oob>` markup | `injectOob(html)` from `lib/render.js` | Existing helper; idempotent; handles edge cases |
| Compound row+OOB response | Build via `respondWithUpdates` | Direct `res.type('html').send(rowHtml + '\n' + injectOob(panelHtml))` | `respondWithUpdates` injects OOB on EVERY panel — corrupts primary row swap target. Phase 5 RESEARCH §Pitfall 2 confirmed this |
| HTMX 4xx-swap behavior | New layout meta tag | Existing `views/layout.njk:6` already in place from Plan 05-01 | Verified by `test/library-routes.test.js:160-165` |
| Cancel client-state snapshot serialization | `hx-on::cancel` JS to capture markup | Server-side `GET /library/cancel-fix?...` re-fetch | Always reflects current state; no JS state to manage; matches Phase 5 D-62 |

## Common Pitfalls

### Pitfall 1: `String#includes('/recipes')` matches the recipes index page

**What goes wrong:** A naive `currentUrl.includes('/recipes')` to detect the recipe-detail surface also matches `/recipes` (the recipes index page) and `/recipes` substring inside `/this-week` URLs (it doesn't, but conceptually similar bugs exist).

**Why it happens:** Phase 6's `HX-Current-URL` routing has THREE surfaces, not two. The recipe-detail page is `/recipes/:id`, not `/recipes`. A substring check that doesn't anchor on the `/:id` segment will misroute saves originating from the recipes index page.

**How to avoid:** Use a regex `/\/recipes\/[a-z0-9]+/i` (or similar capturing the id) instead of `String#includes`. Test both the recipes-index page (`/`) and the recipe-detail page (`/recipes/abc123`) explicitly — assert that a save from `/` falls through to the library default surface, while a save from `/recipes/abc123` gets the recipe OOB shape with the correct `recipeId` interpolated.

**Warning signs:** Saves from the Recipes index page produce a 500 error or weird OOB markup; or recipe-detail saves OOB-swap into the wrong section because `recipeId` was extracted incorrectly.

### Pitfall 2: Editor `<li>` outer id must be SURFACE-relative, not entry-relative

**What goes wrong:** Naively setting `id="library-row-{{ entry.id }}"` on the editor (mirroring Phase 5's row-toggle convention) creates a DOM id collision when the same entry is also rendered on the Library tab (which is unlikely on grocery / recipe pages but possible on the Library tab itself). More importantly: the editor needs to outerHTML-swap back to the original SURFACE row (a `<li class="grocery-item">` or a recipe-ingredient `<li>`), NOT to a Library-tab row. If the editor's id is `library-row-{entry.id}`, the Cancel re-fetch endpoint can't tell which surface to render the original row for.

**Why it happens:** Phase 5's outerHTML toggle works because both the read-only row AND the edit form live ONLY on the Library tab. Phase 6's editor has THREE possible parent surfaces (grocery item row, recipe ingredient line, Library tab row), each rendering different DOM.

**How to avoid:** Editor's outer id is `library-fix-{surfaceItemId}` (Fix mode) or `library-categorize-{surfaceItemId}` (Categorize mode), where `surfaceItemId` is `g_abc123` (grocery item id) or `r_xyz_3` (recipe id + index). The original surface row's id matches: grocery `<li id="grocery-item-{{ item.id }}">` (already this — `views/partials/grocery-item.njk:1`) and recipe `<li id="recipe-ing-{{ recipe.id }}-{{ loop.index0 }}">` (Phase 6 adds this).

**Wait — id mismatch?** Yes: the original grocery row is `id="grocery-item-g_abc123"` but the editor row is `id="library-fix-g_abc123"`. After the editor outerHTML-swaps in, the original id is gone. Cancel must re-fetch the original markup and HTMX outerHTML-swaps it back into `#library-fix-g_abc123` — the Cancel response must wrap the grocery-item HTML inside a `<li id="library-fix-g_abc123">` ... NO, that's wrong. Let me re-think:

**Correct pattern:** Cancel response is the ORIGINAL row's full HTML — `<li id="grocery-item-g_abc123" class="grocery-item">...</li>` — and outerHTML-swaps the editor `<li id="library-fix-g_abc123">` BACK to `<li id="grocery-item-g_abc123">`. The id changes during the swap (this is fine — outerHTML replaces the entire element including its id). Same for the open: pencil click outerHTML-swaps `<li id="grocery-item-g_abc123">` -> `<li id="library-fix-g_abc123">`.

The `surfaceItemId` query param threaded through the editor (Save's `hx-target` and Cancel's `hx-get`) is the BRIDGE — both sides know the original surface item's id and can find/restore the original DOM.

### Pitfall 3: HTMX `hx-target="closest li"` traverses from button, NOT form

**What goes wrong:** A pencil button inside a `<li class="grocery-item">` with `hx-target="closest li"` correctly resolves to the parent `<li>`. But once the editor `<li>` swaps in, the form inside the editor with `hx-target="closest li"` also resolves to the parent `<li>` — the editor itself, which has a different id. If the form's `hx-target` was set as `#library-fix-{surfaceItemId}` (explicit id reference), the swap continues to work. If it was `closest li` (selector), it works only because `closest` walks up from the form element.

**Why it happens:** The closest-li selector relies on the editor `<li>` being the form's nearest `<li>` ancestor. If a future markup tweak nests another `<li>` between the form and the editor (unlikely but possible), the selector breaks silently.

**How to avoid:** Use explicit id targets on forms inside editors: `hx-target="#library-fix-{{ surfaceItemId }}"`. The pencil button can use `closest li` (no inner-element complexity). [VERIFIED: Phase 5 `library-row-edit.njk:3` uses `hx-target="#library-row-{{ entry.id }}"` — explicit id, not `closest`]

### Pitfall 4: `urlencode` filter passes through arrays/numbers — but not via `req.query`

**What goes wrong:** A pencil button with `hx-get="/library/categorize-edit?text={{ item.text|urlencode }}"` produces a URL like `/library/categorize-edit?text=garlic%20clove`. Express decodes this back to `req.query.text = 'garlic clove'`. Fine. BUT: if `item.text` contains a `&` or a duplicate query separator, the URL parser may misinterpret.

**Why it happens:** `urlencode` (Nunjucks built-in, alias of `urlencode`) percent-encodes the entire string. Express's `urlencoded` parser correctly decodes `%26` back to `&` in query values. Confirmed safe via `test/_helpers.js:46-69` request shape. No-op pitfall in practice — but worth a test fixture with `item.text = 'salt & pepper'` to verify the round-trip.

**How to avoid:** Test fixture with special-char item text. Assert the resulting Categorize editor's `name` input has the correct value (decoded back).

### Pitfall 5: Categorize POST may create an orphan if save races

**What goes wrong:** User opens Categorize for `salt & pepper` (no library match). Server returns editor. User types name `salt`, hits Save. While editor was open, another tab created entry for `salt`. The Phase 5 POST /library check runs `aliasConflict` which would now match — server returns 400 with the conflict error. User sees inline error, has to start over.

**Why it happens:** This is the documented "concurrent edit" scenario. Mitigated by D-77's inline error path — the user gets the conflict explanation and a link to the existing Library tab entry.

**How to avoid:** Acceptable per "Concurrent-edit prevention is deferred" (Phase 5 / Phase 6 deferred). Test fixture: pre-seed `state.library` with the same name; trigger Categorize POST with the same name; assert 400 + inline error fragment with conflict message.

### Pitfall 6: HX-Current-URL header is OPTIONAL — non-HTMX requests don't send it

**What goes wrong:** Direct `curl` or non-HTMX clients don't send `HX-Current-URL`. Phase 6's per-surface response logic must handle the missing-header case gracefully (default to library surface, or skip OOB and just save).

**Why it happens:** `HX-Current-URL` is set by the HTMX library client-side; any non-HTMX client (e.g., direct API caller, test fixtures that don't set the header) won't send it.

**How to avoid:** `const currentUrl = req.headers['hx-current-url'] || ''`. The default `/library` (Phase 5 row-fragment + footer) branch handles the case fine — if the client isn't HTMX, the response shape doesn't matter (no DOM to swap). Test fixture: a POST `/library/:id/categories` with NO `hx-current-url` header — assert 200 + `Saved categories` toast + a sane response body (Phase 5 row fragment + footer is fine).

### Pitfall 7: `respondWithUpdates` would inject `hx-swap-oob` on the editor `<li>` (Phase 5 RESEARCH §Pitfall 2 inheritance)

**What goes wrong:** Using `respondWithUpdates(req, res, { panels: [...] })` for the Save handler injects `hx-swap-oob="true"` onto every panel. If the editor `<li>` (the primary swap target) is among them, HTMX treats the response as OOB-only — no primary swap occurs, and the editor never closes.

**Why it happens:** `respondWithUpdates` calls `injectOob` on every panel unconditionally (`lib/render.js:27-31`).

**How to avoid:** Use `renderSync` + `injectOob` directly, exactly as `routes/library.js:200-212` (Save) and `routes/library.js:243-245` (Delete) already do. Phase 6 inherits this constraint without modification. D-80 in CONTEXT.md locks this in.

### Pitfall 8: `views/recipe.njk` ingredient `<li>` becomes a presentational container — keep `{{ ing.text }}` visible

**What goes wrong:** Phase 6 D-71 / FIX-04 invariant: recipe pages NEVER substitute `entry.name` for `ing.text`. If the Phase 6 template extension accidentally pulls `entry.name` into the line (e.g., via a server-rendered "Library entry: foo" badge as part of the ingredient line markup), it violates FIX-04.

**Why it happens:** Tempting to display "match metadata" inline.

**How to avoid:** The ingredient line shows ONLY `{{ ing.text }}` + the pencil button. The canonical name appears ONLY inside the editor's `Library entry:` header (D-71 surface). Test fixture: rename a library entry's name; assert the recipe page still shows `ing.text` unchanged. This is the FIX-04 invariant test (CONTEXT.md `<canonical_refs>` line 110).

### Pitfall 9: Double-render on `routes/recipes.js#GET /recipes/:id` already runs `decorateIngredients` — keep idempotency

**What goes wrong:** None expected. Confirmation only: `routes/recipes.js:78` already runs `decorateIngredients(recipe.ingredients, state.library)` per request. Phase 6's per-surface OOB shape calls the same function with the same arguments — same output. No race window, no caching invalidation needed.

**How to avoid:** No action; documenting the invariant. [VERIFIED: `routes/recipes.js:65-81`]

## Code Examples

### Pencil button conditional `hx-get` (grocery item)

```nunjucks
{# views/partials/grocery-item.njk — extension between text and delete #}
<li class="grocery-item{% if item.checked %} is-checked{% endif %}" id="grocery-item-{{ item.id }}">
  <button class="grocery-check" ...>{...}</button>
  <span class="grocery-text">{{ item.text }}</span>
  {% if item.libraryEntryId %}
    <button class="grocery-pencil"
            hx-get="/library/{{ item.libraryEntryId }}/categories-edit?surface=grocery&itemId={{ item.id }}"
            hx-target="closest li"
            hx-swap="outerHTML"
            aria-label="Fix categorization for {{ item.text }}">
      {% include "partials/icon-pencil.njk" %}
    </button>
  {% else %}
    <button class="grocery-pencil"
            hx-get="/library/categorize-edit?text={{ item.text|urlencode }}&surface=grocery&itemId={{ item.id }}"
            hx-target="closest li"
            hx-swap="outerHTML"
            aria-label="Categorize {{ item.text }}">
      {% include "partials/icon-pencil.njk" %}
    </button>
  {% endif %}
  <button class="grocery-delete" ...>{...}</button>
</li>
```

The `aria-label` interpolates `item.text` — safe because it's an HTML attribute, NOT an HTTP header (CLAUDE.md C-04 ASCII rule applies to headers only).

### Pencil button on recipe ingredient line

```nunjucks
{# views/partials/recipe-ingredient-line.njk — NEW partial #}
<li id="recipe-ing-{{ recipe.id }}-{{ index }}" class="recipe-ingredient-line">
  <span class="recipe-ingredient-text">{{ ing.text }}</span>
  {% if ing.libraryEntryId %}
    <button class="recipe-pencil"
            hx-get="/library/{{ ing.libraryEntryId }}/categories-edit?surface=recipe&recipeId={{ recipe.id }}&index={{ index }}"
            hx-target="closest li"
            hx-swap="outerHTML"
            aria-label="Fix categorization for {{ ing.text }}">
      {% include "partials/icon-pencil.njk" %}
    </button>
  {% else %}
    <button class="recipe-pencil"
            hx-get="/library/categorize-edit?text={{ ing.text|urlencode }}&surface=recipe&recipeId={{ recipe.id }}&index={{ index }}"
            hx-target="closest li"
            hx-swap="outerHTML"
            aria-label="Categorize {{ ing.text }}">
      {% include "partials/icon-pencil.njk" %}
    </button>
  {% endif %}
</li>
```

```nunjucks
{# views/recipe.njk — replace lines 19-29 #}
<section class="recipe-ingredients" id="recipe-ingredient-groups-{{ recipe.id }}">
  <h2>Ingredients</h2>
  {% for group in recipe.ingredientGroups %}
    <h3 class="ingredient-category">{{ group.category }}</h3>
    <ul>
      {% for ing in group.items %}
        {% set index = loop.index0 %}
        {% include "partials/recipe-ingredient-line.njk" %}
      {% endfor %}
    </ul>
  {% else %}
    <p class="empty">No ingredients found.</p>
  {% endfor %}
</section>
```

**Index-stability note:** `loop.index0` is per-group, but the per-line id (`recipe-ing-{{ recipe.id }}-{{ index }}`) needs uniqueness across the whole `<section>`. Either:
- (a) flatten ingredients before grouping for stable ids — OR
- (b) include the group category in the id: `recipe-ing-{{ recipe.id }}-{{ group.category }}-{{ loop.index0 }}` — OR
- (c) use a precomputed flat index attached during `decorateIngredients`.

Option (c) is the cleanest. Recommend extending `decorateIngredients` to attach `globalIndex` per item — but that's a `lib/calc.js` mutation Phase 6 was supposed to avoid. Alternative: Use `partials/recipe-ingredient-groups.njk` to pre-flatten and emit unique indices. Planner decides.

**Simplest approach:** option (b) — include the category. `recipe-ing-{{ recipe.id }}-{{ group.category }}-{{ loop.index0 }}`. No `lib/calc.js` change. The Cancel endpoint receives `category` and `index` and reconstructs the line. Slightly verbose but zero infrastructure cost.

### `routes/library.js` — new POST /library/:id/categories handler

```javascript
// New route, append to routes/library.js after existing routes.
router.post('/library/:id/categories', (req, res) => {
  const id = req.params.id;
  const state = storage.get();
  const library = Array.isArray(state.library) ? state.library : [];
  const idx = library.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).type('text').send('Not found');

  const existing = library[idx];
  const body = req.body || {};
  const recipeCategory = typeof body.recipeCategory === 'string' ? body.recipeCategory : '';
  const groceryCategory = typeof body.groceryCategory === 'string' ? body.groceryCategory : '';
  const surfaceItemId = typeof body.surfaceItemId === 'string' ? body.surfaceItemId : '';

  // Validation: enum check on both categories.
  function renderEditFormError(errorMsg) {
    const formView = {
      entry: { ...existing, recipeCategory, groceryCategory },
      surfaceItemId,
      categorizeError: errorMsg,
      RECIPE_CATEGORIES,
      GROCERY_CATEGORIES
    };
    const html = renderSync(req, 'partials/library-fix-editor.njk', formView);
    return res.status(400).type('html').send(html);
  }

  if (!RECIPE_CATEGORIES.includes(recipeCategory)) {
    return renderEditFormError(`Invalid recipe category '${recipeCategory}'.`);
  }
  if (!GROCERY_CATEGORIES.includes(groceryCategory)) {
    return renderEditFormError(`Invalid grocery category '${groceryCategory}'.`);
  }

  // Mutate. Sets curated:true per FIX-01 SC#1 / D-74.
  library[idx] = { ...existing, recipeCategory, groceryCategory, curated: true };
  state.library = library;
  storage.save();

  setToast(res, 'Saved categories');
  return respondPerSurface(req, res, state, id);
});
```

The `respondPerSurface` helper handles the three OOB shapes per the routing logic in "Per-surface OOB response shapes" above.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`. Validation section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node 24.12.0) |
| Config file | None — runs via `node --test test/*.test.js` |
| Quick run command | `node --test test/library-categories-routes.test.js` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIX-01 | Grocery row pencil button HTML present (matched + unmatched cases) | HTTP integration | `node --test test/grocery-routes.test.js` | Extend existing |
| FIX-01 | GET /library/:id/categories-edit returns Fix editor fragment with both dropdowns + Save + "Edit full entry" link | HTTP smoke | `node --test test/library-categories-routes.test.js` | New (or extend library-routes) |
| FIX-01 | POST /library/:id/categories saves curated:true and OOB-swaps `#grocery-list` when HX-Current-URL is /grocery | HTTP integration | `node --test test/library-categories-routes.test.js` | New |
| FIX-01 | POST /library/:id/categories item moves to new category group on Save (regression test) | HTTP integration | `node --test test/library-categories-routes.test.js` | New |
| FIX-02 | Recipe ingredient line pencil button HTML present (matched + unmatched cases) | HTTP integration | `node --test test/recipes.test.js` | Extend existing |
| FIX-02 | Recipe page has stable per-line id `recipe-ing-{recipe.id}-{group.category}-{index}` | HTTP smoke | `node --test test/recipes.test.js` | Extend existing |
| FIX-02 | Recipe page has stable section id `recipe-ingredient-groups-{recipe.id}` | HTTP smoke | `node --test test/recipes.test.js` | Extend existing |
| FIX-02 | POST /library/:id/categories OOB-swaps `#recipe-ingredient-groups-{recipeId}` when HX-Current-URL is /recipes/:id | HTTP integration | `node --test test/library-categories-routes.test.js` | New |
| FIX-03 | GET /library/:id/categories-edit fragment does NOT contain a name input field (categories-only invariant) | HTTP smoke | `node --test test/library-categories-routes.test.js` | New |
| FIX-03 | Fix editor contains "Edit full entry" link with `href="/library?q={encoded}"` | HTTP smoke | `node --test test/library-categories-routes.test.js` | New |
| FIX-04 | Recipe page rendering shows `ing.text` (NOT `entry.name`) — invariant under entry rename | HTTP integration | `node --test test/recipes.test.js` | New test in existing file |
| FIX-04 | Grocery item rendering shows `item.text` (NOT `entry.name`) — invariant under entry rename | HTTP integration | `node --test test/grocery-routes.test.js` | New test in existing file |
| Categorize | GET /library/categorize-edit?text=... returns fragment with name pre-filled via normalizeIngredientText, dropdowns pre-selected via heuristic | HTTP smoke | `node --test test/library-categories-routes.test.js` | New |
| Categorize | POST /library (Categorize submission with HX-Current-URL=/grocery) creates entry with curated:true and OOB-swaps `#grocery-list` | HTTP integration | `node --test test/library-categories-routes.test.js` | New |
| Categorize | POST /library 400 on name conflict returns categorize-editor fragment with inline `categorizeError` slot populated, preserving user-typed values | HTTP integration | `node --test test/library-categories-routes.test.js` | New |
| Categorize | POST /library 400 on alias conflict (same as Phase 5 path) — regression test that adds `surfaceItemId` body field doesn't break existing flow | HTTP integration | `node --test test/library-routes.test.js` | Extend existing |
| Cancel | GET /library/cancel-fix?surface=grocery&itemId=g_xxx returns the original grocery-item.njk fragment | HTTP smoke | `node --test test/library-categories-routes.test.js` | New |
| Cancel | GET /library/cancel-fix?surface=recipe&recipeId=r_xxx&category=Veg&index=2 returns the original recipe-ingredient-line.njk fragment | HTTP smoke | `node --test test/library-categories-routes.test.js` | New |
| Edge case | POST /library/:id/categories with NO `hx-current-url` header falls through to default (library) surface response — does not 500 | HTTP smoke | `node --test test/library-categories-routes.test.js` | New |
| Edge case | Pencil button `aria-label` interpolates non-ASCII `item.text` correctly (e.g., crème fraîche) | HTTP smoke | `node --test test/library-categories-routes.test.js` | New |
| Edge case | Item text containing special chars (`&`, `(`, `'`) round-trips through `urlencode` filter and decodes correctly on Categorize editor open | HTTP integration | `node --test test/library-categories-routes.test.js` | New |
| Edge case | POST /library/:id/categories returns 404 for unknown id | HTTP smoke | `node --test test/library-categories-routes.test.js` | New |
| Edge case | POST /library/:id/categories returns 400 with editor fragment for invalid recipeCategory enum | HTTP integration | `node --test test/library-categories-routes.test.js` | New |
| Edge case | POST /library/:id/categories returns 400 with editor fragment for invalid groceryCategory enum | HTTP integration | `node --test test/library-categories-routes.test.js` | New |

### Per-surface OOB swap test pattern

```javascript
// Pattern: 3 surfaces x 1 endpoint = 3 nearly-identical tests parameterized on
// HX-Current-URL header value. Each asserts the OOB target id and absence of
// the OTHER surfaces' OOB targets.

test('POST /library/:id/categories OOB-swaps #grocery-list when HX-Current-URL is /grocery', async () => {
  // Seed: one library entry, one grocery item that matches it
  const { newLibraryEntry } = require('../lib/library');
  const garlic = newLibraryEntry({
    name: 'garlic', aliases: ['garlic'],
    recipeCategory: 'Seasoning', groceryCategory: 'Aisle', curated: false
  });
  seedLibrary([garlic]);
  // Add grocery item that matches the entry
  await helpers.request(ctx.port, { method: 'POST', path: '/grocery', body: { text: 'garlic' } });

  // Save new categories from the grocery surface
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${garlic.id}/categories`,
    body: {
      recipeCategory: 'Veg',
      groceryCategory: 'Produce',
      surfaceItemId: 'placeholder'  // Not validated server-side; planner decides
    },
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/grocery' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.doesNotMatch(res.body, /id="recipe-ingredient-groups-/);
  assert.doesNotMatch(res.body, /id="library-panel"/);
  assert.strictEqual(res.headers['x-status-toast'], 'Saved categories');

  // State: entry has new categories + curated:true
  const state = storage.get();
  const updated = state.library.find(e => e.id === garlic.id);
  assert.strictEqual(updated.recipeCategory, 'Veg');
  assert.strictEqual(updated.groceryCategory, 'Produce');
  assert.strictEqual(updated.curated, true);

  // Re-render: verify the item moves to the Produce category group
  const after = await helpers.request(ctx.port, { path: '/grocery' });
  assert.match(after.body, /<h3 class="grocery-category">Produce<\/h3>[^<]*[\s\S]*?>garlic</);
});
```

### Sampling Rate

- **Per task commit:** `node --test test/library-categories-routes.test.js` (~3-5 seconds)
- **Per wave merge:** `npm test` (full suite — currently 349 tests; Phase 6 adds ~25-30 more, ~10s total)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/library-categories-routes.test.js` — covers FIX-01..FIX-04 + Categorize + Cancel + edge cases (NEW file; ~25-30 tests)
- [ ] `test/grocery-routes.test.js` extension — pencil button HTML presence + conditional `hx-get` (~3 tests)
- [ ] `test/recipes.test.js` extension — pencil button + per-line id + section id + FIX-04 invariant (~5 tests)
- [ ] `test/library-routes.test.js` extension — POST /library + `surfaceItemId` body field doesn't break existing flow (~1 regression test)
- [ ] `views/partials/recipe-ingredient-groups.njk` — NEW thin wrapper partial for OOB target rendering
- [ ] `views/partials/recipe-ingredient-line.njk` — NEW partial for line-level rendering (Cancel-fragment endpoint reuses)
- [ ] Test fixtures: matched + unmatched grocery items, matched + unmatched recipe ingredients (no fixture file infrastructure needed; inline per-test seeding via `seedLibrary` + `seedRecipes` is the existing convention)

## Runtime State Inventory

Phase 6 is NOT a rename / refactor / migration phase. It adds new affordances and routes without renaming existing identifiers. Skipping detailed runtime state walkthrough.

**Sanity checks performed:**

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 6 adds no new state shape; mutations are confined to existing `state.library[].recipeCategory` / `state.library[].groceryCategory` / `state.library[].curated` (all already in the entry shape since Phase 1 FND-01) | None |
| Live service config | None — single-user JSON file storage, no external services | None |
| OS-registered state | None — no new server processes, no new ports, no new env vars, no new systemd units | None |
| Secrets/env vars | None — no new config | None |
| Build artifacts / installed packages | None — no build step (CLAUDE.md C-01); no new npm dependencies; no compiled artifacts | None |

## Environment Availability

Phase 6 does not introduce any new external dependencies. Skipping detailed audit. All required tooling is already in place from Phase 5:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runner + server | ✓ | 24.12.0 (per STACK.md) | — |
| npm | Package management | ✓ | 8.19.2+ | — |
| Express 4 | HTTP routing | ✓ | 4.21.1 | — |
| Nunjucks 3 | Template engine | ✓ | 3.2.4 (`urlencode` filter is a core 3.x feature) | — |
| HTMX 2.0.4 | Vendored | ✓ | 2.0.4 | — |
| node:test | Test framework | ✓ | Node built-in | — |

Step 2.6: SKIPPED (no external dependencies introduced).

## Security Domain

`security_enforcement` is not explicitly set in `.planning/config.json` — defaulting to enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user LAN-only trust model (CLAUDE.md C-05); no auth introduced |
| V3 Session Management | no | No sessions; stateless requests |
| V4 Access Control | no | No multi-user; no role-based access |
| V5 Input Validation | yes | Enum validation on `recipeCategory` / `groceryCategory` (`RECIPE_CATEGORIES.includes(...)`); name length check (`maxlength="200"`); `aliasConflict` + name-equality on Categorize submission |
| V6 Cryptography | no | No new crypto; no new secrets |

### Known Threat Patterns for {Express 4 + HTMX + Nunjucks}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via user-typed name in inline error | Tampering | Nunjucks `autoescape: true` (server.js:9) escapes `{{ name }}` interpolation by default. Inline error template uses `{{ categorizeError }}` which inherits autoescape. [VERIFIED: server.js:9; existing Phase 5 test `test/library-routes.test.js:395` asserts single quotes become `&#39;`] |
| XSS via `aria-label` interpolation of `item.text` | Tampering | Nunjucks `autoescape: true` escapes attribute values. Same path as Phase 5 `aria-label="Delete {{ item.text }}"` (already shipped) |
| Open URL injection via `?text=...` query param | Tampering | `urlencode` filter percent-encodes; Express decodes back to `req.query.text` as a plain string; the value is escaped on render via autoescape |
| CSRF on state-mutating POST | Spoofing | Single-user LAN-only trust model — accepted risk per CLAUDE.md C-05; no CSRF tokens elsewhere in the app |
| HTTP-header injection via toast | Tampering | `setToast` strips `\r\n` and slices to 200 chars (routes/library.js:11). Phase 6 toasts are literal ASCII verbs (`Saved categories`, `Added entry`) — no interpolation, zero injection surface |
| Path traversal via `/library/:id` | Tampering | Express route param matches whatever is passed; lookup is by exact id match against `state.library`. Unknown ids 404 cleanly. Already covered by Phase 5 tests |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nunjucks 3.2.4 ships the `urlencode` filter in core (not requiring a custom filter registration) | Don't Hand-Roll table; Code Examples | Low — Nunjucks core filters list documented to include `urlencode`; if absent the planner can register `env.addFilter('urlencode', encodeURIComponent)` in `server.js:8-12` (one line) |
| A2 | The recipe-detail surface is uniquely identifiable from `HX-Current-URL` via regex `/\/recipes\/[a-z0-9]+/i` | Per-surface OOB response shapes; Pitfall 1 | Low — `lib/id.js` produces 10-char base36 ids; if id format changes, the regex needs updating. Tests should pin on the actual id format. [Mitigated by explicit test fixtures] |
| A3 | The Categorize editor's `surfaceItemId` query/body param is sufficient for the Cancel endpoint to reconstruct the original surface row from state | Implementation Approach; Pitfall 2 | Medium — for grocery, `state.grocery.find(g => g.id === itemId)` is straightforward. For recipe, `state.recipes.find(r => r.id === recipeId).ingredients[index]` works IF index is stable. Pitfall 8 details the index-stability concern; planner picks resolution |
| A4 | Phase 6 does NOT need to mutate `lib/calc.js` — `buildGroceryView` and `decorateIngredients` already attach `libraryEntryId` per Phase 3 | Architecture sections | Verified by reading `lib/calc.js:96-115` and `:235-242`. [VERIFIED — not assumed] |
| A5 | The planner can land Phase 6 in 4 sequential waves; full-suite tests pass at each wave gate | Summary; Validation | Low — every needed helper already exists; no Phase 5 regression should occur if `routes/library.js` POST /library is augmented carefully (Categorize branch added below the existing valid path) |
| A6 | The recipe ingredient per-line id format `recipe-ing-{recipe.id}-{group.category}-{loop.index0}` is unambiguously parseable in the Cancel endpoint | Code Examples; Pitfall 8 | Low — categories are a fixed enum (`RECIPE_CATEGORIES`); index is integer; recipe.id is base36. The Cancel endpoint receives all three as separate query params, so no parsing of a compound id is needed |
| A7 | Concurrent-edit (two tabs Fix the same entry) is acceptable per Phase 5 deferred + Phase 6 deferred lists | Pitfall 5; Deferred Ideas | Documented as accepted in CONTEXT.md `<deferred>` |

## Open Questions

1. **Index-stability strategy for recipe ingredient lines.**
   - What we know: Each `<li>` needs a stable id for outerHTML toggling. `loop.index0` resets per group.
   - What's unclear: Whether to use compound id (`recipe.id + group.category + loop.index0`) or pre-flatten in `decorateIngredients` to attach a `globalIndex`.
   - Recommendation: **Compound id (Pitfall 8 option b)** — no `lib/calc.js` change. The Cancel endpoint receives `category` and `index` as separate query params; it rebuilds the line by walking `decorateIngredients`'s output for that category and picking `[index]`. Slight code duplication; zero infrastructure cost. Locked in if planner agrees.

2. **Cancel-fragment endpoint URL shape.**
   - What we know: One endpoint serving two surfaces (grocery, recipe) is desirable.
   - What's unclear: Whether to use `GET /library/cancel-fix?surface=...` or two endpoints (`GET /grocery/:id/row-fragment` and `GET /recipes/:id/ingredient-line?category=...&index=...`).
   - Recommendation: **One consolidated endpoint** with surface query param. Lives in `routes/library.js` (next to the editor-fragment endpoints) so Phase 6 doesn't sprawl across multiple route files. The endpoint is functionally identical regardless of which file owns it.

3. **What does "full panel re-render" mean for the `/library` surface specifically?**
   - What we know: D-72 says "full panel re-render"; CONTEXT.md last bullet (Claude's Discretion) recommends row-fragment for `/library`.
   - What's unclear: Whether the Library tab's existing inline-edit row (Phase 5 `library-row.njk`) is the right swap target when Save originates from `/library` — vs. re-rendering the whole panel.
   - Recommendation: **Row fragment + OOB footer** (mirrors Phase 5 POST /library/:id success path verbatim). Reasoning: D-72 says "full panel" but the Phase 5 row-level swap ALREADY works on the Library tab and is more performant. The "full panel" intent is for grocery and recipe surfaces where the affected item moves between groups; on /library the row stays in place (alphabetical sort doesn't depend on categories).

4. **Should `surfaceItemId` be a body field on Save POST, or only embedded in the editor's `hx-target`?**
   - What we know: HTMX `hx-target` accepts a CSS selector; the form's `hx-target="#library-fix-{{ surfaceItemId }}"` doesn't require any body field.
   - What's unclear: Whether the server needs `surfaceItemId` in the POST body to render error fragments (400 path) with the correct outer `<li>` id for outerHTML.
   - Recommendation: **Yes, include `surfaceItemId` as a hidden form field.** On 400, the server re-renders the editor fragment — the outer `<li>` id MUST match the `hx-target` for outerHTML to land correctly. The hidden field is the cleanest way to round-trip this value through the form submit cycle.

## State of the Art

No external library / framework changes for Phase 6 — pure project-internal extension. Phase 5's HTMX 2.0.4 `responseHandling` config remains in place; no further upstream API changes affect this phase.

## Sources

### Primary (HIGH confidence — verified against the live codebase)

- `routes/library.js` (Phase 5, complete) — Save handler pattern, Cancel handler pattern, compound row+OOB-footer response, `setToast` helper, route registration order
- `routes/weeks.js:38-42` — Canonical `HX-Current-URL` header read + substring routing pattern (the actual-existing analog; CONTEXT.md erroneously said `routes/recipes.js`)
- `routes/grocery.js` — Per-surface OOB shape for `/grocery` (`#grocery-list` panel via `buildGroceryView`)
- `routes/recipes.js:65-81` — `GET /recipes/:id` runs `decorateIngredients` on every render; OOB target `#recipe-ingredient-groups-{recipe.id}` would re-render the same data
- `lib/render.js:14-25` — `renderSync` and `injectOob` exports verified
- `lib/calc.js:81-127, 226-250` — `buildGroceryView` and `decorateIngredients` already attach `libraryEntryId`; comment at line 111 confirms Phase 3 anticipated Phase 6
- `lib/library.js:149-161` — `aliasConflict` exact signature and behavior
- `lib/categorize.js:349-355` — `RECIPE_CATEGORIES`, `GROCERY_CATEGORIES`, `recipeCategoryOf`, `groceryCategoryOf`, `normalizeIngredientText` exports
- `views/layout.njk:6` — HTMX 4xx-swap meta tag in place
- `views/partials/library-row-edit.njk` — Reference partial structure; outer-DOM-id-on-li pattern
- `test/library-routes.test.js` (lines 200-525) — Test idioms for HTTP-level coverage of fragment routes, 400 paths, 404 paths, OOB assertions, state-mutation verification
- `test/weeks-routes.test.js:107-128` — Canonical `HX-Current-URL` test idiom (lowercase header key, full URL value)
- `test/_helpers.js:46-69` — Request helper accepts custom headers; default content-type is `application/x-www-form-urlencoded`
- `.planning/phases/05-library-tab/05-RESEARCH.md` (lines 374-453) — HTMX 4xx-swap pitfall analysis; respondWithUpdates corruption pitfall; outerHTML row-toggle pattern; compound row+OOB pattern
- `.planning/phases/06-inline-fix/06-CONTEXT.md` D-68..D-82 — Locked decisions
- `.planning/phases/06-inline-fix/06-UI-SPEC.md` — Visual + interaction contract; settled all UI Claude's-Discretion items

### Secondary (MEDIUM confidence — Nunjucks/HTMX docs cross-referenced via training)

- Nunjucks 3 core filters list — `urlencode` documented as a core filter [ASSUMED A1; planner can register a custom filter as fallback if needed]
- HTMX 2.0.4 documentation — `responseHandling` config; `hx-current-url` automatic header attachment; OOB swap behavior

### Tertiary (LOW confidence — none)

No tertiary sources used. All findings verified against the live codebase or Phase 5 RESEARCH.md (itself HIGH-confidence).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package and pattern already shipped in Phases 1-5; no new dependencies
- Architecture: HIGH — every helper, view-builder, route convention, and test idiom already exists; Phase 6 is pure extension
- Pitfalls: HIGH — Phase 5 RESEARCH.md surfaced 7 pitfalls; Phase 6 inherits them and adds 2 surface-specific ones (HX-Current-URL false-match for `/recipes` index; surface-relative editor `<li>` id)
- Implementation Approach: HIGH — concrete, file-by-file, with code samples that compile against the actual Phase 5 codebase

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days for stable codebase; no upstream changes anticipated)

## RESEARCH COMPLETE

Phase 6 implementation approach is fully derivable from Phase 5 patterns. 4 new routes, 2 new editor partials, 1 factored ingredient-line partial, and a small per-surface OOB-routing helper are the entire architectural footprint; ~25-30 new tests cover the four FIX requirements plus Categorize, Cancel, and edge cases.
