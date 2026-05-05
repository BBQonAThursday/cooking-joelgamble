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

test('buildView sets activeTab to "recipes"', () => {
  const view = buildView({ recipes: [] }, new Date(2026, 4, 5));
  assert.strictEqual(view.activeTab, 'recipes');
});

test('buildView marks recipes tagged in the active week with isTagged=true', () => {
  const state = {
    recipes: [
      { id: 'a', title: 'A', addedAt: '2026-05-01T00:00:00Z' },
      { id: 'b', title: 'B', addedAt: '2026-05-02T00:00:00Z' }
    ],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: false, modifiedAfterConfirm: false }]
  };
  const view = buildView(state, new Date(2026, 4, 5));
  const a = view.recipes.find(r => r.id === 'a');
  const b = view.recipes.find(r => r.id === 'b');
  assert.strictEqual(a.isTagged, true);
  assert.strictEqual(b.isTagged, false);
});

test('buildView returns isTagged=false when there is no active week', () => {
  const state = { recipes: [{ id: 'a', title: 'A', addedAt: '2026-05-01T00:00:00Z' }] };
  const view = buildView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.recipes[0].isTagged, false);
});

const { buildWeeklyView } = require('../lib/calc');

test('buildWeeklyView returns the active week and decorated tagged recipes', () => {
  const state = {
    recipes: [
      { id: 'a', title: 'A', sourceUrl: 'https://x.com/a', totalMinutes: 30, ingredients: ['eggs'] },
      { id: 'b', title: 'B', sourceUrl: 'https://x.com/b', totalMinutes: 60, ingredients: ['flour'] }
    ],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a', 'b'], confirmed: false, modifiedAfterConfirm: false }]
  };
  const view = buildWeeklyView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.activeTab, 'this-week');
  assert.strictEqual(view.weekRecipeCount, 2);
  assert.strictEqual(view.weekRecipes[0].title, 'A');
  assert.strictEqual(view.weekRecipes[0].sourceDomain, 'x.com');
  assert.strictEqual(view.weekRecipes[0].totalTimeLabel, '30m');
  assert.strictEqual(view.weekRecipes[0].isTagged, true);
});

test('buildWeeklyView filters out dangling recipe ids', () => {
  const state = {
    recipes: [{ id: 'a', title: 'A', sourceUrl: 'https://x.com/a', ingredients: [] }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a', 'deleted'], confirmed: false, modifiedAfterConfirm: false }]
  };
  const view = buildWeeklyView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.weekRecipeCount, 1);
  assert.strictEqual(view.weekRecipes[0].id, 'a');
});

test('buildWeeklyView reports pendingIngredientCount minus existing grocery dupes', () => {
  const state = {
    recipes: [{ id: 'a', title: 'A', sourceUrl: 'https://x.com/a', ingredients: ['eggs', 'milk', 'flour'] }],
    weeks: [{ weekStart: '2026-05-04', recipeIds: ['a'], confirmed: false, modifiedAfterConfirm: false }],
    grocery: [{ id: 'g_a', text: 'eggs', checked: false }]
  };
  const view = buildWeeklyView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.pendingIngredientCount, 2); // milk, flour
});

test('buildWeeklyView returns an empty active week when none exists in state', () => {
  const view = buildWeeklyView({ recipes: [] }, new Date(2026, 4, 5));
  assert.strictEqual(view.weekRecipeCount, 0);
  assert.strictEqual(view.week.weekStart, '2026-05-04');
  assert.strictEqual(view.week.confirmed, false);
});
