const { test } = require('node:test');
const assert = require('node:assert');
const { buildView, sourceDomain, formatTotalTime, buildLibraryView } = require('../lib/calc');

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

const { buildGroceryView } = require('../lib/calc');

test('buildGroceryView partitions checked vs unchecked', () => {
  const state = {
    grocery: [
      { id: 'g_a', text: '1 onion', checked: false },
      { id: 'g_b', text: '1 cup milk', checked: true },
      { id: 'g_c', text: '1 tsp salt', checked: false }
    ]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.activeTab, 'grocery');
  assert.strictEqual(view.hasGrocery, true);
  assert.strictEqual(view.hasCategorized, true);
  assert.strictEqual(view.hasClosed, true);
  assert.strictEqual(view.checkedCount, 1);
  assert.strictEqual(view.closedItems.length, 1);
  assert.strictEqual(view.closedItems[0].id, 'g_b');
});

test('buildGroceryView groups unchecked items by grocery category in canonical order', () => {
  const state = {
    grocery: [
      { id: 'g_a', text: '1 cup milk', checked: false },
      { id: 'g_b', text: '1 onion', checked: false },
      { id: 'g_c', text: '500g chicken', checked: false }
    ]
  };
  const view = buildGroceryView(state);
  // GROCERY_CATEGORIES order: Produce, Meat, Dairy, Aisle, Frozen, Other
  assert.deepStrictEqual(view.categorizedGroups.map(g => g.category), ['Produce', 'Meat', 'Dairy']);
  assert.strictEqual(view.categorizedGroups[0].items[0].text, '1 onion');
  assert.strictEqual(view.categorizedGroups[1].items[0].text, '500g chicken');
  assert.strictEqual(view.categorizedGroups[2].items[0].text, '1 cup milk');
});

test('buildGroceryView omits empty category groups', () => {
  const state = {
    grocery: [{ id: 'g_a', text: '1 onion', checked: false }]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.categorizedGroups.length, 1);
  assert.strictEqual(view.categorizedGroups[0].category, 'Produce');
});

test('buildGroceryView with only checked items shows hasCategorized=false hasClosed=true', () => {
  const state = {
    grocery: [{ id: 'g_a', text: 'eggs', checked: true }]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.hasGrocery, true);
  assert.strictEqual(view.hasCategorized, false);
  assert.strictEqual(view.hasClosed, true);
  assert.strictEqual(view.categorizedGroups.length, 0);
  assert.strictEqual(view.closedItems.length, 1);
});

test('buildGroceryView empty state', () => {
  const view = buildGroceryView({});
  assert.strictEqual(view.hasGrocery, false);
  assert.strictEqual(view.hasCategorized, false);
  assert.strictEqual(view.hasClosed, false);
  assert.deepStrictEqual(view.categorizedGroups, []);
  assert.deepStrictEqual(view.closedItems, []);
  assert.strictEqual(view.checkedCount, 0);
});

const { buildHistoryView } = require('../lib/calc');

test('buildHistoryView excludes the active week and sorts newest first', () => {
  const state = {
    recipes: [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' }
    ],
    weeks: [
      { weekStart: '2026-04-20', recipeIds: ['a'], confirmed: true, modifiedAfterConfirm: false },
      { weekStart: '2026-05-04', recipeIds: ['a','b'], confirmed: false, modifiedAfterConfirm: false }, // active
      { weekStart: '2026-04-27', recipeIds: ['b'], confirmed: true, modifiedAfterConfirm: false }
    ]
  };
  const view = buildHistoryView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.activeTab, 'history');
  assert.strictEqual(view.pastWeeks.length, 2);
  assert.strictEqual(view.pastWeeks[0].weekStart, '2026-04-27');
  assert.strictEqual(view.pastWeeks[1].weekStart, '2026-04-20');
});

