# Phase 5: Library Tab - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 11 new/modified files
**Analogs found:** 9 / 11 (2 files have no close analog; see "No Analog Found" section)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `routes/library.js` | route | request-response + CRUD | `routes/grocery.js` | exact |
| `lib/calc.js` (extend: buildLibraryView) | service/view-model | transform | `lib/calc.js#buildGroceryView` | exact (same file) |
| `lib/render.js` (extend: export renderSync) | utility | request-response | `lib/render.js` (internal already) | exact (same file) |
| `views/library.njk` | template (full page) | request-response | `views/grocery.njk` | exact |
| `views/partials/library-panel.njk` | template (panel partial) | request-response | `views/partials/grocery-list.njk` | role-match (adds filter/search UI) |
| `views/partials/library-row.njk` | template (item partial) | request-response | `views/partials/grocery-item.njk` | role-match (more fields, same id/outerHTML pattern) |
| `views/partials/library-row-edit.njk` | template (edit form partial) | request-response | none — new inline-edit toggle pattern | no analog |
| `views/partials/library-footer.njk` | template (OOB footer) | request-response | none — new OOB footer pattern | no analog |
| `views/layout.njk` (extend: 5th tab + htmx-config) | template (layout) | request-response | `views/layout.njk` lines 11-16 | exact (same file, additive) |
| `public/styles.css` (extend: library-* classes) | config/style | — | `public/styles.css` `.grocery-*` block | role-match |
| `server.js` (extend: mount library router) | config | — | `server.js` lines 22-25 | exact |
| `test/library-routes.test.js` | test | request-response | `test/grocery-routes.test.js` | exact |
| `test/calc.test.js` (extend: buildLibraryView block) | test | transform | `test/calc.test.js` existing blocks | exact (same file) |

---

## Pattern Assignments

### `routes/library.js` (route, request-response + CRUD)

**Analog:** `routes/grocery.js` (lines 1-73)

**Imports pattern** (`routes/grocery.js` lines 1-6):
```javascript
const express = require('express');
const storage = require('../lib/storage');
const { buildGroceryView } = require('../lib/calc');
const { addItem, toggleChecked, removeItem, clearChecked } = require('../lib/grocery');
const { respondWithUpdates } = require('../lib/render');
```

For `routes/library.js`, adapt to:
```javascript
const express = require('express');
const storage = require('../lib/storage');
const { buildLibraryView } = require('../lib/calc');
const { newLibraryEntry, aliasConflict } = require('../lib/library');
const { respondWithUpdates, renderSync, injectOob } = require('../lib/render');
const { RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('../lib/categorize');
```

**setToast helper** (`routes/grocery.js` lines 9-12 — copy verbatim):
```javascript
function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}
```

**Full-page GET pattern** (`routes/grocery.js` lines 14-16):
```javascript
router.get('/grocery', (req, res) => {
  res.render('grocery.njk', buildGroceryView(storage.get()));
});
```

For library, `GET /library` passes `req.query.q` and `req.query.filter`:
```javascript
router.get('/library', (req, res) => {
  const q = req.query.q || '';
  const filter = req.query.filter || 'All';
  res.render('library.njk', buildLibraryView(storage.get(), { q, filter }));
});
```

**Mutation POST with respondWithUpdates** (`routes/grocery.js` lines 18-30):
```javascript
router.post('/grocery', (req, res) => {
  const text = req.body && typeof req.body.text === 'string' ? req.body.text : '';
  const state = storage.get();
  const result = addItem(state, text);
  if (!result.ok) return res.status(400).type('text').send('Item required');
  storage.save();
  setToast(res, 'Added');
  const view = buildGroceryView(state);
  respondWithUpdates(req, res, {
    panels: ['partials/grocery-list.njk'],
    extra: view
  });
});
```

**404 guard pattern** (`routes/grocery.js` lines 32-36):
```javascript
router.post('/grocery/:id/check', (req, res) => {
  const state = storage.get();
  const result = toggleChecked(state, req.params.id);
  if (!result.ok) return res.status(404).type('text').send('Not found');
  // ...
});
```

