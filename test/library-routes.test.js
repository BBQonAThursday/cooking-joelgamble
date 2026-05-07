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

module.exports = { addLibraryEntry };