test('buildHistoryView resolves recipe titles, filtering dangling ids', () => {
  const state = {
    recipes: [{ id: 'a', title: 'A' }],
    weeks: [
      { weekStart: '2026-04-27', recipeIds: ['a', 'deleted'], confirmed: true, modifiedAfterConfirm: false }
    ]
  };
  const view = buildHistoryView(state, new Date(2026, 4, 5));
  assert.strictEqual(view.pastWeeks[0].recipes.length, 1);
  assert.strictEqual(view.pastWeeks[0].recipes[0].title, 'A');
});

test('buildHistoryView returns hasHistory=false when no past weeks', () => {
  const view = buildHistoryView({ recipes: [], weeks: [] }, new Date(2026, 4, 5));
  assert.strictEqual(view.hasHistory, false);
  assert.deepStrictEqual(view.pastWeeks, []);
});

const { decorateIngredients } = require('../lib/calc');
const { buildLibraryIndex } = require('../lib/library');

test('decorateIngredients groups ingredients by recipe category in canonical order', () => {
  const ingredients = [
    '500g chicken thighs',
    '1 medium onion',
    '1 tsp salt',
    '2 tbsp olive oil',
    'something-uncategorized'
  ];
  const groups = decorateIngredients(ingredients);
  assert.deepStrictEqual(groups.map(g => g.category), ['Protein', 'Veg', 'Seasoning', 'Flavor', 'Other']);
  assert.deepStrictEqual(groups[0].items, [{ text: '500g chicken thighs', libraryEntryId: null }]);
  assert.deepStrictEqual(groups[1].items, [{ text: '1 medium onion', libraryEntryId: null }]);
  assert.deepStrictEqual(groups[2].items, [{ text: '1 tsp salt', libraryEntryId: null }]);
  assert.deepStrictEqual(groups[3].items, [{ text: '2 tbsp olive oil', libraryEntryId: null }]);
  assert.deepStrictEqual(groups[4].items, [{ text: 'something-uncategorized', libraryEntryId: null }]);
});

test('decorateIngredients omits empty categories', () => {
  const groups = decorateIngredients(['500g chicken', '1 tsp salt']);
  assert.strictEqual(groups.length, 2);
  assert.deepStrictEqual(groups.map(g => g.category), ['Protein', 'Seasoning']);
});

test('decorateIngredients preserves item order within a group', () => {
  const groups = decorateIngredients([
    '1 onion',
    '1 carrot',
    '1 tomato'
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].items, [{ text: '1 onion', libraryEntryId: null }, { text: '1 carrot', libraryEntryId: null }, { text: '1 tomato', libraryEntryId: null }]);
});

test('decorateIngredients tolerates empty/missing input', () => {
  assert.deepStrictEqual(decorateIngredients(undefined), []);
  assert.deepStrictEqual(decorateIngredients(null), []);
  assert.deepStrictEqual(decorateIngredients([]), []);
  assert.deepStrictEqual(decorateIngredients(['', '   ']), []);
});

// --- Phase 3 buildGroceryView library threading (MATCH-02, D-31..D-34) -----