**DELETE pattern** (`routes/grocery.js` lines 46-57):
```javascript
router.delete('/grocery/:id', (req, res) => {
  const state = storage.get();
  const result = removeItem(state, req.params.id);
  if (!result.ok) return res.status(404).type('text').send('Not found');
  storage.save();
  setToast(res, 'Removed');
  const view = buildGroceryView(state);
  respondWithUpdates(req, res, { panels: ['partials/grocery-list.njk'], extra: view });
});
```

**Module export pattern** (`routes/grocery.js` line 73):
```javascript
module.exports = router;
```

**CRITICAL: Single-row + OOB-footer response (edit save / delete — do NOT use respondWithUpdates for these).**
`respondWithUpdates` injects `hx-swap-oob` on ALL panels, which would corrupt the primary row swap. For
`POST /library/:id` (save) and `DELETE /library/:id` (delete), build the response manually:
```javascript
// From RESEARCH.md D-63 sketch
const rowHtml = renderSync(req, 'partials/library-row.njk', { entry: updatedEntry, RECIPE_CATEGORIES, GROCERY_CATEGORIES });
const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', buildLibraryView(state)));
res.type('html').send(rowHtml + '\n' + footerHtml);
```

**400 alias-conflict response (edit save):**
```javascript
// Return the edit form fragment at 400 so HTMX swaps it (requires meta-tag override)
const html = renderSync(req, 'partials/library-row-edit.njk', { entry: entryWithError, RECIPE_CATEGORIES, GROCERY_CATEGORIES });
return res.status(400).type('html').send(html);
```

**Toast strings — verb-only, no name interpolation (CLAUDE.md ASCII-safety rule):**
- Manual create: `'Added entry'`
- Edit save: `'Saved entry'`
- Delete: `'Removed entry'`

---

### `lib/calc.js` — add `buildLibraryView` (service/view-model, transform)

**Analog:** `lib/calc.js#buildGroceryView` (lines 81-127)

**Defensive guard + index build pattern** (`lib/calc.js` lines 86-91):
```javascript
const libraryIndex = (state && Array.isArray(state.library) && state.library.length > 0)
  ? buildLibraryIndex(state.library)
  : null;
```

**Full `buildLibraryView` implementation** (from RESEARCH.md D-55/D-56/D-66 verified sketch):
```javascript
function buildLibraryView(state, { q = '', filter = 'All' } = {}) {
  const library = Array.isArray(state && state.library) ? state.library : [];
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];

  // Build recipe-count map: O(recipes x ingredients-per-recipe)
  const libraryIndex = library.length > 0 ? buildLibraryIndex(library) : null;
  const recipeCountMap = new Map(library.map(e => [e.id, 0]));
  if (libraryIndex) {
    for (const recipe of recipes) {
      const seen = new Set(); // avoid counting the same entry twice per recipe
      for (const text of (recipe.ingredients || [])) {
        if (typeof text !== 'string') continue;
        const match = findEntryInIndex(libraryIndex, text);
        if (match && !seen.has(match.id)) {
          recipeCountMap.set(match.id, (recipeCountMap.get(match.id) || 0) + 1);
          seen.add(match.id);
        }
      }
    }
  }

  // Sort alphabetically by name (locale-aware, D-55)
  const sorted = library.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Apply filter predicate (D-56)
  let visible = sorted;
  if (filter === 'Uncurated') visible = visible.filter(e => !e.curated);
  if (filter === 'Unused')    visible = visible.filter(e => (recipeCountMap.get(e.id) || 0) === 0);

  // Apply search predicate (D-56)
  if (q) {
    const term = q.toLowerCase();
    visible = visible.filter(e =>
      (e.name || '').toLowerCase().includes(term) ||
      (e.aliases || []).some(a => a.toLowerCase().includes(term))
    );
  }

  // Decorate entries for template (D-53, D-64, D-65)
  const entries = visible.map(e => {
    const count = recipeCountMap.get(e.id) || 0;
    return {
      id: e.id,
      name: e.name,
      aliases: e.aliases || [],
      aliasesDisplay: (e.aliases || []).join(', '),
      recipeCategory: e.recipeCategory,
      groceryCategory: e.groceryCategory,
      curated: !!e.curated,
      recipeCount: count,
      unused: count === 0,
      deleteConfirm: count === 0
        ? `Delete "${e.name}"? This entry is unused.`
        : `Delete "${e.name}"? Used in ${count} recipe${count === 1 ? '' : 's'}. Categorization will fall back to the heuristic.`
    };
  });

  const unusedCount = library.filter(e => (recipeCountMap.get(e.id) || 0) === 0).length;

  return {
    entries,
    hasEntries: entries.length > 0,
    unusedCount,
    totalCount: library.length,
    q,
    filter,
    activeTab: 'library',
    RECIPE_CATEGORIES,
    GROCERY_CATEGORIES
  };
}
```

