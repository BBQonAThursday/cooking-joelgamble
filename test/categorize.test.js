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

test('recipeCategoryOf handles plurals via prefix match', () => {
  assert.strictEqual(recipeCategoryOf('2 tomatoes'), 'Veg');
  assert.strictEqual(recipeCategoryOf('3 onions'), 'Veg');
});

test('recipeCategoryOf prefers longer keyword (chicken broth -> Flavor not Protein)', () => {
  assert.strictEqual(recipeCategoryOf('1 cup chicken broth'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('1 cup vegetable broth'), 'Flavor');
});

test('recipeCategoryOf does not match on non-word-boundary substrings', () => {
  // "atomato" should not match "tomato"
  assert.strictEqual(recipeCategoryOf('atomato'), 'Other');
});
