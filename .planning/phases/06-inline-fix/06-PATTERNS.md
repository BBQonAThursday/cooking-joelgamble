# Phase 6: Inline Fix - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 9 (3 NEW partials, 1 NEW test, 5 EXTEND)
**Analogs found:** 9 / 9 (100% coverage — every pattern Phase 6 needs already lives in the codebase)

---

## File Classification

| New/Modified File | NEW/EXTEND | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|-----------|------|-----------|----------------|---------------|
| `routes/library.js` | EXTEND | controller (Express router) | request-response + per-surface OOB | self (Phase 5 `POST /library/:id` lines 122-213, `GET /library/:id/edit` lines 48-58, `DELETE /library/:id` lines 219-246) + `routes/weeks.js:38-43` (HX-Current-URL idiom) | exact (self-extension; only the surface-routing forks are new) |
| `views/partials/library-fix-editor.njk` | NEW | view fragment (inline editor) | request-response (HTMX outerHTML) | `views/partials/library-row-edit.njk` (Phase 5 — same `<li>` outer DOM id + Save/Cancel + hx-target=closest-li toggle) | exact-shape, different field set |
| `views/partials/library-categorize-editor.njk` | NEW | view fragment (inline editor) | request-response (HTMX outerHTML) | `views/partials/library-row-edit.njk` (Save/Cancel structure) + `views/library.njk` `library-add` form (3-field shape: name + 2 dropdowns; pulled in via reading the manual-add markup) | exact-shape, different field set |
| `views/partials/recipe-ingredient-line.njk` | NEW (recommended by RESEARCH §6) | view fragment (single line) | request-response | `views/partials/grocery-item.njk` (single-row partial with `<li id="…">`, button stack pattern) | role-match (same partial-per-row idiom; recipe page currently inlines the line) |
| `views/partials/grocery-item.njk` | EXTEND | view fragment | request-response | self — existing buttons in same file (`.grocery-check` and `.grocery-delete`) | exact (self-extension; pencil mirrors the `×` button shape) |
| `views/recipe.njk` | EXTEND | view (full page) | request-response | self (lines 19-29 ingredient block) — refactor to include the new line partial | exact (self-extension) |
| `public/styles.css` | EXTEND | static asset | n/a | self — `.grocery-delete` (lines 314-323) for icon-button shape; `.library-add button` (lines 436-444) for Save pill; `.library-row` (lines 476-484) for `<li>` row container; `@media (max-width: 640px)` block (line 413) for stack-on-narrow | exact (UI-SPEC.md ships ~140-line append) |
| `test/library-categories-routes.test.js` | NEW | test (HTTP integration) | request-response | `test/library-routes.test.js` (Phase 5 — `seedLibrary`, `makeEntry`, `_helpers.request` with `headers`) + `test/weeks-routes.test.js:107-128` (HX-Current-URL header idiom) | exact (same scaffold; new file recommended for size) |
| `test/grocery-routes.test.js` | EXTEND | test (HTTP integration) | request-response | self (existing `addItem` helper + assertion idioms) | exact (self-extension) |
| `test/recipes.test.js` | EXTEND | test (HTTP integration) | request-response | self (existing scrape monkey-patch + `setupDataDir`/`startTestServer` scaffold) + `test/weeks-routes.test.js:107-128` (HX-Current-URL test idiom) | exact (self-extension) |

> Note: per CONTEXT canonical_refs the tests file is `test/recipes-routes.test.js`, but the actual file in repo is `test/recipes.test.js` (verified via Glob). All pattern citations below use the real path.

---

## Pattern Assignments

### 1. `routes/library.js` (EXTEND — controller, request-response + per-surface OOB)

**Analog A — `routes/library.js:48-58` (GET edit-form fragment).** Same shape as Phase 6's `GET /library/:id/categories-edit`: look up entry, 404 if not found, render a single partial via `renderSync`, send as `text/html`.

```javascript
// routes/library.js:48-58 — Phase 5 GET /library/:id/edit
router.get('/library/:id/edit', (req, res) => {
  const state = storage.get();
  const entry = entryViewById(state, req.params.id);
  if (!entry) return res.status(404).type('text').send('Not found');
  const html = renderSync(req, 'partials/library-row-edit.njk', {
    entry,
    RECIPE_CATEGORIES,
    GROCERY_CATEGORIES
  });
  res.type('html').send(html);
});
```

**What to copy verbatim for `GET /library/:id/categories-edit`:**
- 404 short-circuit on `entryViewById(state, id)` returning undefined.
- `renderSync(req, 'partials/library-fix-editor.njk', { entry, RECIPE_CATEGORIES, GROCERY_CATEGORIES, ... })`.
- `res.type('html').send(html)`.

**What to change:**
- Template name: `partials/library-fix-editor.njk` (NEW) instead of `partials/library-row-edit.njk`.
- Add `surfaceItemId`, `surface`, `itemId`, `recipeId`, `index` from `req.query` (RESEARCH §line 401-405) into the render context — the editor uses these for its outer `<li>` id and Cancel hx-get URL.
- Cancel target endpoint reads the same query params back: `GET /library/cancel-fix?surface=...&itemId=...&recipeId=...&index=...`.

---

**Analog B — `routes/library.js:122-213` (POST edit save).** Phase 6's `POST /library/:id/categories` mirrors this body almost verbatim — the difference is the validation set (categories only, no name/aliases) and the per-surface response shape.

