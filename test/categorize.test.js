const { test } = require('node:test');
const assert = require('node:assert');
const { recipeCategoryOf, RECIPE_CATEGORIES } = require('../lib/categorize');

test('RECIPE_CATEGORIES is the canonical ordered list', () => {
  assert.deepStrictEqual(RECIPE_CATEGORIES, ['Protein', 'Veg', 'Seasoning', 'Flavor', 'Other']);
});

test('recipeCategoryOf maps animal proteins to Protein', () => {
  assert.strictEqual(recipeCategoryOf('500g boneless chicken thighs'), 'Protein');
  assert.strictEqual(recipeCategoryOf('1 lb ground beef'), 'Protein');
  assert.strictEqual(recipeCategoryOf('2 salmon fillets'), 'Protein');
  assert.strictEqual(recipeCategoryOf('3 eggs, beaten'), 'Protein');
});

test('recipeCategoryOf maps plant proteins to Protein', () => {
  assert.strictEqual(recipeCategoryOf('1 block firm tofu'), 'Protein');
  assert.strictEqual(recipeCategoryOf('1 cup red lentils'), 'Protein');
  assert.strictEqual(recipeCategoryOf('1 can chickpeas, drained'), 'Protein');
});

test('recipeCategoryOf maps vegetables and aromatics to Veg', () => {
  assert.strictEqual(recipeCategoryOf('1 medium onion, diced'), 'Veg');
  assert.strictEqual(recipeCategoryOf('3 cloves garlic, minced'), 'Veg');
  assert.strictEqual(recipeCategoryOf('2 large tomatoes'), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 cup mushrooms'), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 lemon, juiced'), 'Veg');
});

test('recipeCategoryOf maps dry spices and herbs to Seasoning', () => {
  assert.strictEqual(recipeCategoryOf('1 tsp salt'), 'Seasoning');
  assert.strictEqual(recipeCategoryOf('1/2 tsp black pepper'), 'Seasoning');
  assert.strictEqual(recipeCategoryOf('2 tbsp curry powder'), 'Seasoning');
  assert.strictEqual(recipeCategoryOf('1 tsp dried oregano'), 'Seasoning');
});

