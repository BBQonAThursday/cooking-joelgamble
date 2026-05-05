# Testing Patterns

**Analysis Date:** 2026-05-05

## Test Framework & Runtime

**Framework:**
- Built-in: `node:test` (Node.js native test runner)
- Assertion: `node:assert` (Node.js built-in assertions)
- No external test frameworks (no Jest, Vitest, etc.)

**Run Commands:**
```bash
npm test                              # Run all tests
npm test -- test/calc.test.js         # Run specific test file
npm test -- --grep "pattern"          # Filter by test name
```

**Configuration:**
- Entry: `package.json` script: `"test": "node --test \"test/**/*.test.js\""`
- No `jest.config.js`, `vitest.config.js`, or other config file needed
- Tests run in series by default; each test file runs in a separate worker (no cross-file pollution)

## Test File Organization

**Location:**
- Co-located with source: test files live in `test/` directory at project root
- Not co-located in source directory structure

**Naming Convention:**
- `test/*.test.js` (e.g., `test/storage.test.js`, `test/recipes.test.js`)
- File names match the module being tested when possible

**Directory Structure:**
```
test/
├── _helpers.js              # Test utilities (setup, server, requests)
├── calc.test.js             # Tests for lib/calc.js
├── categorize.test.js       # Tests for lib/categorize.js
├── garbage.test.js          # Tests for lib/garbage.js (if exists)
├── grocery-routes.test.js   # Tests for routes/grocery.js
├── grocery.test.js          # Tests for lib/grocery.js
├── history-routes.test.js   # Tests for routes/history.js
├── id.test.js               # Tests for lib/id.js
├── recipes.test.js          # Tests for routes/recipes.js
├── render.test.js           # Tests for lib/render.js
├── scrape.test.js           # Tests for lib/scrape.js
├── storage.test.js          # Tests for lib/storage.js
├── week.test.js             # Tests for lib/week.js
└── weeks-routes.test.js     # Tests for routes/weeks.js
```

## Test Structure

**Suite Organization:**
- Use `test()` function from `node:test` (no nested describes)
- `beforeEach()`, `afterEach()` hooks for setup/teardown
- No `describe()` blocks; tests are flat

**Basic Pattern:**
```javascript
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
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
```

## Test Isolation

**Storage Singleton Reset:**
- Each test gets a fresh isolated data directory via `RECIPE_BOX_DATA_DIR` env var
- Storage module singleton reset by:
  1. Call `helpers.setupDataDir()` → creates temp dir, sets `process.env.RECIPE_BOX_DATA_DIR`
  2. Delete cached require: `delete require.cache[require.resolve('../lib/storage')]`
  3. Re-require storage: `storage = require('../lib/storage')`
  4. On teardown: `helpers.teardownDataDir()` → removes temp dir, clears env var

**Example from `test/storage.test.js`:**
```javascript
beforeEach(() => {
  helpers.setupDataDir();
  delete require.cache[require.resolve('../lib/storage')];
  storage = require('../lib/storage');
});

afterEach(() => {
  helpers.teardownDataDir();
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
```

## Test Helpers (`test/_helpers.js`)

**Data Directory Setup:**
```javascript
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
```

**Server Management:**
```javascript
async function startTestServer() {
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
```

**HTTP Request Helper:**
```javascript
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
```

**Usage in Route Tests:**
```javascript
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
});

test('POST /recipes saves a recipe and OOB-swaps the panel', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes',
    body: { url: 'https://example.com/recipe-1' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.headers['x-status-toast'] || '', /Saved:/);
});
```

## Mocking

**Framework:** Node.js built-in `require()` cache mutation (no external mock library)

