# Weekly Recipes & Grocery List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add calendar-aware weekly meal planning + a freeform grocery list with shopping-mode checkboxes, layered onto the existing recipe-box without changing its behavior for the existing Recipes flow.

**Architecture:** Additive. New pure helpers in `lib/week.js` and `lib/grocery.js`. State migration grows two new arrays (`weeks[]`, `grocery[]`). Three new route modules mounted alongside `routes/recipes.js`. View refactor extracts a shared `recipe-card.njk` partial used by both the Recipes list and the new This Week list. Layout grows a top tab strip linking the four pages. HTMX OOB-swap pattern (existing `respondWithUpdates` helper) is reused throughout. Lazy week rollover — no scheduler. The first state-touching request after Monday 00:00 (server local time) creates a fresh active week; previous weeks are archived implicitly by virtue of not being the current Monday's record.

**Tech Stack:** Node 18+ (built-in `fetch`, `node:test`), Express 4, Nunjucks, HTMX. No build step. Atomic JSON state at `data/state.json`. Existing test infrastructure: `test/_helpers.js` (`setupDataDir`, `startTestServer`, `request`).

**Spec:** `docs/superpowers/specs/2026-05-05-weekly-recipes-grocery-list-design.md`

---

## File Structure

**New files:**
- `lib/week.js` — pure helpers: `mondayOf`, `ensureCurrentWeek`, `tagRecipe`, `confirmWeek`, `unconfirmWeek`
- `lib/grocery.js` — pure helpers: `newGroceryId`, `addItem`, `toggleChecked`, `removeItem`, `clearChecked`
- `routes/weeks.js` — `/this-week*` endpoints
- `routes/grocery.js` — `/grocery*` endpoints
- `routes/history.js` — `/history`
- `views/this-week.njk`, `views/grocery.njk`, `views/history.njk` — page templates
- `views/partials/recipe-card.njk`, `views/partials/tag-toggle.njk`, `views/partials/this-week-panel.njk`, `views/partials/week-banner.njk`, `views/partials/grocery-list.njk`, `views/partials/grocery-item.njk` — partials
- `test/week.test.js`, `test/grocery.test.js`, `test/weeks-routes.test.js`, `test/grocery-routes.test.js`, `test/history-routes.test.js` — tests

**Modified files:**
- `lib/storage.js` — `migrate()` adds `weeks: []` and `grocery: []`
- `lib/calc.js` — new view-models `buildWeeklyView`, `buildGroceryView`, `buildHistoryView`; existing `buildView` gains `activeTab` and `isTagged` per recipe
- `lib/render.js` — pass `today` (current Date) to `buildView`
- `server.js` — pass `today` to `buildView`; mount three new routers
- `views/layout.njk` — add `<nav class="tabs">` strip
- `views/index.njk` — minor: `activeTab` already provided by calc; loop uses new card partial via `recipes-panel.njk`
- `views/recipe.njk` — add `tag-toggle.njk` next to title
- `views/partials/recipes-panel.njk` — slimmed; loops `recipe-card.njk`
- `public/styles.css` — additions for tabs, tag-toggle, week-banner, grocery-list

---

## Task 1: Storage migration adds `weeks: []` and `grocery: []`

**Files:**
- Modify: `lib/storage.js`
- Modify: `test/storage.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/storage.test.js` (after the existing `migrate coerces non-array recipes` test):

```js
test('migrate fills missing weeks onto an existing state', () => {
  const m = storage.migrateForTest({ recipes: [] });
  assert.deepStrictEqual(m.weeks, []);
});

test('migrate fills missing grocery onto an existing state', () => {
  const m = storage.migrateForTest({ recipes: [] });
  assert.deepStrictEqual(m.grocery, []);
});

test('migrate coerces non-array weeks to []', () => {
  const m = storage.migrateForTest({ recipes: [], weeks: 'nope' });
  assert.deepStrictEqual(m.weeks, []);
});

test('migrate coerces non-array grocery to []', () => {
  const m = storage.migrateForTest({ recipes: [], grocery: { not: 'an array' } });
  assert.deepStrictEqual(m.grocery, []);
});

test('migrate preserves existing weeks and grocery', () => {
  const existing = {
    recipes: [],
    weeks: [{ weekStart: '2026-04-27', recipeIds: ['x'], confirmed: true, modifiedAfterConfirm: false }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  const m = storage.migrateForTest(existing);
  assert.strictEqual(m.weeks.length, 1);
  assert.strictEqual(m.weeks[0].weekStart, '2026-04-27');
  assert.strictEqual(m.grocery.length, 1);
  assert.strictEqual(m.grocery[0].text, 'eggs');
});

test('defaultState contains empty weeks and grocery arrays', () => {
  const s = storage.defaultState();
  assert.deepStrictEqual(s.weeks, []);
  assert.deepStrictEqual(s.grocery, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="weeks|grocery"`
Expected: 6 new tests fail with `expected [] / actual undefined` (or similar).

- [ ] **Step 3: Update `defaultState` and `migrate` in `lib/storage.js`**

Replace the `defaultState` and `migrate` functions:

```js
function defaultState() {
  return { recipes: [], weeks: [], grocery: [] };
}

function migrate(raw) {
  const base = defaultState();
  const merged = { ...base, ...(raw || {}) };
  if (!Array.isArray(merged.recipes)) merged.recipes = [];
  if (!Array.isArray(merged.weeks)) merged.weeks = [];
  if (!Array.isArray(merged.grocery)) merged.grocery = [];
  return merged;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 65+ tests pass (existing 65 + 6 new).

- [ ] **Step 5: Commit**

```powershell
git add lib/storage.js test/storage.test.js
git commit -m "feat(storage): migrate weeks[] and grocery[] arrays"
```

---

## Task 2: `lib/week.js` — `mondayOf`

**Files:**
- Create: `lib/week.js`
- Create: `test/week.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/week.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { mondayOf } = require('../lib/week');

test('mondayOf returns the same date when given a Monday', () => {
  // 2026-05-04 is a Monday
  assert.strictEqual(mondayOf(new Date(2026, 4, 4)), '2026-05-04');
});

test('mondayOf returns the prior Monday when given a Tuesday', () => {
  assert.strictEqual(mondayOf(new Date(2026, 4, 5)), '2026-05-04');
});

test('mondayOf returns the prior Monday when given a Sunday', () => {
  // 2026-05-10 is a Sunday → Mon = 2026-05-04
  assert.strictEqual(mondayOf(new Date(2026, 4, 10)), '2026-05-04');
});

test('mondayOf strips time-of-day', () => {
  assert.strictEqual(mondayOf(new Date(2026, 4, 5, 23, 59, 59)), '2026-05-04');
});

test('mondayOf zero-pads months and days', () => {
  // 2026-01-04 is a Sunday → Mon = 2025-12-29
  assert.strictEqual(mondayOf(new Date(2026, 0, 4)), '2025-12-29');
});