**module.exports extension pattern** — add `buildLibraryView` to the existing exports object at the bottom of `lib/calc.js`.

---

### `lib/render.js` — export `renderSync` (utility)

**Analog:** `lib/render.js` lines 14-17 (function already exists, not yet exported)

**Current exports** (`lib/render.js` line 33):
```javascript
module.exports = { renderFragments, respondWithUpdates, injectOob };
```

**Change:** Add `renderSync` to exports:
```javascript
module.exports = { renderFragments, respondWithUpdates, injectOob, renderSync };
```

No other changes to `lib/render.js`. `renderSync` body (lines 14-17) is already correct:
```javascript
function renderSync(req, template, ctx) {
  const env = req.app.get('nunjucksEnv');
  return env.render(template, ctx);
}
```

---

### `views/library.njk` (template, full page)

**Analog:** `views/grocery.njk` (lines 1-17 — entire file)

```nunjucks
{% extends "layout.njk" %}
{% block content %}
  <main class="app">
    <header class="app-header">
      <h1>Grocery</h1>
    </header>
    <form class="grocery-add"
          hx-post="/grocery"
          hx-swap="none"
          hx-on:htmx:after-request="if(event.detail.successful) this.reset()">
      <input type="text" name="text" placeholder="Add an item" required maxlength="500" autocomplete="off">
      <button type="submit">Add</button>
    </form>
    {% include "partials/grocery-list.njk" %}
  </main>
{% endblock %}
```

For `views/library.njk`, mirror this shape — replace grocery-specific class names and form fields with library equivalents. The manual-add form (from RESEARCH.md D-67 sketch):
```nunjucks
<form class="library-add"
      hx-post="/library"
      hx-swap="none"
      hx-on:htmx:after-request="if(event.detail.successful) this.reset()">
  <input type="text" name="name" placeholder="Canonical name" required maxlength="200">
  <input type="text" name="aliases" placeholder="Aliases (comma-separated)" maxlength="1000">
  <select name="recipeCategory">
    {% for cat in RECIPE_CATEGORIES %}
      <option value="{{ cat }}">{{ cat }}</option>
    {% endfor %}
  </select>
  <select name="groceryCategory">
    {% for cat in GROCERY_CATEGORIES %}
      <option value="{{ cat }}">{{ cat }}</option>
    {% endfor %}
  </select>
  <button type="submit">Add entry</button>
</form>
{% include "partials/library-panel.njk" %}
```

---

### `views/partials/library-panel.njk` (template, panel partial)

**Analog:** `views/partials/grocery-list.njk` (lines 1-28 — entire file)

**Grocery panel OOB-target pattern** (`views/partials/grocery-list.njk` line 1):
```nunjucks
<section id="grocery-list" class="grocery-list">
```

For library panel, the outer element is the HTMX outerHTML swap target for filter/search responses:
```nunjucks
<section id="library-panel" class="library-panel">
```

**Empty state pattern** (`views/partials/grocery-list.njk` lines 25-27):
```nunjucks
{% if not hasGrocery %}
  <p class="empty grocery-empty">Grocery list is empty.</p>
{% endif %}
```

Library has two distinct empty states (D-59 — from RESEARCH.md):
```nunjucks
{% if not hasEntries %}
  {% if q or filter != 'All' %}
    <p class="library-empty">No entries match "{{ q }}"{% if filter != 'All' %} with filter {{ filter }}{% endif %}.</p>
    <button hx-get="/library"
            hx-target="#library-panel"
            hx-swap="outerHTML"
            hx-push-url="true">Clear search</button>
  {% else %}
    <p class="library-empty">Library is empty. Add an entry above or save a recipe to seed automatically.</p>
  {% endif %}
{% endif %}
```

