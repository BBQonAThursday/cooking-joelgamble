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

function seedGrocery(items) {
  const state = storage.get();
  state.grocery = items;
  storage.save();
}

function seedRecipes(recipes) {
  const state = storage.get();
  state.recipes = recipes;
  storage.save();
}

function makeEntry(overrides) {
  return Object.assign({
    id: 'lb_test0001',
    name: 'tomato',
    aliases: ['tomatoes'],
    recipeCategory: 'Veg',
    groceryCategory: 'Produce',
    curated: true,
    createdAt: ''
  }, overrides);
}

// ====== GET /library/:id/categories-edit ======

test('GET /library/:id/categories-edit returns Fix editor fragment with both dropdowns + Edit-full-entry link', async () => {
  seedLibrary([makeEntry({ id: 'lb_tomato01', name: 'tomato' })]);
  const res = await helpers.request(ctx.port, { path: '/library/lb_tomato01/categories-edit?surface=grocery&itemId=g_xyz' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<form/);
  assert.match(res.body, /hx-post="\/library\/lb_tomato01\/categories"/);
  assert.match(res.body, /<select[^>]*name="recipeCategory"/);
  assert.match(res.body, /<select[^>]*name="groceryCategory"/);
  assert.match(res.body, /id="library-fix-grocery-item-g_xyz"/);
  assert.match(res.body, /Library entry: <strong>tomato<\/strong>/);
  assert.match(res.body, /href="\/library\?q=tomato"/);
  assert.strictEqual(res.headers['x-status-toast'], undefined);
});

test('GET /library/:id/categories-edit fragment is categories-only (no name/aliases inputs) per FIX-03', async () => {
  seedLibrary([makeEntry({ id: 'lb_test01' })]);
  const res = await helpers.request(ctx.port, { path: '/library/lb_test01/categories-edit?surface=grocery&itemId=g_xyz' });
  assert.strictEqual(res.status, 200);
  assert.doesNotMatch(res.body, /<input[^>]*name="name"/);
  assert.doesNotMatch(res.body, /<input[^>]*name="aliases"/);
  assert.doesNotMatch(res.body, /<input[^>]*name="aliasesRaw"/);
});

test('GET /library/:id/categories-edit returns 404 on unknown id', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/lb_nonexistent/categories-edit?surface=grocery&itemId=g_xyz' });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body, 'Not found');
});

test('GET /library/:id/categories-edit pre-selects current entry categories in dropdowns', async () => {
  seedLibrary([makeEntry({ id: 'lb_test01', recipeCategory: 'Protein', groceryCategory: 'Meat' })]);
  const res = await helpers.request(ctx.port, { path: '/library/lb_test01/categories-edit?surface=grocery&itemId=g_xyz' });
  assert.match(res.body, /<option value="Protein"\s*selected/);
  assert.match(res.body, /<option value="Meat"\s*selected/);
});

test('GET /library/:id/categories-edit recipe surface produces recipe-relative outer id', async () => {
  // surfaceItemId is computed server-side as recipe-{recipeId}-{index} when
  // surface=recipe so the editor's outerHTML target matches the source <li>'s id.
  seedLibrary([makeEntry({ id: 'lb_apple01', name: 'apple' })]);
  const res = await helpers.request(ctx.port, { path: '/library/lb_apple01/categories-edit?surface=recipe&recipeId=r_abc&index=2' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="library-fix-recipe-r_abc-2"/);
});

// ====== GET /library/categorize-edit ======

test('GET /library/categorize-edit returns Categorize editor with name pre-filled and dropdowns set', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/categorize-edit?text=tomato&surface=grocery&itemId=g_abc' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<form/);
  assert.match(res.body, /hx-post="\/library"/);
  assert.match(res.body, /<input[^>]*name="name"[^>]*value="tomato"/);
  assert.match(res.body, /<select[^>]*name="recipeCategory"/);
  assert.match(res.body, /<select[^>]*name="groceryCategory"/);
  assert.match(res.body, /id="library-categorize-grocery-item-g_abc"/);
  assert.match(res.body, /New library entry/);
  assert.doesNotMatch(res.body, /<input[^>]*name="aliases"/);
});