```javascript
// routes/library.js:122-145 — Phase 5 POST /library/:id (top half)
router.post('/library/:id', (req, res) => {
  const id = req.params.id;
  const state = storage.get();
  const library = Array.isArray(state.library) ? state.library : [];
  const idx = library.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).type('text').send('Not found');

  const existing = library[idx];
  const body = req.body || {};
  const recipeCategory = typeof body.recipeCategory === 'string' ? body.recipeCategory : '';
  const groceryCategory = typeof body.groceryCategory === 'string' ? body.groceryCategory : '';

  function renderEditFormError(errorMsg) {
    // ... renders partials/library-row-edit.njk with status 400, no toast ...
    return res.status(400).type('html').send(html);
  }

  if (!RECIPE_CATEGORIES.includes(recipeCategory)) {
    return renderEditFormError(`Invalid recipe category '${recipeCategory}'.`);
  }
  if (!GROCERY_CATEGORIES.includes(groceryCategory)) {
    return renderEditFormError(`Invalid grocery category '${groceryCategory}'.`);
  }
```

**What to copy verbatim:**
- 404 short-circuit on missing entry (`if (idx === -1) return res.status(404).type('text').send('Not found');`).
- Defensive `typeof body.X === 'string' ? body.X : ''` body-field unpacking.
- `RECIPE_CATEGORIES.includes(...)` / `GROCERY_CATEGORIES.includes(...)` enum checks.
- `renderEditFormError` closure that re-renders the editor with `status(400)` and NO `setToast` (D-78 silent-400).
- ESL-spread mutation: `library[idx] = { ...existing, recipeCategory, groceryCategory, curated: true };` (preserves any future entry fields per CLAUDE.md extensibility note).
- `state.library = library; storage.save();`.

**What to change:**
- Drop `name`, `aliases`, `aliasesRaw` parsing — Fix is categories-only (D-74).
- Drop `aliasConflict` validation — Fix never touches name/aliases.
- 400 path renders `partials/library-fix-editor.njk` (NEW), not `partials/library-row-edit.njk`.
- Toast: `setToast(res, 'Saved categories')` instead of `'Saved entry'` (D-78).
- Replace the Phase 5 final compound row+OOB-footer (`rowHtml + injectOob(footerHtml)`) with `respondPerSurface(req, res, state, id)` (the new helper from RESEARCH §716-755). Surface routing per D-73.

---

**Analog C — `routes/weeks.js:38-43` (HX-Current-URL idiom — VERIFIED in RESEARCH §1 as the actual location, NOT `routes/recipes.js` as CONTEXT.md claims).**

```javascript
// routes/weeks.js:38-43 — POST /this-week/recipes/:id
const currentUrl = req.headers['hx-current-url'] || '';
const context = currentUrl.includes('/this-week') ? 'this-week' : 'recipes';
respondWithUpdates(req, res, {
  panels: ['partials/recipe-card.njk', 'partials/tag-toggle.njk'],
  extra: { r: decoratedRecipe, id: decoratedRecipe.id, isTagged: result.isTagged, context }
});
```

**What to copy:** `req.headers['hx-current-url'] || ''` (lowercase key, default empty string per Pitfall 6). Substring `.includes(...)` for the `/grocery` and `/library` branches.

**What to change:**
- Phase 6 has THREE branches, not two (`/grocery`, `/recipes/:id`, `/library`).
- The `/recipes/:id` branch needs a regex (NOT `.includes`) per RESEARCH §Pitfall 1: `currentUrl.match(/^[^?#]*\/recipes\/([a-z0-9]+)/i)` so the recipes-INDEX page (`/`) does not false-match and so the `recipeId` is captured for the OOB target id.
- Do NOT use `respondWithUpdates` — it injects `hx-swap-oob` on the primary swap target (RESEARCH §Pitfall 7). Use the Analog D pattern below.

---

**Analog D — `routes/library.js:200-212` (compound row + OOB-panel via `renderSync` + `injectOob`) AND `routes/library.js:243-245` (empty-primary + OOB-only).**

```javascript
// routes/library.js:200-212 — Phase 5 success path
setToast(res, 'Saved entry');
const updatedView = buildLibraryView(state);
const updatedEntry = updatedView.entries.find(e => e.id === id);
const rowHtml = renderSync(req, 'partials/library-row.njk', {
  entry: updatedEntry, RECIPE_CATEGORIES, GROCERY_CATEGORIES
});
const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', updatedView));
res.type('html').send(rowHtml + '\n' + footerHtml);
```

```javascript
// routes/library.js:243-245 — Phase 5 DELETE — empty primary + OOB panel
const updatedView = buildLibraryView(state);
const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', updatedView));
res.type('html').send(footerHtml);
```

**What to copy verbatim:**
- `renderSync(req, template, ctx)` for any non-OOB primary fragment.
- `injectOob(renderSync(req, template, ctx))` for OOB fragments.
- `res.type('html').send(...)` to combine.

**What to change for Phase 6's three response shapes (D-72/D-73):**
- **`/grocery` surface**: empty-primary + OOB-only pattern (Analog D-2). Send `injectOob(renderSync(req, 'partials/grocery-list.njk', buildGroceryView(state)))`. The editor `<li>` evaporates because the primary swap target receives empty content (Pitfall RESEARCH §A3 explains this — VERIFIED `routes/library.js:243-245` already uses this idiom).
- **`/recipes/:id` surface**: empty-primary + OOB-only. Send `injectOob(renderSync(req, 'partials/recipe-ingredient-groups.njk', { recipe: { id, ingredientGroups: decorateIngredients(...) } }))`. NEEDS new partial `partials/recipe-ingredient-groups.njk` per RESEARCH §356 (extracted from the inline `<section>` in `views/recipe.njk:19-29` so both initial render and OOB swap share one source).
- **`/library` surface**: row-fragment + OOB-footer (Analog D-1, the Phase 5 row idiom). Per CONTEXT.md "Claude's Discretion" final bullet, the planner picks row-fragment for `/library`. NOTE: the editor's outer id is `library-fix-{surfaceItemId}` which differs from the row's `library-row-{entry.id}` — the response cannot be just the row fragment because HTMX would not find a target. Either: (a) the editor on `/library` keeps `library-row-{entry.id}` as its outer id (collides with surface convention but Library-tab is an isolated surface so no collision in practice); or (b) full-panel re-render for `/library` too (uniform with the other two). RESEARCH-VERIFIED: planner decides; recommend (b) for uniformity.