**HTMX debounce search input** (D-57 from RESEARCH.md):
```nunjucks
<input type="text"
       name="q"
       value="{{ q }}"
       placeholder="Search entries..."
       hx-get="/library"
       hx-trigger="keyup changed delay:300ms"
       hx-target="#library-panel"
       hx-swap="outerHTML"
       hx-push-url="true"
       hx-include="[name='filter']">
```

**Filter button pattern** (D-58 from RESEARCH.md):
```nunjucks
<button hx-get="/library?filter=All&q={{ q }}"
        hx-target="#library-panel"
        hx-swap="outerHTML"
        hx-push-url="true"
        class="library-filter-btn {% if filter == 'All' %}active{% endif %}">All</button>
```

**Entry list and footer** — `<ul>` iterating entries with `{% include "partials/library-row.njk" %}`, followed by `{% include "partials/library-footer.njk" %}`.

---

### `views/partials/library-row.njk` (template, item partial)

**Analog:** `views/partials/grocery-item.njk` (lines 1-13 — entire file)

**Grocery item id/class pattern** (`views/partials/grocery-item.njk` line 1):
```nunjucks
<li class="grocery-item{% if item.checked %} is-checked{% endif %}" id="grocery-item-{{ item.id }}">
```

**CRITICAL:** Both `library-row.njk` and `library-row-edit.njk` MUST share the same outer id so HTMX outerHTML toggles between them. From RESEARCH.md D-52/D-60:
```nunjucks
<li id="library-row-{{ entry.id }}" class="library-row">
  <span class="library-name">{{ entry.name }}</span>
  <span class="library-aliases">{{ entry.aliasesDisplay }}</span>
  <span class="library-category-recipe">{{ entry.recipeCategory }}</span>
  <span class="library-category-grocery">{{ entry.groceryCategory }}</span>
  <span class="library-badge library-badge-{% if entry.curated %}curated{% else %}uncurated{% endif %}">
    [{% if entry.curated %}curated{% else %}uncurated{% endif %}]
  </span>
  {% if entry.unused %}
    <span class="library-badge library-badge-unused">[unused]</span>
  {% endif %}
  <button hx-get="/library/{{ entry.id }}/edit"
          hx-target="#library-row-{{ entry.id }}"
          hx-swap="outerHTML">Edit</button>
  <button hx-delete="/library/{{ entry.id }}"
          hx-target="#library-row-{{ entry.id }}"
          hx-swap="outerHTML"
          hx-confirm="{{ entry.deleteConfirm }}">Delete</button>
</li>
```

Note: `hx-delete` matches the existing `DELETE /grocery/:id` and `DELETE /recipes/:id` convention per RESEARCH.md recommendation.

---

### `views/partials/library-row-edit.njk` (template, edit form partial)

**Analog:** No close analog in the codebase. This is the first inline-edit toggle partial.

**Key constraint:** Same outer `id` as `library-row.njk` — `id="library-row-{{ entry.id }}"` — so HTMX outerHTML targets it correctly.

From RESEARCH.md D-60 sketch:
```nunjucks
<li id="library-row-{{ entry.id }}" class="library-row library-row-edit">
  <form hx-post="/library/{{ entry.id }}"
        hx-target="#library-row-{{ entry.id }}"
        hx-swap="outerHTML">
    <input type="text" name="name" value="{{ entry.name }}" required maxlength="200">
    <div>
      <input type="text" name="aliases" value="{{ entry.aliasesDisplay }}" maxlength="1000">
      {% if entry.aliasError %}
        <div class="library-alias-error">{{ entry.aliasError }}</div>
      {% endif %}
    </div>
    <select name="recipeCategory">
      {% for cat in RECIPE_CATEGORIES %}
        <option value="{{ cat }}"{% if cat == entry.recipeCategory %} selected{% endif %}>{{ cat }}</option>
      {% endfor %}
    </select>
    <select name="groceryCategory">
      {% for cat in GROCERY_CATEGORIES %}
        <option value="{{ cat }}"{% if cat == entry.groceryCategory %} selected{% endif %}>{{ cat }}</option>
      {% endfor %}
    </select>
    <button type="submit">Save</button>
    <button type="button"
            hx-get="/library/{{ entry.id }}"
            hx-target="#library-row-{{ entry.id }}"
            hx-swap="outerHTML">Cancel</button>
  </form>
</li>
```

