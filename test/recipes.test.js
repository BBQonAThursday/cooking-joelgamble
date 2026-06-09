const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const helpers = require('./_helpers');

// Monkey-patch the scrape module's export with a deterministic stub.
// Because Node's --test runs each test file in its own worker, mutations
// to the cached scrape module don't leak to other files. routes/recipes.js
// calls `scrapeMod.scrape(...)` against the same shared export object, so
// mutating the export here changes what the route sees.
const scrapeMod = require('../lib/scrape');
scrapeMod.scrape = async (url) => {
  if (url.includes('fail-network')) return { ok: false, reason: "Couldn't reach example.com" };
  if (url.includes('fail-no-recipe')) return { ok: false, reason: 'No recipe data found on this page' };
  return {
    ok: true,
    recipe: {
      sourceUrl: url,
      title: 'Stub Recipe ' + url.split('/').pop(),
      description: '',
      imageUrl: null,
      servings: '4 servings',
      totalMinutes: 30,
      ingredients: ['salt'],
      instructions: ['Cook.']
    }
  };
};

let ctx;

beforeEach(async () => {
  helpers.setupDataDir();
  ctx = await helpers.startTestServer();
});

afterEach(async () => {
  await helpers.stopTestServer(ctx.server);
  helpers.teardownDataDir();
});

test('GET / renders empty state', async () => {
  const res = await helpers.request(ctx.port, { path: '/' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="recipes-panel"/);
  assert.match(res.body, /No recipes yet/);
});

test('POST /recipes saves a new recipe and OOB-swaps the panel', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes',
    body: { url: 'https://example.com/recipe-1' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="recipes-panel"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, /Stub Recipe recipe-1/);
  assert.match(res.headers['x-status-toast'] || '', /Saved: Stub Recipe recipe-1/);
});

test('POST /recipes with same URL twice updates rather than duplicates', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/dup' }});
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/dup' }});
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /Updated:/);

  // Verify only one entry in state via a clean GET.
  const list = await helpers.request(ctx.port, { path: '/' });
  const matches = list.body.match(/Stub Recipe dup/g) || [];
  assert.strictEqual(matches.length, 1);
});

test('POST /recipes with scraper failure returns 200 + error toast, no state change', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes',
    body: { url: 'https://example.com/fail-no-recipe' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /No recipe data/);
  // Panel should still render empty (scrape failed → no save).
  assert.match(res.body, /No recipes yet/);
});

test('POST /recipes with missing url returns 400', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes',
    body: {}
  });
  assert.strictEqual(res.status, 400);
});

test('GET /recipes/:id returns the recipe page', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/get-test' }});
  const { idForUrl } = require('../lib/id');
  const id = idForUrl('https://example.com/get-test');

  const res = await helpers.request(ctx.port, { path: `/recipes/${id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /Stub Recipe get-test/);
  assert.match(res.body, /Ingredients/);
  assert.match(res.body, /Instructions/);
});

test('GET /recipes/:id returns 404 for unknown id', async () => {
  const res = await helpers.request(ctx.port, { path: '/recipes/zzzzzzzzzz' });
  assert.strictEqual(res.status, 404);
});

test('DELETE /recipes/:id removes the recipe and OOB-swaps the panel', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/del-test' }});
  const { idForUrl } = require('../lib/id');
  const id = idForUrl('https://example.com/del-test');

  const res = await helpers.request(ctx.port, { method: 'DELETE', path: `/recipes/${id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="recipes-panel"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, /No recipes yet/);
  assert.match(res.headers['x-status-toast'] || '', /Deleted/);
});

test('DELETE /recipes/:id returns 404 for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'DELETE', path: '/recipes/zzzzzzzzzz' });
  assert.strictEqual(res.status, 404);
});

test('GET / renders the top tabs with Recipes active', async () => {
  const res = await helpers.request(ctx.port, { path: '/' });
  assert.match(res.body, /<nav class="tabs">/);
  assert.match(res.body, /href="\/"[^>]*class="tab active"[^>]*>Recipes/);
  assert.match(res.body, /href="\/this-week"/);
  assert.match(res.body, /href="\/grocery"/);
  assert.match(res.body, /href="\/history"/);
});

test('GET / shows an untagged tag-toggle on each recipe card', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/tag-test' } });
  const res = await helpers.request(ctx.port, { path: '/' });
  assert.match(res.body, /<button[^>]*class="tag-toggle"[^>]*hx-post="\/this-week\/recipes\/[a-z0-9]+"/);
  assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
});