---

**Analog E — `routes/library.js:63-114` (POST /library, manual-add — Categorize submission reuses this).**

The Categorize editor's Save submits to existing `POST /library`. Phase 6 must add ONE branch near the response stage:

```javascript
// EXISTING — routes/library.js:109-113 — Phase 5 success tail
setToast(res, 'Added entry');
respondWithUpdates(req, res, {
  panels: ['partials/library-panel.njk'],
  extra: buildLibraryView(state)
});
```

**What to add for Phase 6 (D-75 — branch on `HX-Current-URL`):**
- Before the final `respondWithUpdates`, check `req.headers['hx-current-url']`. If `/grocery` or `/recipes/:id` → fork to `respondPerSurface`. If `/library` (or no header) → keep existing `respondWithUpdates` shape.
- Add a name-equality conflict check (RESEARCH §line 475-485 — `nameConflict(state, name)` helper colocated in `routes/library.js`, NOT in `lib/library.js`). On conflict: HTTP 400 + `library-categorize-editor.njk` fragment with `categorizeError` set, preserving typed values (D-77 mirrors Phase 5 D-61).
- The 400 path also branches on the editor mode: if the request originated from Categorize (HX-Current-URL is `/grocery` or `/recipes/:id`), render `library-categorize-editor.njk`; if from Library tab manual-add, keep the existing 400 plain-text behavior (preserves Phase 5 contract).

**Anti-patterns to avoid:**
- Do NOT split into a new `POST /library/categorize` endpoint (D-75 explicitly says "reuses existing POST /library"). RESEARCH §466-470 confirms the branch-in-existing approach.
- Do NOT mutate `lib/library.js` to add `nameConflict` — keep it route-layer (RESEARCH §493).
- Do NOT use `respondWithUpdates` for the per-surface OOB shape (Pitfall 7).

---

### 2. `views/partials/library-fix-editor.njk` (NEW — view fragment, inline editor)

**Analog:** `views/partials/library-row-edit.njk` (Phase 5).

```nunjucks
{# views/partials/library-row-edit.njk — VERBATIM (the analog) #}
<li id="library-row-{{ entry.id }}" class="library-row library-row-edit">
  <form hx-post="/library/{{ entry.id }}"
        hx-target="#library-row-{{ entry.id }}"
        hx-swap="outerHTML"
        class="library-edit-form">
    <input type="text" name="name" value="{{ entry.name }}" required maxlength="200" autocomplete="off">
    <div class="library-aliases-field">
      <input type="text" name="aliases" value="{{ entry.aliasesDisplay }}" maxlength="1000" autocomplete="off">
      {% if entry.aliasError %}
        <div class="library-alias-error">{{ entry.aliasError }}</div>
      {% endif %}
    </div>
    <select name="recipeCategory">
      {% for cat in RECIPE_CATEGORIES %}<option value="{{ cat }}"{% if cat == entry.recipeCategory %} selected{% endif %}>{{ cat }}</option>{% endfor %}
    </select>
    <select name="groceryCategory">
      {% for cat in GROCERY_CATEGORIES %}<option value="{{ cat }}"{% if cat == entry.groceryCategory %} selected{% endif %}>{{ cat }}</option>{% endfor %}
    </select>
    <button type="submit" class="library-save">Save</button>
    <button type="button"
            class="library-cancel"
            hx-get="/library/{{ entry.id }}"
            hx-target="#library-row-{{ entry.id }}"
            hx-swap="outerHTML">Cancel</button>
  </form>
</li>
```

**What to copy verbatim:**
- `<li id="..." class="...">` outer-DOM-id pattern for HTMX outerHTML toggle (Analog A4).
- `<form hx-post="..." hx-target="#..." hx-swap="outerHTML">` with EXPLICIT id target (NOT `closest li` — RESEARCH §Pitfall 3 confirms `library-row-edit.njk:3` uses explicit id).
- Inline `<select>` + `{% for cat in CATEGORIES %}...{% if cat == entry.X %} selected{% endif %}` pattern for both dropdowns.
- Save button = orange pill (`class="library-save"`).
- Cancel button = transparent + bordered (`class="library-cancel"` + `hx-get` + same `hx-target` + `hx-swap="outerHTML"`).