`RECIPE_CATEGORIES` and `GROCERY_CATEGORIES` are available because the route passes them in the render context.

---

### `views/partials/library-footer.njk` (template, OOB footer)

**Analog:** No close analog in the codebase. This is the first dedicated OOB-footer partial.

**Outer element** must have `id="library-footer"` so `injectOob()` in the route handler can find it. From RESEARCH.md compound-response pattern:
```nunjucks
<footer id="library-footer" class="library-footer">
  {% if unusedCount == 1 %}1 unused entry{% elif unusedCount > 1 %}{{ unusedCount }} unused entries{% endif %}
</footer>
```

This fragment is never included directly — it is only emitted via `injectOob(renderSync(...))` in save/delete route handlers.

---

### `views/layout.njk` — extend: 5th nav tab + htmx-config meta (template, layout)

**Analog:** `views/layout.njk` lines 11-16 (existing nav block) and line 8 (existing meta tags)

**Existing nav block** (lines 11-16):
```nunjucks
<nav class="tabs">
  <a href="/" class="tab{% if activeTab == 'recipes' %} active{% endif %}">Recipes</a>
  <a href="/this-week" class="tab{% if activeTab == 'this-week' %} active{% endif %}">This Week</a>
  <a href="/grocery" class="tab{% if activeTab == 'grocery' %} active{% endif %}">Grocery</a>
  <a href="/history" class="tab{% if activeTab == 'history' %} active{% endif %}">History</a>
</nav>
```

**Add this line after History** (final commit of phase only — atomic-tab-launch convention):
```nunjucks
<a href="/library" class="tab{% if activeTab == 'library' %} active{% endif %}">Library</a>
```

**HTMX 400-swap meta-tag config** — insert into `<head>` after the existing `<meta>` tags (line 4-5), before `<link>` (line 7). CRITICAL for D-61 alias-conflict inline error. From RESEARCH.md D-61/Pitfall 1:
```html
<meta name="htmx-config" content='{
  "responseHandling": [
    {"code":"204", "swap": false},
    {"code":"400", "swap": true},
    {"code":"[23]..", "swap": true},
    {"code":"[45]..", "swap": false, "error": true}
  ]
}' />
```

The `"400"` rule must appear BEFORE the `[45]..` catch-all. Omit `error:true` on the 400 rule to suppress the generic "Error" toast on alias-conflict (the inline error is the user feedback; a disappearing toast is redundant and confusing).

**Note on toast-listener conflict:** The existing `htmx:afterRequest` listener in `layout.njk` (lines 30-38) calls `showStatus('Error', true)` on `!e.detail.successful`. With `{"code":"400","swap":true}` (no `error:true`), HTMX does NOT fire `htmx:responseError` for 400, so `e.detail.successful` will be `true` for 400 swap responses. The toast listener will then look for `X-Status-Toast` header — which the route does NOT set on 400 — and fall back to `showStatus('Saved')`. To avoid the "Saved" toast on a 400 alias-conflict, the route should ensure no `X-Status-Toast` header is set on the 400 path (which is correct per D-61 — do not call `setToast` on 400).

---

### `public/styles.css` — extend: library-* classes (config/style)

**Analog:** `public/styles.css` `.grocery-*` block (lines 254-395 approximately)

**Add form class pattern** (mirror `.grocery-add` lines 256-277):
```css
.library-add {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
```

**Panel class pattern** (mirror `.grocery-list` lines 278-286):
```css
.library-panel {
  list-style: none;
  padding: 0;
  /* ... same border-radius, background as grocery-list ... */
}
```

**Row class pattern** (mirror `.grocery-item` lines 287-298):
```css
.library-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.library-row:last-child { border-bottom: none; }
```

**Badge classes** (new — no grocery analog):
```css
.library-badge { font-size: 11px; padding: 2px 6px; border-radius: 3px; }
.library-badge-curated { background: var(--accent); color: white; }
.library-badge-uncurated { background: var(--error); color: white; }
.library-badge-unused { background: var(--muted); color: white; }
```

**Empty state** (mirror `.grocery-empty` line 324):
```css
.library-empty { padding: 20px; text-align: center; }
```

**Filter button active state** (new — no grocery analog):
```css
.library-filter-btn { /* similar to .tab styles */ }
.library-filter-btn.active { /* highlight active filter */ }
```

