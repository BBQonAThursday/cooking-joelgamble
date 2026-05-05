# Recipe Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal recipe box: paste a recipe URL → app extracts the recipe via Schema.org JSON-LD → recipe is saved and displayed. Browse, view, delete. Plus a tile in `home-hub` that observes the count + most recent recipe.

**Architecture:** Express + Nunjucks + HTMX OOB swaps, modeled on the workout-log baseline. JSON file persistence with atomic writes. `lib/calc.js` is pure (view-model only); `lib/scrape.js` is pure-ish (fetch injectable via `ctx.fetch`). Routes mutate state via `storage.save()` then return OOB-swap fragments via `respondWithUpdates`. Tests use `node:test`, isolated by per-test temp data dirs (`RECIPE_BOX_DATA_DIR` env var); HTTP routes are tested over real Express on an ephemeral port.

**Tech Stack:** Node 20+, Express 4, Nunjucks 3, HTMX 1 (vendored), `node:test`, `node:http`. No bundler, no transpiler, no test framework dependency.

**Spec reference:** `docs/superpowers/specs/2026-05-04-recipe-box-design.md`.

**Cross-repo work:** Tasks 17 and 18 modify the **`home-hub`** sibling repo (`../home-hub`), not `recipe-box`. Commit them in that repo.

---

## File Structure

```
recipe-box/
  package.json                  CREATE — express, nunjucks, scripts (start/dev/test)
  .gitignore                    CREATE — node_modules, data/, etc.
  server.js                     CREATE — createApp() + listen on port 3003 (default)
  lib/
    storage.js                  CREATE — state singleton, defaultState, migrate, atomic save
    calc.js                     CREATE — pure buildView (sorts recipes newest-first)
    render.js                   CREATE — renderFragments + respondWithUpdates (OOB swaps)
    scrape.js                   CREATE — fetch + JSON-LD extract + Recipe normalize
    id.js                       CREATE — base36 hash helper for stable recipe ids
  routes/
    recipes.js                  CREATE — POST/GET/DELETE handlers
  views/
    layout.njk                  CREATE — shell + status toast (cloned from workout-log pattern)
    index.njk                   CREATE — paste-URL form + recipes panel
    recipe.njk                  CREATE — single recipe page
    partials/
      recipes-panel.njk         CREATE — OOB-swappable list (id="recipes-panel")
  public/
    styles.css                  CREATE — minimal styling, mobile-friendly
    vendor/
      htmx.min.js               CREATE — copy from ../workout-log/public/vendor/htmx.min.js
  data/                         (gitignored; created at runtime)
  test/
    _helpers.js                 CREATE — temp data dir + HTTP request helper
    storage.test.js             CREATE
    calc.test.js                CREATE
    render.test.js              CREATE
    scrape.test.js              CREATE — covers all scrape/* helpers + top-level scrape()
    recipes.test.js             CREATE — POST/GET/DELETE over real HTTP
    fixtures/
      recipe-basic.html         CREATE — minimal hand-rolled fixture for happy path
      recipe-graph.html         CREATE — fixture with @graph and HowToSection
      recipe-no-ld.html         CREATE — page with no JSON-LD at all
  README.md                     CREATE — short
  docs/superpowers/
    specs/2026-05-04-recipe-box-design.md   (already exists)
    plans/2026-05-05-recipe-box.md          (this file)
```

**Cross-repo (home-hub):**
```
home-hub/
  lib/
    adapters/
      recipe-box.js             CREATE — file-read adapter, planner pattern
    storage.js                  MODIFY — add recipes tile to defaultState()
  test/
    adapters/
      recipe-box.test.js        CREATE
  data/state.json               REGENERATE on next boot (defaultState reseed) OR add tile manually
```

Each module has one responsibility:
- **`lib/storage.js`** — owns disk + state singleton; nobody else touches `data/state.json`.
- **`lib/calc.js`** — pure: state in, view-model out.
- **`lib/render.js`** — owns OOB-injection mechanics; routes don't hand-roll fragment HTML.
- **`lib/scrape.js`** — owns network + JSON-LD parsing; route doesn't know about HTML or schema.org.
- **`routes/recipes.js`** — thin: validate input, call scrape, mutate via storage, render via respondWithUpdates.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `public/vendor/htmx.min.js` (copy from sibling)
- Create: `server.js` (skeleton — express + healthz only)

- [ ] **Step 1.1: Write `package.json`**

```json
{
  "name": "recipe-box",
  "version": "0.1.0",
  "private": true,
  "description": "Personal recipe box. Paste a URL — the app scrapes the JSON-LD recipe and saves it.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "dev:lan": "set HOST=0.0.0.0&& node --watch server.js",
    "test": "node --test \"test/**/*.test.js\""
  },
  "keywords": ["recipe", "scraper", "json-ld"],
  "author": "Joel",
  "license": "UNLICENSED",
  "dependencies": {
    "express": "^4.21.1",
    "nunjucks": "^3.2.4"
  }
}
```

- [ ] **Step 1.2: Write `.gitignore`**

```
# Dependencies
node_modules/

# Logs
*.log
npm-debug.log*

# Environment
.env
.env.local
.env.*.local

# Editor / OS
.DS_Store
Thumbs.db
.vscode/
.idea/
*.swp

# Persisted app state (gitignored — never commit)
data/

# Git worktrees
.worktrees/

# Brainstorming visual companion
.superpowers/

# Claude Code local overrides
.claude/settings.local.json
```

- [ ] **Step 1.3: Vendor HTMX**

Run from the `recipe-box/` repo root:

```bash
mkdir -p public/vendor
cp ../workout-log/public/vendor/htmx.min.js public/vendor/htmx.min.js
```

- [ ] **Step 1.4: Write skeleton `server.js`**

Just enough to boot and respond to a healthz check.

```js
const path = require('node:path');
const express = require('express');
const nunjucks = require('nunjucks');

function createApp() {
  const app = express();

  const env = nunjucks.configure(path.join(__dirname, 'views'), {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production'
  });
  app.set('view engine', 'njk');
  app.set('nunjucksEnv', env);

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // Routes registered in later tasks.

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).type('text').send('Server error: ' + err.message);
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const HOST = process.env.HOST || '127.0.0.1';
  const PORT = parseInt(process.env.PORT, 10) || 3003;
  app.listen(PORT, HOST, () => {
    console.log(`Recipe box running at http://${HOST}:${PORT}`);
  });
}

module.exports = { createApp };
```

- [ ] **Step 1.5: Install deps and smoke check**

```bash
npm install
node -e "require('./server')"
```

Expected: no error. Then run a quick boot test:

```bash
node server.js &
sleep 1
curl -s http://127.0.0.1:3003/healthz
```

Expected output: `ok`. Kill the background process afterward (`pkill -f "node server.js"` or close the terminal).

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json .gitignore public/vendor/htmx.min.js server.js
git commit -m "scaffold: express + nunjucks skeleton, port 3003"
```

---

## Task 2: Test helpers

**Files:**
- Create: `test/_helpers.js`

- [ ] **Step 2.1: Write `test/_helpers.js`**

Adapted from workout-log: temp data dir per test, ephemeral-port test server, raw-http request helper. The env var name is `RECIPE_BOX_DATA_DIR`.

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

let dataDir = null;

function setupDataDir() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-box-test-'));
  process.env.RECIPE_BOX_DATA_DIR = dataDir;
}

