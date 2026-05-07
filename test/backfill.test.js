const { test } = require('node:test');
const assert = require('node:assert');
const { runBackfill } = require('../lib/backfill');

// Pure tests for lib/backfill.js#runBackfill. No HTTP, no fs, no setupDataDir
// (D-50). Each test constructs a fresh plain state object inline. Per D-51
// the existing 284-test suite is untouched.

test('runBackfill seeds entries on first run with populated recipes (SC#2a)', () => {
  const state = {
    recipes: [{ id: 'r1', title: 'Soup', ingredients: ['salt', 'olive oil'] }],
    library: [],
    libraryMigratedAt: null
  };
  const result = runBackfill(state);
  assert.strictEqual(result.alreadyRan, false);
  assert.ok(state.library.length >= 1, 'state.library should be seeded on first run');
  assert.ok(result.added.length >= 1, 'result.added should report at least one new entry');
});

test('runBackfill sets libraryMigratedAt to an ISO timestamp on first run (SC#2b)', () => {
  const state = {
    recipes: [{ id: 'r1', title: 'Soup', ingredients: ['salt'] }],
    library: [],
    libraryMigratedAt: null
  };
  runBackfill(state);
  assert.match(state.libraryMigratedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('runBackfill flips timestamp on empty state.recipes (SC#2c / empty-recipes edge case)', () => {
  const state = { recipes: [], library: [], libraryMigratedAt: null };
  const result = runBackfill(state);
  assert.strictEqual(result.alreadyRan, false);
  assert.strictEqual(result.added.length, 0);
  assert.strictEqual(state.library.length, 0);
  assert.match(state.libraryMigratedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('runBackfill is idempotent on libraryMigratedAt truthy (SC#3)', () => {
  const state = {
    recipes: [{ id: 'r1', title: 'Soup', ingredients: ['salt', 'olive oil', 'onion'] }],
    library: [],
    libraryMigratedAt: null
  };
  runBackfill(state);
  const lengthAfterFirst = state.library.length;
  const timestampAfterFirst = state.libraryMigratedAt;
  assert.ok(lengthAfterFirst >= 1, 'precondition: first run should seed entries');
  assert.ok(timestampAfterFirst, 'precondition: first run should set timestamp');

  const second = runBackfill(state);
  assert.strictEqual(second.alreadyRan, true);
  assert.deepStrictEqual(second.added, []);
  assert.deepStrictEqual(second.aliasesAppended, []);
  assert.strictEqual(state.library.length, lengthAfterFirst, 'library length must be unchanged on idempotent re-run');
  assert.strictEqual(state.libraryMigratedAt, timestampAfterFirst, 'timestamp must be unchanged on idempotent re-run');
});

test('runBackfill seeds peanut butter as groceryCategory: Aisle (SC#4 - Phase 1 D-01 fix flows through)', () => {
  const state = {
    recipes: [{ id: 'r1', title: 'PB Cookies', ingredients: ['peanut butter'] }],
    library: [],
    libraryMigratedAt: null
  };
  runBackfill(state);
  const pb = state.library.find(e => e.name === 'peanut butter');
  assert.ok(pb, 'peanut butter entry should be seeded');
  assert.strictEqual(pb.groceryCategory, 'Aisle');
});

test('runBackfill skips non-array recipe.ingredients with console.warn (D-40)', () => {
  const state = {
    recipes: [
      { id: 'r-bad', title: 'Bad', ingredients: undefined },
      { id: 'r-good', title: 'Good', ingredients: ['salt'] }
    ],
    library: [],
    libraryMigratedAt: null
  };
  const originalWarn = console.warn;
  const calls = [];
  console.warn = (...args) => { calls.push(args.join(' ')); };
  try {
    const result = runBackfill(state);
    assert.ok(
      calls.some(line => line.includes('[backfill]') && line.includes('r-bad')),
      'expected backfill warn referencing the bad recipe id'
    );
    assert.strictEqual(result.alreadyRan, false);
    assert.ok(state.library.length >= 1, 'good recipe should still seed');
  } finally {
    console.warn = originalWarn;
  }
});

test('runBackfill catches per-recipe extractAndSeed throws and continues (D-41)', () => {
  const libraryMod = require('../lib/library');
  const originalExtractAndSeed = libraryMod.extractAndSeed;
  let call = 0;
  libraryMod.extractAndSeed = (s, ingredients) => {
    call += 1;
    if (call === 2) {
      throw new Error('forced backfill failure');
    }
    // Mutate state.library on success branches so length matches the assertion.
    if (!Array.isArray(s.library)) s.library = [];
    const stub = {
      id: 'lb_stub' + call,
      name: 'stub-' + call,
      aliases: [],
      recipeCategory: 'Other',
      groceryCategory: 'Other',
      curated: false,
      createdAt: new Date().toISOString()
    };
    s.library.push(stub);
    return { ok: true, added: [stub], aliasesAppended: [] };
  };

  const originalError = console.error;
  console.error = () => {};
  try {
    const state = {
      recipes: [
        { id: 'r1', title: 'A', ingredients: ['a'] },
        { id: 'r2', title: 'B', ingredients: ['b'] },
        { id: 'r3', title: 'C', ingredients: ['c'] }
      ],
      library: [],
      libraryMigratedAt: null
    };
    const result = runBackfill(state);
    assert.strictEqual(result.alreadyRan, false);
    assert.strictEqual(state.library.length, 2, 'first and third recipes should seed; second throws');
    assert.match(state.libraryMigratedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  } finally {
    libraryMod.extractAndSeed = originalExtractAndSeed;
    console.error = originalError;
  }
});

test('runBackfill short-circuits when libraryMigratedAt is the empty string (Pitfall 4)', () => {
  // Empty string is falsy -- treat as "not yet run", proceed with backfill.
  const state = {
    recipes: [{ id: 'r1', title: 'Soup', ingredients: ['salt'] }],
    library: [],
    libraryMigratedAt: ''
  };
  const result = runBackfill(state);
  assert.strictEqual(result.alreadyRan, false);
  assert.match(state.libraryMigratedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('runBackfill is defensive against non-array state.recipes (Pitfall 5)', () => {
  const state = { recipes: null, library: [], libraryMigratedAt: null };
  const result = runBackfill(state);
  assert.strictEqual(result.alreadyRan, false);
  assert.ok(Array.isArray(state.recipes), 'state.recipes should be coerced to []');
  assert.strictEqual(state.recipes.length, 0);
  assert.match(state.libraryMigratedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('runBackfill returns alreadyRan: true on null/undefined state', () => {
  const a = runBackfill(null);
  const b = runBackfill(undefined);
  assert.deepStrictEqual(a, { alreadyRan: true, added: [], aliasesAppended: [] });
  assert.deepStrictEqual(b, { alreadyRan: true, added: [], aliasesAppended: [] });
});