test('recipeCategoryOf maps oils, sauces, sweeteners to Flavor', () => {
  assert.strictEqual(recipeCategoryOf('2 tbsp olive oil'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('1/4 cup soy sauce'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('2 tbsp honey'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('1 cup chicken broth'), 'Flavor');
});

test('recipeCategoryOf returns Other for unknown input', () => {
  assert.strictEqual(recipeCategoryOf('xyzzy unknown ingredient'), 'Other');
  assert.strictEqual(recipeCategoryOf(''), 'Other');
  assert.strictEqual(recipeCategoryOf(null), 'Other');
  assert.strictEqual(recipeCategoryOf(undefined), 'Other');
  assert.strictEqual(recipeCategoryOf(42), 'Other');
});

test('recipeCategoryOf handles plurals via explicit keywords', () => {
  assert.strictEqual(recipeCategoryOf('2 tomatoes'), 'Veg');
  assert.strictEqual(recipeCategoryOf('3 onions'), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 cup mushrooms'), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 lb carrots'), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 cup peas'), 'Veg');
});

test('recipeCategoryOf prefers longer keyword (chicken broth -> Flavor not Protein)', () => {
  assert.strictEqual(recipeCategoryOf('1 cup chicken broth'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('1 cup vegetable broth'), 'Flavor');
});

test('recipeCategoryOf does not match on non-word-boundary substrings', () => {
  // "atomato" should not match "tomato"
  assert.strictEqual(recipeCategoryOf('atomato'), 'Other');
});

const { groceryCategoryOf, GROCERY_CATEGORIES } = require('../lib/categorize');
const { buildLibraryIndex } = require('../lib/library');

test('GROCERY_CATEGORIES is the canonical ordered list', () => {
  assert.deepStrictEqual(GROCERY_CATEGORIES, ['Produce', 'Meat', 'Dairy', 'Aisle', 'Frozen', 'Other']);
});

test('groceryCategoryOf maps fresh produce to Produce', () => {
  assert.strictEqual(groceryCategoryOf('1 medium onion, diced'), 'Produce');
  assert.strictEqual(groceryCategoryOf('2 large tomatoes'), 'Produce');
  assert.strictEqual(groceryCategoryOf('1 lemon'), 'Produce');
});

test('groceryCategoryOf maps animal proteins to Meat', () => {
  assert.strictEqual(groceryCategoryOf('500g boneless chicken thighs'), 'Meat');
  assert.strictEqual(groceryCategoryOf('1 lb ground beef'), 'Meat');
  assert.strictEqual(groceryCategoryOf('2 salmon fillets'), 'Meat');
});

test('groceryCategoryOf maps dairy items to Dairy', () => {
  assert.strictEqual(groceryCategoryOf('1 cup milk'), 'Dairy');
  assert.strictEqual(groceryCategoryOf('2 tbsp butter'), 'Dairy');
  assert.strictEqual(groceryCategoryOf('1 cup shredded cheddar cheese'), 'Dairy');
  assert.strictEqual(groceryCategoryOf('3 eggs'), 'Dairy');
});

test('groceryCategoryOf maps shelf-stable to Aisle', () => {
  assert.strictEqual(groceryCategoryOf('1 cup rice'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 lb pasta'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 tsp salt'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('2 tbsp olive oil'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1/4 cup soy sauce'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 can chickpeas'), 'Aisle');
});

test('groceryCategoryOf maps frozen to Frozen', () => {
  assert.strictEqual(groceryCategoryOf('1 bag frozen peas'), 'Frozen');
  assert.strictEqual(groceryCategoryOf('1 pint ice cream'), 'Frozen');
});

test('groceryCategoryOf returns Other for unknown input', () => {
  assert.strictEqual(groceryCategoryOf('xyzzy unknown'), 'Other');
  assert.strictEqual(groceryCategoryOf(''), 'Other');
  assert.strictEqual(groceryCategoryOf(null), 'Other');
});

test('groceryCategoryOf prefers Aisle over Produce for canned/processed', () => {
  // tomato sauce should be Aisle (canned/jarred), not Produce
  assert.strictEqual(groceryCategoryOf('1 cup tomato sauce'), 'Aisle');
});

test('recipeCategoryOf maps chicken stock to Flavor (longest keyword wins over chicken)', () => {
  assert.strictEqual(recipeCategoryOf('1 cup chicken stock'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('2 cups beef stock'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('3 cups vegetable stock'), 'Flavor');
});

test('groceryCategoryOf routes thyme to Produce (no Aisle dead-code conflict)', () => {
  // thyme should map cleanly to Produce; the duplicate Aisle entry was removed
  // to eliminate dead code. Same for basil and rosemary.
  assert.strictEqual(groceryCategoryOf('1 sprig fresh thyme'), 'Produce');
  assert.strictEqual(groceryCategoryOf('1 sprig fresh basil'), 'Produce');
  assert.strictEqual(groceryCategoryOf('1 sprig fresh rosemary'), 'Produce');
});

test('groceryCategoryOf("peanut butter") returns Aisle (pea-prefix bug fix — D-01, FND-04)', () => {
  // Regression for the \b...\b regex fix. Before the fix, the keyword
  // 'pea' (in GROCERY_KEYWORDS.Produce) prefix-matched 'peanut' so 'peanut butter'
  // would route to Produce. After the fix, only 'peanut butter' (Aisle) wins.
  assert.strictEqual(groceryCategoryOf('peanut butter'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 tbsp peanut butter'), 'Aisle');
});

test('recipeCategoryOf("peanut butter") does NOT classify as Veg (pea-prefix bug fix)', () => {
  // Before the fix, 'pea' (in RECIPE_KEYWORDS.Veg) prefix-matched 'peanut'.
  // After the fix, 'peanut butter' is not in RECIPE_KEYWORDS so it falls
  // through to longer matches; 'peanut' is now an explicit Protein keyword.
  const result = recipeCategoryOf('1 tbsp peanut butter');
  assert.notStrictEqual(result, 'Veg');
});

test('recipeCategoryOf("peanuts") returns Protein (explicit plural keyword)', () => {
  assert.strictEqual(recipeCategoryOf('1 cup peanuts'), 'Protein');
  assert.strictEqual(recipeCategoryOf('2 tbsp chopped peanuts'), 'Protein');
});

test('recipeCategoryOf does not match prefix-only substrings (pea does not match peanut)', () => {
  // Direct invariant: with bilateral \b\b, 'pea' should not match 'peanut'.
  // 'peanuts' should hit the explicit 'peanuts' Protein keyword, not the 'pea' Veg keyword.
  assert.strictEqual(recipeCategoryOf('peanut'), 'Protein');
  assert.strictEqual(recipeCategoryOf('peanuts'), 'Protein');
});

test('groceryCategoryOf still classifies plurals correctly after \\b\\b fix', () => {
  assert.strictEqual(groceryCategoryOf('2 lemons'), 'Produce');
  assert.strictEqual(groceryCategoryOf('3 onions'), 'Produce');
  assert.strictEqual(groceryCategoryOf('1 cup mushrooms'), 'Produce');
  assert.strictEqual(groceryCategoryOf('1 can chickpeas'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 bag frozen peas'), 'Frozen');
});

// --- Phase 3 library-aware tests (MATCH-01, D-26..D-28) ----------------------

test('recipeCategoryOf library priority: library entry overrides heuristic (D-26 raw-library form)', () => {
  // Heuristic would say 'black pepper' -> Seasoning. Library overrides to Flavor.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'black pepper', aliases: ['black pepper'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(recipeCategoryOf('1 tsp black pepper', state.library), 'Flavor');
});

test('groceryCategoryOf library priority: library entry overrides heuristic (D-26 raw-library form)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'black pepper', aliases: ['black pepper'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(groceryCategoryOf('1 tsp black pepper', state.library), 'Aisle');
});

test('recipeCategoryOf accepts pre-built index from buildLibraryIndex (D-26 hot-path form)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'peanut butter', aliases: ['peanut butter'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  const idx = buildLibraryIndex(state.library);
  assert.strictEqual(recipeCategoryOf('1 tbsp peanut butter', idx), 'Flavor');
  assert.strictEqual(groceryCategoryOf('1 tbsp peanut butter', idx), 'Aisle');
});

test('recipeCategoryOf SC#1 ergonomics: library array form works (peanut butter)', () => {
  // SC#1 of ROADMAP wording: recipeCategoryOf('peanut butter', state.library) returns library's category.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'peanut butter', aliases: ['peanut butter'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(recipeCategoryOf('peanut butter', state.library), 'Flavor');
});

test('recipeCategoryOf D-28: library "Other" does NOT fall through to heuristic', () => {
  // Heuristic alone says 'onion' -> Veg. User curated 'onion' as Other (deliberate
  // choice). Library 'Other' must win and NOT fall through to the keyword path.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'onion', aliases: ['onion'], recipeCategory: 'Other', groceryCategory: 'Other', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(recipeCategoryOf('1 onion', state.library), 'Other');
  assert.strictEqual(groceryCategoryOf('1 onion', state.library), 'Other');
});

test('recipeCategoryOf D-26 fallback: empty library array falls through to heuristic', () => {
  // SC#5 backwards compat -- empty library means the heuristic path runs identical to single-arg.
  assert.strictEqual(recipeCategoryOf('1 onion', []), recipeCategoryOf('1 onion'));
  assert.strictEqual(recipeCategoryOf('1 onion', []), 'Veg');
});

test('recipeCategoryOf D-26 fallback: null library falls through to heuristic', () => {
  assert.strictEqual(recipeCategoryOf('1 onion', null), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 onion', undefined), 'Veg');
});

test('recipeCategoryOf D-26 fallback: library with no matching alias falls through to heuristic', () => {
  // Library has only 'tofu'; input is 'chicken broth' -- no library hit, heuristic 'Flavor' wins.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'tofu', aliases: ['tofu'], recipeCategory: 'Protein', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(recipeCategoryOf('1 cup chicken broth', state.library), 'Flavor');
});

test('groceryCategoryOf D-26 fallback: empty / null / no-match all use heuristic', () => {
  assert.strictEqual(groceryCategoryOf('1 cup milk', []), 'Dairy');
  assert.strictEqual(groceryCategoryOf('1 cup milk', null), 'Dairy');
  assert.strictEqual(groceryCategoryOf('1 cup milk', [
    { id: 'lb_aaaaaaaa', name: 'tofu', aliases: ['tofu'], recipeCategory: 'Protein', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
  ]), 'Dairy');
});

// --- D-35: bare 'pepper'/'peppers' regression (Phase 1 carryover) ------------

test('D-35 RECIPE: black pepper maps to Seasoning (was incorrectly Veg before D-35)', () => {
  assert.strictEqual(recipeCategoryOf('1 tsp black pepper'), 'Seasoning');
  assert.strictEqual(recipeCategoryOf('1/2 tsp white pepper'), 'Seasoning');
  assert.strictEqual(recipeCategoryOf('1 tsp peppercorns'), 'Seasoning');
});

test('D-35 RECIPE: red pepper flakes still wins as Seasoning (longer keyword still beats bell)', () => {
  assert.strictEqual(recipeCategoryOf('1 tsp red pepper flakes'), 'Seasoning');
});

test('D-35 RECIPE: red bell peppers still maps to Veg (bell variants intact)', () => {
  assert.strictEqual(recipeCategoryOf('2 red bell peppers'), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 jalapeno, sliced'), 'Veg');
});

test('D-35 GROCERY: bare pepper / peppers map to Produce (newly added)', () => {
  assert.strictEqual(groceryCategoryOf('peppers'), 'Produce');
  assert.strictEqual(groceryCategoryOf('1 red pepper'), 'Produce');
});

test('D-35 GROCERY: red bell peppers still maps to Produce (bell variant intact)', () => {
  assert.strictEqual(groceryCategoryOf('2 red bell peppers'), 'Produce');
});

// --- 03-REVISION-1 BLOCKER closure: D-36 raw-library normalization ---------

test('D-36 raw-library form: alias whitespace/case noise is normalized via matchRawLibrary (BLOCKER fix)', () => {
  // Per 03-REVISION-1: matchRawLibrary now uses normalizeIngredientText (moved
  // from lib/library.js to lib/categorize.js per Plan 03-01 Approach A) so the
  // raw-library path produces byte-equivalent regex compilation to the pre-built-
  // index path. SC#1's user-facing wording works in BOTH forms.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['  GARLIC  '], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-06T00:00:00.000Z' }
    ]
  };
  // Raw-library form (the form SC#1 uses).
  assert.strictEqual(recipeCategoryOf('1 clove garlic', state.library), 'Veg');
  assert.strictEqual(groceryCategoryOf('1 clove garlic', state.library), 'Produce');
  // Pre-built-index form (the hot path).
  const idx = buildLibraryIndex(state.library);
  assert.strictEqual(recipeCategoryOf('1 clove garlic', idx), 'Veg');
  assert.strictEqual(groceryCategoryOf('1 clove garlic', idx), 'Produce');
});
