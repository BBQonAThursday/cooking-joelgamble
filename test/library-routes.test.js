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

// Plan 04: POST /library/:id (edit-save) tests

// Success path 1: updates entry, returns read-only row + OOB footer.
test('POST /library/:id updates the entry and OOB-swaps the footer', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const apple = newLibraryEntry({ name: 'apple', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false });
  const beef  = newLibraryEntry({ name: 'beef',  aliases: [],  recipeCategory: 'Protein', groceryCategory: 'Meat', curated: true });
  seedLibrary([apple, beef]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${apple.id}`,
    body: { name: 'apple', aliases: 'apples, gala', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 200);
  // Body must be the read-only row (not the edit form) -- li tag with id, no <form
  assert.match(res.body, new RegExp(`<li[^>]*id="library-row-${apple.id}"[^>]*class="library-row"`));
  assert.doesNotMatch(res.body, /<form/);
  // Body must contain the OOB footer
  assert.match(res.body, /id="library-footer"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  // Toast set
  assert.strictEqual(res.headers['x-status-toast'], 'Saved entry');
  // State reflects updated aliases
  const after = await helpers.request(ctx.port, { path: '/library' });
  assert.match(after.body, /apples, gala/);
});

// Success path 2: sets curated:true on a previously uncurated entry (LIB-05).
test('POST /library/:id sets curated:true on a previously uncurated entry (LIB-05)', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'carrot', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${entry.id}`,
    body: { name: 'carrot', aliases: '', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 200);
  // Row should show [curated] not [uncurated]
  assert.match(res.body, /\[curated\]/);
  assert.doesNotMatch(res.body, /\[uncurated\]/);
  // Verify state directly
  const state = storage.get();
  const saved = state.library.find(e => e.id === entry.id);
  assert.strictEqual(saved.curated, true, 'curated must be true after save');
});

// Success path 3: no-op save with own alias does not trigger alias conflict.
test('POST /library/:id no-op save (same alias) succeeds -- excludingId works', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'garlic', aliases: ['garlic clove'], recipeCategory: 'Seasoning', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${entry.id}`,
    body: { name: 'garlic', aliases: 'garlic clove', recipeCategory: 'Seasoning', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 200, 'Self-alias re-submit must succeed, not 400');
});

// 400 path 1: missing name returns edit-form with inline error, no toast.
test('POST /library/:id 400s on missing name and returns edit-form fragment with inline error', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'pear', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${entry.id}`,
    body: { name: '   ', aliases: 'x', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /<form/);
  assert.match(res.body, /library-alias-error/);
  assert.match(res.body, /Name is required/);
  // D-61: no toast on 400
  assert.ok(!res.headers['x-status-toast'], 'No toast header on 400 (D-61)');
});