test('GET /recipes/:id renders the tag-toggle next to the title', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/detail-test' }});
  const { idForUrl } = require('../lib/id');
  const id = idForUrl('https://example.com/detail-test');
  const res = await helpers.request(ctx.port, { path: `/recipes/${id}` });
  assert.match(res.body, new RegExp(`id="tag-toggle-${id}"`));
  // Untagged by default
  assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
});

test('GET /recipes/:id renders ingredients grouped by category', async () => {
  // Add a recipe directly to state for richer category coverage.
  // viewMode must be 'processed' to see category headers (default is 'original').
  const storage = require('../lib/storage');
  const state = storage.get();
  state.recipes.push({
    id: 'multicat',
    addedAt: '2026-05-01T00:00:00Z',
    sourceUrl: 'https://example.com/multicat',
    title: 'Multi-Category Recipe',
    description: '',
    imageUrl: null,
    servings: '4',
    totalMinutes: 30,
    ingredients: ['500g chicken', '1 onion', '1 tsp salt', '2 tbsp olive oil'],
    instructions: ['cook'],
    viewMode: 'processed'
  });
  storage.save();

  const res = await helpers.request(ctx.port, { path: '/recipes/multicat' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<h3 class="ingredient-category">Protein<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Veg<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Seasoning<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Flavor<\/h3>/);
  assert.match(res.body, />500g chicken</);
  assert.match(res.body, />1 onion</);
  assert.match(res.body, />1 tsp salt</);
  assert.match(res.body, />2 tbsp olive oil</);
});

// ----- Phase 4 / EXTR-01 / SC#1: POST auto-extract hook ---------------------

test('POST /recipes seeds state.library via auto-extract hook (SC#1a)', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes',
    body: { url: 'https://example.com/extr-1' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /Saved:/);
  const storage = require('../lib/storage');
  const state = storage.get();
  assert.ok(state.library.length >= 1, 'POST hook should have seeded at least one library entry');
});

test('POST /recipes second save with same URL does NOT regrow library (SC#1b)', async () => {
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/extr-2' } });
  const storage = require('../lib/storage');
  const lengthAfterFirst = storage.get().library.length;
  assert.ok(lengthAfterFirst >= 1, 'first POST should seed at least one entry');

  await helpers.request(ctx.port, { method: 'POST', path: '/recipes', body: { url: 'https://example.com/extr-2' } });
  assert.strictEqual(storage.get().library.length, lengthAfterFirst, 'library count must be stable on re-save (library-first match; no second save)');
});

test('POST /recipes still saves and toasts Saved when extractAndSeed throws (D-48)', async () => {
  const libraryMod = require('../lib/library');
  const originalExtractAndSeed = libraryMod.extractAndSeed;
  libraryMod.extractAndSeed = () => { throw new Error('forced failure for test'); };
  try {
    const res = await helpers.request(ctx.port, {
      method: 'POST', path: '/recipes',
      body: { url: 'https://example.com/throw-test' }
    });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['x-status-toast'] || '', /Saved: Stub Recipe throw-test/);
    const list = await helpers.request(ctx.port, { path: '/' });
    assert.match(list.body, /Stub Recipe throw-test/);
  } finally {
    libraryMod.extractAndSeed = originalExtractAndSeed;
  }
});

// ----- Phase 6 / FIX-02 + FIX-04: pencil affordance on recipe ingredient lines

function seedLibraryAndRecipe(entry, recipe) {
  const storage = require('../lib/storage');
  const state = storage.get();
  state.library = [entry];
  state.libraryMigratedAt = new Date().toISOString();
  state.recipes = [recipe];
  storage.save();
}

function makeEntry(overrides) {
  return Object.assign({
    id: 'lb_test0001',
    name: 'apple',
    aliases: [],
    recipeCategory: 'Veg',
    groceryCategory: 'Produce',
    curated: true,
    createdAt: ''
  }, overrides);
}

function makeRecipe(overrides) {
  return Object.assign({
    id: 'r_test0001',
    title: 'T',
    sourceUrl: 'https://x.test/r',
    ingredients: [],
    instructions: [],
    imageUrl: '',
    totalMinutes: 0,
    servings: '1',
    addedAt: new Date().toISOString()
  }, overrides);
}