**What to change:**
- Outer id: `id="library-fix-{{ surfaceItemId }}"` (NOT `library-row-{{ entry.id }}` — Pitfall 2 explains why; the editor must toggle back to the SURFACE row, not a Library-tab row).
- Outer class: `class="library-fix-editor"` (NOT `library-row library-row-edit`).
- DROP the `<input name="name">` (categories-only — D-74; FIX-03 invariant test asserts no `name=` field in this fragment).
- DROP the `<input name="aliases">` and `library-aliases-field` div.
- DROP the alias error slot (`{% if entry.aliasError %}...`) — Fix has no name/alias validation, so no inline-error slot needed for this editor.
- ADD a header div above the form: `<div class="library-fix-header"><span>Library entry: <strong>{{ entry.name }}</strong></span><a class="library-fix-link" href="/library?q={{ entry.name|urlencode }}">Edit full entry &rarr;</a></div>` (D-71, FIX-03).
- Form `hx-post`: `/library/{{ entry.id }}/categories` (NOT `/library/{{ entry.id }}`).
- Form `hx-target`: `#library-fix-{{ surfaceItemId }}` (explicit id per Pitfall 3).
- Add `<input type="hidden" name="surfaceItemId" value="{{ surfaceItemId }}">` so the POST handler can re-render the editor on validation failure with the correct outer id.
- Cancel `hx-get`: `/library/cancel-fix?surface={{ surface }}&itemId={{ itemId }}{% if recipeId %}&recipeId={{ recipeId }}&index={{ index }}{% endif %}` (per RESEARCH §line 391-395; per-surface re-fetch).
- Cancel `hx-target`: `#library-fix-{{ surfaceItemId }}`.
- Add `autofocus` attribute on the first `<select>` (per UI-SPEC.md §Interaction Contract step 5).
- Wrap dropdowns in `<div class="library-fix-fields">` and each `<label>` + `<select>` pair in `<div class="library-fix-field">` (per UI-SPEC.md CSS).
- Save button class: `library-fix-save`. Cancel button class: `library-fix-cancel`. (D-67 / UI-SPEC.md.)

**Anti-patterns to avoid:**
- Pitfall 2: Do NOT use `library-row-{{ entry.id }}` as the outer id (collision risk + confuses Cancel re-fetch).
- Pitfall 3: Do NOT use `hx-target="closest li"` on the form — use explicit id reference.
- Pitfall 8 / FIX-04: Do NOT display `entry.name` anywhere outside the header. The form below shows ONLY category dropdowns; `entry.name` appears ONCE in the labelled header.

---

### 3. `views/partials/library-categorize-editor.njk` (NEW — view fragment, inline editor)

**Analog:** `views/partials/library-row-edit.njk` (form structure) + the Categorize editor needs a `<input type="text" name="name">` field. The closest existing 3-field form (name + 2 dropdowns) is the manual-add form in `views/library.njk` — both reference `RECIPE_CATEGORIES` / `GROCERY_CATEGORIES` for the dropdowns.

**What to copy verbatim from `library-row-edit.njk`:**
- Outer `<li id="..." class="...">` pattern (same as Fix editor).
- `<form hx-post="..." hx-target="#..." hx-swap="outerHTML">`.
- Inline `<select>` blocks with `{% for cat in CATEGORIES %}{% if cat == X %} selected{% endif %}`.
- Save / Cancel button structure.
- Inline-error slot pattern: `{% if entry.aliasError %}<div class="library-alias-error">{{ entry.aliasError }}</div>{% endif %}` — Phase 6 renames the variable to `categorizeError` and the class to `library-categorize-error` (D-77 mirrors D-61 verbatim).

**What to change (vs. Fix editor):**
- Outer id: `id="library-categorize-{{ surfaceItemId }}"`.
- Outer class: `class="library-categorize-editor"`.
- Header: `<div class="library-categorize-header">New library entry</div>` (no name interpolation — D-71).
- ADD a `<input type="text" name="name" value="{{ prefilledName }}" required maxlength="200" autocomplete="off" autofocus>` (D-76: pre-filled via `normalizeIngredientText(item.text)` server-side).
- ADD `<div class="library-categorize-error" role="alert">{{ categorizeError }}</div>` slot below the name input (D-77; `role="alert"` per UI-SPEC.md §Accessibility).
- Form `hx-post`: `/library` (existing Phase 5 endpoint — D-75).
- Form `hx-target`: `#library-categorize-{{ surfaceItemId }}`.
- Hidden `<input type="hidden" name="surfaceItemId" value="{{ surfaceItemId }}">` so the 400-conflict fragment re-renders with the correct outer id.
- Dropdowns pre-selected via `{% if cat == prefilledRecipeCategory %} selected{% endif %}` and `{% if cat == prefilledGroceryCategory %} selected{% endif %}` — server runs `recipeCategoryOf(item.text)` and `groceryCategoryOf(item.text)` to compute these (D-76).
- NO aliases input (D-76 — keeps scope tight).
- Save button class: `library-categorize-save`. Cancel button class: `library-categorize-cancel`.
- Cancel `hx-get`: `/library/cancel-fix?surface={{ surface }}&itemId={{ itemId }}{% if recipeId %}&recipeId={{ recipeId }}&index={{ index }}{% endif %}`.

**Anti-patterns to avoid:**
- Pitfall 4: When the pencil button passes `text={{ item.text|urlencode }}` to the open-Categorize endpoint, the server must decode safely. Test fixture: `item.text = 'salt & pepper'` round-trip (RESEARCH §540-542).
- Pitfall 5: Concurrent-edit race (Categorize after another tab created the same entry) — accepted; test fixture in RESEARCH §550 covers it.

---

### 4. `views/partials/recipe-ingredient-line.njk` (NEW — view fragment, single line)

**Analog:** `views/partials/grocery-item.njk` (single-row partial with stable `<li>` id and conditional button).

