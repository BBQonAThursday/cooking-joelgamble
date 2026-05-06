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
