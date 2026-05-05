const { test } = require('node:test');
const assert = require('node:assert');
const { buildView, sourceDomain, formatTotalTime } = require('../lib/calc');

test('buildView returns empty view for empty state', () => {
  const v = buildView({ recipes: [] });
  assert.deepStrictEqual(v.recipes, []);
  assert.strictEqual(v.hasRecipes, false);
});

test('buildView sorts recipes newest-first by addedAt', () => {
  const state = {
    recipes: [
      { id: 'a', title: 'Old',  addedAt: '2026-05-01T00:00:00.000Z' },
      { id: 'b', title: 'New',  addedAt: '2026-05-05T00:00:00.000Z' },
      { id: 'c', title: 'Mid',  addedAt: '2026-05-03T00:00:00.000Z' }
    ]
  };
  const v = buildView(state);
  assert.deepStrictEqual(v.recipes.map(r => r.title), ['New', 'Mid', 'Old']);
  assert.strictEqual(v.hasRecipes, true);
});

test('buildView decorates each recipe with sourceDomain', () => {
  const state = { recipes: [
    { id: 'a', title: 'X', sourceUrl: 'https://www.smittenkitchen.com/2024/01/recipe', addedAt: '2026-05-05T00:00:00Z' }
  ]};
  const v = buildView(state);
  assert.strictEqual(v.recipes[0].sourceDomain, 'smittenkitchen.com');
});

test('sourceDomain strips www and path', () => {
  assert.strictEqual(sourceDomain('https://www.allrecipes.com/recipe/123'), 'allrecipes.com');
  assert.strictEqual(sourceDomain('https://cooking.nytimes.com/recipes/abc'), 'cooking.nytimes.com');
  assert.strictEqual(sourceDomain('not a url'), '');
  assert.strictEqual(sourceDomain(null), '');
});

test('formatTotalTime renders minutes as "1h 30m" / "45m" / null-friendly', () => {
  assert.strictEqual(formatTotalTime(90), '1h 30m');
  assert.strictEqual(formatTotalTime(45), '45m');
  assert.strictEqual(formatTotalTime(120), '2h');
  assert.strictEqual(formatTotalTime(null), '');
  assert.strictEqual(formatTotalTime(0), '');
});