```nunjucks
{# views/partials/grocery-item.njk — VERBATIM (the analog, lines 1-13) #}
<li class="grocery-item{% if item.checked %} is-checked{% endif %}" id="grocery-item-{{ item.id }}">
  <button class="grocery-check"
          hx-post="/grocery/{{ item.id }}/check"
          hx-swap="none"
          aria-label="{% if item.checked %}Uncheck{% else %}Check{% endif %} {{ item.text }}">
    {% if item.checked %}✓{% endif %}
  </button>
  <span class="grocery-text">{{ item.text }}</span>
  <button class="grocery-delete"
          hx-delete="/grocery/{{ item.id }}"
          hx-swap="none"
          aria-label="Delete {{ item.text }}">×</button>
</li>
```

**What to copy:**
- `<li id="..." class="...">` stable per-render id pattern.
- `<span class="...-text">{{ item.text }}</span>` — text rendered as-is (FIX-04 invariant).
- `<button class="...-pencil" hx-get="..." hx-target="closest li" hx-swap="outerHTML" aria-label="...">{% include "partials/icon-pencil.njk" %}</button>` pattern with conditional `hx-get` based on `ing.libraryEntryId`.

**What to change:**
- Outer `<li>` id: `recipe-ing-{{ recipe.id }}-{{ group.category }}-{{ index }}` (RESEARCH §line 663-665 option (b) — includes `group.category` for uniqueness across the whole `<section>` since `loop.index0` is per-group).
- Outer `<li>` class: `recipe-ingredient-line`.
- Drop the `.grocery-check` button (recipe lines have no check action).
- Drop the `.grocery-delete` button (FIX-04: no recipe-string mutation; deletion is Library-tab-only).
- Replace with single pencil button that conditionally targets `/library/{{ ing.libraryEntryId }}/categories-edit?surface=recipe&recipeId={{ recipe.id }}&index={{ index }}` (matched) or `/library/categorize-edit?text={{ ing.text|urlencode }}&surface=recipe&recipeId={{ recipe.id }}&index={{ index }}` (unmatched).
- `aria-label`: `Fix categorization for {{ ing.text }}` (matched) or `Categorize {{ ing.text }}` (unmatched).
- Pencil class: `recipe-pencil` (smaller — `width: 20px; height: 20px;` per UI-SPEC.md).

**Anti-patterns to avoid:**
- Pitfall 8 / FIX-04: Render ONLY `{{ ing.text }}` — never substitute `entry.name`. Test fixture in `test/recipes.test.js` should rename a library entry's name and assert the recipe page still shows `ing.text` unchanged.

---

### 5. `views/partials/grocery-item.njk` (EXTEND — view fragment)

**Analog:** self — existing `.grocery-check` and `.grocery-delete` buttons in the same file (lines 2-7 and 9-12).

**What to copy from existing buttons:**
- Button positioning between `<span class="grocery-text">` and `<button class="grocery-delete">` (CONTEXT.md `<canonical_refs>` line 134: "after the existing grocery-text span and before the existing grocery-delete button").
- `aria-label` interpolating `item.text` (existing pattern at lines 5 and 12 — non-ASCII safe because aria-label is HTML attribute, NOT HTTP header per CLAUDE.md C-04).
- Same `width: 24px; height: 24px;` icon-button shape (D-68 — see CSS analog in `.grocery-delete` at `public/styles.css:314-323`).

**What to add:**
```nunjucks
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
```

(Verbatim from RESEARCH §586-610 with the inclusion of the shared `icon-pencil.njk` partial per UI-SPEC.md.)

**What to change:** Insert this block between line 8 (`<span class="grocery-text">{{ item.text }}</span>`) and line 9 (`<button class="grocery-delete" ...>`).

**Anti-patterns to avoid:**
- Pitfall 4: Test special chars in `item.text` — `urlencode` filter handles `&` correctly, but verify with a fixture (`item.text = 'salt & pepper'`).
- Pitfall 8 / FIX-04: Do NOT introduce any markup that displays `entry.name` next to the item text. The pencil button is the ONLY new element; the existing `.grocery-text` span keeps showing `item.text` only.

---

### 6. `views/recipe.njk` (EXTEND — view, full page)

**Analog:** self (lines 19-29 — the existing ingredient `<section>` block).

```nunjucks
{# views/recipe.njk:19-29 — current state #}
<section class="recipe-ingredients">
  <h2>Ingredients</h2>
  {% for group in recipe.ingredientGroups %}
    <h3 class="ingredient-category">{{ group.category }}</h3>
    <ul>
      {% for ing in group.items %}<li>{{ ing.text }}</li>{% endfor %}
    </ul>
  {% else %}
    <p class="empty">No ingredients found.</p>
  {% endfor %}
</section>
```

**What to change (per RESEARCH §640-655):**
```nunjucks
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

**What to copy:** Outer `<section>` + `<h2>` + `{% for group %}` loop structure stays untouched.

**What to change:**
- Add `id="recipe-ingredient-groups-{{ recipe.id }}"` to the `<section>` (D-73 OOB target; RESEARCH §line 35).
- Replace inline `<li>{{ ing.text }}</li>` with `{% set index = loop.index0 %}{% include "partials/recipe-ingredient-line.njk" %}` (factor for re-use in Cancel-fragment endpoint).

**Recommended additional refactor** per RESEARCH §356: extract the inner `{% for group %}...{% endfor %}` block into a separate `partials/recipe-ingredient-groups.njk` so the same partial powers both the initial render AND the OOB swap on Save:
```nunjucks
<section class="recipe-ingredients" id="recipe-ingredient-groups-{{ recipe.id }}">
  <h2>Ingredients</h2>
  {% include "partials/recipe-ingredient-groups.njk" %}