---

### `server.js` — extend: mount library router (config)

**Analog:** `server.js` lines 22-25 (existing route mounts)

```javascript
app.use('/', require('./routes/recipes'));
app.use('/', require('./routes/weeks'));
app.use('/', require('./routes/grocery'));
app.use('/', require('./routes/history'));
```

**Add one line** alongside the existing mounts (order before the `app.get('/')` catch-all at line 29):
```javascript
app.use('/', require('./routes/library'));
```

---

### `test/library-routes.test.js` (test, request-response)

**Analog:** `test/grocery-routes.test.js` (lines 1-104 — entire file)

**Test scaffolding pattern** (`test/grocery-routes.test.js` lines 1-22):
```javascript
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const helpers = require('./_helpers');

let ctx;

beforeEach(async () => {
  helpers.setupDataDir();
  ctx = await helpers.startTestServer();
});

afterEach(async () => {
  await helpers.stopTestServer(ctx.server);
  helpers.teardownDataDir();
});
```

**State-seeding helper pattern** (`test/grocery-routes.test.js` lines 17-22):
```javascript
async function addItem(port, text) {
  const res = await helpers.request(port, { method: 'POST', path: '/grocery', body: { text } });
  const m = res.body.match(/id="grocery-item-(g_[a-z0-9]+)"/);
  return m ? m[1] : null;
}
```

For library, mirror as (from RESEARCH.md test sketch):
```javascript
async function addLibraryEntry(port, fields) {
  const res = await helpers.request(port, {
    method: 'POST', path: '/library',
    body: fields  // { name, aliases, recipeCategory, groceryCategory }
  });
  const m = res.body.match(/id="library-row-(lb_[a-z0-9]+)"/);
  return m ? m[1] : null;
}
```

**Full-page GET assertion pattern** (`test/grocery-routes.test.js` lines 24-30):
```javascript
test('GET /grocery renders the page with empty state', async () => {
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/grocery"[^>]*class="tab active"/);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /Grocery list is empty/);
});
```

**OOB-swap assertion pattern** (`test/grocery-routes.test.js` lines 32-43):
```javascript
assert.match(res.body, /id="grocery-list"/);
assert.match(res.body, /hx-swap-oob="true"/);
assert.match(res.headers['x-status-toast'] || '', /Added/);
```

**404 assertion pattern** (`test/grocery-routes.test.js` lines 69-72):
```javascript
test('DELETE /grocery/:id 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'DELETE', path: '/grocery/g_nope' });
  assert.strictEqual(res.status, 404);
});
```

---

### `test/calc.test.js` — extend: buildLibraryView block (test, transform)

**Analog:** `test/calc.test.js` existing `buildView` / `buildWeeklyView` blocks (lines 1-71)

**Test block structure pattern** (`test/calc.test.js` lines 1-9):
```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { buildView, sourceDomain, formatTotalTime } = require('../lib/calc');
```

Add import to the existing require at top: `const { buildLibraryView } = require('../lib/calc');`