test('GET /library/categorize-edit normalizes the prefilled name (strips quantity tokens)', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/categorize-edit?text=2%20cups%20of%20Garlic%20Cloves&surface=grocery&itemId=g_abc' });
  assert.strictEqual(res.status, 200);
  // normalizeIngredientText strips quantity prefixes + lowercases.
  assert.match(res.body, /<input[^>]*name="name"[^>]*value="garlic cloves"/);
});

test('GET /library/categorize-edit reflects heuristic category guesses in pre-selected dropdown options', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/categorize-edit?text=peanut%20butter&surface=grocery&itemId=g_abc' });
  assert.strictEqual(res.status, 200);
  // 'peanut butter' is an Aisle keyword (Phase 4 pea-prefix fix). Heuristic
  // pre-selects Aisle on the grocery dropdown.
  assert.match(res.body, /<option value="Aisle"\s*selected/);
});

test('GET /library/categorize-edit with empty text returns editor with empty prefilled name', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/categorize-edit?surface=grocery&itemId=g_abc' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<input[^>]*name="name"[^>]*value=""/);
});

test('GET /library/categorize-edit recipe surface produces recipe-relative outer id', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/categorize-edit?text=salt&surface=recipe&recipeId=r_xyz&index=3' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="library-categorize-recipe-r_xyz-3"/);
});

test('GET /library/categorize-edit produces no x-status-toast (silent GET)', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/categorize-edit?text=tomato&surface=grocery&itemId=g_abc' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['x-status-toast'], undefined);
});

// ====== GET /library/cancel-fix ======

test('GET /library/cancel-fix?surface=grocery returns the original grocery-item fragment', async () => {
  seedLibrary([makeEntry({ id: 'lb_tomato01', name: 'tomato', aliases: ['tomato'] })]);
  seedGrocery([{ id: 'g_xyz', text: 'tomato', checked: false }]);
  const res = await helpers.request(ctx.port, { path: '/library/cancel-fix?surface=grocery&itemId=g_xyz' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-item-g_xyz"/);
  assert.match(res.body, /class="grocery-pencil"/);
  assert.match(res.body, /class="grocery-text">tomato</);
});

test('GET /library/cancel-fix?surface=grocery returns 404 on unknown itemId', async () => {
  seedGrocery([{ id: 'g_other', text: 'other', checked: false }]);
  const res = await helpers.request(ctx.port, { path: '/library/cancel-fix?surface=grocery&itemId=g_nonexistent' });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body, 'Not found');
});

test('GET /library/cancel-fix?surface=recipe returns the original recipe-ingredient-line fragment', async () => {
  seedLibrary([makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] })]);
  seedRecipes([{
    id: 'r_test01',
    title: 'T',
    sourceUrl: 'https://x.test/r',
    ingredients: ['1 apple'],
    instructions: [],
    imageUrl: '',
    totalMinutes: 0,
    servings: '1',
    addedAt: new Date().toISOString()
  }]);
  const res = await helpers.request(ctx.port, { path: '/library/cancel-fix?surface=recipe&recipeId=r_test01&index=0' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /class="recipe-ingredient-line"/);
  assert.match(res.body, /class="recipe-pencil"/);
  assert.match(res.body, /class="recipe-ingredient-text">1 apple</);
});

test('GET /library/cancel-fix?surface=recipe returns 404 on unknown recipeId', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/cancel-fix?surface=recipe&recipeId=r_nonexistent&index=0' });
  assert.strictEqual(res.status, 404);
});

test('GET /library/cancel-fix?surface=recipe returns 404 on flatIndex out of range', async () => {
  seedRecipes([{
    id: 'r_test02',
    title: 'T2',
    sourceUrl: 'https://x.test/r2',
    ingredients: ['1 apple'],
    instructions: [],
    imageUrl: '',
    totalMinutes: 0,
    servings: '1',
    addedAt: new Date().toISOString()
  }]);
  const res = await helpers.request(ctx.port, { path: '/library/cancel-fix?surface=recipe&recipeId=r_test02&index=99' });
  assert.strictEqual(res.status, 404);
});

test('GET /library/cancel-fix returns 400 on unknown surface', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/cancel-fix?surface=unknown' });
  assert.strictEqual(res.status, 400);
});

