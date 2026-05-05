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

test('migrate fills missing weeks onto an existing state', () => {
  const m = storage.migrateForTest({ recipes: [] });
  assert.deepStrictEqual(m.weeks, []);
});

test('migrate fills missing grocery onto an existing state', () => {
  const m = storage.migrateForTest({ recipes: [], weeks: [] });
  assert.deepStrictEqual(m.grocery, []);
});

test('migrate coerces non-array weeks to []', () => {
  const m = storage.migrateForTest({ recipes: [], weeks: 'nope' });
  assert.deepStrictEqual(m.weeks, []);
});

test('migrate coerces non-array grocery to []', () => {
  const m = storage.migrateForTest({ recipes: [], grocery: { not: 'an array' } });
  assert.deepStrictEqual(m.grocery, []);
});

test('migrate preserves existing weeks and grocery', () => {
  const existing = {
    recipes: [],
    weeks: [{ weekStart: '2026-04-27', recipeIds: ['x'], confirmed: true, modifiedAfterConfirm: false }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  const m = storage.migrateForTest(existing);
  assert.strictEqual(m.weeks.length, 1);
  assert.strictEqual(m.weeks[0].weekStart, '2026-04-27');
  assert.strictEqual(m.grocery.length, 1);
  assert.strictEqual(m.grocery[0].text, 'eggs');
});

test('defaultState contains empty weeks and grocery arrays', () => {
  const s = storage.defaultState();
  assert.deepStrictEqual(s.weeks, []);
  assert.deepStrictEqual(s.grocery, []);
});