**Test fixture pattern** for `buildLibraryView` (from CONTEXT.md Claude's Discretion):
```javascript
// Test fixture: 3 library entries, 2 recipes referencing entry[0]
const state = {
  library: [
    { id: 'lb_aaa', name: 'apple', aliases: ['apples'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '' },
    { id: 'lb_bbb', name: 'beef', aliases: ['ground beef'], recipeCategory: 'Protein', groceryCategory: 'Meat', curated: false, createdAt: '' },
    { id: 'lb_ccc', name: 'cinnamon', aliases: [], recipeCategory: 'Seasoning', groceryCategory: 'Aisle', curated: true, createdAt: '' }
  ],
  recipes: [
    { id: 'r1', ingredients: ['apples', 'sugar'] },
    { id: 'r2', ingredients: ['sliced apples'] }
  ]
};
```

**Assertions to cover** (per CONTEXT.md):
- `buildLibraryView(state).entries` sorted alphabetically: `['apple','beef','cinnamon']`
- `entries[0].recipeCount === 2` (apple matched by 2 recipes)
- `entries[1].recipeCount === 0` (beef unused)
- `entries[2].recipeCount === 0` (cinnamon unused)
- `entries[1].unused === true`
- `buildLibraryView(state, { q: 'apple' }).entries.length === 1`
- `buildLibraryView(state, { filter: 'Uncurated' }).entries[0].name === 'beef'`
- `buildLibraryView(state, { filter: 'Unused' }).entries.length === 2`
- `buildLibraryView({}).entries` length is 0 (empty state guard)
- `buildLibraryView(state).activeTab === 'library'`

---

## Shared Patterns

### setToast Helper
**Source:** `routes/grocery.js` lines 9-12
**Apply to:** `routes/library.js` — copy verbatim into the new file
```javascript
function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}
```

### respondWithUpdates for Full Panel
**Source:** `lib/render.js` lines 27-31 + `routes/grocery.js` lines 26-29
**Apply to:** `routes/library.js` `POST /library` (manual add) and filter/search GET
```javascript
respondWithUpdates(req, res, {
  panels: ['partials/library-panel.njk'],
  extra: buildLibraryView(state, { q, filter })
});
```

### renderSync + injectOob for Single Row + Footer
**Source:** `lib/render.js` lines 14-17 (renderSync), lines 19-25 (injectOob)
**Apply to:** `routes/library.js` `POST /library/:id` (save) and `DELETE /library/:id` (delete)
```javascript
const rowHtml = renderSync(req, 'partials/library-row.njk', { entry: ..., RECIPE_CATEGORIES, GROCERY_CATEGORIES });
const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', buildLibraryView(state)));
res.type('html').send(rowHtml + '\n' + footerHtml);
```

### Defensive Array Guard
**Source:** `lib/calc.js` lines 25, 82 and `lib/storage.js` migrate pattern
**Apply to:** `lib/calc.js#buildLibraryView` — apply to both `state.library` and `state.recipes`
```javascript
const library = Array.isArray(state && state.library) ? state.library : [];
const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
```

### Test Scaffold (beforeEach/afterEach)
**Source:** `test/grocery-routes.test.js` lines 1-15
**Apply to:** `test/library-routes.test.js` — copy verbatim, no modifications needed

### ASCII-Safe Toast Rule
**Source:** CLAUDE.md + `routes/grocery.js` setToast usage
**Apply to:** All `setToast()` calls in `routes/library.js` — verb-only strings, never interpolate entry names

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `views/partials/library-row-edit.njk` | template (edit form partial) | request-response | No existing inline-edit toggle partial in the codebase; first instance of the outerHTML row-toggle pattern |
| `views/partials/library-footer.njk` | template (OOB footer) | request-response | No existing dedicated OOB-footer partial; first instance of a compound row+footer response |

**For these files**, the planner should use the RESEARCH.md verified sketches directly (reproduced above in their Pattern Assignments sections). The outerHTML-toggle and compound-response patterns are novel to Phase 5 but are well-specified in RESEARCH.md with verified HTMX behavior notes.

---

## Key Anti-Patterns (from RESEARCH.md)

1. **Do NOT pass row partial to `respondWithUpdates`** — it will add `hx-swap-oob` to the row and break the primary outerHTML swap target. Use `res.type('html').send(rowHtml + '\n' + injectOob(footerHtml))` directly for save/delete.
2. **Do NOT give `library-row-edit.njk` a different outer id than `library-row.njk`** — both must be `id="library-row-{{ entry.id }}"`.
3. **Do NOT interpolate `entry.name` into toast strings** — non-ASCII ingredient names break the `X-Status-Toast` HTTP header.
4. **Do NOT skip the `<meta name="htmx-config">` 400-swap override** — HTMX 2.0.4 (the vendored version) does NOT swap 4xx responses by default; without the override, alias-conflict errors will not render inline.
5. **Do NOT add the nav tab to `views/layout.njk` until the final wave** — atomic-tab-launch convention from STATE.md.

---

## Metadata

**Analog search scope:** `routes/`, `lib/`, `views/`, `views/partials/`, `test/`, `public/`
**Files scanned:** 12 source files read directly; grocery-routes test (104 lines), render.js (33 lines), calc.js (81-127 buildGroceryView), layout.njk (44 lines), grocery.njk (17 lines), grocery-list.njk (28 lines), grocery-item.njk (13 lines), server.js (63 lines), _helpers.js (76 lines), calc.test.js (80 lines reviewed)
**Pattern extraction date:** 2026-05-07