test('GET /recipes/:id wraps ingredient section with id="recipe-ingredient-groups-:id"', async () => {
  const recipeId = 'r_test0001';
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] }),
    makeRecipe({ id: recipeId, ingredients: ['1 apple'] })
  );
  const res = await helpers.request(ctx.port, { path: `/recipes/${recipeId}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, new RegExp(`id="recipe-ingredient-groups-${recipeId}"`));
});

test('GET /recipes/:id renders each ingredient line with stable per-line id', async () => {
  const recipeId = 'r_test0001';
  // viewMode 'processed' required: per-line ids only appear in categorized view.
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] }),
    makeRecipe({ id: recipeId, ingredients: ['1 apple'], viewMode: 'processed' })
  );
  const res = await helpers.request(ctx.port, { path: `/recipes/${recipeId}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, new RegExp(`id="recipe-ing-${recipeId}-(Protein|Veg|Seasoning|Flavor|Other)-0"`));
});

test('GET /recipes/:id matched ingredient pencil targets /library/:id/categories-edit', async () => {
  const recipeId = 'r_test0001';
  // viewMode 'processed' required: pencil buttons only appear in categorized view.
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] }),
    makeRecipe({ id: recipeId, ingredients: ['1 apple'], viewMode: 'processed' })
  );
  const res = await helpers.request(ctx.port, { path: `/recipes/${recipeId}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /hx-get="\/library\/lb_apple01\/categories-edit\?surface=recipe&recipeId=r_test0001&index=0"/);
  assert.match(res.body, /class="recipe-pencil"/);
});

test('GET /recipes/:id unmatched ingredient pencil targets /library/categorize-edit', async () => {
  const storage = require('../lib/storage');
  const state = storage.get();
  state.library = [];
  state.libraryMigratedAt = new Date().toISOString();
  // viewMode 'processed' required: pencil buttons only appear in categorized view.
  state.recipes = [makeRecipe({ id: 'r_test0001', ingredients: ['1 zzunknown'], viewMode: 'processed' })];
  storage.save();
  const res = await helpers.request(ctx.port, { path: '/recipes/r_test0001' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /hx-get="\/library\/categorize-edit\?text=1%20zzunknown&surface=recipe&recipeId=r_test0001&index=0"/);
});

test('GET /recipes/:id renders ing.text not entry.name (FIX-04)', async () => {
  const recipeId = 'r_test0001';
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] }),
    makeRecipe({ id: recipeId, ingredients: ['1 apple, sliced'] })
  );
  const res = await helpers.request(ctx.port, { path: `/recipes/${recipeId}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<span class="recipe-ingredient-text">1 apple, sliced<\/span>/);
});

