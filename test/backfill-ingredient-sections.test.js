'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { backfillRecipe, backfillAll } = require('../scripts/backfill-ingredient-sections');

// WPRM 2-group fixture HTML (no live network).
const WPRM_2_GROUPS_HTML = `
<div class="wprm-recipe-ingredient-group">
  <h4 class="wprm-recipe-group-name">For the Dough</h4>
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">2</span>
      <span class="wprm-recipe-ingredient-unit">cups</span>
      <span class="wprm-recipe-ingredient-name">flour</span>
    </li>
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">1</span>
      <span class="wprm-recipe-ingredient-unit">tsp</span>
      <span class="wprm-recipe-ingredient-name">salt</span>
    </li>
  </ul>
</div>
<div class="wprm-recipe-ingredient-group">
  <h4 class="wprm-recipe-group-name">For the Sauce</h4>
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">1</span>
      <span class="wprm-recipe-ingredient-unit">can</span>
      <span class="wprm-recipe-ingredient-name">tomatoes</span>
    </li>
  </ul>
</div>
`;

// Stub fetchFn that returns the WPRM 2-group fixture.
function makeFetchFn(html, { status = 200, ok = true } = {}) {
  return async (_url, _opts) => ({
    ok: ok && status >= 200 && status < 300,
    status,
    text: async () => html
  });
}

// Stub fetchFn that throws a network error.
function makeFailFetch(reason) {
  return async (_url, _opts) => { throw new Error(reason); };
}

// Stub fetchFn that returns ok=false (e.g. HTTP 500).
function makeErrorFetch(status) {
  return async (_url, _opts) => ({
    ok: false,
    status,
    text: async () => 'Server Error'
  });
}

// No-op sleepFn so tests don't wait 500ms between recipes.
const noopSleep = () => Promise.resolve();

// Minimal recipe object factory.
function makeRecipe(overrides) {
  return Object.assign({
    id: 'r_test001',
    sourceUrl: 'https://example.com/recipe',
    title: 'Test Recipe',
    ingredients: ['2 cups flour', '1 tsp salt', '1 can tomatoes'],
    instructions: ['Mix.', 'Bake.'],
    imageUrl: null,
    servings: '4',
    addedAt: new Date().toISOString()
  }, overrides);
}

// --- backfillRecipe success path ---

test('backfillRecipe: WPRM fetch success sets ingredientSections with 2 headings', async () => {
  const recipe = makeRecipe();
  const report = await backfillRecipe(recipe, { fetchFn: makeFetchFn(WPRM_2_GROUPS_HTML) });

  assert.strictEqual(report.status, 'sections');
  assert.strictEqual(report.count, 2);
  assert.ok(Array.isArray(report.headings), 'headings must be an array');
  assert.strictEqual(report.headings.length, 2);
  assert.strictEqual(report.headings[0], 'For the Dough');
  assert.strictEqual(report.headings[1], 'For the Sauce');
  assert.ok(report.reason === null, 'reason should be null on success');
});

test('backfillRecipe: ingredientSections set correctly on recipe object', async () => {
  const recipe = makeRecipe();
  await backfillRecipe(recipe, { fetchFn: makeFetchFn(WPRM_2_GROUPS_HTML) });

  assert.ok(Array.isArray(recipe.ingredientSections), 'ingredientSections must be array');
  assert.strictEqual(recipe.ingredientSections.length, 2);
  assert.strictEqual(recipe.ingredientSections[0].heading, 'For the Dough');
  assert.ok(recipe.ingredientSections[0].items.length >= 1, 'first group must have items');
  assert.strictEqual(recipe.ingredientSections[1].heading, 'For the Sauce');
});

test('backfillRecipe: other recipe fields are unchanged after success', async () => {
  const original = makeRecipe();
  const originalTitle = original.title;
  const originalIngredients = [...original.ingredients];
  const originalInstructions = [...original.instructions];

  await backfillRecipe(original, { fetchFn: makeFetchFn(WPRM_2_GROUPS_HTML) });

  assert.strictEqual(original.title, originalTitle, 'title must be unchanged');
  assert.deepStrictEqual(original.ingredients, originalIngredients, 'ingredients must be unchanged');
  assert.deepStrictEqual(original.instructions, originalInstructions, 'instructions must be unchanged');
});

// --- backfillRecipe failure paths ---

