const { test } = require('node:test');
const assert = require('node:assert');
const { mondayOf } = require('../lib/week');

test('mondayOf returns the same date when given a Monday', () => {
  // 2026-05-04 is a Monday
  assert.strictEqual(mondayOf(new Date(2026, 4, 4)), '2026-05-04');
});

test('mondayOf returns the prior Monday when given a Tuesday', () => {
  assert.strictEqual(mondayOf(new Date(2026, 4, 5)), '2026-05-04');
});

test('mondayOf returns the prior Monday when given a Sunday', () => {
  // 2026-05-10 is a Sunday → Mon = 2026-05-04
  assert.strictEqual(mondayOf(new Date(2026, 4, 10)), '2026-05-04');
});

test('mondayOf strips time-of-day', () => {
  assert.strictEqual(mondayOf(new Date(2026, 4, 5, 23, 59, 59)), '2026-05-04');
});

test('mondayOf zero-pads months and days', () => {
  // 2026-01-04 is a Sunday → Mon = 2025-12-29
  assert.strictEqual(mondayOf(new Date(2026, 0, 4)), '2025-12-29');
});

test('mondayOf works across DST transitions (US spring-forward)', () => {
  // 2026-03-08 is a Sunday and is the US DST start in 2026 → Mon = 2026-03-02
  assert.strictEqual(mondayOf(new Date(2026, 2, 8)), '2026-03-02');
});

const { ensureCurrentWeek } = require('../lib/week');

test('ensureCurrentWeek creates an empty week when none exists', () => {
  const state = { recipes: [], weeks: [], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(week.weekStart, '2026-05-04');
  assert.deepStrictEqual(week.recipeIds, []);
  assert.strictEqual(week.confirmed, false);
  assert.strictEqual(week.modifiedAfterConfirm, false);
  assert.strictEqual(state.weeks.length, 1);
  assert.strictEqual(state.weeks[0], week);
});

test('ensureCurrentWeek returns the existing active week', () => {
  const existing = { weekStart: '2026-05-04', recipeIds: ['abc'], confirmed: true, modifiedAfterConfirm: false };
  const state = { recipes: [], weeks: [existing], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 7));
  assert.strictEqual(week, existing);
  assert.strictEqual(state.weeks.length, 1);
});

test('ensureCurrentWeek leaves prior weeks alone', () => {
  const past = { weekStart: '2026-04-27', recipeIds: ['x'], confirmed: true, modifiedAfterConfirm: false };
  const state = { recipes: [], weeks: [past], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.notStrictEqual(week, past);
  assert.strictEqual(state.weeks.length, 2);
  assert.strictEqual(state.weeks[0], past);
  assert.strictEqual(week.weekStart, '2026-05-04');
});

test('ensureCurrentWeek tolerates missing weeks array', () => {
  const state = { recipes: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.ok(Array.isArray(state.weeks));
  assert.strictEqual(state.weeks[0], week);
});

const { tagRecipe } = require('../lib/week');

test('tagRecipe adds a recipe id to the active week', () => {
  const state = { recipes: [{ id: 'abc' }], weeks: [], grocery: [] };
  const result = tagRecipe(state, 'abc', new Date(2026, 4, 5));
  assert.deepStrictEqual(result, { ok: true, isTagged: true });
  assert.deepStrictEqual(state.weeks[0].recipeIds, ['abc']);
});

test('tagRecipe toggles off a previously tagged recipe', () => {
  const state = {
    recipes: [{ id: 'abc' }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['abc'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  const result = tagRecipe(state, 'abc', new Date(2026, 4, 5));
  assert.deepStrictEqual(result, { ok: true, isTagged: false });
  assert.deepStrictEqual(state.weeks[0].recipeIds, []);
});

test('tagRecipe rejects an unknown recipe id', () => {
  const state = { recipes: [{ id: 'abc' }], weeks: [], grocery: [] };
  const result = tagRecipe(state, 'zzz', new Date(2026, 4, 5));
  assert.deepStrictEqual(result, { ok: false, reason: 'unknown recipe' });
  assert.strictEqual(state.weeks.length, 0);
});

test('tagRecipe sets modifiedAfterConfirm when the active week was confirmed', () => {
  const state = {
    recipes: [{ id: 'abc' }, { id: 'def' }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['abc'], confirmed: true, modifiedAfterConfirm: false }],
    grocery: []
  };
  tagRecipe(state, 'def', new Date(2026, 4, 5));
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, true);
});

test('tagRecipe does not flip modifiedAfterConfirm when the week is not yet confirmed', () => {
  const state = {
    recipes: [{ id: 'abc' }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: [], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  tagRecipe(state, 'abc', new Date(2026, 4, 5));
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, false);
});

const { confirmWeek, unconfirmWeek } = require('../lib/week');

function recipe(id, ingredients) {
  return { id, title: id, sourceUrl: `https://x/${id}`, ingredients };
}

test('confirmWeek imports tagged recipes ingredients (deduped)', () => {
  const state = {
    recipes: [
      recipe('a', ['eggs', '2 tbsp salt']),
      recipe('b', ['flour', 'eggs'])
    ],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a', 'b'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.addedCount, 3); // eggs, salt, flour (eggs deduped)
  assert.strictEqual(state.grocery.length, 3);
  assert.strictEqual(state.weeks[0].confirmed, true);
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, false);
});

test('confirmWeek skips ingredients already in grocery (string-equal)', () => {
  const state = {
    recipes: [recipe('a', ['eggs', 'milk'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(result.addedCount, 1);
  assert.strictEqual(state.grocery.length, 2);
  assert.ok(state.grocery.some(g => g.text === 'milk'));
});

test('confirmWeek returns addedCount=0 when all ingredients are dupes', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.addedCount, 0);
  assert.strictEqual(state.weeks[0].confirmed, true);
});

test('confirmWeek rejects when no recipes are tagged', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: [], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.deepStrictEqual(result, { ok: false, reason: 'no recipes tagged' });
  assert.strictEqual(state.weeks[0].confirmed, false);
});

test('confirmWeek filters out tagged ids that no longer exist in recipes', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a', 'deleted-id'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: []
  };
  const result = confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.addedCount, 1);
});

test('confirmWeek clears modifiedAfterConfirm', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: true, modifiedAfterConfirm: true }],
    grocery: []
  };
  confirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, false);
});

test('unconfirmWeek clears confirmed and modifiedAfterConfirm without removing grocery items', () => {
  const state = {
    recipes: [recipe('a', ['eggs'])],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: true, modifiedAfterConfirm: true }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  unconfirmWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(state.weeks[0].confirmed, false);
  assert.strictEqual(state.weeks[0].modifiedAfterConfirm, false);
  assert.strictEqual(state.grocery.length, 1);
});