test('GET /recipes/:id rendering does not substitute entry.name even after rename (FIX-04)', async () => {
  const recipeId = 'r_test0001';
  // Library entry's canonical name is "pomme" but the alias still matches "apple",
  // so the recipe ingredient still resolves to this entry's libraryEntryId — yet
  // the rendered text MUST be the original ing.text, not entry.name.
  // viewMode 'processed' required: pencil SVG only appears in categorized view.
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'pomme', aliases: ['apple'] }),
    makeRecipe({ id: recipeId, ingredients: ['1 apple, sliced'], viewMode: 'processed' })
  );
  const res = await helpers.request(ctx.port, { path: `/recipes/${recipeId}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<span class="recipe-ingredient-text">1 apple, sliced<\/span>/);
  assert.ok(!res.body.includes('pomme'), 'rendered body must not contain canonical name pomme');
  // Sanity: shared icon partial included (only in processed/categorized view).
  assert.match(res.body, /viewBox="0 0 16 16"/);
});

// ----- Phase 6 / Wave 4: FIX-04 round-trip invariants -----------------------
// These extend the static FIX-04 tests above with full round-trip flows:
// 1. Save changes a library category -> recipe ingredient text MUST be unchanged.
// 2. Rename happens AFTER an initial GET (simulating LIB-05 in-session rename) ->
//    next GET MUST still render ing.text, not the new entry.name.

test('FIX-04 round-trip: changing library category does NOT change recipe ingredient text', async () => {
  // viewMode 'processed' required so category headers appear in both pre- and post-POST renders.
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'], recipeCategory: 'Veg', groceryCategory: 'Produce' }),
    makeRecipe({ id: 'r_test01', ingredients: ['1 apple, sliced'], viewMode: 'processed' })
  );

  // POST new recipeCategory.
  const post = await helpers.request(ctx.port, {
    method: 'POST',
    path: '/library/lb_apple01/categories',
    headers: { 'hx-current-url': 'http://127.0.0.1:3003/recipes/r_test01' },
    body: { recipeCategory: 'Protein', groceryCategory: 'Meat', surfaceItemId: 'recipe-r_test01-0', surface: 'recipe', recipeId: 'r_test01', index: '0' }
  });
  assert.strictEqual(post.status, 200);

  // Re-GET -- text unchanged, group changed.
  const res = await helpers.request(ctx.port, { path: '/recipes/r_test01' });
  assert.match(res.body, /<span class="recipe-ingredient-text">1 apple, sliced<\/span>/);
  assert.match(res.body, /class="ingredient-category">Protein<[\s\S]*1 apple, sliced/);
});

test('FIX-04 round-trip: renaming library entry across renders does NOT change recipe ingredient text', async () => {
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'], recipeCategory: 'Veg', groceryCategory: 'Produce' }),
    makeRecipe({ id: 'r_test01', ingredients: ['1 apple, sliced'] })
  );

  // First GET -- confirms current rendering.
  const get1 = await helpers.request(ctx.port, { path: '/recipes/r_test01' });
  assert.match(get1.body, /<span class="recipe-ingredient-text">1 apple, sliced<\/span>/);

  // Rename library entry's canonical name (simulating LIB-05 rename via Library tab).
  const storage = require('../lib/storage');
  const state = storage.get();
  state.library[0].name = 'pomme';
  storage.save();

  // Re-GET -- recipe-ingredient-text MUST still show '1 apple, sliced'. FIX-04.
  const get2 = await helpers.request(ctx.port, { path: '/recipes/r_test01' });
  assert.match(get2.body, /<span class="recipe-ingredient-text">1 apple, sliced<\/span>/);
  // Defense in depth: 'pomme' may appear in aria-label attributes but MUST NOT
  // appear inside any .recipe-ingredient-text span.
  const ingTextMatches = get2.body.match(/<span class="recipe-ingredient-text">[^<]+<\/span>/g) || [];
  for (const span of ingTextMatches) {
    assert.ok(!span.includes('pomme'), `FIX-04 violation: span contains canonical name: ${span}`);
  }
});

// ----- QUICK-K14: per-recipe ingredient view toggle --------------------------

test('GET /recipes/:id defaults to original view (no category headers)', async () => {
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] }),
    makeRecipe({ id: 'r_test0001', ingredients: ['1 apple'] })
    // no viewMode set -- must default to original
  );
  const res = await helpers.request(ctx.port, { path: '/recipes/r_test0001' });
  assert.strictEqual(res.status, 200);
  assert.doesNotMatch(res.body, /<h3 class="ingredient-category">/);
  assert.match(res.body, /1 apple/);
});

test('POST /recipes/:id/view flips to processed and persists', async () => {
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'], recipeCategory: 'Veg' }),
    makeRecipe({ id: 'r_test0001', ingredients: ['1 apple'] })
  );
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes/r_test0001/view', body: {}
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<h3 class="ingredient-category">/);
  const storage = require('../lib/storage');
  assert.strictEqual(storage.get().recipes[0].viewMode, 'processed');
});

test('POST /recipes/:id/view twice flips back to original', async () => {
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'] }),
    makeRecipe({ id: 'r_test0001', ingredients: ['1 apple'] })
  );
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes/r_test0001/view', body: {} });
  await helpers.request(ctx.port, { method: 'POST', path: '/recipes/r_test0001/view', body: {} });
  const storage = require('../lib/storage');
  assert.strictEqual(storage.get().recipes[0].viewMode, 'original');
});

test('POST /recipes/:id/view unknown id returns 404', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes/nope/view', body: {}
  });
  assert.strictEqual(res.status, 404);
});

test('POST /recipes/:id/view returns OOB toggle with updated label', async () => {
  seedLibraryAndRecipe(
    makeEntry({ id: 'lb_apple01', name: 'apple', aliases: ['apple'], recipeCategory: 'Veg' }),
    makeRecipe({ id: 'r_test0001', ingredients: ['1 apple'] })
  );
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/recipes/r_test0001/view', body: {}
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="ingredient-view-toggle-r_test0001"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, /Show original/);
});
