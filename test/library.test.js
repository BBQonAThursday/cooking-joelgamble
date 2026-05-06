const { test } = require('node:test');
const assert = require('node:assert');
const { newLibraryId, newLibraryEntry, aliasConflict } = require('../lib/library');

// --- newLibraryId ----------------------------------------------------------

test('newLibraryId returns strings matching /^lb_[0-9a-z]{8}$/', () => {
  for (let i = 0; i < 50; i++) {
    const id = newLibraryId();
    assert.match(id, /^lb_[0-9a-z]{8}$/);
  }
});

test('newLibraryId returns unique values across many calls', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) ids.add(newLibraryId());
  // base36^8 = ~2.8e12, 1000 draws should not collide in practice.
  assert.strictEqual(ids.size, 1000);
});

// --- newLibraryEntry -------------------------------------------------------

test('newLibraryEntry returns the canonical entry shape with all required fields', () => {
  const entry = newLibraryEntry({
    name: 'garlic',
    recipeCategory: 'Veg',
    groceryCategory: 'Produce',
    aliases: ['garlic', 'cloves of garlic'],
    curated: true
  });
  assert.match(entry.id, /^lb_[0-9a-z]{8}$/);
  assert.strictEqual(entry.name, 'garlic');
  assert.deepStrictEqual(entry.aliases, ['garlic', 'cloves of garlic']);
  assert.strictEqual(entry.recipeCategory, 'Veg');
  assert.strictEqual(entry.groceryCategory, 'Produce');
  assert.strictEqual(entry.curated, true);
  assert.match(entry.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('newLibraryEntry defaults aliases to [] when omitted', () => {
  const entry = newLibraryEntry({ name: 'salt', recipeCategory: 'Seasoning', groceryCategory: 'Aisle' });
  assert.deepStrictEqual(entry.aliases, []);
});

test('newLibraryEntry defaults curated to false when omitted', () => {
  const entry = newLibraryEntry({ name: 'salt', recipeCategory: 'Seasoning', groceryCategory: 'Aisle' });
  assert.strictEqual(entry.curated, false);
});

test('newLibraryEntry coerces curated to a boolean', () => {
  const truthy = newLibraryEntry({ name: 'a', recipeCategory: 'Veg', groceryCategory: 'Produce', curated: 'yes' });
  const falsy  = newLibraryEntry({ name: 'b', recipeCategory: 'Veg', groceryCategory: 'Produce', curated: 0 });
  assert.strictEqual(truthy.curated, true);
  assert.strictEqual(falsy.curated, false);
});

test('newLibraryEntry does NOT include a nutrition placeholder (D-08)', () => {
  const entry = newLibraryEntry({ name: 'a', recipeCategory: 'Veg', groceryCategory: 'Produce' });
  assert.strictEqual('nutrition' in entry, false);
});

test('newLibraryEntry sets a fresh ISO timestamp on each call', () => {
  const before = Date.now();
  const entry = newLibraryEntry({ name: 'a', recipeCategory: 'Veg', groceryCategory: 'Produce' });
  const after = Date.now();
  const t = Date.parse(entry.createdAt);
  assert.ok(t >= before && t <= after, 'createdAt should be within the test window');
});

// --- aliasConflict ---------------------------------------------------------

test('aliasConflict returns the conflicting entry when two entries share a normalized alias', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'olive oil', aliases: ['olive oil'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const conflict = aliasConflict(state, 'garlic');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_aaaaaaaa');
});

test('aliasConflict is case- and whitespace-insensitive (trim + toLowerCase only -- D-04)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'olive oil', aliases: ['olive oil'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.ok(aliasConflict(state, '  Olive Oil  '));
  assert.ok(aliasConflict(state, 'OLIVE OIL'));
});

test('aliasConflict returns falsy when no entry shares the alias', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.ok(!aliasConflict(state, 'red onion'));
});

test('aliasConflict returns falsy when the only matching entry is the excludingId (Phase 1 SC#3)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.ok(!aliasConflict(state, 'garlic', 'lb_aaaaaaaa'));
});

test('aliasConflict still finds a conflict in a DIFFERENT entry when excludingId is set', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'roasted garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  // Excluding 'aaaaaaaa' should still surface the duplicate alias on 'bbbbbbbb'.
  const conflict = aliasConflict(state, 'garlic', 'lb_aaaaaaaa');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_bbbbbbbb');
});

test('aliasConflict tolerates a state with no library array', () => {
  assert.ok(!aliasConflict({}, 'garlic'));
  assert.ok(!aliasConflict({ library: null }, 'garlic'));
  assert.ok(!aliasConflict({ library: 'nope' }, 'garlic'));
});

test('aliasConflict returns falsy for empty/whitespace alias input', () => {
  const state = { library: [{ id: 'lb_aaaaaaaa', name: 'a', aliases: ['a'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' }] };
  assert.ok(!aliasConflict(state, ''));
  assert.ok(!aliasConflict(state, '   '));
  assert.ok(!aliasConflict(state, null));
});