</section>
```
This keeps the OOB target id rendering in one place and lets the Save handler render only the inner groups (no `<h2>` re-render). Planner picks.

**Anti-patterns to avoid:**
- Pitfall 9: Do NOT add a separate categorization update path — `decorateIngredients` already runs per-render and reflects new categories on next paint.
- Index-stability: `loop.index0` is per-group, not global. Using `recipe-ing-{{ recipe.id }}-{{ group.category }}-{{ index }}` (option b in RESEARCH §665) is the simplest path with no `lib/calc.js` mutation.

---

### 7. `public/styles.css` (EXTEND — static asset)

**Analog A — `.grocery-delete` block (lines 314-323) for the icon-button shape:**
```css
.grocery-delete {
  width: 24px; height: 24px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.grocery-delete:hover { color: var(--error); }
```

**What to copy:** Width/height/border/background/color shape exactly. Phase 6's `.grocery-pencil` mirrors this; differences are `:hover { color: var(--accent); }` (orange instead of red — pencil is "edit", not "delete") and the inline `display: inline-flex; align-items: center; justify-content: center;` for centering the inline SVG.

**Analog B — `.library-add button` (lines 436-444) for the Save button pill:**
```css
.library-add button {
  padding: 10px 18px;
  border: none;
  background: var(--accent);
  color: white;
  border-radius: var(--radius);
  font-size: 16px;
  cursor: pointer;
}
```

**What to copy:** Phase 6's `.library-fix-save` and `.library-categorize-save` mirror this exactly (UI-SPEC.md §CSS shows `padding: 8px 16px; font-size: 14px;` — slightly tighter for inline editor context, but same orange pill).

**Analog C — `.library-row` (lines 476-484) for the editor `<li>` container:**
```css
.library-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border);
}
.library-row:last-child { border-bottom: none; }
```

**What to copy:** `padding: 12px 14px;` (UI-SPEC.md spacing scale — matches `.grocery-item`); `border-bottom`; `:last-child { border-bottom: none; }`. The editor uses `display: block;` (not flex) because internal layout is via the inner `library-fix-form > library-fix-fields` flex chain.

**Analog D — `@media (max-width: 640px)` block (line 413) for stack-on-narrow:**
```css
@media (max-width: 640px) {
  .recipe-list { grid-template-columns: 1fr; }
  .paste-form { flex-direction: column; }
  ...
}
```

**What to copy:** UI-SPEC.md uses `@media (max-width: 480px)` for the editor stack. The existing `@media (max-width: 640px)` block is a precedent — Phase 6 either adds a new `@media (max-width: 480px)` block or appends rules to the existing `640px` block. Planner picks per UI-SPEC.md §Viewport behavior (480px chosen for the editor's two-column→one-column breakpoint).

**What to add:** ~140 lines per UI-SPEC.md §CSS Additions Summary (verbatim block, lines 305-449 of UI-SPEC.md). All new classes prefixed `library-fix-*` / `library-categorize-*` / `.grocery-pencil` / `.recipe-pencil` / `.recipe-ingredient-line`. No new design tokens (UI-SPEC.md confirms zero new variables).

**Anti-patterns to avoid:**
- Do NOT introduce new `--accent2` or other custom properties. Phase 6 reuses existing tokens (UI-SPEC.md §Color confirms).
- Do NOT redefine `.grocery-delete`/`.grocery-check` — pencil is a NEW class, not a reuse.

---

### 8. `test/library-categories-routes.test.js` (NEW — test, HTTP integration)

**Analog A — `test/library-routes.test.js:1-53` (test scaffold + helpers).**

```javascript
// test/library-routes.test.js:1-53 — scaffold
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const helpers = require('./_helpers');
const storage = require('../lib/storage');

let ctx;
beforeEach(async () => {
  helpers.setupDataDir();
  ctx = await helpers.startTestServer();
});
afterEach(async () => {
  await helpers.stopTestServer(ctx.server);
  helpers.teardownDataDir();
});

function seedLibrary(entries) {
  const state = storage.get();
  state.library = entries;
  state.libraryMigratedAt = new Date().toISOString();
  storage.save();
}

function makeEntry(overrides) {
  return Object.assign({
    id: 'lb_test0001', name: 'apple', aliases: [],
    recipeCategory: 'Veg', groceryCategory: 'Produce',
    curated: true, createdAt: ''
  }, overrides);
}
```

**What to copy verbatim:** `beforeEach`/`afterEach` setup; `seedLibrary`/`makeEntry`/`seedRecipes` helpers; `helpers.request` calls.

**Analog B — `test/library-routes.test.js:175-200` (GET fragment shape assertions):**

```javascript
test('GET /library/:id/edit returns the edit form fragment', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'tomato', aliases: ['tomatoes'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, { path: `/library/${entry.id}/edit` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<form/);
  assert.match(res.body, /name="name"/);
  assert.match(res.body, /<select name="recipeCategory">/);
  ...
});
```

**What to copy:** `helpers.request(ctx.port, { path: ... })` for GET; `assert.match(res.body, /<form/)`; `<select name="...">` regex assertions.

**What to change for Phase 6:**
- `path: \`/library/${entry.id}/categories-edit?surface=grocery&itemId=g_xyz\``.
- Assert `<form/`, `<select name="recipeCategory">`, `<select name="groceryCategory">`.
- Assert `Library entry: tomato` header (D-71).
- Assert `<a` link with `href="/library?q=tomato"` for "Edit full entry" (FIX-03).
- Assert `assert.doesNotMatch(res.body, /name="name"/)` — categories-only invariant (FIX-03).
- Assert `assert.doesNotMatch(res.body, /name="aliases"/)` — categories-only invariant.

