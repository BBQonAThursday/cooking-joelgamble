# Coding Conventions

**Analysis Date:** 2026-05-05

## Language & Module System

**Runtime:** Node.js (CommonJS/require)

- All code uses CommonJS: `const X = require('./path')` and `module.exports = {}`
- No ES modules (no `import`/`export`)
- Pure Node APIs: `require('node:fs')`, `require('node:path')`, `require('node:crypto')`, `require('node:http')`, `require('node:test')`

## Code Style

**Formatting:**
- 2-space indentation (consistent throughout all `.js` files)
- Single quotes for strings: `'string'` not `"string"`
- Semicolons required at end of statements
- No linter configured (no `.eslintrc`, `.prettierrc`, or `biome.json`)

**Examples:**
```javascript
// From lib/storage.js
const fs = require('node:fs');
const path = require('node:path');

function defaultState() {
  return { recipes: [], weeks: [], grocery: [] };
}

let state = null;

function load() {
  if (state) return state;
  const dir = getDataDir();
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(getStateFile())) {
      const raw = JSON.parse(fs.readFileSync(getStateFile(), 'utf8'));
      state = migrate(raw);
      persist();
    } else {
      state = defaultState();
      persist();
    }
  } catch (err) {
    console.warn('Could not load state, using defaults:', err.message);
    state = defaultState();
  }
  return state;
}
```

## Naming Patterns

**Files:**
- Lowercase, no dashes, no spaces: `storage.js`, `calc.js`, `scrape.js`
- Test files: `*.test.js` (e.g., `storage.test.js`, `recipes.test.js`)
- Route files: `recipes.js`, `weeks.js`, `grocery.js`, `history.js` in `routes/`
- Library modules: `*.js` in `lib/` directory

**Functions:**
- camelCase: `defaultState`, `getDataDir`, `getStateFile`, `buildView`, `formatTotalTime`, `sourceDomain`
- Private/internal functions: no prefix convention (no underscore prefix for privacy, but `_resetForTest()` is exposed as testing utility)
- Exported functions: explicitly listed in `module.exports = { ... }`

**Variables:**
- camelCase for locals and module-level: `state`, `recipes`, `toastVerb`, `existingIdx`
- UPPERCASE for constants: `RECIPE_CATEGORIES`, `GROCERY_CATEGORIES`, `RECIPE_KEYWORDS`, `GROCERY_KEYWORDS`, `SCRIPT_RE`
- Boolean variables: `isTagged`, `confirmed`, `hasRecipes`, `hasCategorized`, `hasClosed`

**Types & Objects:**
- No TypeScript; plain objects with implicit shape
- ID formats:
  - Recipe IDs: `idForUrl(url)` produces 10-char base36 hash (stable, collision-resistant)
  - Grocery item IDs: `newGroceryId()` produces `g_` + 8-char base36 (non-cryptographic, unique per call)

**Examples:**
```javascript
// From lib/id.js
function idForUrl(url) {
  const buf = crypto.createHash('sha256').update(String(url)).digest();
  const hi = BigInt('0x' + buf.subarray(0, 8).toString('hex'));
  return hi.toString(36).padStart(10, '0').slice(-10);
}

// From lib/grocery.js
function newGroceryId() {
  return 'g_' + Math.random().toString(36).slice(2, 10);
}
```

## Function Design

**Size:**
- Most functions are short (<30 lines); some view builders are longer
- Helper functions stay focused on a single task

**Parameters:**
- Minimal parameters; functions often take a `state` object and return new/modified data
- Options objects used when multiple optional parameters needed

**Return Values:**
- Result objects: `{ ok: true, ... }` or `{ ok: false, reason: 'error message' }`
- View objects: `{ activeTab, recipes, hasRecipes, ... }` shaped for template rendering
- Void-returning functions: `load()`, `save()`, `persist()` mutate module state

**Examples:**
```javascript
// From lib/grocery.js — result object pattern
function addItem(state, text) {
  const trimmed = (typeof text === 'string' ? text : '').trim().slice(0, 500);
  if (!trimmed) return { ok: false, reason: 'item required' };
  if (!Array.isArray(state.grocery)) state.grocery = [];
  const item = { id: newGroceryId(), text: trimmed, checked: false };
  state.grocery.push(item);
  return { ok: true, item };
}

// From lib/calc.js — view object pattern
function buildView(state, today) {
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const sorted = recipes.slice().sort((a, b) =>
    (b.addedAt || '').localeCompare(a.addedAt || '')
  );
  // ... decorations ...
  return {
    recipes: decorated,
    hasRecipes: decorated.length > 0,
    activeTab: 'recipes'
  };
}
```

## Module Design

**Exports:**
- All exports explicit in `module.exports = { func1, func2, ... }`
- No barrel exports (no `index.js` re-exports)
- No default exports; always named exports

**Singleton Pattern:**
- `lib/storage.js` is the state owner; returns module-level `state` variable via `get()` and `save()`
- `lib/storage.js#migrate(raw)` handles schema evolution when state shape changes
- Testing utility: `_resetForTest()` clears singleton for per-test isolation

**Example:**
```javascript
// From lib/storage.js
let state = null;  // Module-level singleton

function get()      { return load(); }
function save()     { persist(); }
function _resetForTest() { state = null; }  // Testing hook

module.exports = {
  get, save, replace, reset,
  defaultState, migrateForTest: migrate, _resetForTest
};
```

## Architecture Patterns