// 400 path 2: alias conflict preserves user-typed values in the re-rendered form.
test('POST /library/:id 400s on alias conflict and preserves user-typed values', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const apple = newLibraryEntry({ name: 'apple', aliases: ['apples'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  const beef  = newLibraryEntry({ name: 'beef',  aliases: ['cow'],    recipeCategory: 'Protein', groceryCategory: 'Meat', curated: true });
  seedLibrary([apple, beef]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${beef.id}`,
    body: { name: 'cattle', aliases: 'apples', recipeCategory: 'Protein', groceryCategory: 'Meat' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /<form/);
  // Nunjucks autoescape: single quotes become &#39; in the HTML output
  assert.match(res.body, /Alias (&#39;|')apples(&#39;|') is already used by (&#39;|')apple(&#39;|')\./);
  // User-typed values preserved in the form
  assert.match(res.body, /value="cattle"/);
  assert.match(res.body, /value="apples"/);
  assert.match(res.body, /<option value="Protein"\s*selected/);
  // State unchanged: beef still has alias 'cow'
  const after = await helpers.request(ctx.port, { path: '/library' });
  assert.match(after.body, /cow/);
});

// 400 path 3: invalid recipeCategory.
test('POST /library/:id 400s on invalid recipeCategory', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'thing', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${entry.id}`,
    body: { name: 'thing', aliases: '', recipeCategory: 'Hax', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /<form/);
  // Nunjucks autoescape: single quotes become &#39; in the HTML output
  assert.match(res.body, /Invalid recipe category (&#39;|')Hax(&#39;|')\./);
});

// 400 path 4: invalid groceryCategory.
test('POST /library/:id 400s on invalid groceryCategory', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'stuff', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${entry.id}`,
    body: { name: 'stuff', aliases: '', recipeCategory: 'Veg', groceryCategory: 'Sky' }
  });
  assert.strictEqual(res.status, 400);
  assert.match(res.body, /<form/);
  // Nunjucks autoescape: single quotes become &#39; in the HTML output
  assert.match(res.body, /Invalid grocery category (&#39;|')Sky(&#39;|')\./);
});

// 404 path.
test('POST /library/:id 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_nope',
    body: { name: 'whatever', aliases: '', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body, 'Not found');
});

// Alias deduplication.
test('POST /library/:id dedupes aliases via Set', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'fig', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  seedLibrary([entry]);
  const res = await helpers.request(ctx.port, {
    method: 'POST',
    path: `/library/${entry.id}`,
    body: { name: 'fig', aliases: 'a, a, b, b, ', recipeCategory: 'Veg', groceryCategory: 'Produce' }
  });
  assert.strictEqual(res.status, 200);
  // Saved row should show deduped aliases 'a, b'
  assert.match(res.body, /a, b/);
  assert.doesNotMatch(res.body, /a, a/);
});

// Plan 05: DELETE /library/:id tests

// Test 1: removes the entry from state.library
test('DELETE /library/:id removes the entry and OOB-swaps the footer', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const apple = newLibraryEntry({ name: 'apple', aliases: [], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  const beef  = newLibraryEntry({ name: 'beef',  aliases: [], recipeCategory: 'Protein', groceryCategory: 'Meat', curated: true });
  seedLibrary([apple, beef]);

  const res = await helpers.request(ctx.port, {
    method: 'DELETE',
    path: `/library/${apple.id}`
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['x-status-toast'], 'Removed entry');
  // Response must contain the OOB footer
  assert.match(res.body, /id="library-footer"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  // The response body must NOT contain the deleted row id (no full-page leak)
  assert.doesNotMatch(res.body, new RegExp(`id="library-row-${apple.id}"`));
  // State: apple gone, beef remains
  const state = storage.get();
  assert.strictEqual(state.library.length, 1);
  assert.strictEqual(state.library[0].id, beef.id);
});

// Test 2: LIB-06 regression — state.recipes MUST NOT be mutated
test('DELETE /library/:id does NOT mutate state.recipes (LIB-06 regression)', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const apple = newLibraryEntry({ name: 'apple', aliases: ['apples', 'sliced apples'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true });
  const beef  = newLibraryEntry({ name: 'beef',  aliases: [], recipeCategory: 'Protein', groceryCategory: 'Meat', curated: true });
  seedLibrary([apple, beef]);
  seedRecipes([
    { id: 'r1', title: 'pie',  ingredients: ['apples', 'sugar'],        addedAt: '2026-05-01' },
    { id: 'r2', title: 'tart', ingredients: ['sliced apples', 'butter'], addedAt: '2026-05-02' }
  ]);

  // Deep-copy snapshot of recipes BEFORE the delete
  const snapshot = JSON.parse(JSON.stringify(storage.get().recipes));

  const res = await helpers.request(ctx.port, {
    method: 'DELETE',
    path: `/library/${apple.id}`
  });

  assert.strictEqual(res.status, 200);

  const after = storage.get();
  // recipes array length unchanged
  assert.strictEqual(after.recipes.length, snapshot.length, 'recipes.length must be unchanged');
  // Each recipe's ingredients arrays must be identical
  for (let i = 0; i < snapshot.length; i++) {
    assert.deepStrictEqual(
      after.recipes[i].ingredients,
      snapshot[i].ingredients,
      `recipes[${i}].ingredients must be unchanged after delete`
    );
  }
  // Library correctly reduced by one
  assert.strictEqual(after.library.length, 1);
});

// Test 3: 404 for unknown id
test('DELETE /library/:id 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'DELETE',
    path: '/library/lb_nope'
  });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body, 'Not found');
  // State unchanged (empty library from beforeEach)
  const state = storage.get();
  assert.ok(!Array.isArray(state.library) || state.library.length === 0);
});

// Test 4: footer unusedCount pluralization — singular vs plural vs zero
test('DELETE /library/:id updates the footer unusedCount (pluralization branches)', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const e1 = newLibraryEntry({ name: 'alpha',   aliases: [], recipeCategory: 'Other', groceryCategory: 'Other', curated: false });
  const e2 = newLibraryEntry({ name: 'bravo',   aliases: [], recipeCategory: 'Other', groceryCategory: 'Other', curated: false });
  const e3 = newLibraryEntry({ name: 'charlie', aliases: [], recipeCategory: 'Other', groceryCategory: 'Other', curated: false });
  seedLibrary([e1, e2, e3]);
  // No recipes seeded -- all 3 are unused (unusedCount starts at 3)

  // Delete e1 -> unusedCount should be 2 (plural)
  const res1 = await helpers.request(ctx.port, {
    method: 'DELETE',
    path: `/library/${e1.id}`
  });
  assert.strictEqual(res1.status, 200);
  assert.match(res1.body, /id="library-footer"/);
  assert.match(res1.body, /2 unused entries/);

  // Delete e2 -> unusedCount should be 1 (singular)
  const res2 = await helpers.request(ctx.port, {
    method: 'DELETE',
    path: `/library/${e2.id}`
  });
  assert.strictEqual(res2.status, 200);
  assert.match(res2.body, /id="library-footer"/);
  assert.match(res2.body, /1 unused entry/);
});

// Test 5: idempotency-of-delete — second DELETE returns 404
test('DELETE /library/:id idempotency-of-delete (second call returns 404)', async () => {
  const { newLibraryEntry } = require('../lib/library');
  const entry = newLibraryEntry({ name: 'dupe', aliases: [], recipeCategory: 'Other', groceryCategory: 'Other', curated: true });
  seedLibrary([entry]);

  // First DELETE: should succeed
  const res1 = await helpers.request(ctx.port, {
    method: 'DELETE',
    path: `/library/${entry.id}`
  });
  assert.strictEqual(res1.status, 200, 'first DELETE must return 200');

  // Second DELETE: entry already gone, must 404
  const res2 = await helpers.request(ctx.port, {
    method: 'DELETE',
    path: `/library/${entry.id}`
  });
  assert.strictEqual(res2.status, 404, 'second DELETE must return 404');
  assert.strictEqual(res2.body, 'Not found');
});

module.exports = { addLibraryEntry };