// ====== Route order verification ======

test('GET /library/categorize-edit is NOT swallowed by GET /library/:id (route order)', async () => {
  // If route order is wrong, /library/categorize-edit hits the :id wildcard
  // and entryViewById returns undefined -> 404. Correct order: matches
  // categorize-edit first -> 200 with editor fragment.
  const res = await helpers.request(ctx.port, { path: '/library/categorize-edit?surface=grocery&itemId=g_abc' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /class="library-categorize-editor"/);
});

test('GET /library/cancel-fix is NOT swallowed by GET /library/:id (route order)', async () => {
  // Same first-match concern as the categorize-edit test: a missing route-
  // ordering would cause :id to match cancel-fix and return 404. Correct
  // order returns the 400 'Unknown surface' branch from cancel-fix itself.
  const res = await helpers.request(ctx.port, { path: '/library/cancel-fix' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body, 'Unknown surface');
});

// ====== POST /library/:id/categories ======

test('POST /library/:id/categories saves curated:true and sets Saved categories toast', async () => {
  seedLibrary([makeEntry({ id: 'lb_test01', curated: false, recipeCategory: 'Veg', groceryCategory: 'Produce' })]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_test01/categories',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/library' },
    body: { recipeCategory: 'Protein', groceryCategory: 'Meat', surfaceItemId: 'library-lb_test01', surface: 'library' }
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['x-status-toast'], 'Saved categories');
  const state = storage.get();
  const entry = state.library.find(e => e.id === 'lb_test01');
  assert.strictEqual(entry.recipeCategory, 'Protein');
  assert.strictEqual(entry.groceryCategory, 'Meat');
  assert.strictEqual(entry.curated, true);
});

test('POST /library/:id/categories from /grocery returns OOB grocery-list fragment', async () => {
  seedLibrary([makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] })]);
  seedGrocery([{ id: 'g_xyz', text: 'apple', checked: false }]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_apple01/categories',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/grocery' },
    body: { recipeCategory: 'Protein', groceryCategory: 'Meat', surfaceItemId: 'grocery-item-g_xyz', surface: 'grocery', itemId: 'g_xyz' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.strictEqual(res.headers['x-status-toast'], 'Saved categories');
});

test('POST /library/:id/categories from /recipes/:id returns OOB recipe-ingredient-groups fragment', async () => {
  seedLibrary([makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] })]);
  seedRecipes([{
    id: 'r_test01',
    title: 'T',
    sourceUrl: 'https://x.test/r',
    ingredients: ['1 apple'],
    instructions: [],
    imageUrl: '',
    totalMinutes: 0,
    servings: '1',
    addedAt: new Date().toISOString()
  }]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_apple01/categories',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/recipes/r_test01' },
    body: { recipeCategory: 'Veg', groceryCategory: 'Produce', surfaceItemId: 'recipe-r_test01-0', surface: 'recipe', recipeId: 'r_test01', index: '0' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="recipe-ingredient-groups-r_test01"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.strictEqual(res.headers['x-status-toast'], 'Saved categories');
});

test('POST /library/:id/categories from /library returns row fragment + OOB footer', async () => {
  seedLibrary([makeEntry({ id: 'lb_test01' })]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_test01/categories',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/library' },
    body: { recipeCategory: 'Protein', groceryCategory: 'Meat' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="library-row-lb_test01"/);
  assert.match(res.body, /id="library-footer"/);
  assert.match(res.body, /hx-swap-oob="true"/);
});

test('POST /library/:id/categories returns 400 + Fix editor fragment on invalid recipeCategory', async () => {
  seedLibrary([makeEntry({ id: 'lb_test01' })]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_test01/categories',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/grocery' },
    body: { recipeCategory: 'BadCategory', groceryCategory: 'Produce', surfaceItemId: 'grocery-item-g_xyz', surface: 'grocery', itemId: 'g_xyz' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /class="library-fix-editor"/);
  assert.ok(!res.headers['x-status-toast'], 'No toast on 400');
});