test('mondayOf works across DST transitions (US spring-forward)', () => {
  // 2026-03-08 is a Sunday and is the US DST start in 2026 → Mon = 2026-03-02
  assert.strictEqual(mondayOf(new Date(2026, 2, 8)), '2026-03-02');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/week.test.js`
Expected: all 6 tests fail with `Cannot find module '../lib/week'`.

- [ ] **Step 3: Create `lib/week.js`**

```js
function mondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = { mondayOf };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/week.test.js`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/week.js test/week.test.js
git commit -m "feat(week): mondayOf — local-date Monday string"
```

---

## Task 3: `lib/week.js` — `ensureCurrentWeek`

**Files:**
- Modify: `lib/week.js`
- Modify: `test/week.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/week.test.js`:

```js
const { ensureCurrentWeek } = require('../lib/week');

test('ensureCurrentWeek creates an empty week when none exists', () => {
  const state = { recipes: [], weeks: [], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(week.weekStart, '2026-05-04');
  assert.deepStrictEqual(week.recipeIds, []);
  assert.strictEqual(week.confirmed, false);
  assert.strictEqual(week.modifiedAfterConfirm, false);
  assert.strictEqual(state.weeks.length, 1);
  assert.strictEqual(state.weeks[0], week);
});

test('ensureCurrentWeek returns the existing active week', () => {
  const existing = { weekStart: '2026-05-04', recipeIds: ['abc'], confirmed: true, modifiedAfterConfirm: false };
  const state = { recipes: [], weeks: [existing], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 7));
  assert.strictEqual(week, existing);
  assert.strictEqual(state.weeks.length, 1);
});

test('ensureCurrentWeek leaves prior weeks alone', () => {
  const past = { weekStart: '2026-04-27', recipeIds: ['x'], confirmed: true, modifiedAfterConfirm: false };
  const state = { recipes: [], weeks: [past], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.notStrictEqual(week, past);
  assert.strictEqual(state.weeks.length, 2);
  assert.strictEqual(state.weeks[0], past);
  assert.strictEqual(week.weekStart, '2026-05-04');
});

test('ensureCurrentWeek tolerates missing weeks array', () => {
  const state = { recipes: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.ok(Array.isArray(state.weeks));
  assert.strictEqual(state.weeks[0], week);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/week.test.js`
Expected: 4 new tests fail (`ensureCurrentWeek is not a function`).

- [ ] **Step 3: Implement `ensureCurrentWeek`**

Append to `lib/week.js` (before `module.exports`):

```js
function ensureCurrentWeek(state, today) {
  const monday = mondayOf(today);
  if (!Array.isArray(state.weeks)) state.weeks = [];
  let week = state.weeks.find(w => w.weekStart === monday);
  if (!week) {
    week = { weekStart: monday, recipeIds: [], confirmed: false, modifiedAfterConfirm: false };
    state.weeks.push(week);
  }
  return week;
}
```

Update the export:

```js
module.exports = { mondayOf, ensureCurrentWeek };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/week.test.js`
Expected: all 10 passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/week.js test/week.test.js
git commit -m "feat(week): ensureCurrentWeek lazily creates the active week"
```

---

## Task 4: `lib/week.js` — `tagRecipe`

**Files:**
- Modify: `lib/week.js`
- Modify: `test/week.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/week.test.js`:

```js
const { tagRecipe } = require('../lib/week');

test('tagRecipe adds a recipe id to the active week', () => {
  const state = { recipes: [{ id: 'abc' }], weeks: [], grocery: [] };
  const result = tagRecipe(state, 'abc', new Date(2026, 4, 5));
  assert.deepStrictEqual(result, { ok: true, isTagged: true });
  assert.deepStrictEqual(state.weeks[0].recipeIds, ['abc']);
});

test('tagRecipe toggles off a previously tagged recipe', () => {
  const state = {
    recipes: [{ id: 'abc' }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['abc'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  const result = tagRecipe(state, 'abc', new Date(2026, 4, 5));
  assert.deepStrictEqual(result, { ok: true, isTagged: false });
  assert.deepStrictEqual(state.weeks[0].recipeIds, []);
});

test('tagRecipe rejects an unknown recipe id', () => {
  const state = { recipes: [{ id: 'abc' }], weeks: [], grocery: [] };
  const result = tagRecipe(state, 'zzz', new Date(2026, 4, 5));
  assert.deepStrictEqual(result, { ok: false, reason: 'unknown recipe' });
  assert.strictEqual(state.weeks.length, 0);
});

test('tagRecipe sets modifiedAfterConfirm when the active week was confirmed', () => {
  const state = {
    recipes: [{ id: 'abc' }, { id: 'def' }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['abc'], confirmed: true, modifiedAfterConfirm: false }],
    grocery: []
  };
  tagRecipe(state, 'def', new Date(2026, 4, 5));
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, true);
});

test('tagRecipe does not flip modifiedAfterConfirm when the week is not yet confirmed', () => {
  const state = {
    recipes: [{ id: 'abc' }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: [], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  tagRecipe(state, 'abc', new Date(2026, 4, 5));
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/week.test.js`
Expected: 5 new tests fail.

- [ ] **Step 3: Implement `tagRecipe`**

Append to `lib/week.js` (before `module.exports`):

```js
function tagRecipe(state, recipeId, today) {
  const recipes = Array.isArray(state.recipes) ? state.recipes : [];
  if (!recipes.some(r => r.id === recipeId)) {
    return { ok: false, reason: 'unknown recipe' };
  }
  const week = ensureCurrentWeek(state, today);
  const idx = week.recipeIds.indexOf(recipeId);
  let isTagged;
  if (idx >= 0) {
    week.recipeIds.splice(idx, 1);
    isTagged = false;
  } else {
    week.recipeIds.push(recipeId);
    isTagged = true;
  }
  if (week.confirmed) week.modifiedAfterConfirm = true;
  return { ok: true, isTagged };
}
```

Update export:

```js
module.exports = { mondayOf, ensureCurrentWeek, tagRecipe };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/week.test.js`
Expected: all 15 passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/week.js test/week.test.js
git commit -m "feat(week): tagRecipe — toggle a recipe in the active week"
```

---

## Task 5: `lib/grocery.js` — `newGroceryId` + `addItem`

**Files:**
- Create: `lib/grocery.js`
- Create: `test/grocery.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/grocery.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { newGroceryId, addItem } = require('../lib/grocery');

test('newGroceryId returns a g_-prefixed string', () => {
  const id = newGroceryId();
  assert.match(id, /^g_[a-z0-9]+$/);
});

test('newGroceryId returns distinct ids on successive calls', () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) ids.add(newGroceryId());
  assert.strictEqual(ids.size, 50);
});

test('addItem appends a trimmed item to grocery', () => {
  const state = { grocery: [] };
  const result = addItem(state, '  eggs  ');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item.text, 'eggs');
  assert.strictEqual(result.item.checked, false);
  assert.match(result.item.id, /^g_/);
  assert.strictEqual(state.grocery.length, 1);
  assert.strictEqual(state.grocery[0], result.item);
});

test('addItem rejects empty / whitespace text', () => {
  const state = { grocery: [] };
  assert.deepStrictEqual(addItem(state, '').ok, false);
  assert.deepStrictEqual(addItem(state, '   ').ok, false);
  assert.deepStrictEqual(addItem(state, null).ok, false);
  assert.deepStrictEqual(addItem(state, undefined).ok, false);
  assert.strictEqual(state.grocery.length, 0);
});

test('addItem caps text at 500 chars', () => {
  const state = { grocery: [] };
  const long = 'x'.repeat(600);
  const result = addItem(state, long);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item.text.length, 500);
});

test('addItem tolerates missing grocery array', () => {
  const state = {};
  addItem(state, 'milk');
  assert.ok(Array.isArray(state.grocery));
  assert.strictEqual(state.grocery.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/grocery.test.js`
Expected: all 6 tests fail (`Cannot find module '../lib/grocery'`).

- [ ] **Step 3: Create `lib/grocery.js`**

```js
function newGroceryId() {
  // Simple non-cryptographic id; collision risk in practice is negligible
  // for a personal app and addItem returns a fresh one each call.
  return 'g_' + Math.random().toString(36).slice(2, 10);
}

function addItem(state, text) {
  const trimmed = (typeof text === 'string' ? text : '').trim().slice(0, 500);
  if (!trimmed) return { ok: false, reason: 'item required' };
  if (!Array.isArray(state.grocery)) state.grocery = [];
  const item = { id: newGroceryId(), text: trimmed, checked: false };
  state.grocery.push(item);
  return { ok: true, item };
}

module.exports = { newGroceryId, addItem };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/grocery.test.js`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/grocery.js test/grocery.test.js
git commit -m "feat(grocery): newGroceryId + addItem helpers"
```

---

## Task 6: `lib/grocery.js` — `toggleChecked`

**Files:**
- Modify: `lib/grocery.js`
- Modify: `test/grocery.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/grocery.test.js`:

```js
const { toggleChecked } = require('../lib/grocery');

test('toggleChecked flips an item from unchecked to checked', () => {
  const state = { grocery: [{ id: 'g_a', text: 'eggs', checked: false }] };
  const result = toggleChecked(state, 'g_a');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item.checked, true);
  assert.strictEqual(state.grocery[0].checked, true);
});

test('toggleChecked flips a checked item back to unchecked', () => {
  const state = { grocery: [{ id: 'g_a', text: 'eggs', checked: true }] };
  toggleChecked(state, 'g_a');
  assert.strictEqual(state.grocery[0].checked, false);
});

test('toggleChecked rejects an unknown id', () => {
  const state = { grocery: [{ id: 'g_a', text: 'eggs', checked: false }] };
  const result = toggleChecked(state, 'g_zzz');
  assert.deepStrictEqual(result, { ok: false, reason: 'unknown item' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/grocery.test.js`
Expected: 3 new tests fail.

- [ ] **Step 3: Implement `toggleChecked`**

Append to `lib/grocery.js` (before `module.exports`):

```js
function toggleChecked(state, id) {
  const item = (state.grocery || []).find(g => g.id === id);
  if (!item) return { ok: false, reason: 'unknown item' };
  item.checked = !item.checked;
  return { ok: true, item };
}
```

Update export: `module.exports = { newGroceryId, addItem, toggleChecked };`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/grocery.test.js`
Expected: 9 passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/grocery.js test/grocery.test.js
git commit -m "feat(grocery): toggleChecked"
```

---

## Task 7: `lib/grocery.js` — `removeItem` + `clearChecked`

**Files:**
- Modify: `lib/grocery.js`
- Modify: `test/grocery.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/grocery.test.js`:

```js
const { removeItem, clearChecked } = require('../lib/grocery');

test('removeItem removes the item by id', () => {
  const state = { grocery: [
    { id: 'g_a', text: 'a', checked: false },
    { id: 'g_b', text: 'b', checked: false }
  ]};
  const result = removeItem(state, 'g_a');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item.text, 'a');
  assert.strictEqual(state.grocery.length, 1);
  assert.strictEqual(state.grocery[0].id, 'g_b');
});

test('removeItem rejects an unknown id', () => {
  const state = { grocery: [{ id: 'g_a', text: 'a', checked: false }] };
  const result = removeItem(state, 'g_zzz');
  assert.deepStrictEqual(result, { ok: false, reason: 'unknown item' });
  assert.strictEqual(state.grocery.length, 1);
});

test('clearChecked removes only checked items', () => {
  const state = { grocery: [
    { id: 'g_a', text: 'a', checked: true },
    { id: 'g_b', text: 'b', checked: false },
    { id: 'g_c', text: 'c', checked: true }
  ]};
  const result = clearChecked(state);
  assert.strictEqual(result.clearedCount, 2);
  assert.strictEqual(state.grocery.length, 1);
  assert.strictEqual(state.grocery[0].id, 'g_b');
});

test('clearChecked is a no-op when none are checked', () => {
  const state = { grocery: [{ id: 'g_a', text: 'a', checked: false }] };
  const result = clearChecked(state);
  assert.strictEqual(result.clearedCount, 0);
  assert.strictEqual(state.grocery.length, 1);
});

test('clearChecked tolerates missing grocery array', () => {
  const state = {};
  const result = clearChecked(state);
  assert.strictEqual(result.clearedCount, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/grocery.test.js`
Expected: 5 new tests fail.

- [ ] **Step 3: Implement `removeItem` and `clearChecked`**

Append to `lib/grocery.js` (before `module.exports`):

```js
function removeItem(state, id) {
  if (!Array.isArray(state.grocery)) return { ok: false, reason: 'unknown item' };
  const idx = state.grocery.findIndex(g => g.id === id);
  if (idx < 0) return { ok: false, reason: 'unknown item' };
  const [removed] = state.grocery.splice(idx, 1);
  return { ok: true, item: removed };
}

function clearChecked(state) {
  if (!Array.isArray(state.grocery)) return { clearedCount: 0 };
  const before = state.grocery.length;
  state.grocery = state.grocery.filter(g => !g.checked);
  return { clearedCount: before - state.grocery.length };
}
```

Update export:

```js
module.exports = { newGroceryId, addItem, toggleChecked, removeItem, clearChecked };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/grocery.test.js`
Expected: 14 passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/grocery.js test/grocery.test.js
git commit -m "feat(grocery): removeItem + clearChecked"
```

---

## Task 8: `lib/week.js` — `confirmWeek` + `unconfirmWeek`

**Files:**
- Modify: `lib/week.js`
- Modify: `test/week.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/week.test.js`:

```js
const { confirmWeek, unconfirmWeek } = require('../lib/week');

function recipe(id, ingredients) {
  return { id, title: id, sourceUrl: `https://x/${id}`, ingredients };
}

test('confirmWeek imports tagged recipes ingredients (deduped)', () => {
  const state = {
    recipes: [
      recipe('a', ['eggs', '2 tbsp salt']),
      recipe('b', ['flour', 'eggs'])
    ],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a', 'b'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.addedCount, 3); // eggs, salt, flour (eggs deduped)
  assert.strictEqual(state.grocery.length, 3);
  assert.strictEqual(state.weeks[0].confirmed, true);
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, false);
});

test('confirmWeek skips ingredients already in grocery (string-equal)', () => {
  const state = {
    recipes: [recipe('a', ['eggs', 'milk'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(result.addedCount, 1);
  assert.strictEqual(state.grocery.length, 2);
  assert.ok(state.grocery.some(g => g.text === 'milk'));
});

test('confirmWeek returns addedCount=0 when all ingredients are dupes', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.addedCount, 0);
  assert.strictEqual(state.weeks[0].confirmed, true);
});

test('confirmWeek rejects when no recipes are tagged', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: [], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.deepStrictEqual(result, { ok: false, reason: 'no recipes tagged' });
  assert.strictEqual(state.weeks[0].confirmed, false);
});

test('confirmWeek filters out tagged ids that no longer exist in recipes', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a', 'deleted-id'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.addedCount, 1);
});

test('confirmWeek clears modifiedAfterConfirm', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: true, modifiedAfterConfirm: true }],
    grocery: []
  };
  confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, false);
});

test('unconfirmWeek clears confirmed and modifiedAfterConfirm without removing grocery items', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: true, modifiedAfterConfirm: true }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  unconfirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(state.weeks[0].confirmed, false);
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, false);
  assert.strictEqual(state.grocery.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/week.test.js`
Expected: 7 new tests fail.

- [ ] **Step 3: Implement `confirmWeek` and `unconfirmWeek`**

At the top of `lib/week.js`, add:

```js
const { newGroceryId } = require('./grocery');
```

Append before `module.exports`:

```js
function confirmWeek(state, today) {
  const week = ensureCurrentWeek(state, today);
  if (week.recipeIds.length === 0) {
    return { ok: false, reason: 'no recipes tagged' };
  }
  const recipes = Array.isArray(state.recipes) ? state.recipes : [];
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  if (!Array.isArray(state.grocery)) state.grocery = [];
  const existingTexts = new Set(state.grocery.map(g => g.text));
  let added = 0;
  for (const id of week.recipeIds) {
    const r = recipesById.get(id);
    if (!r) continue;
    for (const text of (r.ingredients || [])) {
      if (typeof text !== 'string' || !text.trim()) continue;
      if (existingTexts.has(text)) continue;
      state.grocery.push({ id: newGroceryId(), text, checked: false });
      existingTexts.add(text);
      added++;
    }
  }
  week.confirmed = true;
  week.modifiedAfterConfirm = false;
  return { ok: true, addedCount: added };
}

function unconfirmWeek(state, today) {
  const week = ensureCurrentWeek(state, today);
  week.confirmed = false;
  week.modifiedAfterConfirm = false;
  return { ok: true };
}
```

Update export:

```js
module.exports = { mondayOf, ensureCurrentWeek, tagRecipe, confirmWeek, unconfirmWeek };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/week.test.js`
Expected: 22 passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/week.js test/week.test.js
git commit -m "feat(week): confirmWeek + unconfirmWeek"
```

---

## Task 9: `lib/calc.js` — `buildView` adds `activeTab` and `isTagged`

**Files:**
- Modify: `lib/calc.js`
- Modify: `lib/render.js`
- Modify: `server.js`
- Modify: `test/calc.test.js`

This task threads `today` through the existing code path. Existing routes call `buildView(storage.get())` — they need to pass `new Date()`.

- [ ] **Step 1: Write the failing tests**

Append to `test/calc.test.js`:

```js
test('buildView sets activeTab to "recipes"', () => {
  const view = buildView({ recipes: [] }, new Date(2026, 4, 5));
  assert.strictEqual(view.activeTab, 'recipes');
});

test('buildView marks recipes tagged in the active week with isTagged=true', () => {
  const state = {
    recipes: [
      { id: 'a', title: 'A', addedAt: '2026-05-01T00:00:00Z' },
      { id: 'b', title: 'B', addedAt: '2026-05-02T00:00:00Z' }
    ],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: false, modifiedAfterConfirm: false }]
  };
  const view = buildView(state, new Date(2026, 4, 5));
  const a = view.recipes.find(r => r.id === 'a');
  const b = view.recipes.find(r => r.id === 'b');
  assert.strictEqual(a.isTagged, true);
  assert.strictEqual(b.isTagged, false);
});

test('buildView returns isTagged=false when there is no active week', () => {
  const state = { recipes: [{ id: 'a', title: 'A', addedAt: '2026-05-01T00:00:00Z' }] };
  const view = buildView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.recipes[0].isTagged, false);
});
```

Note: `test/calc.test.js` already requires `buildView`. Confirm the import is at the top of that file before appending.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/calc.test.js`
Expected: 3 new tests fail (`activeTab undefined` / `isTagged undefined`).

- [ ] **Step 3: Update `buildView` in `lib/calc.js`**

Replace `buildView` with:

```js
const { mondayOf } = require('./week');

function buildView(state, today) {
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const sorted = recipes.slice().sort((a, b) =>
    (b.addedAt || '').localeCompare(a.addedAt || '')
  );
  const taggedIds = today
    ? new Set(((state && state.weeks) || [])
        .find(w => w.weekStart === mondayOf(today))?.recipeIds || [])
    : new Set();
  const decorated = sorted.map(r => ({
    ...r,
    sourceDomain: sourceDomain(r.sourceUrl),
    totalTimeLabel: formatTotalTime(r.totalMinutes),
    isTagged: taggedIds.has(r.id)
  }));
  return {
    recipes: decorated,
    hasRecipes: decorated.length > 0,
    activeTab: 'recipes'
  };
}
```

- [ ] **Step 4: Update `lib/render.js` to pass `today`**

Replace the `renderFragments` function:

```js
function renderFragments(req, res, parts) {
  const view = buildView(storage.get(), new Date());
  const html = parts.map(({ template, mode, extra }) => {
    const ctx = { ...view, ...(extra || {}) };
    const out = renderSync(req, template, ctx);
    return mode === 'oob' ? injectOob(out) : out;
  }).join('\n');
  res.type('html').send(html);
}
```

- [ ] **Step 5: Update `server.js` to pass `today`**

In `server.js`, replace the `app.get('/', ...)` handler:

```js
app.get('/', (req, res) => {
  res.render('index.njk', buildView(storage.get(), new Date()));
});
```

- [ ] **Step 6: Update existing routes/recipes.js GET handler**

In `routes/recipes.js`, the GET `/recipes/:id` handler builds a decorated recipe directly. It does not call `buildView`. No change needed unless tests fail — leave alone.

- [ ] **Step 7: Run all tests to verify they pass**

Run: `npm test`
Expected: all passing (existing + new).

- [ ] **Step 8: Commit**

```powershell
git add lib/calc.js lib/render.js server.js test/calc.test.js
git commit -m "feat(calc): buildView gets activeTab + per-recipe isTagged"
```

---

## Task 10: `lib/calc.js` — `buildWeeklyView`

**Files:**
- Modify: `lib/calc.js`
- Modify: `test/calc.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/calc.test.js`:

```js
const { buildWeeklyView } = require('../lib/calc');

test('buildWeeklyView returns the active week and decorated tagged recipes', () => {
  const state = {
    recipes: [
      { id: 'a', title: 'A', sourceUrl: 'https://x.com/a', totalMinutes: 30, ingredients: ['eggs'] },
      { id: 'b', title: 'B', sourceUrl: 'https://x.com/b', totalMinutes: 60, ingredients: ['flour'] }
    ],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a', 'b'], confirmed: false, modifiedAfterConfirm: false }]
  };
  const view = buildWeeklyView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.activeTab, 'this-week');
  assert.strictEqual(view.weekRecipeCount, 2);
  assert.strictEqual(view.weekRecipes[0].title, 'A');
  assert.strictEqual(view.weekRecipes[0].sourceDomain, 'x.com');
  assert.strictEqual(view.weekRecipes[0].totalTimeLabel, '30m');
  assert.strictEqual(view.weekRecipes[0].isTagged, true);
});

test('buildWeeklyView filters out dangling recipe ids', () => {
  const state = {
    recipes: [{ id: 'a', title: 'A', sourceUrl: 'https://x.com/a', ingredients: [] }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a', 'deleted'], confirmed: false, modifiedAfterConfirm: false }]
  };
  const view = buildWeeklyView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.weekRecipeCount, 1);
  assert.strictEqual(view.weekRecipes[0].id, 'a');
});

test('buildWeeklyView reports pendingIngredientCount minus existing grocery dupes', () => {
  const state = {
    recipes: [{ id: 'a', title: 'A', sourceUrl: 'https://x.com/a', ingredients: ['eggs', 'milk', 'flour'] }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  const view = buildWeeklyView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.pendingIngredientCount, 2); // milk, flour
});

test('buildWeeklyView returns an empty active week when none exists in state', () => {
  const view = buildWeeklyView({ recipes: [] }, new Date(2026, 4, 5));
  assert.strictEqual(view.weekRecipeCount, 0);
  assert.strictEqual(view.week.weekStart, '2026-05-04');
  assert.strictEqual(view.week.confirmed, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/calc.test.js`
Expected: 4 new tests fail (`buildWeeklyView is not a function`).

- [ ] **Step 3: Implement `buildWeeklyView`**

Append to `lib/calc.js` (before `module.exports`):

```js
function buildWeeklyView(state, today) {
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const monday = mondayOf(today);
  const week = ((state && state.weeks) || []).find(w => w.weekStart === monday)
    || { weekStart: monday, recipeIds: [], confirmed: false, modifiedAfterConfirm: false };
  const decorated = week.recipeIds
    .map(id => recipesById.get(id))
    .filter(Boolean)
    .map(r => ({
      ...r,
      sourceDomain: sourceDomain(r.sourceUrl),
      totalTimeLabel: formatTotalTime(r.totalMinutes),
      isTagged: true
    }));
  const existingTexts = new Set(((state && state.grocery) || []).map(g => g.text));
  let pendingCount = 0;
  for (const r of decorated) {
    for (const text of (r.ingredients || [])) {
      if (typeof text !== 'string' || !text.trim()) continue;
      if (existingTexts.has(text)) continue;
      pendingCount++;
      existingTexts.add(text);
    }
  }
  return {
    week,
    weekRecipes: decorated,
    weekRecipeCount: decorated.length,
    pendingIngredientCount: pendingCount,
    hasRecipes: decorated.length > 0,
    activeTab: 'this-week'
  };
}
```

Update `module.exports` to include `buildWeeklyView`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/calc.test.js`
Expected: all passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/calc.js test/calc.test.js
git commit -m "feat(calc): buildWeeklyView"
```

---

## Task 11: `lib/calc.js` — `buildGroceryView`

**Files:**
- Modify: `lib/calc.js`
- Modify: `test/calc.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/calc.test.js`:

```js
const { buildGroceryView } = require('../lib/calc');

test('buildGroceryView decorates grocery list with counts', () => {
  const state = {
    grocery: [
      { id: 'g_a', text: 'eggs', checked: false },
      { id: 'g_b', text: 'milk', checked: true }
    ]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.activeTab, 'grocery');
  assert.strictEqual(view.grocery.length, 2);
  assert.strictEqual(view.hasGrocery, true);
  assert.strictEqual(view.checkedCount, 1);
});

test('buildGroceryView handles empty/missing grocery', () => {
  const view = buildGroceryView({});
  assert.deepStrictEqual(view.grocery, []);
  assert.strictEqual(view.hasGrocery, false);
  assert.strictEqual(view.checkedCount, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/calc.test.js`
Expected: 2 new tests fail.

- [ ] **Step 3: Implement `buildGroceryView`**

Append to `lib/calc.js`:

```js
function buildGroceryView(state) {
  const items = Array.isArray(state && state.grocery) ? state.grocery : [];
  return {
    grocery: items.map(g => ({ ...g })),
    hasGrocery: items.length > 0,
    checkedCount: items.filter(g => g.checked).length,
    activeTab: 'grocery'
  };
}
```

Update `module.exports` to include `buildGroceryView`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/calc.test.js`
Expected: passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/calc.js test/calc.test.js
git commit -m "feat(calc): buildGroceryView"
```

---

## Task 12: `lib/calc.js` — `buildHistoryView`

**Files:**
- Modify: `lib/calc.js`
- Modify: `test/calc.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/calc.test.js`:

```js
const { buildHistoryView } = require('../lib/calc');

test('buildHistoryView excludes the active week and sorts newest first', () => {
  const state = {
    recipes: [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' }
    ],
    weeks: [
      { weekStart: '2026-04-20', recipeIds: ['a'], confirmed: true, modifiedAfterConfirm: false },
      { weekStart: '2026-05-04', recipeIds: ['a','b'], confirmed: false, modifiedAfterConfirm: false }, // active
      { weekStart: '2026-04-27', recipeIds: ['b'], confirmed: true, modifiedAfterConfirm: false }
    ]
  };
  const view = buildHistoryView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.activeTab, 'history');
  assert.strictEqual(view.pastWeeks.length, 2);
  assert.strictEqual(view.pastWeeks[0].weekStart, '2026-04-27');
  assert.strictEqual(view.pastWeeks[1].weekStart, '2026-04-20');
});

test('buildHistoryView resolves recipe titles, filtering dangling ids', () => {
  const state = {
    recipes: [{ id: 'a', title: 'A' }],
    weeks: [
      { weekStart: '2026-04-27', recipeIds: ['a', 'deleted'], confirmed: true, modifiedAfterConfirm: false }
    ]
  };
  const view = buildHistoryView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.pastWeeks[0].recipes.length, 1);
  assert.strictEqual(view.pastWeeks[0].recipes[0].title, 'A');
});

test('buildHistoryView returns hasHistory=false when no past weeks', () => {
  const view = buildHistoryView({ recipes: [], weeks: [] }, new Date(2026, 4, 5));
  assert.strictEqual(view.hasHistory, false);
  assert.deepStrictEqual(view.pastWeeks, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/calc.test.js`
Expected: 3 new tests fail.

- [ ] **Step 3: Implement `buildHistoryView`**

Append to `lib/calc.js`:

```js
function buildHistoryView(state, today) {
  const monday = mondayOf(today);
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const past = ((state && state.weeks) || [])
    .filter(w => w.weekStart < monday)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map(w => ({
      weekStart: w.weekStart,
      confirmed: !!w.confirmed,
      recipes: (w.recipeIds || [])
        .map(id => recipesById.get(id))
        .filter(Boolean)
        .map(r => ({ id: r.id, title: r.title }))
    }));
  return {
    pastWeeks: past,
    hasHistory: past.length > 0,
    activeTab: 'history'
  };
}
```

Update `module.exports` to include `buildHistoryView`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/calc.test.js`
Expected: passing.

- [ ] **Step 5: Commit**

```powershell
git add lib/calc.js test/calc.test.js
git commit -m "feat(calc): buildHistoryView"
```

---

## Task 13: Layout — top tabs strip

**Files:**
- Modify: `views/layout.njk`
- Modify: `test/recipes.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/recipes.test.js`:

```js
test('GET / renders the top tabs with Recipes active', async () => {
  const res = await helpers.request(ctx.port, { path: '/' });
  assert.match(res.body, /<nav class="tabs">/);
  assert.match(res.body, /href="\/"[^>]*class="tab active"[^>]*>Recipes</);
  assert.match(res.body, /href="\/this-week"/);
  assert.match(res.body, /href="\/grocery"/);
  assert.match(res.body, /href="\/history"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recipes.test.js`
Expected: fail (no `<nav class="tabs">` in current layout).

- [ ] **Step 3: Update `views/layout.njk`**

Replace the `{% block content %}{% endblock %}` line with:

```html
  <nav class="tabs">
    <a href="/" class="tab{% if activeTab == 'recipes' %} active{% endif %}">Recipes</a>
    <a href="/this-week" class="tab{% if activeTab == 'this-week' %} active{% endif %}">This Week</a>
    <a href="/grocery" class="tab{% if activeTab == 'grocery' %} active{% endif %}">Grocery</a>
    <a href="/history" class="tab{% if activeTab == 'history' %} active{% endif %}">History</a>
  </nav>
  {% block content %}{% endblock %}
```

(The wrapping `<body>` and existing toast/HTMX boilerplate stay as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recipes.test.js`
Expected: passing.

- [ ] **Step 5: Run full suite to ensure nothing broke**

Run: `npm test`
Expected: all passing.

- [ ] **Step 6: Commit**

```powershell
git add views/layout.njk test/recipes.test.js
git commit -m "feat(layout): top-tab navigation strip"
```

---

## Task 14: Extract `views/partials/recipe-card.njk` (refactor)

**Files:**
- Create: `views/partials/recipe-card.njk`
- Modify: `views/partials/recipes-panel.njk`

- [ ] **Step 1: Run tests before refactor (capture baseline)**

Run: `npm test`
Expected: all passing.

- [ ] **Step 2: Create `views/partials/recipe-card.njk`**

```html
<li class="recipe-card{% if r.isTagged %} is-tagged{% endif %}" data-id="{{ r.id }}">
  <a class="recipe-card-link" href="/recipes/{{ r.id }}">
    {% if r.imageUrl %}
      <img class="recipe-card-img" src="{{ r.imageUrl }}" alt="" loading="lazy">
    {% else %}
      <div class="recipe-card-img recipe-card-img-empty"></div>
    {% endif %}
    <div class="recipe-card-body">
      <div class="recipe-card-title">{{ r.title }}</div>
      <div class="recipe-card-meta">
        {% if r.servings %}{{ r.servings }}{% endif %}
        {% if r.totalTimeLabel %} · {{ r.totalTimeLabel }}{% endif %}
        {% if r.sourceDomain %} · {{ r.sourceDomain }}{% endif %}
      </div>
    </div>
  </a>
  {% if context != 'this-week' %}
  <button class="delete-btn"
          hx-delete="/recipes/{{ r.id }}"
          hx-swap="none"
          hx-confirm="Delete this recipe?"
          aria-label="Delete">×</button>
  {% endif %}
</li>
```

- [ ] **Step 3: Update `views/partials/recipes-panel.njk` to use the partial**

Replace the entire file with:

```html
<section id="recipes-panel" class="recipes-panel">
  {% if hasRecipes %}
    <ul class="recipe-list">
      {% for r in recipes %}
        {% include "partials/recipe-card.njk" %}
      {% endfor %}
    </ul>
  {% else %}
    <p class="empty">No recipes yet. Paste a URL above to get started.</p>
  {% endif %}
</section>
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all passing — the rendered HTML structure should match what existing tests assert (`id="recipes-panel"`, `Stub Recipe ...`, `hx-swap-oob="true"`, `No recipes yet`, `Deleted/Updated/Saved` toasts).

- [ ] **Step 5: Commit**

```powershell
git add views/partials/recipe-card.njk views/partials/recipes-panel.njk
git commit -m "refactor(views): extract recipe-card partial"
```

---

## Task 15: Tag-toggle partial wired into recipe-card

**Files:**
- Create: `views/partials/tag-toggle.njk`
- Modify: `views/partials/recipe-card.njk`
- Modify: `test/recipes.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/recipes.test.js`:

```js
test('GET / shows an untagged tag-toggle on each recipe card', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/tag-test' } });
  const res = await helpers.request(ctx.port, { path: '/' });
  assert.match(res.body, /<button[^>]*class="tag-toggle"[^>]*hx-post="\/this-week\/recipes\/[a-z0-9]+"/);
  assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recipes.test.js`
Expected: fail (no `tag-toggle` markup).

- [ ] **Step 3: Create `views/partials/tag-toggle.njk`**

```html
<button class="tag-toggle{% if isTagged %} is-tagged{% endif %}"
        id="tag-toggle-{{ id }}"
        hx-post="/this-week/recipes/{{ id }}"
        hx-swap="none"
        aria-label="{% if isTagged %}Remove from this week{% else %}Add to this week{% endif %}"
        title="{% if isTagged %}Remove from this week{% else %}Add to this week{% endif %}">★</button>
```

- [ ] **Step 4: Wire it into `views/partials/recipe-card.njk`**

Replace the file with:

```html
<li class="recipe-card{% if r.isTagged %} is-tagged{% endif %}" id="recipe-card-{{ r.id }}" data-id="{{ r.id }}">
  <a class="recipe-card-link" href="/recipes/{{ r.id }}">
    {% if r.imageUrl %}
      <img class="recipe-card-img" src="{{ r.imageUrl }}" alt="" loading="lazy">
    {% else %}
      <div class="recipe-card-img recipe-card-img-empty"></div>
    {% endif %}
    <div class="recipe-card-body">
      <div class="recipe-card-title">{{ r.title }}</div>
      <div class="recipe-card-meta">
        {% if r.servings %}{{ r.servings }}{% endif %}
        {% if r.totalTimeLabel %} · {{ r.totalTimeLabel }}{% endif %}
        {% if r.sourceDomain %} · {{ r.sourceDomain }}{% endif %}
      </div>
    </div>
  </a>
  {% set id = r.id %}
  {% set isTagged = r.isTagged %}
  {% include "partials/tag-toggle.njk" %}
  {% if context != 'this-week' %}
  <button class="delete-btn"
          hx-delete="/recipes/{{ r.id }}"
          hx-swap="none"
          hx-confirm="Delete this recipe?"
          aria-label="Delete">×</button>
  {% endif %}
</li>
```

Note: The card now has `id="recipe-card-{{ r.id }}"` so OOB-swaps from the toggle endpoint (Task 18) can target it.

Note: Nunjucks doesn't support `{% include "..." with { ... } %}` (that's Jinja2/Twig). Use `{% set %}` before the include — Nunjucks `{% include %}` always passes the current parent context, and the `set` lines just add the two variables the partial needs into that context.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: all passing.

- [ ] **Step 6: Commit**

```powershell
git add views/partials/tag-toggle.njk views/partials/recipe-card.njk test/recipes.test.js
git commit -m "feat(views): tag-toggle on each recipe card"
```

---

## Task 16: Tag-toggle on recipe detail page

**Files:**
- Modify: `views/recipe.njk`
- Modify: `routes/recipes.js`
- Modify: `test/recipes.test.js`

The detail-page handler decorates the recipe directly (not via `buildView`). It needs to know whether the recipe is currently tagged so the toggle renders the right state.

- [ ] **Step 1: Write the failing test**

Append to `test/recipes.test.js`:

```js
test('GET /recipes/:id renders the tag-toggle next to the title', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/detail-test' }});
  const { idForUrl } = require('../lib/id');
  const id = idForUrl('https://example.com/detail-test');
  const res = await helpers.request(ctx.port, { path: `/recipes/${id}` });
  assert.match(res.body, new RegExp(`id="tag-toggle-${id}"`));
  // Untagged by default
  assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recipes.test.js`
Expected: fail (no toggle on detail page).

- [ ] **Step 3: Update GET handler in `routes/recipes.js`**

Replace the GET handler:

```js
router.get('/recipes/:id', (req, res) => {
  const state = storage.get();
  const recipe = state.recipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).type('text').send('Not found');
  const { mondayOf } = require('../lib/week');
  const monday = mondayOf(new Date());
  const week = (state.weeks || []).find(w => w.weekStart === monday);
  const isTagged = !!(week && week.recipeIds.includes(recipe.id));
  const decorated = {
    ...recipe,
    sourceDomain: sourceDomain(recipe.sourceUrl),
    totalTimeLabel: formatTotalTime(recipe.totalMinutes),
    isTagged
  };
  res.render('recipe.njk', { recipe: decorated });
});
```

- [ ] **Step 4: Update `views/recipe.njk`**

Replace the file with:

```html
{% extends "layout.njk" %}
{% block content %}
  <main class="app recipe-view">
    <p><a href="/">← Back to recipes</a></p>
    <div class="recipe-header">
      <h1>{{ recipe.title }}</h1>
      {% set id = recipe.id %}
      {% set isTagged = recipe.isTagged %}
      {% include "partials/tag-toggle.njk" %}
    </div>
    {% if recipe.description %}<p class="description">{{ recipe.description }}</p>{% endif %}
    {% if recipe.imageUrl %}<img class="hero" src="{{ recipe.imageUrl }}" alt="">{% endif %}
    <p class="meta">
      {% if recipe.servings %}{{ recipe.servings }}{% endif %}
      {% if recipe.totalTimeLabel %} · {{ recipe.totalTimeLabel }}{% endif %}
      {% if recipe.sourceDomain %} · <a href="{{ recipe.sourceUrl }}" rel="noopener">{{ recipe.sourceDomain }}</a>{% endif %}
    </p>
    <h2>Ingredients</h2>
    <ul>
      {% for ing in recipe.ingredients %}<li>{{ ing }}</li>{% endfor %}
    </ul>
    <h2>Instructions</h2>
    <ol>
      {% for step in recipe.instructions %}<li>{{ step }}</li>{% endfor %}
    </ol>
  </main>
{% endblock %}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 6: Commit**

```powershell
git add routes/recipes.js views/recipe.njk test/recipes.test.js
git commit -m "feat(views): tag-toggle on recipe detail page"
```

---

## Task 17: This Week page + GET /this-week route

**Files:**
- Create: `views/partials/this-week-panel.njk`
- Create: `views/partials/week-banner.njk`
- Create: `views/this-week.njk`
- Create: `routes/weeks.js`
- Modify: `server.js` (mount router)
- Create: `test/weeks-routes.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/weeks-routes.test.js`:

```js
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const helpers = require('./_helpers');

const scrapeMod = require('../lib/scrape');
scrapeMod.scrape = async (url) => ({
  ok: true,
  recipe: {
    sourceUrl: url,
    title: 'Stub ' + url.split('/').pop(),
    description: '',
    imageUrl: null,
    servings: null,
    totalMinutes: 30,
    ingredients: ['ingredient-' + url.split('/').pop()],
    instructions: ['Cook.']
  }
});

let ctx;

beforeEach(async () => {
  helpers.setupDataDir();
  ctx = await helpers.startTestServer();
});

afterEach(async () => {
  await helpers.stopTestServer(ctx.server);
  helpers.teardownDataDir();
});

test('GET /this-week renders the page with empty state and active tab', async () => {
  const res = await helpers.request(ctx.port, { path: '/this-week' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/this-week"[^>]*class="tab active"/);
  assert.match(res.body, /id="this-week-panel"/);
  assert.match(res.body, /No recipes tagged for this week/);
  assert.match(res.body, /id="week-banner"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/weeks-routes.test.js`
Expected: fail with 404 (no /this-week route).

- [ ] **Step 3: Create `views/partials/week-banner.njk`**

```html
<section id="week-banner" class="week-banner{% if week.confirmed and week.modifiedAfterConfirm %} warning{% endif %}">
  {% if not week.confirmed %}
    {% if weekRecipeCount > 0 %}
      <button class="banner-btn"
              hx-post="/this-week/confirm"
              hx-swap="none">Confirm week — adds {{ pendingIngredientCount }} ingredient{{ 's' if pendingIngredientCount != 1 else '' }} to grocery list</button>
      <p class="banner-sub">{{ weekRecipeCount }} recipe{{ 's' if weekRecipeCount != 1 else '' }} tagged.</p>
    {% else %}
      <p class="banner-sub">No recipes tagged yet. Add some from the Recipes tab.</p>
    {% endif %}
  {% elif week.modifiedAfterConfirm %}
    <button class="banner-btn"
            hx-post="/this-week/confirm"
            hx-swap="none">Re-confirm to sync grocery list</button>
    <p class="banner-sub">Week modified after confirm.</p>
  {% else %}
    <p class="banner-sub"><span class="confirmed-pill">Confirmed ✓</span></p>
    <button class="banner-btn-secondary"
            hx-post="/this-week/unconfirm"
            hx-swap="none">Unconfirm</button>
  {% endif %}
</section>
```

- [ ] **Step 4: Create `views/partials/this-week-panel.njk`**

```html
<section id="this-week-panel" class="recipes-panel">
  {% if hasRecipes %}
    <ul class="recipe-list">
      {% for r in weekRecipes %}
        {% set context = 'this-week' %}
        {% include "partials/recipe-card.njk" %}
      {% endfor %}
    </ul>
  {% else %}
    <p class="empty">No recipes tagged for this week. Tap a ★ on the Recipes tab to add one.</p>
  {% endif %}
</section>
```

- [ ] **Step 5: Create `views/this-week.njk`**

```html
{% extends "layout.njk" %}
{% block content %}
  <main class="app">
    <header class="app-header">
      <h1>This Week</h1>
    </header>
    {% include "partials/week-banner.njk" %}
    {% include "partials/this-week-panel.njk" %}
  </main>
{% endblock %}
```

- [ ] **Step 6: Create `routes/weeks.js`**

```js
const express = require('express');
const storage = require('../lib/storage');
const { buildWeeklyView } = require('../lib/calc');

const router = express.Router();

router.get('/this-week', (req, res) => {
  res.render('this-week.njk', buildWeeklyView(storage.get(), new Date()));
});

module.exports = router;
```

- [ ] **Step 7: Mount router in `server.js`**

Add after `app.use('/', require('./routes/recipes'));`:

```js
  app.use('/', require('./routes/weeks'));
```

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 9: Commit**

```powershell
git add views/partials/week-banner.njk views/partials/this-week-panel.njk views/this-week.njk routes/weeks.js server.js test/weeks-routes.test.js
git commit -m "feat(this-week): GET /this-week page with empty state"
```

---

## Task 18: POST /this-week/recipes/:id — toggle endpoint

**Files:**
- Modify: `routes/weeks.js`
- Modify: `lib/render.js`
- Modify: `test/weeks-routes.test.js`

The toggle response must return BOTH a re-rendered card (id `recipe-card-<id>`, OOB-swap) AND a re-rendered standalone tag-toggle (id `tag-toggle-<id>`, OOB-swap). HTMX silently ignores fragments whose target id isn't present, so the same response works whether the user is on the Recipes list, This Week, or the recipe detail page.

`lib/render.js` currently exposes `respondWithUpdates({ panels, extra })` which loops over panel templates and OOB-swaps each. We'll re-use it: the two "panels" here are `partials/recipe-card.njk` and `partials/tag-toggle.njk`, with `extra` providing the per-recipe context (since neither panel is a top-level view-model template).

- [ ] **Step 1: Write the failing tests**

Append to `test/weeks-routes.test.js`:

```js
const { idForUrl } = require('../lib/id');

async function saveRecipe(port, url) {
  await helpers.request(port, { method: 'POST', path: '/recipes', body: { url } });
  return idForUrl(url);
}

test('POST /this-week/recipes/:id tags an unknown recipe (added)', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-tag-1');
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, new RegExp(`id="recipe-card-${id}"`));
  assert.match(res.body, new RegExp(`id="tag-toggle-${id}"`));
  assert.match(res.body, /class="tag-toggle is-tagged"/);
  assert.match(res.headers['x-status-toast'] || '', /Added to this week/);
});

test('POST /this-week/recipes/:id toggles off a tagged recipe (removed)', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-tag-2');
  await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  assert.strictEqual(res.status, 200);
  assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
  assert.match(res.headers['x-status-toast'] || '', /Removed from this week/);
});

test('POST /this-week/recipes/:id 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/recipes/zzzzzzzzzz' });
  assert.strictEqual(res.status, 404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/weeks-routes.test.js`
Expected: 3 fail (404 on POST endpoint).

- [ ] **Step 3: Add the toggle handler to `routes/weeks.js`**

Replace `routes/weeks.js` with:

```js
const express = require('express');
const storage = require('../lib/storage');
const { buildWeeklyView } = require('../lib/calc');
const { tagRecipe } = require('../lib/week');
const { sourceDomain, formatTotalTime } = require('../lib/calc');
const { respondWithUpdates } = require('../lib/render');

const router = express.Router();

function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

router.get('/this-week', (req, res) => {
  res.render('this-week.njk', buildWeeklyView(storage.get(), new Date()));
});

router.post('/this-week/recipes/:id', (req, res) => {
  const today = new Date();
  const state = storage.get();
  const recipe = state.recipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).type('text').send('Not found');

  const result = tagRecipe(state, req.params.id, today);
  if (!result.ok) return res.status(400).type('text').send(result.reason);
  storage.save();

  setToast(res, result.isTagged ? 'Added to this week' : 'Removed from this week');

  const decoratedRecipe = {
    ...recipe,
    sourceDomain: sourceDomain(recipe.sourceUrl),
    totalTimeLabel: formatTotalTime(recipe.totalMinutes),
    isTagged: result.isTagged
  };
  // Two OOB fragments: re-rendered card AND re-rendered standalone toggle.
  // HTMX matches by id; whichever isn't in the current DOM is ignored.
  respondWithUpdates(req, res, {
    panels: ['partials/recipe-card.njk', 'partials/tag-toggle.njk'],
    extra: { r: decoratedRecipe, id: decoratedRecipe.id, isTagged: result.isTagged }
  });
});

module.exports = router;
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```powershell
git add routes/weeks.js test/weeks-routes.test.js
git commit -m "feat(this-week): POST /this-week/recipes/:id toggle endpoint"
```

---

## Task 19: POST /this-week/confirm + /unconfirm

**Files:**
- Modify: `routes/weeks.js`
- Modify: `test/weeks-routes.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/weeks-routes.test.js`:

```js
test('POST /this-week/confirm adds tagged recipe ingredients to grocery', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-confirm-1');
  await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="week-banner"/);
  assert.match(res.body, /Confirmed ✓/);
  assert.match(res.headers['x-status-toast'] || '', /Added 1 item/);
});

test('POST /this-week/confirm with no tags returns the no-recipes toast', async () => {
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /No recipes tagged for this week/);
});

test('POST /this-week/confirm with all dupes returns "already up to date" toast', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-confirm-2');
  await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  // Second confirm — nothing to add
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  assert.match(res.headers['x-status-toast'] || '', /Already up to date/);
});

test('POST /this-week/unconfirm clears confirmation without touching grocery', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-unconf-1');
  await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/unconfirm' });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /Confirmation cleared/);
  assert.doesNotMatch(res.body, /Confirmed ✓/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/weeks-routes.test.js`
Expected: 4 new tests fail.

- [ ] **Step 3: Add the confirm/unconfirm handlers to `routes/weeks.js`**

Add the import at the top of the file:

```js
const { tagRecipe, confirmWeek, unconfirmWeek } = require('../lib/week');
```

Append the following routes before `module.exports`:

```js
router.post('/this-week/confirm', (req, res) => {
  const today = new Date();
  const state = storage.get();
  const result = confirmWeek(state, today);
  if (!result.ok && result.reason === 'no recipes tagged') {
    setToast(res, 'No recipes tagged for this week');
    // No state change → no OOB needed; respond with empty body but the toast.
    return res.type('html').send('');
  }
  storage.save();
  if (result.addedCount === 0) {
    setToast(res, 'Already up to date — 0 items added');
  } else {
    setToast(res, `Added ${result.addedCount} item${result.addedCount === 1 ? '' : 's'} to grocery list`);
  }
  // OOB-swap the week banner. respondWithUpdates passes the buildView context;
  // we also need buildWeeklyView's keys (week, weekRecipeCount, pendingIngredientCount).
  const view = buildWeeklyView(state, today);
  respondWithUpdates(req, res, {
    panels: ['partials/week-banner.njk'],
    extra: view
  });
});

router.post('/this-week/unconfirm', (req, res) => {
  const today = new Date();
  const state = storage.get();
  unconfirmWeek(state, today);
  storage.save();
  setToast(res, 'Confirmation cleared');
  const view = buildWeeklyView(state, today);
  respondWithUpdates(req, res, {
    panels: ['partials/week-banner.njk'],
    extra: view
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```powershell
git add routes/weeks.js test/weeks-routes.test.js
git commit -m "feat(this-week): POST /this-week/confirm + /unconfirm"
```

---

## Task 20: Grocery page + GET /grocery + POST /grocery (add)

**Files:**
- Create: `views/partials/grocery-item.njk`
- Create: `views/partials/grocery-list.njk`
- Create: `views/grocery.njk`
- Create: `routes/grocery.js`
- Modify: `server.js`
- Create: `test/grocery-routes.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/grocery-routes.test.js`:

```js
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

test('GET /grocery renders the page with empty state', async () => {
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/grocery"[^>]*class="tab active"/);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /Grocery list is empty/);
});

test('POST /grocery adds an item and OOB-swaps the list', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/grocery',
    body: { text: '  eggs  ' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, />eggs</);
  assert.match(res.headers['x-status-toast'] || '', /Added/);
});

test('POST /grocery rejects empty text with 400', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/grocery',
    body: { text: '   ' }
  });
  assert.strictEqual(res.status, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/grocery-routes.test.js`
Expected: 3 fail (404 — no routes mounted).

- [ ] **Step 3: Create `views/partials/grocery-item.njk`**

```html
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

- [ ] **Step 4: Create `views/partials/grocery-list.njk`**

```html
<ul id="grocery-list" class="grocery-list">
  {% if hasGrocery %}
    {% for item in grocery %}
      {% include "partials/grocery-item.njk" %}
    {% endfor %}
  {% else %}
    <li class="empty grocery-empty">Grocery list is empty.</li>
  {% endif %}
</ul>
```

- [ ] **Step 5: Create `views/grocery.njk`**

```html
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
    {% if checkedCount > 0 %}
      <button class="grocery-clear-checked"
              hx-post="/grocery/clear-checked"
              hx-swap="none">Clear {{ checkedCount }} checked item{{ 's' if checkedCount != 1 else '' }}</button>
    {% endif %}
  </main>
{% endblock %}
```

- [ ] **Step 6: Create `routes/grocery.js`**

```js
const express = require('express');
const storage = require('../lib/storage');
const { buildGroceryView } = require('../lib/calc');
const { addItem } = require('../lib/grocery');
const { respondWithUpdates } = require('../lib/render');

const router = express.Router();

function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

router.get('/grocery', (req, res) => {
  res.render('grocery.njk', buildGroceryView(storage.get()));
});

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

module.exports = router;
```

- [ ] **Step 7: Mount router in `server.js`**

Add after the weeks router mount:

```js
  app.use('/', require('./routes/grocery'));
```

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 9: Commit**

```powershell
git add views/partials/grocery-item.njk views/partials/grocery-list.njk views/grocery.njk routes/grocery.js server.js test/grocery-routes.test.js
git commit -m "feat(grocery): GET /grocery page + POST /grocery add"
```

---

## Task 21: POST /grocery/:id/check — toggle checked

**Files:**
- Modify: `routes/grocery.js`
- Modify: `test/grocery-routes.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/grocery-routes.test.js`:

```js
async function addItem(port, text) {
  const res = await helpers.request(port, { method: 'POST', path: '/grocery', body: { text } });
  // Extract id from rendered body
  const m = res.body.match(/id="grocery-item-(g_[a-z0-9]+)"/);
  return m ? m[1] : null;
}

test('POST /grocery/:id/check toggles checked state', async () => {
  const id = await addItem(ctx.port, 'eggs');
  assert.ok(id);
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/grocery/${id}/check` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, new RegExp(`id="grocery-item-${id}"`));
  assert.match(res.body, /class="grocery-item is-checked"/);
  assert.match(res.body, /hx-swap-oob="true"/);
});

test('POST /grocery/:id/check 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/grocery/g_nope/check' });
  assert.strictEqual(res.status, 404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/grocery-routes.test.js`
Expected: fail.

- [ ] **Step 3: Add the handler to `routes/grocery.js`**

Add the import at the top:

```js
const { addItem, toggleChecked } = require('../lib/grocery');
```

(Replace existing `addItem`-only import.)

Append before `module.exports`:

```js
router.post('/grocery/:id/check', (req, res) => {
  const state = storage.get();
  const result = toggleChecked(state, req.params.id);
  if (!result.ok) return res.status(404).type('text').send('Not found');
  storage.save();
  // OOB-swap the single row
  respondWithUpdates(req, res, {
    panels: ['partials/grocery-item.njk'],
    extra: { item: result.item }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```powershell
git add routes/grocery.js test/grocery-routes.test.js
git commit -m "feat(grocery): POST /grocery/:id/check"
```

---

## Task 22: DELETE /grocery/:id

**Files:**
- Modify: `routes/grocery.js`
- Modify: `test/grocery-routes.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/grocery-routes.test.js`:

```js
test('DELETE /grocery/:id removes the item and OOB-swaps the list', async () => {
  const id = await addItem(ctx.port, 'eggs');
  const res = await helpers.request(ctx.port, { method: 'DELETE', path: `/grocery/${id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /Grocery list is empty/);
  assert.match(res.headers['x-status-toast'] || '', /Removed/);
});

test('DELETE /grocery/:id 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'DELETE', path: '/grocery/g_nope' });
  assert.strictEqual(res.status, 404);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/grocery-routes.test.js`
Expected: fail.

- [ ] **Step 3: Add the handler**

Replace the import line at the top with:

```js
const { addItem, toggleChecked, removeItem } = require('../lib/grocery');
```

Append before `module.exports`:

```js
router.delete('/grocery/:id', (req, res) => {
  const state = storage.get();
  const result = removeItem(state, req.params.id);
  if (!result.ok) return res.status(404).type('text').send('Not found');
  storage.save();
  setToast(res, 'Removed');
  const view = buildGroceryView(state);
  respondWithUpdates(req, res, {
    panels: ['partials/grocery-list.njk'],
    extra: view
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```powershell
git add routes/grocery.js test/grocery-routes.test.js
git commit -m "feat(grocery): DELETE /grocery/:id"
```

---

## Task 23: POST /grocery/clear-checked

**Files:**
- Modify: `routes/grocery.js`
- Modify: `test/grocery-routes.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/grocery-routes.test.js`:

```js
test('POST /grocery/clear-checked removes only checked items', async () => {
  const idA = await addItem(ctx.port, 'eggs');
  const idB = await addItem(ctx.port, 'milk');
  await helpers.request(ctx.port, { method: 'POST', path: `/grocery/${idA}/check` });
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/grocery/clear-checked' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, />milk</);
  assert.doesNotMatch(res.body, />eggs</);
  assert.match(res.headers['x-status-toast'] || '', /Cleared 1 item/);
});

test('POST /grocery/clear-checked with nothing checked says so', async () => {
  await addItem(ctx.port, 'eggs');
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/grocery/clear-checked' });
  assert.match(res.headers['x-status-toast'] || '', /Nothing to clear/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/grocery-routes.test.js`
Expected: fail.

- [ ] **Step 3: Add the handler**

Update the import at the top:

```js
const { addItem, toggleChecked, removeItem, clearChecked } = require('../lib/grocery');
```

Append before `module.exports`:

```js
router.post('/grocery/clear-checked', (req, res) => {
  const state = storage.get();
  const { clearedCount } = clearChecked(state);
  if (clearedCount > 0) storage.save();
  setToast(res, clearedCount > 0
    ? `Cleared ${clearedCount} item${clearedCount === 1 ? '' : 's'}`
    : 'Nothing to clear');
  const view = buildGroceryView(state);
  respondWithUpdates(req, res, {
    panels: ['partials/grocery-list.njk'],
    extra: view
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```powershell
git add routes/grocery.js test/grocery-routes.test.js
git commit -m "feat(grocery): POST /grocery/clear-checked"
```

---

## Task 24: History page + GET /history

**Files:**
- Create: `views/history.njk`
- Create: `routes/history.js`
- Modify: `server.js`
- Create: `test/history-routes.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/history-routes.test.js`:

```js
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

test('GET /history shows empty state when there are no past weeks', async () => {
  const res = await helpers.request(ctx.port, { path: '/history' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/history"[^>]*class="tab active"/);
  assert.match(res.body, /No past weeks yet/);
});

test('GET /history lists past weeks (reads state directly to seed)', async () => {
  // Seed state directly
  const storage = require('../lib/storage');
  const state = storage.get();
  state.recipes.push({ id: 'a', title: 'Old Recipe', addedAt: '2026-04-20T00:00:00Z' });
  state.weeks.push({ weekStart: '2026-04-20', recipeIds: ['a'], confirmed: true, modifiedAfterConfirm: false });
  storage.save();

  const res = await helpers.request(ctx.port, { path: '/history' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /2026-04-20/);
  assert.match(res.body, /Old Recipe/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/history-routes.test.js`
Expected: fail (404).

- [ ] **Step 3: Create `views/history.njk`**

```html
{% extends "layout.njk" %}
{% block content %}
  <main class="app">
    <header class="app-header">
      <h1>History</h1>
    </header>
    {% if hasHistory %}
      <ul class="history-list">
        {% for w in pastWeeks %}
          <li class="history-week">
            <h3 class="history-weekstart">Week of {{ w.weekStart }}{% if w.confirmed %} <span class="confirmed-pill">✓</span>{% endif %}</h3>
            {% if w.recipes.length > 0 %}
              <ul class="history-recipes">
                {% for r in w.recipes %}
                  <li><a href="/recipes/{{ r.id }}">{{ r.title }}</a></li>
                {% endfor %}
              </ul>
            {% else %}
              <p class="empty">No recipes tagged.</p>
            {% endif %}
          </li>
        {% endfor %}
      </ul>
    {% else %}
      <p class="empty">No past weeks yet.</p>
    {% endif %}
  </main>
{% endblock %}
```

- [ ] **Step 4: Create `routes/history.js`**

```js
const express = require('express');
const storage = require('../lib/storage');
const { buildHistoryView } = require('../lib/calc');

const router = express.Router();

router.get('/history', (req, res) => {
  res.render('history.njk', buildHistoryView(storage.get(), new Date()));
});

module.exports = router;
```

- [ ] **Step 5: Mount router in `server.js`**

Add:

```js
  app.use('/', require('./routes/history'));
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 7: Commit**

```powershell
git add views/history.njk routes/history.js server.js test/history-routes.test.js
git commit -m "feat(history): GET /history page"
```

---

## Task 25: CSS additions

**Files:**
- Modify: `public/styles.css`

No automated tests for CSS — covered by manual smoke (Task 26).

- [ ] **Step 1: Append to `public/styles.css`**

Add at the bottom of the file, before the `@media` rule:

```css
/* Tabs */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 8px 14px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font-size: 14px;
}
.tab:hover { color: var(--fg); text-decoration: none; }
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* Tag toggle */
.tag-toggle {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 32px; height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  color: rgba(255,255,255,0.55);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}
.tag-toggle:hover { background: rgba(0,0,0,0.75); color: white; }
.tag-toggle.is-tagged {
  background: var(--accent);
  color: white;
}
.recipe-card.is-tagged {
  border-left: 3px solid var(--accent);
}

/* Recipe-detail tag-toggle (no absolute positioning — sits inline with title) */
.recipe-view .recipe-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.recipe-view .recipe-header .tag-toggle {
  position: static;
  width: 36px; height: 36px;
  font-size: 20px;
}
.recipe-view .recipe-header h1 { margin: 0; flex: 1; }

/* Week banner */
.week-banner {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.week-banner.warning {
  border-left: 3px solid var(--accent);
  background: #fff8f4;
}
.banner-btn {
  padding: 10px 14px;
  border: none;
  background: var(--accent);
  color: white;
  border-radius: var(--radius);
  font-size: 15px;
  cursor: pointer;
  align-self: flex-start;
}
.banner-btn:hover { filter: brightness(1.05); }
.banner-btn-secondary {
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
  align-self: flex-start;
}
.banner-sub { margin: 0; color: var(--muted); font-size: 14px; }
.confirmed-pill {
  display: inline-block;
  padding: 2px 8px;
  background: var(--accent);
  color: white;
  border-radius: 999px;
  font-size: 12px;
}

/* Grocery */
.grocery-add {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.grocery-add input[type="text"] {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 16px;
  background: var(--card-bg);
}
.grocery-add button {
  padding: 10px 18px;
  border: none;
  background: var(--accent);
  color: white;
  border-radius: var(--radius);
  font-size: 16px;
  cursor: pointer;
}
.grocery-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card-bg);
  overflow: hidden;
}
.grocery-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.grocery-item:last-child { border-bottom: none; }
.grocery-item.is-checked .grocery-text {
  text-decoration: line-through;
  color: var(--muted);
}
.grocery-check {
  width: 24px; height: 24px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.grocery-item.is-checked .grocery-check {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.grocery-text { flex: 1; }
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
.grocery-empty { padding: 20px; text-align: center; }
.grocery-clear-checked {
  margin-top: 12px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: var(--radius);
  cursor: pointer;
}
.grocery-clear-checked:hover { color: var(--fg); border-color: var(--fg); }

/* History */
.history-list { list-style: none; padding: 0; margin: 0; }
.history-week {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  margin-bottom: 12px;
}
.history-weekstart { margin: 0 0 8px; font-size: 16px; }
.history-recipes { margin: 0; padding-left: 20px; }
```

- [ ] **Step 2: Verify nothing broke**

Run: `npm test`
Expected: all passing.

- [ ] **Step 3: Commit**

```powershell
git add public/styles.css
git commit -m "ui: styles for tabs, tag-toggle, week banner, grocery, history"
```

---

## Task 26: Manual smoke test

**Files:** none modified. This is a hands-on verification.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

In a browser, open `http://127.0.0.1:3003`.

- [ ] **Step 2: Walk the golden path**

1. Tabs visible at top. "Recipes" is active. Existing recipes still render in cards.
2. Click `★` on a recipe card → toggle becomes filled, card gets accent left-border. Toast: "Added to this week".
3. Open a recipe detail page. Toggle next to title shows filled state. Click again → unfilled. Toast: "Removed from this week".
4. Add a couple of recipes via paste. Click `★` to tag two of them.
5. Switch to "This Week" tab. Two recipes shown. Banner reads "Confirm week — adds N ingredients to grocery list."
6. Click "Confirm week". Banner becomes "Confirmed ✓". Toast: "Added N items to grocery list".
7. Switch to "Grocery" tab. All ingredient strings visible.
8. Add a manual item ("paper towels"). Appears at the bottom.
9. Click checkboxes on a few items. They get strikethrough. "Clear N checked items" button appears.
10. Click "Clear checked items" — checked items disappear. Toast: "Cleared N items".
11. Delete an item via `×`. Toast: "Removed".
12. Switch back to "This Week", tag one more recipe → banner switches to warning state with "Re-confirm to sync grocery list". Click → grocery list gains only the new ingredients (existing ones not duplicated).

- [ ] **Step 3: Verify week rollover (synthetic)**

Stop the server. Edit `data/state.json` directly: change the `weekStart` of the active week to a date one week earlier (e.g. `2026-04-27` → `2026-04-20`). Restart the server. Visit `/this-week` — a fresh empty active week should appear; visit `/history` — the modified week should now appear there.

- [ ] **Step 4: Verify Recipes tab unchanged for previous behaviors**

Confirm: paste form still works, recipe detail still renders, delete still works, OOB-swaps still update the list.

- [ ] **Step 5: Stop the server**

Ctrl-C in the terminal.

- [ ] **Step 6: Document the smoke test outcome**

If anything fails, file an issue or report back to the user. Otherwise, commit the spec/plan ship as a final marker.

```powershell
git status        # should be clean
```

---

## Self-review checklist

After every task above is complete, verify:

- [ ] All commits present in `git log`.
- [ ] `npm test` shows the full suite passing (~100+ tests).
- [ ] No remaining TODO/TBD comments in source.
- [ ] State migrations applied to existing `data/state.json` cleanly (delete file & re-run if a migration test failed earlier — it's safe in dev; on the Pi the existing file gains the empty arrays automatically).
- [ ] Hand the user the tab strip + each route URL for a final live check.