function teardownDataDir() {
  delete process.env.RECIPE_BOX_DATA_DIR;
  if (dataDir && fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  dataDir = null;
}

function getDataDir() {
  return dataDir;
}

async function startTestServer() {
  // Reset the storage singleton so the next storage.get() reloads from the
  // fresh RECIPE_BOX_DATA_DIR.
  require('../lib/storage')._resetForTest();

  const { createApp } = require('../server');
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function stopTestServer(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

function request(port, { method = 'GET', path = '/', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null
      : typeof body === 'string' ? body
      : new URLSearchParams(body).toString();
    const opts = {
      host: '127.0.0.1', port, method, path,
      headers: {
        ...(data ? {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(data)
        } : {}),
        ...headers
      }
    };
    const req = http.request(opts, res => {
      let chunks = '';
      res.on('data', d => { chunks += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: chunks, headers: res.headers }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = {
  setupDataDir, teardownDataDir, getDataDir,
  startTestServer, stopTestServer, request
};
```

- [ ] **Step 2.2: Commit**

```bash
git add test/_helpers.js
git commit -m "test: shared test helpers (temp data dir + ephemeral server)"
```

(No tests pass yet — `lib/storage.js` doesn't exist; that's task 3.)

---

## Task 3: Storage module

**Files:**
- Create: `test/storage.test.js`
- Create: `lib/storage.js`

- [ ] **Step 3.1: Write failing tests**

Create `test/storage.test.js`:

```js
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const helpers = require('./_helpers');

let storage;

beforeEach(() => {
  helpers.setupDataDir();
  delete require.cache[require.resolve('../lib/storage')];
  storage = require('../lib/storage');
});

afterEach(() => {
  helpers.teardownDataDir();
});

test('defaultState contains an empty recipes array', () => {
  const s = storage.defaultState();
  assert.deepStrictEqual(s.recipes, []);
});

test('migrate fills missing recipes onto an existing {} state', () => {
  const m = storage.migrateForTest({});
  assert.deepStrictEqual(m.recipes, []);
});

test('migrate preserves existing recipes', () => {
  const existing = { recipes: [{ id: 'abc', title: 'Pasta' }] };
  const m = storage.migrateForTest(existing);
  assert.strictEqual(m.recipes.length, 1);
  assert.strictEqual(m.recipes[0].title, 'Pasta');
});

test('migrate coerces non-array recipes to []', () => {
  const m = storage.migrateForTest({ recipes: 'not an array' });
  assert.deepStrictEqual(m.recipes, []);
});

test('save persists state and load reads it back', () => {
  const s = storage.get();
  s.recipes.push({ id: 'x', title: 'Soup', addedAt: '2026-05-05T00:00:00.000Z' });
  storage.save();

  // Force a reload by clearing the singleton.
  storage._resetForTest();
  const reloaded = storage.get();
  assert.strictEqual(reloaded.recipes.length, 1);
  assert.strictEqual(reloaded.recipes[0].title, 'Soup');
});

test('save uses atomic temp-file rename (state.json.tmp does not linger)', () => {
  const s = storage.get();
  s.recipes.push({ id: 'y', title: 'Stew', addedAt: '2026-05-05T01:00:00.000Z' });
  storage.save();
  const dir = helpers.getDataDir();
  assert.ok(fs.existsSync(path.join(dir, 'state.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'state.json.tmp')));
});
```

- [ ] **Step 3.2: Run the tests — should fail with module not found**

```bash
npm test -- test/storage.test.js
```

Expected: `Cannot find module '../lib/storage'`.

- [ ] **Step 3.3: Implement `lib/storage.js`**

```js
const fs = require('node:fs');
const path = require('node:path');

function defaultState() {
  return { recipes: [] };
}

function migrate(raw) {
  const base = defaultState();
  const merged = { ...base, ...(raw || {}) };
  if (!Array.isArray(merged.recipes)) merged.recipes = [];
  return merged;
}

let state = null;

function getDataDir() {
  return process.env.RECIPE_BOX_DATA_DIR || path.join(process.cwd(), 'data');
}
function getStateFile() { return path.join(getDataDir(), 'state.json'); }
function getTmpFile()   { return path.join(getDataDir(), 'state.json.tmp'); }

function persist() {
  if (!state) return;
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getTmpFile(), JSON.stringify(state, null, 2));
  fs.renameSync(getTmpFile(), getStateFile());
}

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

function get()      { return load(); }
function save()     { persist(); }
function replace(next) { load(); state = migrate(next || {}); persist(); return state; }
function reset()    { load(); state = defaultState(); persist(); return state; }
function _resetForTest() { state = null; }

module.exports = {
  get, save, replace, reset,
  defaultState, migrateForTest: migrate, _resetForTest
};
```

- [ ] **Step 3.4: Run the tests — should pass**

```bash
npm test -- test/storage.test.js
```

Expected: 6 passing.

- [ ] **Step 3.5: Commit**

```bash
git add lib/storage.js test/storage.test.js
git commit -m "feat(storage): state singleton with atomic persist"
```

---

## Task 4: Calc module (pure view-model)

For v0, calc is intentionally tiny: it sorts recipes newest-first and computes one display helper (source domain).

**Files:**
- Create: `test/calc.test.js`
- Create: `lib/calc.js`

- [ ] **Step 4.1: Write failing tests**

Create `test/calc.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildView, sourceDomain, formatTotalTime } = require('../lib/calc');

test('buildView returns empty view for empty state', () => {
  const v = buildView({ recipes: [] });
  assert.deepStrictEqual(v.recipes, []);
  assert.strictEqual(v.hasRecipes, false);
});

test('buildView sorts recipes newest-first by addedAt', () => {
  const state = {
    recipes: [
      { id: 'a', title: 'Old',  addedAt: '2026-05-01T00:00:00.000Z' },
      { id: 'b', title: 'New',  addedAt: '2026-05-05T00:00:00.000Z' },
      { id: 'c', title: 'Mid',  addedAt: '2026-05-03T00:00:00.000Z' }
    ]
  };
  const v = buildView(state);
  assert.deepStrictEqual(v.recipes.map(r => r.title), ['New', 'Mid', 'Old']);
  assert.strictEqual(v.hasRecipes, true);
});

test('buildView decorates each recipe with sourceDomain', () => {
  const state = { recipes: [
    { id: 'a', title: 'X', sourceUrl: 'https://www.smittenkitchen.com/2024/01/recipe', addedAt: '2026-05-05T00:00:00Z' }
  ]};
  const v = buildView(state);
  assert.strictEqual(v.recipes[0].sourceDomain, 'smittenkitchen.com');
});

test('sourceDomain strips www and path', () => {
  assert.strictEqual(sourceDomain('https://www.allrecipes.com/recipe/123'), 'allrecipes.com');
  assert.strictEqual(sourceDomain('https://cooking.nytimes.com/recipes/abc'), 'cooking.nytimes.com');
  assert.strictEqual(sourceDomain('not a url'), '');
  assert.strictEqual(sourceDomain(null), '');
});

test('formatTotalTime renders minutes as "1h 30m" / "45m" / null-friendly', () => {
  assert.strictEqual(formatTotalTime(90), '1h 30m');
  assert.strictEqual(formatTotalTime(45), '45m');
  assert.strictEqual(formatTotalTime(120), '2h');
  assert.strictEqual(formatTotalTime(null), '');
  assert.strictEqual(formatTotalTime(0), '');
});
```

- [ ] **Step 4.2: Run tests — should fail**

```bash
npm test -- test/calc.test.js
```

Expected: module not found.

- [ ] **Step 4.3: Implement `lib/calc.js`**

```js
function sourceDomain(url) {
  if (typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatTotalTime(min) {
  if (!Number.isFinite(min) || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function buildView(state) {
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const sorted = recipes.slice().sort((a, b) =>
    (b.addedAt || '').localeCompare(a.addedAt || '')
  );
  const decorated = sorted.map(r => ({
    ...r,
    sourceDomain: sourceDomain(r.sourceUrl),
    totalTimeLabel: formatTotalTime(r.totalMinutes)
  }));
  return {
    recipes: decorated,
    hasRecipes: decorated.length > 0
  };
}

module.exports = { buildView, sourceDomain, formatTotalTime };
```

- [ ] **Step 4.4: Run tests — should pass**

```bash
npm test -- test/calc.test.js
```

Expected: 5 passing.

- [ ] **Step 4.5: Commit**

```bash
git add lib/calc.js test/calc.test.js
git commit -m "feat(calc): pure view-model with newest-first sort"
```

---

## Task 5: Render module (OOB swap helper)

**Files:**
- Create: `test/render.test.js`
- Create: `lib/render.js`

- [ ] **Step 5.1: Write failing tests**

Create `test/render.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { injectOob } = require('../lib/render');

test('injectOob adds hx-swap-oob to the root element', () => {
  const html = '<div id="recipes-panel" class="x">child</div>';
  const out = injectOob(html);
  assert.match(out, /hx-swap-oob="true"/);
  assert.match(out, /id="recipes-panel"/);
});

test('injectOob is idempotent if hx-swap-oob already present', () => {
  const html = '<div id="x" hx-swap-oob="true">y</div>';
  const out = injectOob(html);
  assert.strictEqual(out.match(/hx-swap-oob="true"/g).length, 1);
});

test('injectOob preserves leading whitespace handling', () => {
  const html = '\n  <section id="recipes-panel"></section>';
  const out = injectOob(html);
  assert.match(out, /<section id="recipes-panel" hx-swap-oob="true">/);
});
```

- [ ] **Step 5.2: Run tests — should fail**

```bash
npm test -- test/render.test.js
```

Expected: module not found.

- [ ] **Step 5.3: Implement `lib/render.js`**

```js
const { buildView } = require('./calc');
const storage = require('./storage');

function renderFragments(req, res, parts) {
  const view = buildView(storage.get());
  const html = parts.map(({ template, mode, extra }) => {
    const ctx = { ...view, ...(extra || {}) };
    const out = renderSync(req, template, ctx);
    return mode === 'oob' ? injectOob(out) : out;
  }).join('\n');
  res.type('html').send(html);
}

function renderSync(req, template, ctx) {
  const env = req.app.get('nunjucksEnv');
  return env.render(template, ctx);
}

function injectOob(html) {
  const trimmed = html.trimStart();
  return trimmed.replace(/^<([a-zA-Z][\w-]*)([^>]*)>/, (m, tag, attrs) => {
    if (/\bhx-swap-oob=/.test(attrs)) return m;
    return `<${tag}${attrs} hx-swap-oob="true">`;
  });
}

function respondWithUpdates(req, res, { panels = [], extra = {} } = {}) {
  const parts = [];
  for (const template of panels) parts.push({ template, mode: 'oob', extra });
  renderFragments(req, res, parts);
}

module.exports = { renderFragments, respondWithUpdates, injectOob };
```

- [ ] **Step 5.4: Run tests — should pass**

```bash
npm test -- test/render.test.js
```

Expected: 3 passing.

- [ ] **Step 5.5: Commit**

```bash
git add lib/render.js test/render.test.js
git commit -m "feat(render): OOB-swap fragment helper"
```

---

## Task 6: Scrape — JSON-LD script extraction

**Files:**
- Create: `test/scrape.test.js`
- Create: `lib/scrape.js` (just `extractJsonLdScripts` for now — more added in following tasks)

- [ ] **Step 6.1: Write failing tests**

Create `test/scrape.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { extractJsonLdScripts } = require('../lib/scrape');

test('extractJsonLdScripts pulls a single ld+json block', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Recipe","name":"Pasta"}</script>
    </head></html>`;
  const result = extractJsonLdScripts(html);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, 'Pasta');
});

test('extractJsonLdScripts handles multiple blocks', () => {
  const html = `
    <script type="application/ld+json">{"@type":"WebSite"}</script>
    <script type="application/ld+json">{"@type":"Recipe","name":"X"}</script>
  `;
  const result = extractJsonLdScripts(html);
  assert.strictEqual(result.length, 2);
});

test('extractJsonLdScripts is tolerant of attribute order and extra attributes', () => {
  const html = `
    <script id="schemaorg" type="application/ld+json">{"@type":"Recipe","name":"A"}</script>
    <script  type='application/ld+json'  id="x">{"@type":"Recipe","name":"B"}</script>
  `;
  const result = extractJsonLdScripts(html);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].name, 'A');
  assert.strictEqual(result[1].name, 'B');
});

test('extractJsonLdScripts skips blocks that fail to parse', () => {
  const html = `
    <script type="application/ld+json">not json</script>
    <script type="application/ld+json">{"valid": true}</script>
  `;
  const result = extractJsonLdScripts(html);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].valid, true);
});

test('extractJsonLdScripts returns [] when no ld+json present', () => {
  const html = `<html><head><script>alert(1)</script></head></html>`;
  const result = extractJsonLdScripts(html);
  assert.deepStrictEqual(result, []);
});
```

- [ ] **Step 6.2: Run tests — should fail**

```bash
npm test -- test/scrape.test.js
```

Expected: module not found.

- [ ] **Step 6.3: Implement `lib/scrape.js` (first cut)**

```js
// Match <script ... type="application/ld+json" ...>...</script> with any
// attribute order and quote style. Per the JSON spec, ld+json bodies cannot
// contain raw </script>, so a non-greedy body match is safe.
const SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function extractJsonLdScripts(html) {
  if (typeof html !== 'string') return [];
  const out = [];
  let m;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const body = m[1].trim();
    if (!body) continue;
    try {
      out.push(JSON.parse(body));
    } catch {
      // Skip malformed blocks; continue to the next match.
    }
  }
  return out;
}

module.exports = { extractJsonLdScripts };
```

- [ ] **Step 6.4: Run tests — should pass**

```bash
npm test -- test/scrape.test.js
```

Expected: 5 passing.

- [ ] **Step 6.5: Commit**

```bash
git add lib/scrape.js test/scrape.test.js
git commit -m "feat(scrape): extract ld+json script bodies tolerantly"
```

---

## Task 7: Scrape — Recipe node walking

**Files:**
- Modify: `test/scrape.test.js` (append)
- Modify: `lib/scrape.js` (add `findRecipeNode`)

- [ ] **Step 7.1: Append failing tests**

Append to `test/scrape.test.js`:

```js
const { findRecipeNode } = require('../lib/scrape');

test('findRecipeNode returns the node when @type is "Recipe"', () => {
  const node = { '@type': 'Recipe', name: 'X' };
  assert.strictEqual(findRecipeNode([node]), node);
});

test('findRecipeNode returns the node when @type is an array containing "Recipe"', () => {
  const node = { '@type': ['Recipe', 'Article'], name: 'Y' };
  assert.strictEqual(findRecipeNode([node]), node);
});

test('findRecipeNode walks @graph entries', () => {
  const recipe = { '@type': 'Recipe', name: 'Z' };
  const wrapper = { '@graph': [{ '@type': 'WebPage' }, recipe] };
  assert.strictEqual(findRecipeNode([wrapper]), recipe);
});

test('findRecipeNode walks nested arrays', () => {
  const recipe = { '@type': 'Recipe', name: 'Q' };
  const tree = [[{ '@type': 'WebSite' }, [recipe]]];
  assert.strictEqual(findRecipeNode(tree), recipe);
});

test('findRecipeNode returns null when no Recipe present', () => {
  assert.strictEqual(findRecipeNode([{ '@type': 'WebSite' }]), null);
  assert.strictEqual(findRecipeNode([]), null);
});
```

- [ ] **Step 7.2: Run tests — should fail**

```bash
npm test -- test/scrape.test.js
```

Expected: `findRecipeNode is not a function`.

- [ ] **Step 7.3: Implement `findRecipeNode` in `lib/scrape.js`**

Append to `lib/scrape.js` (above `module.exports`):

```js
function isRecipeNode(node) {
  if (!node || typeof node !== 'object') return false;
  const t = node['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

function findRecipeNode(parsedList) {
  for (const item of parsedList || []) {
    const found = walk(item);
    if (found) return found;
  }
  return null;
}

function walk(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (isRecipeNode(node)) return node;
  if (Array.isArray(node['@graph'])) {
    for (const child of node['@graph']) {
      const found = walk(child);
      if (found) return found;
    }
  }
  return null;
}
```

Update `module.exports`:

```js
module.exports = { extractJsonLdScripts, findRecipeNode };
```

- [ ] **Step 7.4: Run tests — should pass**

```bash
npm test -- test/scrape.test.js
```

Expected: 10 passing.

- [ ] **Step 7.5: Commit**

```bash
git add lib/scrape.js test/scrape.test.js
git commit -m "feat(scrape): walk @graph and arrays to find Recipe node"
```

---

## Task 8: Scrape — ISO 8601 duration parser

**Files:**
- Modify: `test/scrape.test.js` (append)
- Modify: `lib/scrape.js` (add `parseIsoDuration`)

- [ ] **Step 8.1: Append failing tests**

Append to `test/scrape.test.js`:

```js
const { parseIsoDuration } = require('../lib/scrape');

test('parseIsoDuration parses hours and minutes', () => {
  assert.strictEqual(parseIsoDuration('PT1H30M'), 90);
  assert.strictEqual(parseIsoDuration('PT45M'), 45);
  assert.strictEqual(parseIsoDuration('PT2H'), 120);
  assert.strictEqual(parseIsoDuration('PT0H15M'), 15);
});

test('parseIsoDuration handles seconds (rounded down to whole minutes)', () => {
  // PT1H30M30S → 90 minutes (we drop seconds for v0)
  assert.strictEqual(parseIsoDuration('PT1H30M30S'), 90);
});

test('parseIsoDuration returns null for malformed or missing input', () => {
  assert.strictEqual(parseIsoDuration(''), null);
  assert.strictEqual(parseIsoDuration(null), null);
  assert.strictEqual(parseIsoDuration('30 min'), null);
  assert.strictEqual(parseIsoDuration('PT'), null);
});
```

- [ ] **Step 8.2: Run tests — should fail**

```bash
npm test -- test/scrape.test.js
```

- [ ] **Step 8.3: Implement `parseIsoDuration`**

Append to `lib/scrape.js` (above `module.exports`):

```js
// Subset of ISO 8601 duration: PT[XH][YM][ZS]. Returns whole minutes (seconds
// floored away). Returns null if the input doesn't match.
function parseIsoDuration(s) {
  if (typeof s !== 'string') return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  // m[3] (seconds) intentionally dropped.
  if (!m[1] && !m[2] && !m[3]) return null; // bare "PT"
  return h * 60 + min;
}
```

Update `module.exports` to include `parseIsoDuration`.

- [ ] **Step 8.4: Run tests — should pass**

```bash
npm test -- test/scrape.test.js
```

- [ ] **Step 8.5: Commit**

```bash
git add lib/scrape.js test/scrape.test.js
git commit -m "feat(scrape): parse ISO 8601 PT durations to minutes"
```

---

## Task 9: Scrape — instruction flattening

**Files:**
- Modify: `test/scrape.test.js` (append)
- Modify: `lib/scrape.js` (add `flattenInstructions`)

- [ ] **Step 9.1: Append failing tests**

```js
const { flattenInstructions } = require('../lib/scrape');

test('flattenInstructions handles a single string', () => {
  assert.deepStrictEqual(
    flattenInstructions('Mix everything. Bake at 350°F for 30 minutes.'),
    ['Mix everything. Bake at 350°F for 30 minutes.']
  );
});

test('flattenInstructions handles an array of strings', () => {
  assert.deepStrictEqual(
    flattenInstructions(['Step 1', 'Step 2']),
    ['Step 1', 'Step 2']
  );
});

test('flattenInstructions handles HowToStep objects (uses .text)', () => {
  const input = [
    { '@type': 'HowToStep', text: 'Do A' },
    { '@type': 'HowToStep', text: 'Do B' }
  ];
  assert.deepStrictEqual(flattenInstructions(input), ['Do A', 'Do B']);
});

test('flattenInstructions recurses into HowToSection.itemListElement', () => {
  const input = [
    { '@type': 'HowToSection', itemListElement: [
      { '@type': 'HowToStep', text: 'A1' },
      { '@type': 'HowToStep', text: 'A2' }
    ]},
    { '@type': 'HowToSection', itemListElement: [
      { '@type': 'HowToStep', text: 'B1' }
    ]}
  ];
  assert.deepStrictEqual(flattenInstructions(input), ['A1', 'A2', 'B1']);
});

test('flattenInstructions returns [] for missing/empty input', () => {
  assert.deepStrictEqual(flattenInstructions(undefined), []);
  assert.deepStrictEqual(flattenInstructions(null), []);
  assert.deepStrictEqual(flattenInstructions([]), []);
  assert.deepStrictEqual(flattenInstructions(''), []);
});

test('flattenInstructions trims whitespace and drops empties', () => {
  assert.deepStrictEqual(
    flattenInstructions(['  one  ', '', '   ', 'two']),
    ['one', 'two']
  );
});
```

- [ ] **Step 9.2: Run tests — should fail**

- [ ] **Step 9.3: Implement `flattenInstructions`**

Append to `lib/scrape.js`:

```js
function flattenInstructions(input) {
  const out = [];
  walkInstr(input, out);
  return out
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(s => s.length > 0);
}

function walkInstr(node, out) {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) walkInstr(child, out);
    return;
  }
  if (typeof node !== 'object') return;
  if (node['@type'] === 'HowToSection' && Array.isArray(node.itemListElement)) {
    walkInstr(node.itemListElement, out);
    return;
  }
  if (node['@type'] === 'HowToStep' && typeof node.text === 'string') {
    out.push(node.text);
    return;
  }
  // Unrecognized object: ignore.
}
```

Update `module.exports`.

- [ ] **Step 9.4: Run tests — should pass**

- [ ] **Step 9.5: Commit**

```bash
git add lib/scrape.js test/scrape.test.js
git commit -m "feat(scrape): flatten recipeInstructions across all schema shapes"
```

---

## Task 10: Scrape — image normalization + recipe shaping

**Files:**
- Modify: `test/scrape.test.js` (append)
- Modify: `lib/scrape.js` (add `normalizeRecipe` + helpers)

- [ ] **Step 10.1: Append failing tests**

```js
const { normalizeRecipe, normalizeImage, normalizeYield } = require('../lib/scrape');

test('normalizeImage handles string', () => {
  assert.strictEqual(normalizeImage('https://x.com/a.jpg'), 'https://x.com/a.jpg');
});

test('normalizeImage handles array (takes first)', () => {
  assert.strictEqual(normalizeImage(['https://x/a.jpg', 'https://x/b.jpg']), 'https://x/a.jpg');
});

test('normalizeImage handles object with url', () => {
  assert.strictEqual(normalizeImage({ url: 'https://x/a.jpg' }), 'https://x/a.jpg');
});

test('normalizeImage handles array of objects', () => {
  assert.strictEqual(normalizeImage([{ url: 'https://x/a.jpg' }]), 'https://x/a.jpg');
});

test('normalizeImage returns null for missing/invalid', () => {
  assert.strictEqual(normalizeImage(undefined), null);
  assert.strictEqual(normalizeImage(null), null);
  assert.strictEqual(normalizeImage([]), null);
  assert.strictEqual(normalizeImage({ noUrl: 'x' }), null);
});

test('normalizeYield coerces number to string', () => {
  assert.strictEqual(normalizeYield(4), '4');
});

test('normalizeYield trims string', () => {
  assert.strictEqual(normalizeYield('  4 servings  '), '4 servings');
});

test('normalizeYield takes first of array', () => {
  assert.strictEqual(normalizeYield(['4 servings', '500g']), '4 servings');
});

test('normalizeYield returns null for empty/missing', () => {
  assert.strictEqual(normalizeYield(undefined), null);
  assert.strictEqual(normalizeYield(''), null);
  assert.strictEqual(normalizeYield([]), null);
});

test('normalizeRecipe builds the full shape from a JSON-LD node', () => {
  const node = {
    '@type': 'Recipe',
    name: 'Pasta',
    description: 'Tasty.',
    image: 'https://x/a.jpg',
    recipeYield: '4 servings',
    prepTime: 'PT15M',
    cookTime: 'PT30M',
    recipeIngredient: ['  2 cups flour  ', '1 egg', ''],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Mix' },
      { '@type': 'HowToStep', text: 'Cook' }
    ]
  };
  const r = normalizeRecipe(node, 'https://example.com/pasta');
  assert.strictEqual(r.title, 'Pasta');
  assert.strictEqual(r.description, 'Tasty.');
  assert.strictEqual(r.imageUrl, 'https://x/a.jpg');
  assert.strictEqual(r.servings, '4 servings');
  assert.strictEqual(r.totalMinutes, 45); // prep+cook fallback
  assert.deepStrictEqual(r.ingredients, ['2 cups flour', '1 egg']);
  assert.deepStrictEqual(r.instructions, ['Mix', 'Cook']);
  assert.strictEqual(r.sourceUrl, 'https://example.com/pasta');
});

test('normalizeRecipe prefers totalTime over prep+cook', () => {
  const node = {
    '@type': 'Recipe',
    name: 'X',
    totalTime: 'PT1H',
    prepTime: 'PT15M',
    cookTime: 'PT30M'
  };
  const r = normalizeRecipe(node, 'https://x/');
  assert.strictEqual(r.totalMinutes, 60);
});

test('normalizeRecipe defaults missing fields cleanly', () => {
  const node = { '@type': 'Recipe', name: 'Bare' };
  const r = normalizeRecipe(node, 'https://x/');
  assert.strictEqual(r.title, 'Bare');
  assert.strictEqual(r.description, '');
  assert.strictEqual(r.imageUrl, null);
  assert.strictEqual(r.servings, null);
  assert.strictEqual(r.totalMinutes, null);
  assert.deepStrictEqual(r.ingredients, []);
  assert.deepStrictEqual(r.instructions, []);
});
```

- [ ] **Step 10.2: Run tests — should fail**

- [ ] **Step 10.3: Implement normalizers**

Append to `lib/scrape.js`:

```js
function normalizeImage(img) {
  if (img == null) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) {
    for (const item of img) {
      const n = normalizeImage(item);
      if (n) return n;
    }
    return null;
  }
  if (typeof img === 'object' && typeof img.url === 'string') return img.url;
  return null;
}

function normalizeYield(y) {
  if (y == null) return null;
  if (Array.isArray(y)) return y.length > 0 ? normalizeYield(y[0]) : null;
  const s = String(y).trim();
  return s.length > 0 ? s : null;
}

function totalMinutesFromNode(node) {
  const total = parseIsoDuration(node.totalTime);
  if (total !== null) return total;
  const prep = parseIsoDuration(node.prepTime);
  const cook = parseIsoDuration(node.cookTime);
  if (prep === null && cook === null) return null;
  return (prep || 0) + (cook || 0);
}

function trimOrEmpty(s) {
  return typeof s === 'string' ? s.trim() : '';
}

function normalizeRecipe(node, sourceUrl) {
  const ingredients = Array.isArray(node.recipeIngredient)
    ? node.recipeIngredient.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
    : [];
  return {
    sourceUrl,
    title: trimOrEmpty(node.name),
    description: trimOrEmpty(node.description),
    imageUrl: normalizeImage(node.image),
    servings: normalizeYield(node.recipeYield),
    totalMinutes: totalMinutesFromNode(node),
    ingredients,
    instructions: flattenInstructions(node.recipeInstructions)
  };
}
```

Update `module.exports` to add `normalizeRecipe`, `normalizeImage`, `normalizeYield`.

- [ ] **Step 10.4: Run tests — should pass**

- [ ] **Step 10.5: Commit**

```bash
git add lib/scrape.js test/scrape.test.js
git commit -m "feat(scrape): normalize Recipe node into our internal shape"
```

---

## Task 11: ID generation

**Files:**
- Create: `test/id.test.js`
- Create: `lib/id.js`

- [ ] **Step 11.1: Write failing tests**

Create `test/id.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { idForUrl } = require('../lib/id');

test('idForUrl produces a 10-char base36 string', () => {
  const id = idForUrl('https://example.com/recipe');
  assert.match(id, /^[0-9a-z]{10}$/);
});

test('idForUrl is deterministic (same URL → same id)', () => {
  const a = idForUrl('https://example.com/x');
  const b = idForUrl('https://example.com/x');
  assert.strictEqual(a, b);
});

test('idForUrl differs for different URLs', () => {
  const a = idForUrl('https://example.com/a');
  const b = idForUrl('https://example.com/b');
  assert.notStrictEqual(a, b);
});
```

- [ ] **Step 11.2: Run tests — should fail**

- [ ] **Step 11.3: Implement `lib/id.js`**

```js
const crypto = require('node:crypto');

// 10-char base36 hash of the URL, derived from the first 8 bytes of sha256.
// Stable across processes; collision-resistant enough for a personal recipe box.
function idForUrl(url) {
  const buf = crypto.createHash('sha256').update(String(url)).digest();
  // Take 8 bytes as a 64-bit unsigned int → base36, padded to 10 chars.
  const hi = BigInt('0x' + buf.subarray(0, 8).toString('hex'));
  return hi.toString(36).padStart(10, '0').slice(-10);
}

module.exports = { idForUrl };
```

- [ ] **Step 11.4: Run tests — should pass**

- [ ] **Step 11.5: Commit**

```bash
git add lib/id.js test/id.test.js
git commit -m "feat(id): stable 10-char base36 hash of source URL"
```

---

## Task 12: Scrape — top-level `scrape()` with mocked fetch

**Files:**
- Create: `test/fixtures/recipe-basic.html`
- Create: `test/fixtures/recipe-graph.html`
- Create: `test/fixtures/recipe-no-ld.html`
- Modify: `test/scrape.test.js` (append `scrape()` tests)
- Modify: `lib/scrape.js` (add top-level `scrape`)

- [ ] **Step 12.1: Create fixtures**

Create `test/fixtures/recipe-basic.html`:

```html
<!DOCTYPE html>
<html><head>
  <title>Basic Recipe</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Basic Pasta",
    "description": "Quick weeknight pasta.",
    "image": "https://example.com/pasta.jpg",
    "recipeYield": "4 servings",
    "totalTime": "PT30M",
    "recipeIngredient": ["1 lb pasta", "2 tbsp olive oil", "1 clove garlic"],
    "recipeInstructions": [
      { "@type": "HowToStep", "text": "Boil water." },
      { "@type": "HowToStep", "text": "Cook pasta until al dente." },
      { "@type": "HowToStep", "text": "Toss with oil and garlic." }
    ]
  }
  </script>
</head><body><h1>Basic Pasta</h1></body></html>
```

Create `test/fixtures/recipe-graph.html`:

```html
<!DOCTYPE html>
<html><head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "name": "Some Site" },
      {
        "@type": ["Recipe", "Article"],
        "name": "Sectioned Stew",
        "image": [{ "url": "https://example.com/stew.jpg" }],
        "recipeIngredient": ["broth", "onion"],
        "recipeInstructions": [
          { "@type": "HowToSection", "itemListElement": [
            { "@type": "HowToStep", "text": "Sauté onion." },
            { "@type": "HowToStep", "text": "Add broth." }
          ]}
        ]
      }
    ]
  }
  </script>
</head><body></body></html>
```

Create `test/fixtures/recipe-no-ld.html`:

```html
<!DOCTYPE html>
<html><head><title>No JSON-LD</title></head>
<body><p>This page has no structured recipe data.</p></body></html>
```

- [ ] **Step 12.2: Append failing tests**

Append to `test/scrape.test.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const { scrape } = require('../lib/scrape');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function mockFetch(html, { status = 200, contentType = 'text/html; charset=utf-8' } = {}) {
  return async (_url, _opts) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => html,
    body: { getReader: () => null } // unused; we use text()
  });
}

test('scrape returns ok with normalized recipe (basic fixture)', async () => {
  const result = await scrape('https://example.com/basic', {
    fetch: mockFetch(fixture('recipe-basic.html')),
    now: new Date('2026-05-05T12:00:00Z')
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.recipe.title, 'Basic Pasta');
  assert.strictEqual(result.recipe.servings, '4 servings');
  assert.strictEqual(result.recipe.totalMinutes, 30);
  assert.strictEqual(result.recipe.ingredients.length, 3);
  assert.strictEqual(result.recipe.instructions.length, 3);
  assert.strictEqual(result.recipe.sourceUrl, 'https://example.com/basic');
});

test('scrape walks @graph and HowToSection (graph fixture)', async () => {
  const result = await scrape('https://example.com/stew', {
    fetch: mockFetch(fixture('recipe-graph.html')),
    now: new Date()
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.recipe.title, 'Sectioned Stew');
  assert.strictEqual(result.recipe.imageUrl, 'https://example.com/stew.jpg');
  assert.deepStrictEqual(result.recipe.instructions, ['Sauté onion.', 'Add broth.']);
});

test('scrape returns ok:false when no JSON-LD on page', async () => {
  const result = await scrape('https://example.com/empty', {
    fetch: mockFetch(fixture('recipe-no-ld.html')),
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /No recipe data/);
});

test('scrape returns ok:false on non-200', async () => {
  const result = await scrape('https://example.com/x', {
    fetch: mockFetch('whatever', { status: 404 }),
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /404|Couldn't reach/);
});

test('scrape returns ok:false on non-HTML content type', async () => {
  const result = await scrape('https://example.com/x', {
    fetch: mockFetch('{}', { contentType: 'application/json' }),
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /not HTML|HTML/i);
});

test('scrape surfaces fetch errors', async () => {
  const result = await scrape('https://nope.invalid/', {
    fetch: async () => { throw new Error('ENOTFOUND'); },
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /Couldn't reach/);
});
```

- [ ] **Step 12.3: Run tests — should fail**

```bash
npm test -- test/scrape.test.js
```

- [ ] **Step 12.4: Implement top-level `scrape()` in `lib/scrape.js`**

Append to `lib/scrape.js`:

```js
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

async function scrape(url, ctx) {
  const fetchFn = (ctx && ctx.fetch) || globalThis.fetch;
  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      response = await fetchFn(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; recipe-box/0.1)' }
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, reason: `Couldn't reach ${hostnameOf(url)}` };
  }

  if (!response.ok) {
    return { ok: false, reason: `Got HTTP ${response.status} from ${hostnameOf(url)}` };
  }

  const ct = (response.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/html')) {
    return { ok: false, reason: `Page is not HTML (content-type ${ct || 'unknown'})` };
  }

  let html;
  try {
    html = await response.text();
  } catch (err) {
    return { ok: false, reason: `Couldn't read response from ${hostnameOf(url)}` };
  }

  if (html.length > MAX_BYTES) {
    return { ok: false, reason: `Page is too large (>${Math.round(MAX_BYTES/1024/1024)}MB)` };
  }

  const parsed = extractJsonLdScripts(html);
  if (parsed.length === 0) {
    return { ok: false, reason: 'No recipe data found on this page' };
  }
  const node = findRecipeNode(parsed);
  if (!node) {
    return { ok: false, reason: 'No recipe data found on this page' };
  }
  if (!node.name || typeof node.name !== 'string') {
    return { ok: false, reason: 'Recipe data has no title' };
  }
  return { ok: true, recipe: normalizeRecipe(node, url) };
}
```

Update `module.exports` to include `scrape`.

- [ ] **Step 12.5: Run tests — should pass**

```bash
npm test
```

Expected: all tests passing across storage, calc, render, id, scrape.

- [ ] **Step 12.6: Commit**

```bash
git add lib/scrape.js test/scrape.test.js test/fixtures
git commit -m "feat(scrape): top-level scrape() with fetch + size + content-type guards"
```

---

## Task 13: Routes — POST /recipes (scrape + save)

**Files:**
- Create: `routes/recipes.js`
- Create: `test/recipes.test.js`
- Create: `views/layout.njk` (minimal — needed for route render to work)
- Create: `views/index.njk` (minimal placeholder — full markup in task 16)
- Create: `views/partials/recipes-panel.njk` (minimal — full markup in task 16)
- Modify: `server.js` (mount routes + landing render)

This task wires the POST flow end-to-end. The minimal templates are intentionally bare — they get filled in at task 16. We need them now so the OOB-swap response actually renders something.

- [ ] **Step 13.1: Create minimal `views/layout.njk`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recipe Box</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="/vendor/htmx.min.js" defer></script>
</head>
<body>
  {% block content %}{% endblock %}
  <div class="status-toast" id="status-toast"></div>
  <script>
    (function () {
      let timer = null;
      function showStatus(msg, isError) {
        const el = document.getElementById('status-toast');
        el.textContent = msg || 'Saved';
        el.classList.toggle('error', !!isError);
        el.classList.add('visible');
        clearTimeout(timer);
        timer = setTimeout(() => el.classList.remove('visible'), isError ? 3500 : 1200);
      }
      document.body.addEventListener('htmx:afterRequest', (e) => {
        if (e.detail.requestConfig && e.detail.requestConfig.verb === 'get') return;
        if (e.detail.successful) {
          const hx = e.detail.xhr.getResponseHeader('X-Status-Toast');
          showStatus(hx || 'Saved');
        } else {
          showStatus('Error', true);
        }
      });
      document.body.addEventListener('htmx:sendError', () => showStatus('Connection error', true));
    })();
  </script>
</body>
</html>
```

- [ ] **Step 13.2: Create minimal `views/index.njk`**

```html
{% extends "layout.njk" %}
{% block content %}
  <main class="app">
    <h1>Recipe Box</h1>
    <form id="paste-form" hx-post="/recipes" hx-swap="none" hx-on:htmx:after-request="if(event.detail.successful) this.reset()">
      <input type="url" name="url" placeholder="Paste a recipe URL" required>
      <button type="submit">Save</button>
    </form>
    {% include "partials/recipes-panel.njk" %}
  </main>
{% endblock %}
```

- [ ] **Step 13.3: Create minimal `views/partials/recipes-panel.njk`**

```html
<section id="recipes-panel">
  {% if hasRecipes %}
    <ul class="recipe-list">
      {% for r in recipes %}
        <li class="recipe-card" data-id="{{ r.id }}">
          <a href="/recipes/{{ r.id }}">{{ r.title }}</a>
        </li>
      {% endfor %}
    </ul>
  {% else %}
    <p class="empty">No recipes yet. Paste a URL above to get started.</p>
  {% endif %}
</section>
```

- [ ] **Step 13.4: Wire landing route + mount in `server.js`**

Modify `server.js`. Replace the placeholder comment `// Routes registered in later tasks.` with:

```js
  app.use('/', require('./routes/recipes'));

  const storage = require('./lib/storage');
  const { buildView } = require('./lib/calc');
  app.get('/', (req, res) => {
    res.render('index.njk', buildView(storage.get()));
  });
```

- [ ] **Step 13.5: Write failing route tests**

Create `test/recipes.test.js`:

```js
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const helpers = require('./_helpers');

// Monkey-patch the scrape module's export with a deterministic stub.
// Because Node's --test runs each test file in its own worker, mutations
// to the cached scrape module don't leak to other files. routes/recipes.js
// calls `scrapeMod.scrape(...)` against the same shared export object, so
// mutating the export here changes what the route sees.
const scrapeMod = require('../lib/scrape');
scrapeMod.scrape = async (url) => {
  if (url.includes('fail-network')) return { ok: false, reason: "Couldn't reach example.com" };
  if (url.includes('fail-no-recipe')) return { ok: false, reason: 'No recipe data found on this page' };
  return {
    ok: true,
    recipe: {
      sourceUrl: url,
      title: 'Stub Recipe ' + url.split('/').pop(),
      description: '',
      imageUrl: null,
      servings: '4 servings',
      totalMinutes: 30,
      ingredients: ['salt'],
      instructions: ['Cook.']
    }
  };
};

let ctx;

beforeEach(async () => {
  helpers.setupDataDir();
  ctx = await helpers.startTestServer();
});

afterEach(async () => {
  await helpers.stopTestServer(ctx.server);
  helpers.teardownDataDir();
});

test('GET / renders empty state', async () => {
  const res = await helpers.request(ctx.port, { path: '/' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="recipes-panel"/);
  assert.match(res.body, /No recipes yet/);
});

test('POST /recipes saves a new recipe and OOB-swaps the panel', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes',
    body: { url: 'https://example.com/recipe-1' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="recipes-panel"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, /Stub Recipe recipe-1/);
  assert.match(res.headers['x-status-toast'] || '', /Saved: Stub Recipe recipe-1/);
});

test('POST /recipes with same URL twice updates rather than duplicates', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/dup' }});
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/dup' }});
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /Updated:/);

  // Verify only one entry in state via a clean GET.
  const list = await helpers.request(ctx.port, { path: '/' });
  const matches = list.body.match(/Stub Recipe dup/g) || [];
  assert.strictEqual(matches.length, 1);
});

test('POST /recipes with scraper failure returns 200 + error toast, no state change', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes',
    body: { url: 'https://example.com/fail-no-recipe' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /No recipe data/);
  // Panel should still render empty (scrape failed → no save).
  assert.match(res.body, /No recipes yet/);
});

test('POST /recipes with missing url returns 400', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes',
    body: {}
  });
  assert.strictEqual(res.status, 400);
});
```

- [ ] **Step 13.6: Run tests — should fail (route missing)**

```bash
npm test -- test/recipes.test.js
```

- [ ] **Step 13.7: Implement `routes/recipes.js`**

```js
const express = require('express');
const storage = require('../lib/storage');
const scrapeMod = require('../lib/scrape');
const { idForUrl } = require('../lib/id');
const { respondWithUpdates } = require('../lib/render');

const router = express.Router();

function setToast(res, msg) {
  // Single ASCII line, capped to a sane size.
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

router.post('/recipes', async (req, res, next) => {
  try {
    const url = req.body && typeof req.body.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      return res.status(400).type('text').send('Missing url');
    }

    const result = await scrapeMod.scrape(url, { fetch: globalThis.fetch, now: new Date() });
    if (!result.ok) {
      setToast(res, result.reason);
      return respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
    }

    const id = idForUrl(url);
    const now = new Date().toISOString();
    const state = storage.get();
    const existingIdx = state.recipes.findIndex(r => r.id === id);
    const entry = { id, addedAt: now, ...result.recipe };
    let toastVerb;
    if (existingIdx >= 0) {
      state.recipes[existingIdx] = entry;
      toastVerb = 'Updated';
    } else {
      state.recipes.unshift(entry);
      toastVerb = 'Saved';
    }
    storage.save();

    setToast(res, `${toastVerb}: ${entry.title}`);
    respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 13.8: Run tests — should pass**

```bash
npm test
```

Expected: all suites green.

- [ ] **Step 13.9: Commit**

```bash
git add routes/recipes.js test/recipes.test.js views server.js
git commit -m "feat(routes): POST /recipes — scrape, save, OOB-swap panel"
```

---

## Task 14: Routes — GET /recipes/:id

**Files:**
- Create: `views/recipe.njk` (minimal — full markup in task 17)
- Modify: `routes/recipes.js`
- Modify: `test/recipes.test.js`

- [ ] **Step 14.1: Create minimal `views/recipe.njk`**

```html
{% extends "layout.njk" %}
{% block content %}
  <main class="app recipe-view">
    <p><a href="/">← Back to recipes</a></p>
    <h1>{{ recipe.title }}</h1>
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

- [ ] **Step 14.2: Append failing tests**

Append to `test/recipes.test.js`:

```js
test('GET /recipes/:id returns the recipe page', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/get-test' }});
  const { idForUrl } = require('../lib/id');
  const id = idForUrl('https://example.com/get-test');

  const res = await helpers.request(ctx.port, { path: `/recipes/${id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /Stub Recipe get-test/);
  assert.match(res.body, /Ingredients/);
  assert.match(res.body, /Instructions/);
});

test('GET /recipes/:id returns 404 for unknown id', async () => {
  const res = await helpers.request(ctx.port, { path: '/recipes/zzzzzzzzzz' });
  assert.strictEqual(res.status, 404);
});
```

- [ ] **Step 14.3: Run tests — should fail**

- [ ] **Step 14.4: Implement GET handler**

In `routes/recipes.js`, before `module.exports`:

```js
const { sourceDomain, formatTotalTime } = require('../lib/calc');

router.get('/recipes/:id', (req, res) => {
  const state = storage.get();
  const recipe = state.recipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).type('text').send('Not found');
  const decorated = {
    ...recipe,
    sourceDomain: sourceDomain(recipe.sourceUrl),
    totalTimeLabel: formatTotalTime(recipe.totalMinutes)
  };
  res.render('recipe.njk', { recipe: decorated });
});
```

- [ ] **Step 14.5: Run tests — should pass**

- [ ] **Step 14.6: Commit**

```bash
git add routes/recipes.js views/recipe.njk test/recipes.test.js
git commit -m "feat(routes): GET /recipes/:id renders single-recipe page"
```

---

## Task 15: Routes — DELETE /recipes/:id

**Files:**
- Modify: `routes/recipes.js`
- Modify: `test/recipes.test.js`
- Modify: `views/partials/recipes-panel.njk` (add delete button)

- [ ] **Step 15.1: Add delete button to panel partial**

Update `views/partials/recipes-panel.njk`:

```html
<section id="recipes-panel">
  {% if hasRecipes %}
    <ul class="recipe-list">
      {% for r in recipes %}
        <li class="recipe-card" data-id="{{ r.id }}">
          <a href="/recipes/{{ r.id }}">{{ r.title }}</a>
          <button class="delete-btn"
                  hx-delete="/recipes/{{ r.id }}"
                  hx-swap="none"
                  hx-confirm="Delete this recipe?"
                  aria-label="Delete">×</button>
        </li>
      {% endfor %}
    </ul>
  {% else %}
    <p class="empty">No recipes yet. Paste a URL above to get started.</p>
  {% endif %}
</section>
```

- [ ] **Step 15.2: Append failing tests**

```js
test('DELETE /recipes/:id removes the recipe and OOB-swaps the panel', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/del-test' }});
  const { idForUrl } = require('../lib/id');
  const id = idForUrl('https://example.com/del-test');

  const res = await helpers.request(ctx.port, { method: 'DELETE', path: `/recipes/${id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="recipes-panel"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, /No recipes yet/);
  assert.match(res.headers['x-status-toast'] || '', /Deleted/);
});

test('DELETE /recipes/:id returns 404 for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'DELETE', path: '/recipes/zzzzzzzzzz' });
  assert.strictEqual(res.status, 404);
});
```

- [ ] **Step 15.3: Run tests — should fail**

- [ ] **Step 15.4: Implement DELETE handler**

In `routes/recipes.js`, before `module.exports`:

```js
router.delete('/recipes/:id', (req, res) => {
  const state = storage.get();
  const idx = state.recipes.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).type('text').send('Not found');
  const [removed] = state.recipes.splice(idx, 1);
  storage.save();
  setToast(res, `Deleted: ${removed.title}`);
  respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
});
```

- [ ] **Step 15.5: Run tests — should pass**

```bash
npm test
```

- [ ] **Step 15.6: Commit**

```bash
git add routes/recipes.js test/recipes.test.js views/partials/recipes-panel.njk
git commit -m "feat(routes): DELETE /recipes/:id with OOB-swap and toast"
```

---

## Task 16: Final views — index + recipes-panel polish

**Files:**
- Modify: `views/index.njk`
- Modify: `views/partials/recipes-panel.njk`

- [ ] **Step 16.1: Polish `views/index.njk`**

```html
{% extends "layout.njk" %}
{% block content %}
  <main class="app">
    <header class="app-header">
      <h1>Recipe Box</h1>
    </header>

    <form id="paste-form" class="paste-form"
          hx-post="/recipes"
          hx-swap="none"
          hx-on:htmx:after-request="if(event.detail.successful) this.reset()">
      <input type="url" name="url" placeholder="Paste a recipe URL" required autocomplete="off">
      <button type="submit">Save</button>
    </form>

    {% include "partials/recipes-panel.njk" %}
  </main>
{% endblock %}
```

- [ ] **Step 16.2: Polish `views/partials/recipes-panel.njk`**

```html
<section id="recipes-panel" class="recipes-panel">
  {% if hasRecipes %}
    <ul class="recipe-list">
      {% for r in recipes %}
        <li class="recipe-card" data-id="{{ r.id }}">
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
          <button class="delete-btn"
                  hx-delete="/recipes/{{ r.id }}"
                  hx-swap="none"
                  hx-confirm="Delete this recipe?"
                  aria-label="Delete">×</button>
        </li>
      {% endfor %}
    </ul>
  {% else %}
    <p class="empty">No recipes yet. Paste a URL above to get started.</p>
  {% endif %}
</section>
```

- [ ] **Step 16.3: Re-run route tests to verify nothing broke**

```bash
npm test -- test/recipes.test.js
```

Expected: all green.

- [ ] **Step 16.4: Commit**

```bash
git add views/index.njk views/partials/recipes-panel.njk
git commit -m "ui: polish list view with hero image and metadata row"
```

---

## Task 17: Polish recipe view + add styles

**Files:**
- Modify: `views/recipe.njk` (add a tiny class hook around the meta)
- Create: `public/styles.css`

- [ ] **Step 17.1: Write `public/styles.css`**

Minimal, mobile-friendly. Token names stay close to workout-log's palette so future cross-app theme work is consistent — but keep it tight; this is v0.

```css
:root {
  --bg: #fafaf7;
  --fg: #1a1a1a;
  --muted: #5a5a5a;
  --accent: #c45a3a;
  --border: #e5e2da;
  --card-bg: #ffffff;
  --error: #b54632;
  --radius: 8px;
  --gap: 16px;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg);
  background: var(--bg);
  line-height: 1.5;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.app {
  max-width: 920px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.app-header h1 { margin: 0 0 16px; font-size: 28px; }

.paste-form {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}
.paste-form input[type="url"] {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 16px;
  background: var(--card-bg);
}
.paste-form button {
  padding: 10px 18px;
  border: none;
  background: var(--accent);
  color: white;
  border-radius: var(--radius);
  font-size: 16px;
  cursor: pointer;
}
.paste-form button:hover { filter: brightness(1.05); }

.recipes-panel { }
.recipe-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--gap);
}
.recipe-card {
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.recipe-card-link {
  display: block;
  color: inherit;
  text-decoration: none;
}
.recipe-card-link:hover { text-decoration: none; }
.recipe-card-img {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  display: block;
  background: #efeae0;
}
.recipe-card-img-empty {
  display: block;
}
.recipe-card-body { padding: 12px 14px; }
.recipe-card-title { font-weight: 600; margin-bottom: 4px; }
.recipe-card-meta { font-size: 13px; color: var(--muted); }

.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px; height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  color: white;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.delete-btn:hover { background: var(--error); }

.empty {
  color: var(--muted);
  text-align: center;
  padding: 32px 0;
}

.recipe-view h1 { margin: 8px 0 4px; }
.recipe-view .description { color: var(--muted); margin-top: 0; }
.recipe-view .hero {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: cover;
  border-radius: var(--radius);
  margin: 12px 0;
}
.recipe-view .meta {
  color: var(--muted);
  font-size: 14px;
  margin-bottom: 16px;
}
.recipe-view ul, .recipe-view ol {
  padding-left: 22px;
}
.recipe-view li { margin-bottom: 6px; }

.status-toast {
  position: fixed;
  bottom: 24px; left: 50%;
  transform: translateX(-50%);
  background: #1a1a1a;
  color: white;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 14px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease;
  z-index: 100;
}
.status-toast.visible { opacity: 1; }
.status-toast.error { background: var(--error); }

@media (max-width: 640px) {
  .recipe-list { grid-template-columns: 1fr; }
  .paste-form { flex-direction: column; }
  .paste-form button { width: 100%; }
}
```

- [ ] **Step 17.2: Add a class hook to `recipe.njk`**

Replace `<main class="app recipe-view">` (already in the template) — no change needed if it's already there. Verify the class is present.

- [ ] **Step 17.3: Manual smoke check**

```bash
npm start
```

Then in a browser at `http://127.0.0.1:3003`:

1. Empty state shows "No recipes yet."
2. Paste a real recipe URL (e.g. `https://www.smittenkitchen.com/2014/07/cheese-stuffed-baked-vegetables/`). Submit. Toast says "Saved: …".
3. Card appears, click into it, full recipe renders.
4. Click the × button, confirm dialog, recipe disappears, toast says "Deleted: …".
5. Resize the browser window to <640px wide; layout collapses to one column.

Stop the server (`Ctrl+C`).

- [ ] **Step 17.4: Commit**

```bash
git add public/styles.css views/recipe.njk
git commit -m "ui: minimal mobile-friendly styles"
```

---

## Task 18: README

**Files:**
- Create: `README.md`

- [ ] **Step 18.1: Write README**

```markdown
# Recipe Box

Personal recipe box. Paste a URL — the app extracts the recipe via Schema.org JSON-LD and saves it.

Same stack as siblings (`workout-log`, `planner-dashboard`, `home-hub`): Node + Express + Nunjucks + HTMX, no build step. Default port 3003.

## Run

\`\`\`bash
npm install
npm start          # http://127.0.0.1:3003
npm run dev        # auto-restart
npm test           # node --test
\`\`\`

`HOST` and `PORT` env vars override defaults. `HOST=0.0.0.0` binds to all interfaces (LAN/Pi access).

## How it works

1. POST a URL → `lib/scrape.js` fetches the page, finds JSON-LD `<script>` blocks, walks `@graph` for a `@type: "Recipe"` node.
2. The node is normalized to our internal shape (title, description, image URL, servings, total minutes, ingredients, instructions).
3. The recipe is saved to `data/state.json` (atomic temp-file rename).
4. The list view OOB-swaps to show the new card; the detail view renders full ingredients/instructions.

If a page has no JSON-LD recipe data, the toast says so. No HTML fallback in v0.

## Structure

- `lib/storage.js` — state singleton, atomic persist
- `lib/calc.js` — pure view-model
- `lib/render.js` — OOB-swap fragment helper
- `lib/scrape.js` — fetch + JSON-LD extraction + Recipe normalization
- `lib/id.js` — stable URL → 10-char id hash
- `routes/recipes.js` — POST/GET/DELETE
- `views/` — Nunjucks templates
- `test/` — `node:test` suites with fixtures

## Deploying to the Pi

Same as the other home apps: clone as a sibling, `npm install`, run under systemd at port 3003. Picked up by `home-hub`'s recipe-box tile.
```

- [ ] **Step 18.2: Commit**

```bash
git add README.md
git commit -m "docs: README"
```

---

## Task 19: home-hub adapter (cross-repo work)

**Working dir:** `../home-hub` (the home-hub repo). All commits in this task land in home-hub, **not** recipe-box.

**Files:**
- Create: `home-hub/lib/adapters/recipe-box.js`
- Create: `home-hub/test/adapters/recipe-box.test.js` (or wherever home-hub puts adapter tests — check existing layout first)

- [ ] **Step 19.1: Inspect home-hub's adapter test layout**

```bash
ls ../home-hub/test/
```

Adapt the file path in the next step to match what's already there. (At time of writing, no existing adapter tests are committed; if the directory `test/adapters/` doesn't exist, create it.)

- [ ] **Step 19.2: Write failing adapter tests**

Create `home-hub/test/adapters/recipe-box.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const adapter = require('../../lib/adapters/recipe-box');

function withTempFile(state, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbox-test-'));
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, JSON.stringify(state));
  try { return fn(file); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('reports count and latest title', async () => {
  await withTempFile({
    recipes: [
      { id: 'a', title: 'Old',    addedAt: '2026-05-01T00:00:00Z' },
      { id: 'b', title: 'Newest', addedAt: '2026-05-05T00:00:00Z' },
      { id: 'c', title: 'Mid',    addedAt: '2026-05-03T00:00:00Z' }
    ]
  }, async (file) => {
    const out = await adapter({ sourcePath: file }, { now: new Date() });
    assert.strictEqual(out.error, null);
    assert.deepStrictEqual(out.lines[0], { label: 'Recipes', value: '3' });
    assert.deepStrictEqual(out.lines[1], { label: 'Latest',  value: 'Newest' });
  });
});

test('reports zero with em-dash latest when empty', async () => {
  await withTempFile({ recipes: [] }, async (file) => {
    const out = await adapter({ sourcePath: file }, { now: new Date() });
    assert.deepStrictEqual(out.lines[0], { label: 'Recipes', value: '0' });
    assert.deepStrictEqual(out.lines[1], { label: 'Latest',  value: '—' });
  });
});

test('returns error string when state file missing', async () => {
  const out = await adapter({ sourcePath: '/nonexistent/path/state.json' }, { now: new Date() });
  assert.ok(out.error, 'expected an error string');
  assert.deepStrictEqual(out.lines, []);
});

test('returns error string when state file is malformed JSON', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbox-test-'));
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, 'not json');
  try {
    const out = await adapter({ sourcePath: file }, { now: new Date() });
    assert.ok(out.error);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 19.3: Run tests — should fail (adapter missing)**

```bash
cd ../home-hub
npm test -- test/adapters/recipe-box.test.js
```

- [ ] **Step 19.4: Implement `home-hub/lib/adapters/recipe-box.js`**

```js
const fs = require('node:fs');

module.exports = async function read(tile, ctx) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(tile.sourcePath, 'utf8'));
  } catch (err) {
    return { status: 'unknown', latencyMs: null, lines: [], error: err.message };
  }
  const recipes = Array.isArray(raw.recipes) ? raw.recipes : [];
  const latest = recipes.slice().sort((a, b) =>
    (b.addedAt || '').localeCompare(a.addedAt || '')
  )[0];
  const lines = [
    { label: 'Recipes', value: String(recipes.length) },
    { label: 'Latest',  value: latest ? latest.title : '—' }
  ];
  return { status: 'unknown', latencyMs: null, lines, error: null };
};
```

- [ ] **Step 19.5: Run tests — should pass**

```bash
npm test
```

- [ ] **Step 19.6: Commit (in home-hub)**

```bash
git add lib/adapters/recipe-box.js test/adapters/recipe-box.test.js
git commit -m "feat(adapter): recipe-box file-read adapter"
```

---

## Task 20: home-hub tile config

**Working dir:** `../home-hub`. Same repo as task 19.

**Files:**
- Modify: `home-hub/lib/storage.js` (add tile to `defaultState()`)
- Modify: `home-hub/data/state.json` (manually add the tile entry, or delete and let `defaultState` reseed on next boot)

- [ ] **Step 20.1: Update `defaultState()` in `home-hub/lib/storage.js`**

In the `tiles` array of `defaultState()`, append after the network entry:

```js
,
{
  id: 'recipes',
  name: 'Recipe Box',
  kind: 'recipe-box',
  url: 'http://127.0.0.1:3003',
  healthCheck: 'http://127.0.0.1:3003',
  sourcePath: '../recipe-box/data/state.json',
  order: 3
}
```

(Comma at the start because the previous entry doesn't have a trailing comma — edit accordingly.)

- [ ] **Step 20.2: Add the tile to the live `home-hub/data/state.json`**

Two options — pick one:

**A) Manual (preserves existing tile customizations):** open `home-hub/data/state.json` and append the same tile object to its `tiles` array.

**B) Reseed (fresh defaults):**
```bash
rm home-hub/data/state.json
# Next `npm start` regenerates from defaultState().
```

- [ ] **Step 20.3: Smoke check**

```bash
# Terminal 1: recipe-box
cd ../recipe-box && npm start
# Terminal 2: home-hub
cd ../home-hub && npm start
```

Visit `http://127.0.0.1:3002`. The Recipe Box tile should appear with `Recipes: 0` and `Latest: —` (or your current state). Click the tile — it opens the recipe-box at port 3003.

Save a recipe in recipe-box, refresh home-hub: the tile updates within `settings.refreshSeconds` (default 30s).

- [ ] **Step 20.4: Commit (in home-hub)**

```bash
cd ../home-hub
git add lib/storage.js data/state.json
git commit -m "feat: register Recipe Box tile (recipe-box adapter, port 3003)"
```

---

## Wrap-up

- [ ] All recipe-box tests green: `cd recipe-box && npm test`
- [ ] All home-hub tests green: `cd ../home-hub && npm test`
- [ ] Manual flow verified end-to-end (paste URL → save → view → delete; hub tile updates).
- [ ] Decide whether to publish to a remote git host now or later (no specific instruction in the spec — both repos are local-only at this point).

Pi deployment is intentionally out of v0 scope per the spec. Pick that up as a follow-up: clone recipe-box on the Pi as a sibling of the others, add a systemd unit at port 3003 with `HOST=0.0.0.0`, and confirm the home-hub tile picks it up.