test('POST /library/:id/categories returns 400 + Fix editor fragment on invalid groceryCategory', async () => {
  seedLibrary([makeEntry({ id: 'lb_test01' })]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_test01/categories',
    body: { recipeCategory: 'Veg', groceryCategory: 'NotARealCategory' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /class="library-fix-editor"/);
  assert.ok(!res.headers['x-status-toast']);
});

test('POST /library/:id/categories returns 404 on unknown id', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_nonexistent/categories',
    body: { recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body, 'Not found');
  assert.ok(!res.headers['x-status-toast']);
});

// ====== POST /library (Categorize-mode branch) ======

test('POST /library Categorize success from /grocery creates entry with curated:true and OOB-swaps grocery-list', async () => {
  seedGrocery([{ id: 'g_abc', text: 'mango', checked: false }]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/grocery' },
    body: { name: 'mango', recipeCategory: 'Veg', groceryCategory: 'Produce', surfaceItemId: 'grocery-item-g_abc', surface: 'grocery', itemId: 'g_abc' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.strictEqual(res.headers['x-status-toast'], 'Added entry');
  const newState = storage.get();
  const entry = newState.library.find(e => e.name === 'mango');
  assert.ok(entry, 'mango entry created');
  assert.strictEqual(entry.curated, true);
});

test('POST /library Categorize 400 on case-insensitive name conflict', async () => {
  seedLibrary([makeEntry({ id: 'lb_apple01', name: 'apple', aliases: [] })]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/grocery' },
    body: { name: 'APPLE', recipeCategory: 'Veg', groceryCategory: 'Produce', surfaceItemId: 'grocery-item-g_abc', surface: 'grocery', itemId: 'g_abc' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /class="library-categorize-editor"/);
  assert.match(res.body, /class="library-categorize-error"/);
  // Conflict message includes the typed name and the colliding entry name
  // (Nunjucks autoescape emits " as &#34; or &quot; depending on version).
  assert.match(res.body, /Name (&#34;|&quot;|")APPLE(&#34;|&quot;|") is already used by entry (&#34;|&quot;|")apple(&#34;|&quot;|")/);
  assert.match(res.body, /value="APPLE"/);
  assert.ok(!res.headers['x-status-toast'], 'No toast on 400');
});

test('POST /library Categorize 400 on alias conflict (name matches an existing alias)', async () => {
  seedLibrary([makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apples'] })]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/grocery' },
    body: { name: 'apples', recipeCategory: 'Veg', groceryCategory: 'Produce', surfaceItemId: 'grocery-item-g_abc', surface: 'grocery', itemId: 'g_abc' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /class="library-categorize-editor"/);
  assert.match(res.body, /class="library-categorize-error"/);
  assert.match(res.body, /already used by entry/);
  assert.match(res.body, /value="apples"/);
  assert.ok(!res.headers['x-status-toast']);
});

test('POST /library Categorize from /recipes/:id returns OOB recipe-ingredient-groups fragment', async () => {
  seedRecipes([{
    id: 'r_test01',
    title: 'T',
    sourceUrl: 'https://x.test/r',
    ingredients: ['1 zzunknown'],
    instructions: [],
    imageUrl: '',
    totalMinutes: 0,
    servings: '1',
    addedAt: new Date().toISOString()
  }]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/recipes/r_test01' },
    body: { name: 'zzunknown', recipeCategory: 'Other', groceryCategory: 'Other', surfaceItemId: 'recipe-r_test01-0', surface: 'recipe', recipeId: 'r_test01', index: '0' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="recipe-ingredient-groups-r_test01"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.strictEqual(res.headers['x-status-toast'], 'Added entry');
});

test('POST /library WITHOUT surfaceItemId preserves Phase 5 plain-text 400 contract', async () => {
  // No surfaceItemId in body -> NOT Categorize mode; existing LIB-04 plain-text contract.
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    body: { name: '', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body, 'Name required');
});

test('POST /library WITHOUT surfaceItemId preserves Phase 5 respondWithUpdates(library-panel) success shape', async () => {
  // No surfaceItemId, no HX-Current-URL: existing Phase 5 path (full library-panel re-render).
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    body: { name: 'newlib', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="library-panel"/);
  assert.strictEqual(res.headers['x-status-toast'], 'Added entry');
});
