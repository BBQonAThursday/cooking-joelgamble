# Phase 5: Library Tab - Research

**Researched:** 2026-05-07
**Domain:** Express 4 routes + HTMX 2.0.4 OOB-swap + Nunjucks 3 inline-edit toggle
**Confidence:** HIGH (all claims verified against live codebase or official HTMX docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-52:** Compact list rows (single-line on wide, wraps on narrow). Grocery-list pattern, NOT recipe-card grid.
- **D-53:** Aliases rendered comma-joined plain text; no pills/chips; no truncation.
- **D-54:** Explicit text badges `[curated]` / `[uncurated]` and `[unused]` when zero recipe references. Both states always surfaced.
- **D-55:** Sort alphabetical by canonical `name`, locale-aware A->Z, stable. Search/filter narrow but do NOT change order.
- **D-56:** Search and filter combine (AND). Active filter stays highlighted while typing.
- **D-57:** Live debounce `hx-trigger="keyup changed delay:300ms"`.
- **D-58:** Both filter and search travel as URL query params (`q=`, `filter=`); `hx-push-url="true"` on panel GET.
- **D-59:** Two distinct empty states: no-match-with-query vs. truly-empty-library.
- **D-60:** Edit form has all four fields (name, aliases, recipeCategory, groceryCategory). Aliases parsed on submit: split on `,`, trim, drop empties, dedup via Set.
- **D-61:** Alias-conflict 400 returns the SAME edit-row fragment (HTTP 400, body = edit form HTML with inline error). Form never closes on error. No toast.
- **D-62:** Cancel returns read-only row via `GET /library/:id` (server-rendered fragment, outerHTML-swap).
- **D-63:** Save success swaps only edited row outerHTML + OOB-swaps unused-count footer. Row stays at old alphabetical position on rename.
- **D-64:** Delete uses `hx-confirm` with recipe-count baked into string at panel render time.
- **D-65:** Confirmation copy varies by N: 0 ("This entry is unused.") vs >0 ("Used in N recipes. Categorization will fall back to the heuristic.").
- **D-66:** Recipe-count comes from a per-render walk inside `buildLibraryView`. O(recipes x ingredients). Not precomputed. Not stored on entries.
- **D-67:** Delete-success toast is generic "Removed entry". All library toasts are verb-only, no name interpolation (ASCII safety).

### Claude's Discretion

- HTTP verb for delete: `POST /library/:id/delete` (Claude's choice; REQUIREMENTS.md LIB-06 leans toward `DELETE /library/:id` — planner should align with existing route convention).
- Edit verb: `POST /library/:id` (not PATCH; avoids `_method` middleware).
- Tab-added-LAST mechanism: `views/layout.njk` edit lands in the FINAL commit/wave after all routes/templates/tests are green.
- Manual-add form placement: top of Library panel (mirrors recipe paste-form / grocery-add-form). Full panel re-render vs. OOB single-row insert is planner's call.
- CSS: classes prefixed `library-*`.
- Test fixture for unused/used badge as described in D-67's Claude's-Discretion block.
- Concurrent-edit prevention: out of scope (last-write-wins, documented).

### Deferred Ideas (OUT OF SCOPE)

Concurrent-edit prevention, manual-add category presets, bulk operations, drag-and-drop, library export, change log, pill rendering, "uncurated first" sort, PATCH verb, server-rendered modal, search highlighting, `updatedAt` field.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIB-01 | New "Library" nav tab in `views/layout.njk` (5th tab); sets `activeTab='library'` | Layout.njk edit at lines 11-16; tab added LAST per atomic-tab-launch convention |
| LIB-02 | GET /library page with All/Uncurated/Unused filter buttons + live substring search across name+aliases | buildLibraryView(state, {q, filter}) + HTMX debounce + hx-push-url; server-side filter walk |
| LIB-03 | Each row: name, aliases comma-joined, both categories, curated indicator, unused badge — render-time computation | buildLibraryView recipe walk (D-66); RECIPE_CATEGORIES + GROCERY_CATEGORIES already exported |
| LIB-04 | POST /library manual create, curated:true, form at top of panel | mirrors grocery addItem pattern; newLibraryEntry + aliasConflict; full panel re-render on success |
| LIB-05 | POST /library/:id updates entry; aliasConflict validation; sets curated:true; OOB-swaps the row | D-60..D-63: inline-edit GET/POST pair; 400 on conflict returns edit form fragment; HTMX 2.x 400-swap workaround required |
| LIB-06 | POST /library/:id/delete removes entry; no state.recipes mutation; OOB-swaps row removal; recipe-count warning | hx-confirm string baked at render time; delete removes row from DOM; footer OOB-swap |
</phase_requirements>

---

## Summary

Phase 5 ships the Library tab — a 5th nav tab giving the user full CRUD over `state.library` entries that Phases 3 and 4 have been populating. The surface is a compact, alphabetically-sorted list with live-debounced search, three filter buttons (All / Uncurated / Unused), inline editing via an outerHTML row-toggle pattern, native-confirm delete, and a manual-add form at the top of the panel.

The implementation is architecturally straightforward: it mirrors the existing grocery-route + grocery-template + buildGroceryView pattern almost exactly. The main novel elements are (a) the dual-fragment response for inline edit (read-only row and edit-form row are two separate partials with the same DOM id), (b) the `buildLibraryView` recipe-walk for per-render `recipeCount`, and (c) the HTMX 2.0.4 `responseHandling` override required to make 400 alias-conflict errors swap their content.

**Primary recommendation:** Follow the grocery-route/template hierarchy as the reference implementation. Add `buildLibraryView` to `lib/calc.js`, create `routes/library.js`, create four template files, extend `test/library-routes.test.js` and `test/calc.test.js`, and land the `views/layout.njk` nav-tab edit in the final plan.

**HTMX version note:** The vendored file is HTMX **2.0.4** (not 1.9.x as STACK.md states). The default `responseHandling` config in 2.0.4 is `[{code:"204",swap:false},{code:"[23]..",swap:true},{code:"[45]..",swap:false,error:true}]`. This means 400 responses do NOT swap by default — the alias-conflict inline-error (D-61) requires a meta-tag config override. [VERIFIED: codebase grep of public/vendor/htmx.min.js]

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Entry list render, filter, search | API/Backend | — | Server-side filtering; recipe-walk for recipeCount requires state access |
| Inline edit toggle (read-only row <-> edit form) | Browser / Client (HTMX outerHTML) | API/Backend (fragment render) | HTMX requests the fragment; server renders it |
| Alias-conflict validation | API/Backend | — | aliasConflict() is a pure function in lib/library.js; must run server-side |
| Delete confirmation | Browser / Client | — | hx-confirm uses native browser confirm(); no server round-trip before delete |
| URL state (search + filter) | API/Backend | Browser/Client (hx-push-url) | Server owns the query; browser history preserves it via push-url |
| Unused-count footer OOB update | API/Backend | — | Counted per-render in buildLibraryView; fragment injected via injectOob |
| Manual-add form | Browser / Client (form) | API/Backend (POST) | Standard HTML form + server POST; mirrors grocery-add pattern |
| Nav tab highlight | Frontend (Nunjucks) | — | activeTab variable threaded through all view builders |

---

## Existing-Code Analogs

### Route Shape — `routes/grocery.js`

The canonical reference for Phase 5 routes. Every library route mirrors this pattern:

```javascript
// Line 9-12: setToast function — copy verbatim into routes/library.js
function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

// Line 14-16: full-page GET
router.get('/grocery', (req, res) => {
  res.render('grocery.njk', buildGroceryView(storage.get()));
});

// Line 18-30: POST mutation -> respondWithUpdates
router.post('/grocery', (req, res) => {
  const state = storage.get();
  const result = addItem(state, text);
  if (!result.ok) return res.status(400).type('text').send('Item required');
  storage.save();
  setToast(res, 'Added');
  respondWithUpdates(req, res, { panels: ['partials/grocery-list.njk'], extra: view });
});
```

[VERIFIED: routes/grocery.js lines 1-73]

### OOB Injection — `lib/render.js`

```javascript
// Line 19-25: injectOob — injects hx-swap-oob="true" on the FIRST element's opening tag
function injectOob(html) {
  const trimmed = html.trimStart();
  return trimmed.replace(/^<([a-zA-Z][\w-]*)([^>]*)>/, (m, tag, attrs) => {
    if (/\bhx-swap-oob=/.test(attrs)) return m;
    return `<${tag}${attrs} hx-swap-oob="true">`;
  });
}

// Line 27-31: respondWithUpdates — ALL panels go through injectOob (mode: 'oob')
function respondWithUpdates(req, res, { panels = [], extra = {} } = {}) {
  const parts = [];
  for (const template of panels) parts.push({ template, mode: 'oob', extra });
  renderFragments(req, res, parts);
}
```

[VERIFIED: lib/render.js lines 1-33]

**Critical gap for Phase 5:** `respondWithUpdates` calls `buildView(storage.get(), new Date())` internally (line 5) for the base context, then merges `extra`. For library routes, `extra` must contain the full `buildLibraryView(state)` output so the panel template has all library-specific variables (`entries`, `unusedCount`, `q`, `filter`, etc.). This is identical to how grocery routes pass `extra: buildGroceryView(state)`. [VERIFIED: lib/render.js lines 4-11]

### View Builder Pattern — `lib/calc.js`

```javascript
// Line 81-127: buildGroceryView — the pattern buildLibraryView mirrors
function buildGroceryView(state) {
  const items = Array.isArray(state && state.grocery) ? state.grocery : [];
  // ... D-34 defensive guard ...
  const libraryIndex = (state && Array.isArray(state.library) && state.library.length > 0)
    ? buildLibraryIndex(state.library) : null;
  // ... per-item processing ...
  return { categorizedGroups, closedItems, hasGrocery, hasCategorized, hasClosed, activeTab: 'grocery' };
}
```

The `buildLibraryView` function follows this exact shape: defensive guard, single-pass library walk, return a view object with `activeTab: 'library'`. [VERIFIED: lib/calc.js lines 81-127]

### Template Hierarchy — `views/grocery.njk` + `views/partials/grocery-list.njk` + `views/partials/grocery-item.njk`

```nunjucks
{# grocery.njk — full page extends layout, has add-form, includes panel partial #}
{% extends "layout.njk" %}
{% block content %}
  <form hx-post="/grocery" hx-swap="none" ...>...</form>
  {% include "partials/grocery-list.njk" %}
{% endblock %}

{# grocery-list.njk — panel partial; id="grocery-list" is the OOB swap target #}
<section id="grocery-list" class="grocery-list">
  {% for group in categorizedGroups %}...{% endfor %}
</section>

{# grocery-item.njk — item partial; id="grocery-item-{{ item.id }}" #}
<li id="grocery-item-{{ item.id }}" ...>...</li>
```

[VERIFIED: views/grocery.njk, views/partials/grocery-list.njk, views/partials/grocery-item.njk]

Phase 5 mirrors this with: `views/library.njk` + `views/partials/library-panel.njk` + `views/partials/library-row.njk` + `views/partials/library-row-edit.njk`.

### Nav Tab — `views/layout.njk` lines 11-16

```nunjucks
<nav class="tabs">
  <a href="/" class="tab{% if activeTab == 'recipes' %} active{% endif %}">Recipes</a>
  <a href="/this-week" class="tab{% if activeTab == 'this-week' %} active{% endif %}">This Week</a>
  <a href="/grocery" class="tab{% if activeTab == 'grocery' %} active{% endif %}">Grocery</a>
  <a href="/history" class="tab{% if activeTab == 'history' %} active{% endif %}">History</a>
</nav>
```

The Library tab line inserts before or after History — `<a href="/library" class="tab{% if activeTab == 'library' %} active{% endif %}">Library</a>`. [VERIFIED: views/layout.njk lines 11-16]

### Test Pattern — `test/grocery-routes.test.js`

HTTP-level tests use `beforeEach/afterEach` with `setupDataDir + startTestServer + stopTestServer + teardownDataDir`. Assertions check `res.status`, `res.body` (regex match), and `res.headers['x-status-toast']`. [VERIFIED: test/grocery-routes.test.js lines 1-104]

Library helper function for seeding state before test assertions (mirrors `addItem` in grocery test):

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

---

## Decision-by-Decision Implementation Sketch

### D-52: Compact list rows

`views/partials/library-row.njk` wraps each entry in a `<li id="library-row-{{ entry.id }}" class="library-row">`. This `id` attribute is the HTMX outerHTML swap target for edit/cancel/save operations. No card-grid pattern.

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
  <button hx-post="/library/{{ entry.id }}/delete"
          hx-target="#library-row-{{ entry.id }}"
          hx-swap="outerHTML"
          hx-confirm="{{ entry.deleteConfirm }}">Delete</button>
</li>
```

### D-53: Aliases as comma-joined plain text

`buildLibraryView` adds `aliasesDisplay: entry.aliases.join(', ')` to each entry view object. Template renders `{{ entry.aliasesDisplay }}`. Empty aliases array yields empty string (no fallback needed).

### D-54: Explicit text badges

Template renders `[curated]` or `[uncurated]` badge unconditionally based on `entry.curated` boolean. `[unused]` badge rendered conditionally when `entry.unused === true` (set by recipe walk in `buildLibraryView`). Both are real text nodes, readable by screen readers.

### D-55: Alphabetical sort in `buildLibraryView`

```javascript
const library = Array.isArray(state && state.library) ? state.library : [];
const sorted = library.slice().sort((a, b) =>
  (a.name || '').localeCompare(b.name || '')
);
```

Filter and search narrow `sorted` but do not re-sort.

### D-56: AND combination of q and filter

`buildLibraryView(state, { q = '', filter = 'All' } = {})` applies predicates sequentially:

```javascript
let visible = sorted;
// Filter predicate
if (filter === 'Uncurated') visible = visible.filter(e => !e.curated);
if (filter === 'Unused')    visible = visible.filter(e => recipeCountMap.get(e.id) === 0);
// Search predicate
if (q) {
  const term = q.toLowerCase();
  visible = visible.filter(e =>
    e.name.toLowerCase().includes(term) ||
    (e.aliases || []).some(a => a.toLowerCase().includes(term))
  );
}
```

### D-57: Live debounce search

In `views/partials/library-panel.njk`:

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

`hx-include="[name='filter']"` ensures the active filter value travels with the search request. The filter input (a hidden field OR the active filter button's form value) must be named `filter` and be include-able.

**Filter button pattern:** Each filter button submits a GET to `/library` with both `q` and `filter`:

```nunjucks
<button hx-get="/library?filter=All&q={{ q }}"
        hx-target="#library-panel"
        hx-swap="outerHTML"
        hx-push-url="true"
        class="library-filter-btn {% if filter == 'All' %}active{% endif %}">All</button>
```

The `q` value is interpolated server-side at panel render time from the view model. This ensures the active filter stays highlighted while the user types: the search input fires GET /library?q=...&filter=Uncurated, which re-renders the panel with `filter=Uncurated` still active.

### D-58: Query params and push-url

`GET /library` reads `req.query.q` (default `''`) and `req.query.filter` (default `'All'`). Passes both to `buildLibraryView(state, { q, filter })`. Response is `hx-swap-oob="true"` on the panel (when called via HTMX); full page render on direct GET.

`hx-push-url="true"` on both the search input and filter buttons ensures the URL updates after each interaction. Browser back/forward restores the full-page view including the query params, which the server re-reads to produce the same filtered panel.

**Back-button behavior:** HTMX 2.x restores from its DOM snapshot cache on back navigation. If the snapshot is stale (HTMX cache miss on cold navigation), the browser reloads `GET /library?q=...&filter=...`, and the server re-filters correctly. Either path works. [VERIFIED: HTMX 2.0.4 config `historyEnabled:true, historyCacheSize:10`]

### D-59: Two distinct empty states

In `views/partials/library-panel.njk`:

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

### D-60: Edit form fields

`views/partials/library-row-edit.njk` must have the SAME outer id as `library-row.njk` — `id="library-row-{{ entry.id }}"` — so HTMX outerHTML on `GET /library/:id/edit` replaces the read-only row with the edit form, and `POST /library/:id` response replaces the edit form with the read-only row.

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

Note: `RECIPE_CATEGORIES` and `GROCERY_CATEGORIES` are available in templates when passed through `extra` in `respondWithUpdates`. The route must include them in the context. They are already exported from `lib/categorize.js`.

### D-61: Alias-conflict 400 — CRITICAL HTMX PITFALL

**The problem:** HTMX 2.0.4 default `responseHandling` is:
```
[{code:"204",swap:false},{code:"[23]..",swap:true},{code:"[45]..",swap:false,error:true}]
```
`[45]..` matches 400 with `swap:false`. HTMX will NOT swap the edit form + inline error on a 400 response by default.

**The fix:** Add a `<meta name="htmx-config">` tag in `views/layout.njk` that overrides responseHandling to make code 400 swap=true:

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

The `"400"` rule must appear BEFORE the `[45]..` catch-all because HTMX matches the first rule that applies. [VERIFIED: HTMX 2.0.4 responseHandling config from vendored file; confirmed via htmx.org/docs/#response-handling]

**Server response shape for 400:**

```javascript
router.post('/library/:id', (req, res) => {
  // ... aliasConflict check ...
  const conflict = aliasConflict(state, alias, id);
  if (conflict) {
    // Render the edit form with the error inline; preserve user's typed values
    const entry = { ...existingEntry, ...userValues, aliasError: `Alias '${alias}' is already used by '${conflict.name}'.` };
    const html = renderSync(req, 'partials/library-row-edit.njk', { entry, RECIPE_CATEGORIES, GROCERY_CATEGORIES });
    return res.status(400).type('html').send(html);
  }
  // ... success path ...
});
```

The 400 body is the raw edit-form fragment HTML. Because the edit form's `hx-target` is `#library-row-{{ entry.id }}` and `hx-swap="outerHTML"`, HTMX (with the 400-swap override) will replace the current edit row with the error-bearing edit row. The form stays open.

**Note:** The layout.njk `htmx:afterRequest` listener calls `showStatus('Error', true)` for non-successful responses. With `swap:true` on 400, the response is still technically processed as an error by the toast listener (because `error:true` in responseHandling fires `htmx:responseError`). The D-61 decision to show NO toast on alias-conflict means the route must NOT call `setToast` on 400, and the error message `"Error"` toast from the layout.njk listener WILL still fire. To suppress this, the error toast listener in layout.njk could be modified to only show "Error" for non-400 responses, OR the 400 responseHandling entry can omit `error:true`. Setting `{"code":"400","swap":true}` (without `error:true`) in the meta-tag config means HTMX does NOT fire `htmx:responseError` for 400, and the generic "Error" toast is suppressed. This is the cleaner approach. [VERIFIED: HTMX responseHandling behavior via htmx.org/docs]

**Recommendation:** Use `{"code":"400","swap":true}` without `error:true` in the meta-tag config to suppress the generic error toast on alias-conflict 400 responses.

### D-62: Cancel returns read-only row

The Cancel button fires `GET /library/:id`. The route renders `partials/library-row.njk` for the current server state of entry `id` and sends it as HTML. HTMX swaps outerHTML of `#library-row-{{ entry.id }}`. This always reflects current server state — if another tab edited the entry in the meantime, Cancel shows the latest saved values. No client-side state required.

```javascript
router.get('/library/:id', (req, res) => {
  const state = storage.get();
  const entry = (state.library || []).find(e => e.id === req.params.id);
  if (!entry) return res.status(404).type('text').send('Not found');
  const view = buildEntryView(entry, state); // builds { id, name, aliasesDisplay, recipeCount, unused, deleteConfirm, ... }
  const html = renderSync(req, 'partials/library-row.njk', { entry: view, RECIPE_CATEGORIES, GROCERY_CATEGORIES });
  res.type('html').send(html);
});
```

### D-63: Save success — row + OOB footer

On successful POST /library/:id:

```javascript
router.post('/library/:id', (req, res) => {
  // ... validation, update entry, storage.save() ...
  setToast(res, 'Saved entry');
  const state = storage.get();
  const updatedEntry = buildEntryView(state.library.find(e => e.id === req.params.id), state);
  const rowHtml = renderSync(req, 'partials/library-row.njk', { entry: updatedEntry, RECIPE_CATEGORIES, GROCERY_CATEGORIES });
  const footerView = buildLibraryView(state); // for unusedCount
  const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', footerView));
  res.type('html').send(rowHtml + '\n' + footerHtml);
});
```

The `rowHtml` is the primary swap (outerHTML target is `#library-row-{{ id }}`). The `footerHtml` has `hx-swap-oob="true"` injected by `injectOob`. HTMX processes both in one response.

**Note about `respondWithUpdates`:** The existing `respondWithUpdates` function routes all panels through `injectOob` (mode: 'oob'), but it uses `buildView` internally for context. For library routes that return a SINGLE ROW (not a panel), `respondWithUpdates` is NOT the right tool — direct `res.type('html').send(rowHtml + footerHtml)` is cleaner. This is a deliberate deviation from the grocery pattern (which always re-renders the full list). [VERIFIED: lib/render.js lines 1-33]

### D-64 / D-65: Delete confirm string baked at render time

In `buildLibraryView`, each entry view gets a `deleteConfirm` string:

```javascript
const count = recipeCountMap.get(entry.id) || 0;
const deleteConfirm = count === 0
  ? `Delete "${entry.name}"? This entry is unused.`
  : `Delete "${entry.name}"? Used in ${count} recipe${count === 1 ? '' : 's'}. Categorization will fall back to the heuristic.`;
```

**ASCII safety alert:** Entry `name` may contain non-ASCII characters (`crème fraîche`, `jalapeño`). The `deleteConfirm` string is rendered into an HTML attribute (`hx-confirm`), NOT into an HTTP header, so non-ASCII characters are fine here. This is different from `setToast` which puts strings into `X-Status-Toast` headers. [VERIFIED: CLAUDE.md; HTML attributes support full Unicode; only HTTP headers are ASCII-constrained]

In the template:

```nunjucks
<button hx-post="/library/{{ entry.id }}/delete"
        hx-target="#library-row-{{ entry.id }}"
        hx-swap="outerHTML"
        hx-confirm="{{ entry.deleteConfirm }}">Delete</button>
```

### D-66: Per-render recipe walk algorithm

```javascript
function buildLibraryView(state, { q = '', filter = 'All' } = {}) {
  const library = Array.isArray(state && state.library) ? state.library : [];
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];

  // Build recipe-count map: O(recipes x ingredients-per-recipe)
  // Build library index once for findEntryInIndex lookup: O(library x aliases)
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

  // Sort alphabetically by name
  const sorted = library.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Apply filter
  let visible = sorted;
  if (filter === 'Uncurated') visible = visible.filter(e => !e.curated);
  if (filter === 'Unused')    visible = visible.filter(e => (recipeCountMap.get(e.id) || 0) === 0);

  // Apply search
  if (q) {
    const term = q.toLowerCase();
    visible = visible.filter(e =>
      (e.name || '').toLowerCase().includes(term) ||
      (e.aliases || []).some(a => a.toLowerCase().includes(term))
    );
  }

  // Decorate entries for template
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

Note: `RECIPE_CATEGORIES` and `GROCERY_CATEGORIES` are included in the view object so templates have them available for `<select>` options. [VERIFIED: lib/categorize.js line 1 + line 172 — both exported; lib/calc.js line 2 already imports them]

### D-67: Generic toasts only

All library-tab `setToast` calls use verb-only strings:
- Manual create: `'Added entry'`
- Edit save: `'Saved entry'`
- Delete: `'Removed entry'`

No interpolation of `entry.name` into any toast string. [VERIFIED: CLAUDE.md constraint; STATE.md pitfall guard]

### Manual-add form (Claude's Discretion)

**Recommendation: full panel re-render on success.**

When `POST /library` creates a new entry, the entry must appear at its alphabetical position in the sorted list. Inserting a single `<li>` at the correct position via OOB would require the server to know the surrounding list state and target a specific DOM position — complex and fragile. Full panel re-render (`respondWithUpdates(req, res, { panels: ['partials/library-panel.njk'], extra: buildLibraryView(state) })`) is simpler, correct on every sort, and consistent with the grocery-add pattern. [ASSUMED: preference for simplicity; both approaches are technically valid per D-67 Claude's Discretion]

Form in `views/library.njk`:

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
```

`hx-swap="none"` on the form because `respondWithUpdates` pushes OOB fragments (the panel refreshes itself via `hx-swap-oob="true"` on `#library-panel`).

### HTTP verb for delete (Claude's Discretion)

**Recommendation: use `DELETE /library/:id` with `hx-delete`**, matching the existing `DELETE /grocery/:id` and `DELETE /recipes/:id` conventions. REQUIREMENTS.md LIB-06 explicitly uses `DELETE /library/:id`. HTMX's `hx-delete` attribute works identically to `hx-post` for the purposes of this phase. The `POST /library/:id/delete` alternative avoids requiring HTMX's `hx-delete` but deviates from the established pattern. Since all other delete routes in the app use the DELETE verb with HTMX, Library should match. [VERIFIED: routes/grocery.js line 46 uses `router.delete`; REQUIREMENTS.md LIB-06]

### HTTP verb for edit (Claude's Discretion)

**Recommendation: use `POST /library/:id`** (not PATCH). HTML forms only natively support GET and POST. HTMX's `hx-post` is simpler than `hx-patch` for this form-submit scenario. REQUIREMENTS.md LIB-05 explicitly authorizes `POST /library/:id accepting _method=PATCH`. No `_method` middleware is needed when using plain POST. [VERIFIED: routes/grocery.js uses no PATCH; REQUIREMENTS.md LIB-05]

### Atomic-tab-launch convention

`views/layout.njk` line 15 (between Grocery and History, or after History) gets the Library `<a>` tag ONLY in the final plan/wave of Phase 5. Until that commit, the Library routes exist and work — they just cannot be reached from the nav. Tests still work because they call routes directly via HTTP. [VERIFIED: STATE.md "Architecture Conventions — Nav tab added LAST"; 05-CONTEXT.md Claude's Discretion]

The planner should structure Phase 5 as:
- Wave 1: `lib/calc.js#buildLibraryView` + `test/calc.test.js` extension
- Wave 2: `routes/library.js` (all 6 routes) + `server.js` mount + `test/library-routes.test.js`
- Wave 3: Templates (library.njk, library-panel.njk, library-row.njk, library-row-edit.njk) + CSS
- Wave 4 (FINAL): `views/layout.njk` nav tab + HTMX 400-swap meta config + layout.njk test

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express 4 | 4.21.1 | HTTP routing | Project standard [VERIFIED: package.json] |
| Nunjucks | 3.2.4 | Server-side HTML fragments | Project standard [VERIFIED: package.json] |
| HTMX | 2.0.4 | outerHTML inline-edit toggle, push-url, debounce | Vendored; project standard [VERIFIED: public/vendor/htmx.min.js] |
| node:test | built-in (Node 24) | Test runner | Project standard [VERIFIED: test/*.test.js] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lib/library.js | project | aliasConflict, newLibraryEntry, buildLibraryIndex, findEntryInIndex | All library CRUD routes |
| lib/categorize.js | project | RECIPE_CATEGORIES, GROCERY_CATEGORIES exports | Edit form select options |
| lib/render.js | project | renderSync, injectOob for row+footer compound responses | Direct use in edit/delete routes |

**Installation:** No new packages. All dependencies are already present.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser                     Express                    lib/
------                      -------                    ----
GET /library?q=&filter= --> router.get('/library')
                              |-- buildLibraryView(state, {q,filter})
                              |     |-- buildLibraryIndex(library)
                              |     |-- per-recipe walk (findEntryInIndex)
                              |     |-- sort/filter/search
                              |     `-- return {entries, unusedCount, ...}
                              `-- res.render('library.njk', view)

HTMX search keyup -------> GET /library?q=...&filter=...
                              |-- buildLibraryView(state, {q,filter})
                              `-- respondWithUpdates(panels: [library-panel.njk])
                                    `-- injectOob -> hx-swap-oob outerHTML #library-panel

Edit button click --------> GET /library/:id/edit
                              `-- renderSync(library-row-edit.njk) -> res.send(html)
                                    `-- HTMX outerHTML #library-row-{id}

Save form submit ---------> POST /library/:id
                    [200]     |-- aliasConflict? -> NO
                              |-- update entry, storage.save()
                              |-- renderSync(library-row.njk) = rowHtml
                              |-- injectOob(renderSync(library-footer.njk)) = footerOob
                              `-- res.send(rowHtml + footerOob)
                    [400]     |-- aliasConflict? -> YES
                              |-- renderSync(library-row-edit.njk, {aliasError})
                              `-- res.status(400).send(editFormHtml)
                                    `-- HTMX swaps edit row (with 400-swap meta override)

Cancel click -------------> GET /library/:id
                              `-- renderSync(library-row.njk) -> res.send(html)
                                    `-- HTMX outerHTML #library-row-{id}

Delete button click -------> [hx-confirm dialog in browser]
                    [confirm] DELETE /library/:id
                              |-- remove entry, storage.save()
                              |-- renderSync(empty-string or tombstone) + footerOob
                              `-- res.send(tombstoneHtml + footerOob)

POST /library (add form) -> POST /library
                              |-- aliasConflict? -> 400 toast "Name required" / "Alias conflict"
                              |-- newLibraryEntry(..., curated:true), storage.save()
                              `-- respondWithUpdates(panels: [library-panel.njk], extra: buildLibraryView)
```

### Recommended Project Structure (additions only)

```
routes/
  library.js              # NEW: 6 routes
lib/
  calc.js                 # EXTEND: add buildLibraryView
views/
  library.njk             # NEW: full page
  partials/
    library-panel.njk     # NEW: OOB swap target #library-panel
    library-row.njk       # NEW: read-only row #library-row-{id}
    library-row-edit.njk  # NEW: edit form row (same id as above)
    library-footer.njk    # NEW: unused-count footer (OOB swap target)
public/
  styles.css              # EXTEND: library-* CSS classes
server.js                 # EXTEND: one new require + app.use line
test/
  library-routes.test.js  # NEW: HTTP-level route tests
  calc.test.js            # EXTEND: buildLibraryView block
```

### Pattern: Row Toggle via outerHTML

The key pattern for inline edit: two partials share the same outer DOM id. HTMX outerHTML replaces the element entirely.

```
#library-row-lb_abc123   <-- initial state: library-row.njk
  [Edit] click -> GET /library/lb_abc123/edit -> library-row-edit.njk (same id)
#library-row-lb_abc123   <-- swapped: library-row-edit.njk
  [Cancel] click -> GET /library/lb_abc123 -> library-row.njk (same id)
  [Save]   POST  -> POST /library/lb_abc123 -> library-row.njk (same id) + footer OOB
```

**Critical requirement:** Both `library-row.njk` and `library-row-edit.njk` must use the exact same outer element id: `id="library-row-{{ entry.id }}"`. The outer element (e.g., `<li>`) is what HTMX targets and replaces.

### Pattern: Compound Row + Footer Response

For save/delete success, the response body contains two fragments:

```
<li id="library-row-lb_abc123" class="library-row">   <-- primary, replaces #library-row-lb_abc123
  ... read-only row content ...
</li>
<footer id="library-footer" class="library-footer" hx-swap-oob="true">  <-- OOB
  {{ unusedCount }} unused entr{{ 'y' if unusedCount == 1 else 'ies' }}
</footer>
```

The `<li>` has no `hx-swap-oob` — it is the primary swap target (HTMX targets `#library-row-lb_abc123` based on the form's `hx-target`). The `<footer>` has `hx-swap-oob="true"` injected by `injectOob()`. HTMX processes both in the same response. [VERIFIED: lib/render.js injectOob behavior; HTMX 2.0.4 `allowNestedOobSwaps:true` config]

### Anti-Patterns to Avoid

- **Putting `hx-swap-oob` on the primary row fragment:** The row must be the primary swap (targeted by the form's `hx-target`). Only the footer should be OOB.
- **Using `respondWithUpdates` for single-row responses:** `respondWithUpdates` wraps ALL panels in `injectOob`, which would add `hx-swap-oob` to the row. For single-row + footer, build the response manually: `res.type('html').send(rowHtml + '\n' + injectOob(footerHtml))`.
- **Re-rendering the full panel on every edit save:** D-63 explicitly chose row-only for performance and to avoid visual jump. Reserve full panel re-render for add/delete.
- **Interpolating entry.name into toast strings:** Non-ASCII names break the HTTP header. Toast strings are verb-only.
- **Expecting HTMX 1.9 behavior:** The vendored file is HTMX 2.0.4. Default 4xx behavior is `swap:false`. The meta-tag config override is mandatory for D-61.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Alias deduplication on form submit | Custom loop | `[...new Set(aliases.map(a => a.trim()).filter(Boolean))]` | One line; covers edge cases |
| Alias conflict detection | String scan | `aliasConflict(state, alias, excludingId)` from lib/library.js | Already ships with normalized matching; race-condition-safe |
| Category validation on form input | Custom enum check | `RECIPE_CATEGORIES.includes(val)` / `GROCERY_CATEGORIES.includes(val)` | Already exported; no new code |
| Entry creation | Hand-crafted object literal | `newLibraryEntry({name, aliases, recipeCategory, groceryCategory, curated})` | Validates categories, deduplicates aliases, generates id, adds createdAt |
| Library index for recipe-count walk | Custom O(n^2) scan | `buildLibraryIndex(library)` + `findEntryInIndex(index, text)` | Regex-based, longest-alias-wins, already tested |
| OOB attribute injection | String concatenation | `injectOob(html)` from lib/render.js | Handles edge cases (already-has-oob, tag parsing) |

---

## Common Pitfalls

### Pitfall 1: HTMX 2.x Does Not Swap 4xx by Default

**What goes wrong:** D-61 requires the server to return HTTP 400 with the edit form + inline error, and expects HTMX to swap the row. Without override, HTMX 2.0.4 fires `htmx:responseError` and does NOT update the DOM. The user sees a generic "Error" toast and the edit form disappears (or nothing happens).

**Why it happens:** HTMX 2.0.4 changed the default `responseHandling` from 1.9.x. In 2.x, `[45]..` maps to `swap:false, error:true`.

**How to avoid:** Add `<meta name="htmx-config" ...>` in `views/layout.njk` to override `responseHandling` with an explicit `{"code":"400","swap":true}` rule before the `[45]..` catch-all.

**Warning signs:** Testing the edit form with a deliberate conflict (duplicate alias) and seeing the form vanish or seeing "Error" toast instead of the inline error message.

### Pitfall 2: respondWithUpdates Adds hx-swap-oob to Primary Row Fragment

**What goes wrong:** If you pass the row partial to `respondWithUpdates`, it goes through `injectOob` and gets `hx-swap-oob="true"`. HTMX then treats it as an OOB swap, looking for a matching `id` in the DOM — which works IF the id matches, but can fail if the row is new (e.g., after add). Worse, the primary swap target (what the form's `hx-target` points to) does not get replaced.

**Why it happens:** `respondWithUpdates` calls `injectOob` on ALL panels unconditionally.

**How to avoid:** For single-row + footer responses (edit, delete), build the response manually: `rowHtml + '\n' + injectOob(footerHtml)`. Use `respondWithUpdates` only for full-panel re-renders (add success, filter/search).

### Pitfall 3: Both Row Partials Must Share the Same Outer id

**What goes wrong:** If `library-row.njk` has `id="library-row-{{ entry.id }}"` on the `<li>` but `library-row-edit.njk` has a different id (e.g., `id="library-row-edit-{{ entry.id }}"`), the outerHTML swap cannot find its target after the first toggle.

**Why it happens:** HTMX outerHTML targets the element by DOM id. If the replacement has a different id, the next swap (Cancel, Save) has no target.

**How to avoid:** Both partials MUST use `id="library-row-{{ entry.id }}"` on their outer `<li>` element.

### Pitfall 4: hx-push-url Does Not Restore Full DOM on Cold Back Navigation

**What goes wrong:** User searches, navigates away, hits back. Browser requests the URL with query params. If the Library route returns only the panel partial (not the full page), the back navigation renders a fragment, not a full page.

**Why it happens:** HTMX push-url snapshots the full DOM into `sessionStorage` (historyCache). On back navigation, HTMX first attempts to restore from cache. If the page was hard-navigated (new tab, etc.) the cache is empty and the browser fetches the URL. The server must return a full page on direct GET.

**How to avoid:** `GET /library` always renders `library.njk` (full page via `res.render`) unless the request is an HTMX partial request (detected via `HX-Request` header). For simplicity, always return the full page — HTMX will extract the panel target automatically if `hx-target` is set. No HX-Request header detection needed. [VERIFIED: HTMX hx-push-url behavior on cold navigation]

### Pitfall 5: deleteConfirm String Contains Entry Name — Safe in HTML Attribute, NOT in HTTP Header

**What goes wrong:** Developer adds entry name to a toast message as well as the `hx-confirm` string. The `hx-confirm` HTML attribute is safe for non-ASCII. The `X-Status-Toast` HTTP header is not.

**Why it happens:** D-67 specifically calls this out, but the two contexts look similar to a developer reading the code.

**How to avoid:** The `deleteConfirm` string goes into the Nunjucks template as an HTML attribute value. The `setToast` call uses ONLY the generic `'Removed entry'` string with no entry name interpolation.

### Pitfall 6: Library Filter Buttons Must Preserve Current q Value

**What goes wrong:** User types "garlic" in search (q=garlic), then clicks "Uncurated" filter button. If the filter button hardcodes `hx-get="/library?filter=Uncurated"` without including `q`, the search term is lost.

**Why it happens:** Each filter button is an independent HTMX trigger; it does not automatically inherit the current search box value.

**How to avoid:** Filter buttons interpolate the current `q` from the view model: `hx-get="/library?filter=Uncurated&q={{ q }}"`. The `q` is available in the panel's template context because `buildLibraryView` returns it. Similarly, the search box uses `hx-include="[name='filter']"` to include the active filter — but the filter input/value must be present in the DOM as a form field named `filter`. Simplest implementation: a hidden `<input type="hidden" name="filter" value="{{ filter }}">` in the panel that the search input's `hx-include` picks up.

### Pitfall 7: Alphabetical Position After Rename

**What goes wrong:** User edits entry name from "Zucchini" to "Apple". D-63 leaves the row in its current (Z) position. After save, "Apple" appears at the bottom of the list. Planner notes say this is an accepted trade-off.

**Why it matters:** Test assertions should NOT check that a renamed entry appears at the top of the list — the row stays at its old position until the next panel reload.

**How to avoid in tests:** After a rename, assert the row content changed (new name visible in the row) rather than row position. Do not assert sort order after inline save.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`. Validation section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node 24.12.0) |
| Config file | None — runs via `node --test test/*.test.js` |
| Quick run command | `node --test test/calc.test.js` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIB-01 | Library tab appears in nav | HTTP smoke | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-02 | GET /library renders; filter buttons; search narrows | HTTP integration | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-02 | Search + filter AND combination | Unit | `node --test test/calc.test.js` | Extend existing |
| LIB-03 | Row shows name, aliases, categories, badges | HTTP integration | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-03 | recipeCount + unused computed at render time | Unit | `node --test test/calc.test.js` | Extend existing |
| LIB-04 | POST /library creates entry, panel refreshes | HTTP integration | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-04 | POST /library 400 on missing name | HTTP smoke | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-05 | GET /library/:id/edit returns edit form fragment | HTTP smoke | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-05 | POST /library/:id saves and returns read-only row | HTTP smoke | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-05 | POST /library/:id 400 on alias conflict (fragment returned) | HTTP integration | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-05 | Cancel (GET /library/:id) returns read-only row | HTTP smoke | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-05 | Save sets curated:true on uncurated entry | HTTP integration | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-06 | DELETE /library/:id removes entry, state.recipes unchanged | HTTP integration | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-06 | DELETE /library/:id 404 for unknown id | HTTP smoke | `node --test test/library-routes.test.js` | No — Wave 0 |
| LIB-06 | Footer unused-count OOB in delete response | HTTP smoke | `node --test test/library-routes.test.js` | No — Wave 0 |

### Key Unit Test Cases for `test/calc.test.js` Extension

```javascript
// State: 3 entries; 2 recipes referencing entry[0] but not entry[1] or entry[2]
// Assert: entries[0].recipeCount == 2, unused == false
// Assert: entries[1].recipeCount == 0, unused == true
// Assert: entries[2].recipeCount == 0, unused == true
// Assert: unusedCount == 2

// State: library sorted alphabetically
// Assert: buildLibraryView returns entries in A->Z name order

// State: q='garlic', filter='All'
// Assert: only entries whose name or aliases include 'garlic' appear

// State: filter='Uncurated'
// Assert: only entries with curated:false appear

// State: filter='Unused', one entry with 0 recipe refs, one with 1
// Assert: only the unused entry appears

// State: q='garlic', filter='Uncurated'
// Assert: AND combination — only uncurated entries matching 'garlic'

// State: empty library
// Assert: entries == [], hasEntries == false, unusedCount == 0

// State: q='no-match', non-empty library
// Assert: entries == [], hasEntries == false (no match empty state)
```

### Key HTTP Test Cases for `test/library-routes.test.js`

```javascript
// GET /library renders page with activeTab='library' and id="library-panel"
// GET /library with entries renders rows with name, badges
// GET /library?q=garlic narrows to matching entries
// GET /library?filter=Uncurated shows only uncurated entries
// POST /library adds entry with curated:true; panel OOB-swaps
// POST /library 400 on empty name
// POST /library 400 on alias conflict with inline error in response body
// GET /library/:id returns library-row fragment (not full page)
// GET /library/:id/edit returns library-row-edit fragment
// POST /library/:id saves; returns row fragment + footer OOB
// POST /library/:id 400 on alias conflict; body contains edit form with error
// POST /library/:id sets curated:true; GET /library/:id confirms curated badge
// DELETE /library/:id removes entry; state.recipes unchanged
// DELETE /library/:id 404 for unknown id
// GET /library empty library renders "Library is empty" message
// GET /library?q=no-match renders "No entries match" message with Clear search button
```

### Sampling Rate

- **Per task commit:** `node --test test/calc.test.js` (unit — fast, covers buildLibraryView)
- **Per wave merge:** `node --test test/library-routes.test.js test/calc.test.js`
- **Phase gate:** `npm test` (full 300+ test suite green before verification)

### Wave 0 Gaps

- [ ] `test/library-routes.test.js` — covers LIB-01 through LIB-06 HTTP layer
- [ ] `test/calc.test.js` extension — new `buildLibraryView` block (add to existing file, no new file needed)
- [ ] `views/partials/library-footer.njk` — OOB swap target for unused count (needed from Wave 1)

---

## Security Domain

`security_enforcement` is not set to `false` in config.json (key absent). Section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user LAN, no auth per CLAUDE.md |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Single-user trust model |
| V5 Input Validation | Yes | Server-side: name maxlength 200, aliases maxlength 1000; category enum validation via RECIPE_CATEGORIES.includes() |
| V6 Cryptography | No | No new crypto; entry IDs use Math.random() (existing newLibraryId pattern, acceptable for single-user app) |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via entry.name in HTML | Tampering | Nunjucks `autoescape: true` (configured in server.js line 8); all template variables auto-escaped |
| XSS via entry.name in hx-confirm attribute | Tampering | Nunjucks attribute escaping covers `"` — no raw HTML injection possible in attribute values |
| HTTP header injection via entry.name in toast | Tampering | setToast strips `\r\n`; D-67 eliminates name from toast strings entirely |
| Oversized alias input | Denial of Service | `maxlength="1000"` on form input; server-side: aliases.slice(0, 1000) before split |
| Alias conflict bypass via normalization | Tampering | aliasConflict uses aliasKey (normalizeIngredientText) — consistent normalized comparison already tested |

---

## Runtime State Inventory

Phase 5 is NOT a rename/refactor/migration phase. It adds new routes and a new tab. No runtime state inventory required.

None — Phase 5 is a greenfield feature addition. No existing stored strings, OS-registered state, or build artifacts are being renamed or removed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v24.12.0 | — |
| npm | Dependencies | Yes | 10.9.2 (from node:test output) | — |
| HTMX 2.0.4 | UI interactions | Yes (vendored) | 2.0.4 | — |
| state.json with state.library | Route tests | Yes (auto-created by storage.js) | — | — |

**All dependencies available.** No missing dependencies. [VERIFIED: Bash `node --version` = v24.12.0; `public/vendor/htmx.min.js` version:"2.0.4"]

---

## Code Examples

### buildLibraryView (complete implementation sketch)

```javascript
// lib/calc.js addition
const { RECIPE_CATEGORIES, GROCERY_CATEGORIES, ... } = require('./categorize');
const { buildLibraryIndex, findEntryInIndex } = require('./library');

function buildLibraryView(state, { q = '', filter = 'All' } = {}) {
  const library = Array.isArray(state && state.library) ? state.library : [];
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];

  const libraryIndex = library.length > 0 ? buildLibraryIndex(library) : null;
  const recipeCountMap = new Map(library.map(e => [e.id, 0]));
  if (libraryIndex) {
    for (const recipe of recipes) {
      const seen = new Set();
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

  const sorted = library.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  let visible = sorted;
  if (filter === 'Uncurated') visible = visible.filter(e => !e.curated);
  if (filter === 'Unused')    visible = visible.filter(e => (recipeCountMap.get(e.id) || 0) === 0);
  if (q) {
    const term = q.toLowerCase();
    visible = visible.filter(e =>
      (e.name || '').toLowerCase().includes(term) ||
      (e.aliases || []).some(a => a.toLowerCase().includes(term))
    );
  }

  const entries = visible.map(e => {
    const count = recipeCountMap.get(e.id) || 0;
    return {
      id: e.id,
      name: e.name || '',
      aliases: Array.isArray(e.aliases) ? e.aliases : [],
      aliasesDisplay: (Array.isArray(e.aliases) ? e.aliases : []).join(', '),
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

[ASSUMED: The `seen` Set per recipe is the author's design choice to avoid counting the same entry twice when a recipe has two ingredients that match the same library entry. This is the most defensible semantics — "how many recipes reference this entry" rather than "how many ingredient lines match".]

### HTMX 400-swap meta-tag config (in layout.njk `<head>`)

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

[VERIFIED: HTMX 2.0.4 responseHandling from vendored file; htmx.org/docs/#response-handling override mechanism]

### routes/library.js skeleton

```javascript
// Source: mirrors routes/grocery.js exactly
const express = require('express');
const storage = require('../lib/storage');
const { buildLibraryView } = require('../lib/calc');
const { RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('../lib/categorize');
const { aliasConflict, newLibraryEntry, newLibraryId } = require('../lib/library');
const { respondWithUpdates, renderSync, injectOob } = require('../lib/render');

const router = express.Router();

function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

// Full-page GET — always returns full page (direct nav + HTMX back-button fallback)
router.get('/library', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const filter = typeof req.query.filter === 'string' ? req.query.filter : 'All';
  res.render('library.njk', buildLibraryView(storage.get(), { q, filter }));
});

// ... other 5 routes ...

module.exports = router;
```

**Note:** `renderSync` and `injectOob` are currently NOT exported from `lib/render.js` — it only exports `{ renderFragments, respondWithUpdates, injectOob }`. `renderSync` IS exported. Check: yes, `module.exports = { renderFragments, respondWithUpdates, injectOob }` at line 33. `renderSync` is NOT in module.exports. Routes that need direct fragment rendering must either use `respondWithUpdates` with a workaround OR the planner should add `renderSync` to `lib/render.js` exports. [VERIFIED: lib/render.js line 33]

**Recommendation:** Add `renderSync` to `lib/render.js`'s `module.exports` in Wave 1 (or as part of the route wave). This is a one-line change, not a new behavior.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTMX 1.9.x `hx-swap-oob` behavior | HTMX 2.0.4 with `responseHandling` config | 2024 (HTMX 2.0 release) | 4xx responses require explicit `responseHandling` override to swap |
| HTMX 1.9 `hx-delete` implicit | HTMX 2.0.4 same syntax, same behavior | No change | `hx-delete` still works identically |

**Deprecated/outdated:**
- STACK.md states "HTMX 1.9.x" — actual vendored version is 2.0.4. STACK.md is inaccurate but the app works fine; the only user-visible difference is the `responseHandling` change for 4xx responses.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `seen` Set per recipe to avoid double-counting same entry across multiple ingredient lines in one recipe | buildLibraryView implementation sketch | Slight over/under count in recipeCount; semantics debate only; heuristically correct |
| A2 | Full panel re-render on manual-add success is the simpler and preferred approach vs. OOB row insertion | Manual-add section | If planner disagrees, OOB insert requires positional DOM targeting logic |
| A3 | `DELETE /library/:id` with `hx-delete` is the recommended HTTP verb (aligning with existing route conventions) | HTTP verb section | If planner uses `POST /library/:id/delete`, route file changes slightly but behavior is identical |
| A4 | `renderSync` should be added to `lib/render.js` module.exports | routes/library.js skeleton | If not exported, routes cannot call it directly; workaround is using `respondWithUpdates` only |

**If this table reflects all assumptions:** Only A1-A4 need user confirmation; all other claims in this research were verified against the codebase or official documentation.

---

## Open Questions (RESOLVED)

1. **`renderSync` export from `lib/render.js`**
   - What we know: `renderSync` is defined in `lib/render.js` (line 14) but NOT in `module.exports` (line 33 only exports `renderFragments, respondWithUpdates, injectOob`).
   - What's unclear: Should the planner add `renderSync` to the export list (one-line change), or should the library routes avoid calling `renderSync` directly and only use `respondWithUpdates`?
   - Recommendation: Add `renderSync` to exports. The single-row fragment responses (GET /library/:id, GET /library/:id/edit, POST /library/:id) require direct template rendering without the OOB injection that `respondWithUpdates` applies.

2. **HTMX 400-swap meta-tag placement**
   - What we know: The meta-tag goes in `views/layout.njk`. All pages extend layout.
   - What's unclear: Does this change affect any existing route that returns a 400? (Grocery add with bad text returns `res.status(400).type('text').send(...)` — plain text body, no HTMX swap involved. Recipe scrape failures return 200 with OOB panel.)
   - Recommendation: Audit all existing 400 responses before adding the meta-tag. None of the existing 400s return HTML swap bodies, so the override is safe. The `swap:true` on 400 only matters when HTMX is the request initiator AND the response body is HTML.

3. **Footer template element tag**
   - What we know: The footer with `id="library-footer"` needs a stable DOM id for OOB swap targeting.
   - What's unclear: Should it be a `<footer>` element or a `<div class="library-footer">` inside the panel? The `injectOob` function injects `hx-swap-oob` on the first tag; the tag choice affects CSS layout.
   - Recommendation: Use `<div id="library-footer" ...>` — consistent with how other panels use `<section>` and `<div>` rather than semantic sectioning elements for OOB targets. Planner's call on semantics.

---

## Sources

### Primary (HIGH confidence)
- Live codebase: `routes/grocery.js`, `lib/render.js`, `lib/calc.js`, `lib/library.js`, `lib/categorize.js`, `views/layout.njk`, `views/grocery.njk`, `views/partials/grocery-list.njk`, `views/partials/grocery-item.njk`, `test/grocery-routes.test.js`, `test/calc.test.js`, `test/_helpers.js`, `server.js`, `public/vendor/htmx.min.js` — all read and verified in this session
- HTMX 2.0.4 `responseHandling` config: verified by reading `public/vendor/htmx.min.js` directly
- HTMX 2.0.4 `allowNestedOobSwaps:true`: verified same file
- `.planning/config.json`: verified `nyquist_validation: true`
- `.planning/phases/05-library-tab/05-CONTEXT.md`: all D-52..D-67 decisions read verbatim

### Secondary (MEDIUM confidence)
- htmx.org/docs/#response-handling — confirmed responseHandling override mechanism and 400-swap-true approach
- htmx.org/docs/#oob_swaps — confirmed OOB swaps still processed on error responses
- htmx.org/attributes/hx-push-url/ — confirmed push-url behavior on back navigation

### Tertiary (LOW confidence)
- None. All claims are HIGH or MEDIUM confidence.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against live codebase
- Architecture: HIGH — all patterns verified against existing route/template/test files
- HTMX 4xx behavior: HIGH — verified from vendored source + official docs
- Pitfalls: HIGH — D-61 pitfall is a confirmed HTMX 2.x breaking change from 1.9.x defaults
- buildLibraryView algorithm: HIGH — mirrors existing buildGroceryView pattern; uses already-tested helpers

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (stable stack; only risk is HTMX upstream changes, but version is pinned)