**View-Model Separation:**
- `lib/calc.js` produces view-model objects (`buildView`, `buildGroceryView`, etc.)
- Views live in `views/*.njk` (Nunjucks templates)
- Routes call `buildXxxView(storage.get(), context)` and pass result to template or `respondWithUpdates()`

**Route Response Pattern:**
- Routes return HTML fragments via `respondWithUpdates(req, res, { panels, extra })`
- Fragments automatically get `hx-swap-oob="true"` via `injectOob(html)` in `lib/render.js`
- Toast messages set via `setToast(res, msg)` → `X-Status-Toast` HTTP header
- Toast constraint: **no em-dashes or non-ASCII characters** (HTTP header encoding limitation)

**Examples:**
```javascript
// From routes/recipes.js
function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

router.post('/recipes', async (req, res, next) => {
  // ... scraping ...
  setToast(res, `${toastVerb}: ${entry.title}`);
  respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
});

// From routes/grocery.js
router.post('/grocery', (req, res) => {
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

## Error Handling

**Strategy:** Result objects + HTTP status codes + console logging

**Patterns:**

1. **Helper function failures:** Return `{ ok: false, reason: '...' }`
   ```javascript
   // lib/grocery.js
   if (!trimmed) return { ok: false, reason: 'item required' };
   ```

2. **Route handling of failures:** Check `result.ok`, set toast, return proper HTTP status
   ```javascript
   // routes/grocery.js
   const result = addItem(state, text);
   if (!result.ok) return res.status(400).type('text').send('Item required');
   ```

3. **Async/scraping errors:** Try/catch in route, call `next(err)` for global handler
   ```javascript
   // routes/recipes.js
   try {
     const result = await scrapeMod.scrape(url, { fetch: globalThis.fetch, now: new Date() });
     if (!result.ok) {
       setToast(res, result.reason);
       return respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
     }
     // ... success ...
   } catch (err) {
     next(err);
   }
   ```

4. **Global error handler:** Logs and sends 500 response
   ```javascript
   // server.js
   app.use((err, req, res, next) => {
     console.error(err);
     res.status(500).type('text').send('Server error: ' + err.message);
   });
   ```

5. **Safe JSON parsing:** Try/catch skips invalid blocks
   ```javascript
   // lib/scrape.js
   try {
     out.push(JSON.parse(body));
   } catch {
     // Skip malformed blocks; continue to the next match.
   }
   ```

## Comments

**When to Comment:**
- Function headers: none (signatures are self-documenting)
- Complex algorithms: explain the approach
  ```javascript
  // Longest keyword wins.
  entries.sort((a, b) => b.length - a.length);
  ```
- Regex patterns: explain what's matched
  ```javascript
  // Match <script ... type="application/ld+json" ...>...</script> with any
  // attribute order and quote style. Per the JSON spec, ld+json bodies cannot
  // contain raw </script>, so a non-greedy body match is safe.
  const SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  ```
- Non-obvious logic or constraints
  ```javascript
  // Simple non-cryptographic id; collision risk in practice is negligible
  // for a personal app and addItem returns a fresh one each call.
  ```

## Import Organization

**Order (no explicit linter rule):**
1. Node built-in modules (`require('node:fs')`)
2. Third-party packages (`require('express')`)
3. Local modules (`require('../lib/storage')`)

**Path Aliases:** None used (all relative imports `../lib/`, `./`)

**Examples:**
```javascript
// From routes/recipes.js
const express = require('express');
const storage = require('../lib/storage');
const scrapeMod = require('../lib/scrape');
const { idForUrl } = require('../lib/id');
const { respondWithUpdates } = require('../lib/render');
const { sourceDomain, formatTotalTime, decorateIngredients } = require('../lib/calc');
```

## Validation & Type Checking

**No TypeScript;** Instead, defensive checks at runtime:

```javascript
// From lib/calc.js
const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];

// From lib/storage.js
if (!Array.isArray(merged.recipes)) merged.recipes = [];
if (!Array.isArray(merged.weeks)) merged.weeks = [];
if (!Array.isArray(merged.grocery)) merged.grocery = [];
```

**Type coercion in migration pattern:**
```javascript
// lib/storage.js — migrate() fills missing fields with sane defaults
function migrate(raw) {
  const base = defaultState();
  const merged = { ...base, ...(raw || {}) };
  if (!Array.isArray(merged.recipes)) merged.recipes = [];
  if (!Array.isArray(merged.weeks)) merged.weeks = [];
  if (!Array.isArray(merged.grocery)) merged.grocery = [];
  return merged;
}
```

## Storage & Persistence

**Atomic writes:**
- Write to temporary file `state.json.tmp`
- Rename to `state.json` (atomic on most filesystems)
- No lingering temp files in production

```javascript
// From lib/storage.js
function persist() {
  if (!state) return;
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getTmpFile(), JSON.stringify(state, null, 2));
  fs.renameSync(getTmpFile(), getStateFile());
}
```

**State location:** `process.env.RECIPE_BOX_DATA_DIR` or `./data/` in project root

## HTTP & Web Conventions

**Request/Response:**
- Content types: `res.type('html')`, `res.type('text')`
- Status codes: 200 (ok), 400 (bad input), 404 (not found), 500 (server error)
- Headers: `X-Status-Toast` for client-side toast messages

**Toast Message Constraint:**
- ASCII-only, no line breaks (replaced with space), max 200 chars
- **Critical:** Must not contain em-dashes or non-ASCII characters (HTTP header encoding issue)

```javascript
function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}
```

---

*Convention analysis: 2026-05-05*
