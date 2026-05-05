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

test('GET / renders the top tabs with Recipes active', async () => {
  const res = await helpers.request(ctx.port, { path: '/' });
  assert.match(res.body, /<nav class="tabs">/);
  assert.match(res.body, /href="\/"[^>]*class="tab active"[^>]*>Recipes/);
  assert.match(res.body, /href="\/this-week"/);
  assert.match(res.body, /href="\/grocery"/);
  assert.match(res.body, /href="\/history"/);
});

test('GET / shows an untagged tag-toggle on each recipe card', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/tag-test' } });
  const res = await helpers.request(ctx.port, { path: '/' });
  assert.match(res.body, /<button[^>]*class="tag-toggle"[^>]*hx-post="\/this-week\/recipes\/[a-z0-9]+"/);
  assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
});

test('GET /recipes/:id renders the tag-toggle next to the title', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/detail-test' }});
  const { idForUrl } = require('../lib/id');
  const id = idForUrl('https://example.com/detail-test');
  const res = await helpers.request(ctx.port, { path: `/recipes/${id}` });
  assert.match(res.body, new RegExp(`id="tag-toggle-${id}"`));
  // Untagged by default
  assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
});

test('GET /recipes/:id renders ingredients grouped by category', async () => {
  // Add a recipe directly to state for richer category coverage.
  const storage = require('../lib/storage');
  const state = storage.get();
  state.recipes.push({
    id: 'multicat',
    addedAt: '2026-05-01T00:00:00Z',
    sourceUrl: 'https://example.com/multicat',
    title: 'Multi-Category Recipe',
    description: '',
    imageUrl: null,
    servings: '4',
    totalMinutes: 30,
    ingredients: ['500g chicken', '1 onion', '1 tsp salt', '2 tbsp olive oil'],
    instructions: ['cook']
  });
  storage.save();

  const res = await helpers.request(ctx.port, { path: '/recipes/multicat' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<h3 class="ingredient-category">Protein<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Veg<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Seasoning<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Flavor<\/h3>/);
  assert.match(res.body, />500g chicken</);
  assert.match(res.body, />1 onion</);
  assert.match(res.body, />1 tsp salt</);
  assert.match(res.body, />2 tbsp olive oil</);
});
