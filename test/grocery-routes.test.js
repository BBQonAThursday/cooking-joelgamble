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

async function addItem(port, text) {
  const res = await helpers.request(port, { method: 'POST', path: '/grocery', body: { text } });
  // Extract id from rendered body
  const m = res.body.match(/id="grocery-item-(g_[a-z0-9]+)"/);
  return m ? m[1] : null;
}

// Phase 6 helpers — copied (NOT imported) from test/library-routes.test.js per CONVENTIONS.
function seedLibrary(entries) {
  const state = storage.get();
  state.library = entries;
  state.libraryMigratedAt = new Date().toISOString();
  storage.save();
}

function makeEntry(overrides) {
  return Object.assign({
    id: 'lb_test0001',
    name: 'apple',
    aliases: [],
    recipeCategory: 'Veg',
    groceryCategory: 'Produce',
    curated: true,
    createdAt: ''
  }, overrides);
}

test('GET /grocery renders the page with empty state', async () => {
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/grocery"[^>]*class="tab active"/);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /Grocery list is empty/);
});

test('POST /grocery adds an item and OOB-swaps the list with category grouping', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/grocery',
    body: { text: '  eggs  ' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, /<h3 class="grocery-category">Dairy<\/h3>/);
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

test('POST /grocery/:id/check moves the item to the Got it closed list', async () => {
  const id = await addItem(ctx.port, 'eggs');
  assert.ok(id);
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/grocery/${id}/check` });
  assert.strictEqual(res.status, 200);
  // OOB-swap of the full list now (not just a single row)
  assert.match(res.body, /id="grocery-list"[^>]*hx-swap-oob="true"/);
  // The item is rendered as checked
  assert.match(res.body, new RegExp(`id="grocery-item-${id}"`));
  assert.match(res.body, /class="grocery-item is-checked"/);
  // It appears under the "Got it" header
  assert.match(res.body, /<h3>Got it<\/h3>/);
  // The Dairy category section that would normally hold it is absent (only one item, now checked)
  assert.doesNotMatch(res.body, /<h3 class="grocery-category">Dairy<\/h3>/);
});

test('POST /grocery/:id/check 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/grocery/g_nope/check' });
  assert.strictEqual(res.status, 404);
});

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

// ----- Phase 6 / FIX-01: pencil affordance on grocery rows ------------------

test('GET /grocery renders a pencil button on each item row', async () => {
  await addItem(ctx.port, 'eggs');
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /class="grocery-pencil"/);
  // Shared SVG partial included.
  assert.match(res.body, /viewBox="0 0 16 16"/);
});

test('GET /grocery: unmatched item pencil targets /library/categorize-edit', async () => {
  await addItem(ctx.port, 'asdfqwerty');
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /hx-get="\/library\/categorize-edit\?text=asdfqwerty&surface=grocery&itemId=g_/);
  assert.match(res.body, /aria-label="Categorize asdfqwerty"/);
});

test('GET /grocery: matched item pencil targets /library/:id/categories-edit', async () => {
  seedLibrary([makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] })]);
  await addItem(ctx.port, 'apple');
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /hx-get="\/library\/lb_apple01\/categories-edit\?surface=grocery&itemId=g_/);
  assert.match(res.body, /aria-label="Fix categorization for apple"/);
});

test('GET /grocery: pencil button sits between .grocery-text and .grocery-delete', async () => {
  await addItem(ctx.port, 'eggs');
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  const textIdx = res.body.indexOf('grocery-text');
  const pencilIdx = res.body.indexOf('grocery-pencil');
  const deleteIdx = res.body.indexOf('grocery-delete');
  assert.ok(textIdx !== -1, 'grocery-text present');
  assert.ok(pencilIdx !== -1, 'grocery-pencil present');
  assert.ok(deleteIdx !== -1, 'grocery-delete present');
  assert.ok(textIdx < pencilIdx, 'pencil after text');
  assert.ok(pencilIdx < deleteIdx, 'pencil before delete');
});

test('GET /grocery: special chars in item text are URL-encoded in pencil hx-get', async () => {
  await addItem(ctx.port, 'salt & pepper');
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  // Nunjucks urlencode emits `%20` for spaces and `%26` for `&`.
  assert.match(res.body, /text=salt(%20|\+)%26(%20|\+)pepper/);
});