test('backfillRecipe: fetch throws -> recipe unchanged, report.status=failed', async () => {
  const recipe = makeRecipe();
  const report = await backfillRecipe(recipe, { fetchFn: makeFailFetch('ENOTFOUND') });

  assert.strictEqual(report.status, 'failed');
  assert.ok(typeof report.reason === 'string', 'reason must be a string');
  assert.ok(report.reason.length > 0, 'reason must not be empty');
  // Recipe must be untouched (no ingredientSections added).
  assert.ok(!Object.prototype.hasOwnProperty.call(recipe, 'ingredientSections'),
    'ingredientSections must not be added when fetch fails');
});

test('backfillRecipe: HTTP error status -> recipe unchanged, report.status=failed', async () => {
  const recipe = makeRecipe();
  const report = await backfillRecipe(recipe, { fetchFn: makeErrorFetch(503) });

  assert.strictEqual(report.status, 'failed');
  assert.match(report.reason, /503/);
  assert.ok(!Object.prototype.hasOwnProperty.call(recipe, 'ingredientSections'),
    'ingredientSections must not be added when fetch returns non-ok status');
});

test('backfillRecipe: non-WPRM html -> report.status=flat, ingredientSections=[]', async () => {
  const recipe = makeRecipe();
  const nonWprmHtml = '<html><body><ul><li>1 egg</li></ul></body></html>';
  const report = await backfillRecipe(recipe, { fetchFn: makeFetchFn(nonWprmHtml) });

  assert.strictEqual(report.status, 'flat');
  assert.deepStrictEqual(recipe.ingredientSections, []);
});

// --- backfillAll: failure does not abort processing of other recipes ---

test('backfillAll: fetch failure for one recipe does not abort others', async () => {
  const recipe1 = makeRecipe({ id: 'r_fail', sourceUrl: 'https://fail.example.com/r' });
  const recipe2 = makeRecipe({ id: 'r_ok', sourceUrl: 'https://ok.example.com/r' });

  // recipe1 fetch throws; recipe2 fetch returns WPRM html.
  let callCount = 0;
  const fetchFn = async (url, opts) => {
    callCount++;
    if (url.includes('fail.example.com')) {
      throw new Error('network failure');
    }
    return {
      ok: true,
      status: 200,
      text: async () => WPRM_2_GROUPS_HTML
    };
  };

  const state = { recipes: [recipe1, recipe2] };
  const reports = await backfillAll(state, { fetchFn, sleepFn: noopSleep });

  assert.strictEqual(callCount, 2, 'both recipes should be attempted');
  assert.strictEqual(reports.length, 2);
  assert.strictEqual(reports[0].status, 'failed');
  assert.strictEqual(reports[1].status, 'sections');

  // recipe1 must not have ingredientSections added.
  assert.ok(!Object.prototype.hasOwnProperty.call(recipe1, 'ingredientSections'),
    'failed recipe must not have ingredientSections');
  // recipe2 must have sections.
  assert.ok(Array.isArray(recipe2.ingredientSections));
  assert.strictEqual(recipe2.ingredientSections.length, 2);
});

// --- Idempotency ---

test('backfillRecipe: running twice yields identical ingredientSections (idempotent)', async () => {
  const recipe = makeRecipe();
  const fetchFn = makeFetchFn(WPRM_2_GROUPS_HTML);

  await backfillRecipe(recipe, { fetchFn });
  const sectionsAfterFirst = JSON.stringify(recipe.ingredientSections);

  await backfillRecipe(recipe, { fetchFn });
  const sectionsAfterSecond = JSON.stringify(recipe.ingredientSections);

  assert.strictEqual(sectionsAfterFirst, sectionsAfterSecond,
    'ingredientSections must be identical on repeated runs');
  // Other fields must still be unchanged.
  assert.strictEqual(recipe.title, 'Test Recipe');
  assert.deepStrictEqual(recipe.ingredients, ['2 cups flour', '1 tsp salt', '1 can tomatoes']);
});

test('backfillRecipe: pre-existing ingredientSections are overwritten (idempotent, not appended)', async () => {
  const recipe = makeRecipe({
    ingredientSections: [{ heading: 'Old Stale Section', items: ['stale item'] }]
  });
  const fetchFn = makeFetchFn(WPRM_2_GROUPS_HTML);

  await backfillRecipe(recipe, { fetchFn });

  // Must have fresh sections from the fixture, not the old stale data.
  assert.strictEqual(recipe.ingredientSections.length, 2);
  assert.strictEqual(recipe.ingredientSections[0].heading, 'For the Dough');
  // 'Old Stale Section' must be gone.
  const allHeadings = recipe.ingredientSections.map(s => s.heading);
  assert.ok(!allHeadings.includes('Old Stale Section'), 'stale section must be overwritten');
});