**Analog C — `test/weeks-routes.test.js:107-128` (HX-Current-URL test idiom — VERIFIED in RESEARCH §A7):**

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

**What to copy verbatim:**
- `headers: { 'hx-current-url': 'http://127.0.0.1:3003/...' }` — note LOWERCASE key (Node normalizes; RESEARCH §A1).
- `new RegExp(`id="..."`)` for asserting OOB target id with interpolation.

**What to change for Phase 6 — three sentinel URL tests:**

| Test | `hx-current-url` value | Expected `assert.match` |
|------|------------------------|--------------------------|
| Save from /grocery | `http://127.0.0.1:3003/grocery` | `id="grocery-list"` + `hx-swap-oob="true"` |
| Save from /recipes/:id | `http://127.0.0.1:3003/recipes/${recipeId}` | `id="recipe-ingredient-groups-${recipeId}"` + `hx-swap-oob="true"` |
| Save from /library | `http://127.0.0.1:3003/library` | `id="library-row-${entryId}"` (or `id="library-panel"` if planner picks full panel) |

**Analog D — `test/library-routes.test.js:382-403` (400-conflict + form-stays-open):**

```javascript
test('POST /library/:id 400s on alias conflict and preserves user-typed values', async () => {
  ...
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /<form/);
  assert.match(res.body, /Alias (&#39;|')apples(&#39;|') is already used by (&#39;|')apple(&#39;|')\./);
  assert.match(res.body, /value="cattle"/);
  assert.match(res.body, /value="apples"/);
  assert.match(res.body, /<option value="Protein"\s*selected/);
  ...
});
```

**What to copy:** `(&#39;|')` regex alternation for Nunjucks autoescape of single quotes. `value="..."` preserved-typed-value assertion. `<option value="..."\s*selected` selected-option assertion. No-toast-on-400 assertion: `assert.ok(!res.headers['x-status-toast'], 'No toast header on 400');`.

**What to change for Phase 6 Categorize 400:**
- POST to `/library` with `headers: { 'hx-current-url': '.../grocery' }` and a name colliding with an existing entry.
- Assert 400.
- Assert `<form/` (form stays open per D-77).
- Assert the `categorizeError` text appears: `Name (&#39;|')X(&#39;|') is already used by entry (&#39;|')Y(&#39;|')` (or similar — D-77 specifies the message).
- Assert `<a href="/library?q=` link in the error message (D-77 "Open it in the Library tab" link).
- Assert preserved typed values via `value="..."` regex.
- Assert `assert.ok(!res.headers['x-status-toast'])` (D-78 silent-400).

**Anti-patterns to avoid:**
- Test the LOWERCASE header key — Node normalizes incoming, but the test's outgoing header object should also be lowercase per `test/weeks-routes.test.js:112` precedent.
- DON'T forget the FIX-04 invariant test (per RESEARCH §744): rename a library entry's name; assert the grocery item / recipe ingredient line still shows the original `item.text` / `ing.text` UNCHANGED.

---

### 9. `test/grocery-routes.test.js` (EXTEND — test)

**Analog:** self — existing `addItem` helper (lines 17-22) and existing assertion idioms (lines 24-104).

```javascript
// test/grocery-routes.test.js:17-22 — existing helper
async function addItem(port, text) {
  const res = await helpers.request(port, { method: 'POST', path: '/grocery', body: { text } });
  const m = res.body.match(/id="grocery-item-(g_[a-z0-9]+)"/);
  return m ? m[1] : null;
}
```

**What to copy:** `addItem` for fixture creation; `helpers.request(ctx.port, { path: '/grocery' })` for the GET; existing `assert.match(res.body, /id="grocery-list"/)` style.

**What to add (per RESEARCH §733-744):**
- Test: GET /grocery includes `class="grocery-pencil"` on each item.
- Test: matched item (seed library + grocery with matching name) → pencil's `hx-get` is `/library/{libraryEntryId}/categories-edit`.
- Test: unmatched item → pencil's `hx-get` is `/library/categorize-edit?text=...`.
- Test (FIX-04 invariant): rename a library entry's name; assert grocery row still shows original `item.text` (not `entry.name`).
- Test: `aria-label` interpolates `item.text` (matched: `Fix categorization for ...`; unmatched: `Categorize ...`).

**Anti-patterns to avoid:**
- Pitfall 4: Add a fixture with `item.text = 'salt & pepper'` and assert the pencil `hx-get` is correctly URL-encoded.

---

### 10. `test/recipes.test.js` (EXTEND — test)

**Analog:** self (existing scrape monkey-patch + scaffold lines 1-39) + `test/weeks-routes.test.js:107-128` for HX-Current-URL idiom.

**What to copy from existing file:**
- `scrapeMod.scrape = async (url) => { ... }` monkey-patch (lines 10-27) — needed for any new test that creates a recipe via POST.
- `helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url } })` for fixture creation.

**What to add:**
- Test: GET /recipes/:id ingredient `<li>` has `id="recipe-ing-{recipe.id}-{group.category}-{index}"`.
- Test: GET /recipes/:id `<section>` has `id="recipe-ingredient-groups-{recipe.id}"` (D-73 OOB target).
- Test: matched ingredient → pencil's `hx-get` is `/library/{libraryEntryId}/categories-edit?surface=recipe&recipeId={recipe.id}&index={i}`.
- Test: unmatched ingredient → pencil's `hx-get` is `/library/categorize-edit?text=...&surface=recipe&recipeId={recipe.id}&index={i}`.
- Test (FIX-04 invariant — RESEARCH §743): seed a library entry; create a recipe whose ingredient matches an alias; rename the entry's name; GET /recipes/:id; assert ingredient line still shows the original `ing.text` (not `entry.name`).