**Pattern:**
1. Require the module at import time
2. Monkey-patch the exported function
3. Mutations only affect current test worker (other files don't see the change)

**Example from `test/recipes.test.js`:**
```javascript
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
```

**Stub Recipe Shape:**
```javascript
{
  sourceUrl: url,
  title: 'Stub Recipe ...',
  description: '',
  imageUrl: null,
  servings: '4 servings',
  totalMinutes: 30,
  ingredients: ['salt'],
  instructions: ['Cook.']
}
```

**What to Mock:**
- External network calls (scraping, fetching): use stub returns
- Date/time: pass `now: new Date()` to functions that need it
- Random IDs: not mocked; tests accept non-deterministic IDs (verified via regex/match)

**What NOT to Mock:**
- `storage` module: use real persistent storage with fresh temp dir per test
- `lib/calc` view builders: test real view output (not mocked)
- `lib/render` template rendering: test real HTML output (not mocked)

## Test Assertions

**Common Patterns:**

1. **Exact equality:**
   ```javascript
   assert.strictEqual(result.ok, true);
   assert.strictEqual(result.item.text, 'eggs');
   assert.strictEqual(result.item.checked, false);
   ```

2. **Deep object equality:**
   ```javascript
   assert.deepStrictEqual(s.recipes, []);
   assert.deepStrictEqual(addItem(state, '').ok, false);
   ```

3. **Array length & content:**
   ```javascript
   assert.strictEqual(reloaded.recipes.length, 1);
   assert.strictEqual(reloaded.recipes[0].title, 'Soup');
   ```

4. **HTML/text content matching:**
   ```javascript
   assert.match(res.body, /id="recipes-panel"/);
   assert.match(res.body, /No recipes yet/);
   assert.match(res.headers['x-status-toast'] || '', /Saved: Stub Recipe recipe-1/);
   ```

5. **Absence of content:**
   ```javascript
   assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
   ```

6. **Regex-based uniqueness:**
   ```javascript
   const matches = list.body.match(/Stub Recipe dup/g) || [];
   assert.strictEqual(matches.length, 1);  // Only one instance
   ```

7. **Property existence:**
   ```javascript
   assert.ok(fs.existsSync(path.join(dir, 'state.json')));
   assert.ok(!fs.existsSync(path.join(dir, 'state.json.tmp')));
   ```

8. **Error handling:**
   ```javascript
   assert.match(res.headers['x-status-toast'] || '', /No recipe data/);
   assert.match(res.body, /No recipes yet/);  // Panel renders empty despite error
   ```

## Test Types

**Unit Tests:** (~130 tests across library modules)
- Scope: Pure functions (`lib/calc.js`, `lib/id.js`, `lib/scrape.js`, `lib/grocery.js`, `lib/categorize.js`, `lib/storage.js`)
- Setup: Create fresh state object or mock dependencies
- Teardown: None needed (pure functions, no side effects)
- Examples: `test/calc.test.js`, `test/id.test.js`, `test/grocery.test.js`

**Integration Tests:** (~40 tests across route tests)
- Scope: Full request → route → view → response
- Setup: Fresh temp data dir + test server
- Teardown: Stop server, clean temp dir
- Mocking: Only external network calls (scraping)
- Examples: `test/recipes.test.js`, `test/weeks-routes.test.js`, `test/grocery-routes.test.js`

**No E2E Tests:** Application is HTMX-based; UI testing not performed

## Test Examples

**Unit Test (Pure Function):**
```javascript
test('formatTotalTime renders minutes as "1h 30m" / "45m" / null-friendly', () => {
  assert.strictEqual(formatTotalTime(90), '1h 30m');
  assert.strictEqual(formatTotalTime(45), '45m');
  assert.strictEqual(formatTotalTime(120), '2h');
  assert.strictEqual(formatTotalTime(null), '');
  assert.strictEqual(formatTotalTime(0), '');
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
});
```

**Integration Test (Route):**
```javascript
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
```

**Storage Test (Persistence):**
```javascript
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

## Coverage

**Requirements:** No minimum coverage threshold enforced

**View Coverage:**
- Generate coverage: `npm test 2>&1 | grep -E "^(PASS|FAIL|  |✔|✖)"`
- Coverage data location: Not tracked in CI/config

**Test Count Summary (as of 2026-05-05):**
- Total: ~171 tests across 12 test files
- Distribution:
  - Unit tests: ~130 (calc, id, scrape, grocery, categorize, storage, week, render)
  - Route integration tests: ~40 (recipes, weeks, grocery, history routes)

---

*Testing analysis: 2026-05-05*