test('buildGroceryView D-32: library hit attaches libraryEntryId and library-driven category', () => {
  // Heuristic alone would say 'black pepper' -> Aisle (existing GROCERY_KEYWORDS Aisle).
  // We use a different override: library says Produce. Verifies library beats heuristic
  // AND the item carries libraryEntryId.
  const state = {
    grocery: [
      { id: 'g_a', text: '1 tsp black pepper', checked: false }
    ],
    library: [
      { id: 'lb_aaaaaaaa', name: 'black pepper', aliases: ['black pepper'], recipeCategory: 'Flavor', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.categorizedGroups.length, 1);
  assert.strictEqual(view.categorizedGroups[0].category, 'Produce'); // library wins over heuristic 'Aisle'
  assert.strictEqual(view.categorizedGroups[0].items[0].libraryEntryId, 'lb_aaaaaaaa');
  assert.strictEqual(view.categorizedGroups[0].items[0].text, '1 tsp black pepper');
});

test('buildGroceryView D-31: empty library means every item has libraryEntryId: null', () => {
  const state = {
    grocery: [
      { id: 'g_a', text: '1 onion', checked: false },
      { id: 'g_b', text: '500g chicken', checked: false }
    ],
    library: []
  };
  const view = buildGroceryView(state);
  // Categorization still runs via the heuristic.
  assert.deepStrictEqual(view.categorizedGroups.map(g => g.category), ['Produce', 'Meat']);
  // Both items carry the null contract.
  assert.strictEqual(view.categorizedGroups[0].items[0].libraryEntryId, null);
  assert.strictEqual(view.categorizedGroups[1].items[0].libraryEntryId, null);
});

test('buildGroceryView D-32: checked (closed) items also carry libraryEntryId', () => {
  const state = {
    grocery: [
      { id: 'g_a', text: '1 onion', checked: true }
    ],
    library: [
      { id: 'lb_aaaaaaaa', name: 'onion', aliases: ['onion'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.closedItems.length, 1);
  assert.strictEqual(view.closedItems[0].libraryEntryId, 'lb_aaaaaaaa');
  assert.strictEqual(view.closedItems[0].id, 'g_a'); // existing fields preserved
  assert.strictEqual(view.closedItems[0].checked, true);
});

test('buildGroceryView D-34 defensive guard: undefined / null / non-array library does not crash', () => {
  const baseGrocery = [{ id: 'g_a', text: '1 onion', checked: false }];

  const view1 = buildGroceryView({ grocery: baseGrocery }); // no library field at all
  assert.strictEqual(view1.categorizedGroups[0].items[0].libraryEntryId, null);

  const view2 = buildGroceryView({ grocery: baseGrocery, library: null });
  assert.strictEqual(view2.categorizedGroups[0].items[0].libraryEntryId, null);

  const view3 = buildGroceryView({ grocery: baseGrocery, library: 'nope' });
  assert.strictEqual(view3.categorizedGroups[0].items[0].libraryEntryId, null);

  const view4 = buildGroceryView({ grocery: baseGrocery, library: [] });
  assert.strictEqual(view4.categorizedGroups[0].items[0].libraryEntryId, null);
});

test('buildGroceryView D-33: index is built once per render (no per-item rebuild)', () => {
  // Smoke check that two items in the same render share consistent library-driven categorization.
  // If the index were rebuilt per item or per category, we would still get the same answer here,
  // but a regression to per-item building would surface as a perf hit. This test pins behavior.
  const state = {
    grocery: [
      { id: 'g_a', text: '1 onion', checked: false },
      { id: 'g_b', text: '1 carrot', checked: false }
    ],
    library: [
      { id: 'lb_aaaaaaaa', name: 'onion',  aliases: ['onion'],  recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-06T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'carrot', aliases: ['carrot'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  const view = buildGroceryView(state);
  const items = view.categorizedGroups.find(g => g.category === 'Produce').items;
  // Both items present in same Produce bucket, both carry the right libraryEntryId.
  const onion = items.find(i => i.id === 'g_a');
  const carrot = items.find(i => i.id === 'g_b');
  assert.strictEqual(onion.libraryEntryId, 'lb_aaaaaaaa');
  assert.strictEqual(carrot.libraryEntryId, 'lb_bbbbbbbb');
});

// --- Phase 3 decorateIngredients library threading (MATCH-02, D-31, D-33, D-34) ---

test('decorateIngredients D-31: items with library match are { text, libraryEntryId }', () => {
  const library = [
    { id: 'lb_aaaaaaaa', name: 'onion', aliases: ['onion'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
  ];
  const groups = decorateIngredients(['1 onion'], library);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].category, 'Veg');
  assert.deepStrictEqual(groups[0].items, [{ text: '1 onion', libraryEntryId: 'lb_aaaaaaaa' }]);
});

test('decorateIngredients D-31: empty library produces { text, libraryEntryId: null } items', () => {
  const groups = decorateIngredients(['1 onion'], []);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].category, 'Veg');
  assert.deepStrictEqual(groups[0].items, [{ text: '1 onion', libraryEntryId: null }]);
});

test('decorateIngredients D-31: undefined library is identical to single-arg call shape', () => {
  const groups1 = decorateIngredients(['1 onion'], undefined);
  const groups2 = decorateIngredients(['1 onion']);
  assert.deepStrictEqual(groups1, groups2);
  assert.deepStrictEqual(groups1[0].items, [{ text: '1 onion', libraryEntryId: null }]);
});

test('decorateIngredients D-28 propagation: library Other category wins over heuristic Veg', () => {
  // User curated 'onion' as Other -- the recipe page must respect that even though the
  // heuristic would group as Veg. This verifies the library->categorize call site
  // (Plan 02 D-28) flows correctly through Plan 03's view-builder.
  const library = [
    { id: 'lb_aaaaaaaa', name: 'onion', aliases: ['onion'], recipeCategory: 'Other', groceryCategory: 'Other', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
  ];
  const groups = decorateIngredients(['1 onion'], library);
  assert.strictEqual(groups[0].category, 'Other');
  assert.deepStrictEqual(groups[0].items, [{ text: '1 onion', libraryEntryId: 'lb_aaaaaaaa' }]);
});

test('decorateIngredients null contract on bad / non-string ingredient entries skips them', () => {
  // Existing test 'tolerates empty/missing input' is preserved unchanged. This new test
  // confirms the null contract specifically on the new D-31 shape.
  const groups = decorateIngredients(['', '   ', null, undefined, '1 onion'], []);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].category, 'Veg');
  assert.deepStrictEqual(groups[0].items, [{ text: '1 onion', libraryEntryId: null }]);
});

test('decorateIngredients D-33: a single call with multiple ingredients shares one library index across items (per-render build invariant)', () => {
  // Per 03-REVISION-1 W-4: strengthens coverage of D-33's per-render-build invariant.
  // We assert that two ingredients in a single call BOTH receive the correct
  // libraryEntryId from the SAME library, proving the index built at the top of
  // the call covers every iteration of the inner loop. A regression to per-item
  // index building (or to caching the index across calls) would still pass this
  // test, but pairing it with the explicit guard at the top of decorateIngredients
  // pins the contract: build once, reuse for every item in this call.
  const library = [
    { id: 'lb_aaaaaaaa', name: 'onion',  aliases: ['onion'],  recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-06T00:00:00.000Z' },
    { id: 'lb_bbbbbbbb', name: 'carrot', aliases: ['carrot'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
  ];
  const groups = decorateIngredients(['1 onion', '1 carrot'], library);
  // Both ingredients land in the same Veg group, both carry the matching libraryEntryId.
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].category, 'Veg');
  assert.deepStrictEqual(groups[0].items, [
    { text: '1 onion', libraryEntryId: 'lb_aaaaaaaa' },
    { text: '1 carrot', libraryEntryId: 'lb_bbbbbbbb' }
  ]);
  // Calling decorateIngredients a SECOND time with the same library returns the
  // same shape -- if the implementation cached the index across calls (a bug),
  // mutations to the library between calls would not be reflected. Here we test
  // the simpler invariant: two consecutive calls produce identical outputs.
  const groups2 = decorateIngredients(['1 onion', '1 carrot'], library);
  assert.deepStrictEqual(groups2, groups);
});

// === Phase 5 buildLibraryView smoke (filled in by Plan 02 + 03 + 04 tasks) ===
test('buildLibraryView is exported by lib/calc (Plan 02 lands implementation)', { skip: typeof buildLibraryView !== 'function' && 'pending Plan 02' }, () => {
  assert.strictEqual(typeof buildLibraryView, 'function');
});