**Anti-patterns to avoid:**
- Pitfall 9: No double-render concerns — `decorateIngredients` is idempotent.
- Test fixture must seed BOTH library AND recipes BEFORE the scrape monkey-patch returns, OR seed via direct `storage.save()` (the Phase 5 `seedLibrary` pattern).

---

## Shared Patterns

### S1. HX-Current-URL header reading (cross-cutting for Save handlers)
**Source:** `routes/weeks.js:38-42` (verified by RESEARCH §A1 / §1).
**Apply to:** `POST /library/:id/categories`, `POST /library` (Categorize branch).
```javascript
const currentUrl = req.headers['hx-current-url'] || '';
// /grocery branch — substring match (safe because `/grocery` is unique among surfaces)
if (currentUrl.includes('/grocery')) { ... }
// /recipes/:id branch — REGEX (NOT substring — Pitfall 1)
const recipeMatch = currentUrl.match(/^[^?#]*\/recipes\/([a-z0-9]+)/i);
if (recipeMatch) { const recipeId = recipeMatch[1]; ... }
// default fallback — /library or no header
```

### S2. Compound row + OOB pattern via `renderSync` + `injectOob` (NOT `respondWithUpdates`)
**Source:** `routes/library.js:200-212` (Phase 5 success path) AND `routes/library.js:243-245` (Phase 5 DELETE empty-primary).
**Apply to:** Every Phase 6 mutation handler that returns OOB.
```javascript
const html = injectOob(renderSync(req, 'partials/grocery-list.njk', view));
res.type('html').send(html);
```
**Critical:** Do NOT use `respondWithUpdates` — RESEARCH §Pitfall 7 / D-80 lock this in.

### S3. ASCII-only verb-only toasts (HTTP-header safety)
**Source:** `routes/library.js:109` (`'Added entry'`), `routes/library.js:203` (`'Saved entry'`), `routes/library.js:236` (`'Removed entry'`).
**Apply to:** `setToast(res, 'Saved categories')` and reused `setToast(res, 'Added entry')`. NO toast on 400 / 404 (D-78).

### S4. Editor outerHTML row-toggle convention
**Source:** `views/partials/library-row.njk:1` and `views/partials/library-row-edit.njk:1` (same outer DOM id).
**Apply to:** Both new editors. SURFACE-relative id (`library-fix-{surfaceItemId}`, `library-categorize-{surfaceItemId}`) per RESEARCH §Pitfall 2 — NOT entry-relative.

### S5. Editor 400-conflict inline-error pattern
**Source:** `routes/library.js:143-161` (Phase 5 D-61 — `renderEditFormError` closure; status 400; NO toast; form re-rendered with user-typed values + `aliasError` slot).
**Apply to:** Categorize 400-name-conflict (D-77 mirrors D-61 verbatim) — rename the slot variable to `categorizeError` and class to `library-categorize-error`. The Fix editor has minimal 400 paths (only invalid enum, which dropdown HTML constraint makes user-rare); when it does 400, re-render the same `library-fix-editor.njk` with no special slot.

### S6. Test header injection idiom
**Source:** `test/weeks-routes.test.js:107-128` (verified by RESEARCH §A7).
**Apply to:** All Phase 6 per-surface OOB-shape tests.
```javascript
helpers.request(ctx.port, {
  method: 'POST', path: ...,
  headers: { 'hx-current-url': 'http://127.0.0.1:3003/grocery' },  // LOWERCASE key
  body: { ... }
});
```

### S7. Test 400-fragment + autoescape idiom
**Source:** `test/library-routes.test.js:395` (Phase 5 D-61 test).
**Apply to:** Categorize 400-conflict test.
```javascript
assert.match(res.body, /(&#39;|')garlic(&#39;|')/);  // Nunjucks autoescape: ' -> &#39;
assert.match(res.body, /value="garlic clove"/);     // preserved typed value
assert.ok(!res.headers['x-status-toast'], 'No toast on 400');
```

---

## No Analog Found

No files in this phase lack a strong codebase analog. Every required pattern is already in production from Phases 1-5. The two NEW editor partials (`library-fix-editor.njk`, `library-categorize-editor.njk`) inherit ~80% of their structure from `views/partials/library-row-edit.njk` (Phase 5); the only genuinely new markup is the `<div class="library-fix-header">` (D-71 metadata header) and the inline-SVG pencil icon partial (`views/partials/icon-pencil.njk`).

---

## Metadata

**Analog search scope:** `routes/`, `views/partials/`, `views/`, `test/`, `lib/render.js`, `public/styles.css`.
**Files scanned:** `routes/library.js`, `routes/weeks.js`, `routes/recipes.js`, `views/partials/library-row.njk`, `views/partials/library-row-edit.njk`, `views/partials/grocery-item.njk`, `views/recipe.njk`, `views/partials/grocery-list.njk`, `lib/render.js`, `public/styles.css` (lines 290-496), `test/library-routes.test.js` (lines 1-589), `test/grocery-routes.test.js`, `test/recipes.test.js`, `test/weeks-routes.test.js` (lines 100-128).
**Pattern extraction date:** 2026-05-07.

---

## PATTERN MAPPING COMPLETE

**9 files mapped (3 NEW partials, 1 NEW test, 5 EXTEND); 100% analog coverage; all patterns derive from Phase 5 + `routes/weeks.js` HX-Current-URL idiom.**
