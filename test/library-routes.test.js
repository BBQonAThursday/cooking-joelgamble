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

// Helper: post the manual-add form and extract the new entry's id from the rendered row.
// Used by tests in plans 03..05. ID format mirrors newLibraryId('lb_' + 8 base36 chars).
async function addLibraryEntry(port, fields) {
  const res = await helpers.request(port, {
    method: 'POST',
    path: '/library',
    body: fields // { name, aliases, recipeCategory, groceryCategory }
  });
  const m = res.body.match(/id="library-row-(lb_[a-z0-9]+)"/);
  return m ? m[1] : null;
}

function seedLibrary(entries) {
  const state = storage.get();
  state.library = entries;
  state.libraryMigratedAt = new Date().toISOString();
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
    name: 'apple',
    aliases: [],
    recipeCategory: 'Veg',
    groceryCategory: 'Produce',
    curated: true,
    createdAt: ''
  }, overrides);
}

// Wave 0 smoke: file loads, helpers import, server boots. Real /library coverage
// arrives in plans 02..06.
test('Wave 0 smoke: test scaffold loads and server boots', async () => {
  const res = await helpers.request(ctx.port, { path: '/healthz' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, 'ok');
});

// Plan 02: GET /library tests

test('GET /library renders empty page with id="library-panel" and empty-state message', async () => {
  const res = await helpers.request(ctx.port, { path: '/library' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="library-panel"/);
  assert.match(res.body, /Library is empty/);
  assert.strictEqual(res.headers['x-status-toast'], undefined);
});

test('GET /library lists seeded entries sorted alphabetically', async () => {
  seedLibrary([
    makeEntry({ id: 'lb_zzz', name: 'zebra' }),
    makeEntry({ id: 'lb_aaa', name: 'apple' }),
    makeEntry({ id: 'lb_mmm', name: 'monkey' })
  ]);
  const res = await helpers.request(ctx.port, { path: '/library' });
  assert.strictEqual(res.status, 200);
  const applePos = res.body.indexOf('>apple<');
  const monkeyPos = res.body.indexOf('>monkey<');
  const zebraPos = res.body.indexOf('>zebra<');
  assert.ok(applePos > -1, 'apple not found in body');
  assert.ok(monkeyPos > -1, 'monkey not found in body');
  assert.ok(zebraPos > -1, 'zebra not found in body');
  assert.ok(applePos < monkeyPos, 'apple should appear before monkey');
  assert.ok(monkeyPos < zebraPos, 'monkey should appear before zebra');
  // Each row has the expected id format
  assert.match(res.body, /id="library-row-lb_aaa"/);
  assert.match(res.body, /id="library-row-lb_mmm"/);
  assert.match(res.body, /id="library-row-lb_zzz"/);
});

test('GET /library renders [curated] and [uncurated] badges correctly', async () => {
  seedLibrary([
    makeEntry({ id: 'lb_aaa', name: 'apple',  curated: true }),
    makeEntry({ id: 'lb_bbb', name: 'beef',   curated: false })
  ]);
  const res = await helpers.request(ctx.port, { path: '/library' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /\[curated\]/);
  assert.match(res.body, /\[uncurated\]/);
});

test('GET /library renders [unused] badge when entry has no matching recipes', async () => {
  seedLibrary([makeEntry({ id: 'lb_aaa', name: 'apple', aliases: [] })]);
  // No recipes seeded — apple is unused
  const res = await helpers.request(ctx.port, { path: '/library' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /\[unused\]/);
});

test('GET /library does NOT render [unused] for an entry referenced by a recipe', async () => {
  seedLibrary([makeEntry({ id: 'lb_aaa', name: 'apple', aliases: ['apples'] })]);
  seedRecipes([{ id: 'r1', title: 'Pie', ingredients: ['apples'] }]);
  const res = await helpers.request(ctx.port, { path: '/library' });
  assert.strictEqual(res.status, 200);
  // The [unused] badge should NOT appear inside the apple row
  const rowStart = res.body.indexOf('id="library-row-lb_aaa"');
  const rowEnd = res.body.indexOf('</li>', rowStart);
  const rowHtml = res.body.slice(rowStart, rowEnd);
  assert.ok(!rowHtml.includes('[unused]'), `[unused] badge should not appear in apple row, got: ${rowHtml.slice(0, 200)}`);
});

test('GET /library?q=apple narrows to matching entries only', async () => {
  seedLibrary([
    makeEntry({ id: 'lb_aaa', name: 'apple' }),
    makeEntry({ id: 'lb_bbb', name: 'beef' }),
    makeEntry({ id: 'lb_ccc', name: 'cinnamon' })
  ]);
  const res = await helpers.request(ctx.port, { path: '/library?q=apple' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, />apple</);
  assert.doesNotMatch(res.body, />beef</);
  assert.doesNotMatch(res.body, />cinnamon</);
});

test('GET /library?filter=Uncurated shows only uncurated entries', async () => {
  seedLibrary([
    makeEntry({ id: 'lb_aaa', name: 'apple',    curated: true }),
    makeEntry({ id: 'lb_bbb', name: 'broccoli', curated: true }),
    makeEntry({ id: 'lb_ccc', name: 'corn',     curated: false })
  ]);
  const res = await helpers.request(ctx.port, { path: '/library?filter=Uncurated' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, />corn</);
  assert.doesNotMatch(res.body, />apple</);
  assert.doesNotMatch(res.body, />broccoli</);
});

test('GET /library?q=nope renders no-match empty state with Clear search button', async () => {
  seedLibrary([makeEntry({ id: 'lb_aaa', name: 'apple' })]);
  const res = await helpers.request(ctx.port, { path: '/library?q=nope' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /No entries match "nope"/);
  assert.match(res.body, /Clear search/);
});

test('GET /library page contains htmx-config meta tag from layout.njk (Plan 01 prerequisite)', async () => {
  const res = await helpers.request(ctx.port, { path: '/library' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /name="htmx-config"/);
  assert.match(res.body, /"code":"400","swap":true/);
});

test('GET /library page does not contain nav tab <a href="/library"> (atomic-tab-launch invariant)', async () => {
  const res = await helpers.request(ctx.port, { path: '/library' });
  assert.strictEqual(res.status, 200);
  assert.doesNotMatch(res.body, /<a[^>]*href="\/library"[^>]*class="tab/);
});

// Plan 03: GET /library/:id (read-only fragment) tests

test('GET /library/:id returns ONLY the row fragment (no full page)', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'apple', aliases: ['apples'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, { path: `/library/${entry.id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /^<li id="library-row-/);
  assert.doesNotMatch(res.body, /<html/);
  assert.doesNotMatch(res.body, /class="tabs"/);
});

test('GET /library/:id 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/lb_nope' });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body, 'Not found');
});

test('GET /library/:id includes [unused] badge when no recipe references the entry', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'parsnip', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  // No recipes seeded -- parsnip is unused
  const res = await helpers.request(ctx.port, { path: `/library/${entry.id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /\[unused\]/);
});

// Plan 03: GET /library/:id/edit (edit form fragment) tests

test('GET /library/:id/edit returns the edit form fragment', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'tomato', aliases: ['tomatoes'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, { path: `/library/${entry.id}/edit` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<form/);
  assert.match(res.body, /name="name"/);
  assert.match(res.body, /name="aliases"/);
  assert.match(res.body, /<select name="recipeCategory">/);
  assert.match(res.body, /<select name="groceryCategory">/);
  assert.match(res.body, /value="tomato"/);
  assert.doesNotMatch(res.body, /<html/);
});

test('GET /library/:id/edit pre-selects the current category in the select', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'broccoli', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, { path: `/library/${entry.id}/edit` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<option value="Veg"\s*selected/);
  assert.match(res.body, /<option value="Produce"\s*selected/);
});

test('GET /library/:id/edit 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { path: '/library/lb_nope/edit' });
  assert.strictEqual(res.status, 404);
});

// Plan 03: POST /library (manual create) tests

test('POST /library creates an entry with curated:true and OOB-swaps the panel', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    body: { name: 'tomato', aliases: 'tomatoes, roma', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="library-panel"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, />tomato</);
  assert.strictEqual(res.headers['x-status-toast'], 'Added entry');
  // Verify [curated] badge appears (not [uncurated])
  const rowStart = res.body.indexOf('id="library-panel"');
  assert.ok(rowStart > -1, 'library-panel not found in body');
  assert.match(res.body, /\[curated\]/);
  assert.doesNotMatch(res.body, /\[uncurated\]/);
});

test('POST /library 400s on missing name', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    body: { name: '   ', aliases: '', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /Name required/);
});

test('POST /library 400s on invalid recipeCategory', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    body: { name: 'thing', aliases: '', recipeCategory: 'Hax', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /Invalid recipe category/);
});

test('POST /library 400s on alias conflict', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const existing = newLibraryEntry({ name: 'garlic clove', aliases: ['garlic'], recipeCategory: 'Seasoning', groceryCategory: 'Produce', curated: true });
  seedLibrary([existing]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    body: { name: 'minced garlic', aliases: 'garlic', recipeCategory: 'Seasoning', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /Alias 'garlic'/);
  assert.match(res.body, /garlic clove/);
  // State must not have the second entry
  const state = storage.get();
  assert.strictEqual(state.library.length, 1, 'rejected entry must not be persisted');
});

test('POST /library dedupes aliases on submit', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library',
    body: { name: 'thing', aliases: 'a, a, b, , b ', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 200);
  // The rendered aliases display should be 'a, b' (not 'a, a, b, , b')
  assert.match(res.body, /a, b/);
  assert.doesNotMatch(res.body, /a, a/);
});

module.exports = { addLibraryEntry };
