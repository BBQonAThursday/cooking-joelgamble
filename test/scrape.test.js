const { test } = require('node:test');
const assert = require('node:assert');
const { extractJsonLdScripts, findRecipeNode } = require('../lib/scrape');

test('extractJsonLdScripts pulls a single ld+json block', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Recipe","name":"Pasta"}</script>
    </head></html>`;
  const result = extractJsonLdScripts(html);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, 'Pasta');
});

test('extractJsonLdScripts handles multiple blocks', () => {
  const html = `
    <script type="application/ld+json">{"@type":"WebSite"}</script>
    <script type="application/ld+json">{"@type":"Recipe","name":"X"}</script>
  `;
  const result = extractJsonLdScripts(html);
  assert.strictEqual(result.length, 2);
});

test('extractJsonLdScripts is tolerant of attribute order and extra attributes', () => {
  const html = `
    <script id="schemaorg" type="application/ld+json">{"@type":"Recipe","name":"A"}</script>
    <script  type='application/ld+json'  id="x">{"@type":"Recipe","name":"B"}</script>
  `;
  const result = extractJsonLdScripts(html);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].name, 'A');
  assert.strictEqual(result[1].name, 'B');
});

test('extractJsonLdScripts skips blocks that fail to parse', () => {
  const html = `
    <script type="application/ld+json">not json</script>
    <script type="application/ld+json">{"valid": true}</script>
  `;
  const result = extractJsonLdScripts(html);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].valid, true);
});

test('extractJsonLdScripts returns [] when no ld+json present', () => {
  const html = `<html><head><script>alert(1)</script></head></html>`;
  const result = extractJsonLdScripts(html);
  assert.deepStrictEqual(result, []);
});

test('findRecipeNode returns the node when @type is "Recipe"', () => {
  const node = { '@type': 'Recipe', name: 'X' };
  assert.strictEqual(findRecipeNode([node]), node);
});

test('findRecipeNode returns the node when @type is an array containing "Recipe"', () => {
  const node = { '@type': ['Recipe', 'Article'], name: 'Y' };
  assert.strictEqual(findRecipeNode([node]), node);
});

test('findRecipeNode walks @graph entries', () => {
  const recipe = { '@type': 'Recipe', name: 'Z' };
  const wrapper = { '@graph': [{ '@type': 'WebPage' }, recipe] };
  assert.strictEqual(findRecipeNode([wrapper]), recipe);
});

test('findRecipeNode walks nested arrays', () => {
  const recipe = { '@type': 'Recipe', name: 'Q' };
  const tree = [[{ '@type': 'WebSite' }, [recipe]]];
  assert.strictEqual(findRecipeNode(tree), recipe);
});

test('findRecipeNode returns null when no Recipe present', () => {
  assert.strictEqual(findRecipeNode([{ '@type': 'WebSite' }]), null);
  assert.strictEqual(findRecipeNode([]), null);
});

const { parseIsoDuration } = require('../lib/scrape');

test('parseIsoDuration parses hours and minutes', () => {
  assert.strictEqual(parseIsoDuration('PT1H30M'), 90);
  assert.strictEqual(parseIsoDuration('PT45M'), 45);
  assert.strictEqual(parseIsoDuration('PT2H'), 120);
  assert.strictEqual(parseIsoDuration('PT0H15M'), 15);
});

test('parseIsoDuration handles seconds (rounded down to whole minutes)', () => {
  // PT1H30M30S → 90 minutes (we drop seconds for v0)
  assert.strictEqual(parseIsoDuration('PT1H30M30S'), 90);
});

test('parseIsoDuration returns null for malformed or missing input', () => {
  assert.strictEqual(parseIsoDuration(''), null);
  assert.strictEqual(parseIsoDuration(null), null);
  assert.strictEqual(parseIsoDuration('30 min'), null);
  assert.strictEqual(parseIsoDuration('PT'), null);
});

const { flattenInstructions } = require('../lib/scrape');

test('flattenInstructions handles a single string', () => {
  assert.deepStrictEqual(
    flattenInstructions('Mix everything. Bake at 350°F for 30 minutes.'),
    ['Mix everything. Bake at 350°F for 30 minutes.']
  );
});

test('flattenInstructions handles an array of strings', () => {
  assert.deepStrictEqual(
    flattenInstructions(['Step 1', 'Step 2']),
    ['Step 1', 'Step 2']
  );
});

test('flattenInstructions handles HowToStep objects (uses .text)', () => {
  const input = [
    { '@type': 'HowToStep', text: 'Do A' },
    { '@type': 'HowToStep', text: 'Do B' }
  ];
  assert.deepStrictEqual(flattenInstructions(input), ['Do A', 'Do B']);
});

test('flattenInstructions recurses into HowToSection.itemListElement', () => {
  const input = [
    { '@type': 'HowToSection', itemListElement: [
      { '@type': 'HowToStep', text: 'A1' },
      { '@type': 'HowToStep', text: 'A2' }
    ]},
    { '@type': 'HowToSection', itemListElement: [
      { '@type': 'HowToStep', text: 'B1' }
    ]}
  ];
  assert.deepStrictEqual(flattenInstructions(input), ['A1', 'A2', 'B1']);
});

test('flattenInstructions returns [] for missing/empty input', () => {
  assert.deepStrictEqual(flattenInstructions(undefined), []);
  assert.deepStrictEqual(flattenInstructions(null), []);
  assert.deepStrictEqual(flattenInstructions([]), []);
  assert.deepStrictEqual(flattenInstructions(''), []);
});

test('flattenInstructions trims whitespace and drops empties', () => {
  assert.deepStrictEqual(
    flattenInstructions(['  one  ', '', '   ', 'two']),
    ['one', 'two']
  );
});

const { normalizeRecipe, normalizeImage, normalizeYield } = require('../lib/scrape');

test('normalizeImage handles string', () => {
  assert.strictEqual(normalizeImage('https://x.com/a.jpg'), 'https://x.com/a.jpg');
});

test('normalizeImage handles array (takes first)', () => {
  assert.strictEqual(normalizeImage(['https://x/a.jpg', 'https://x/b.jpg']), 'https://x/a.jpg');
});

test('normalizeImage handles object with url', () => {
  assert.strictEqual(normalizeImage({ url: 'https://x/a.jpg' }), 'https://x/a.jpg');
});

test('normalizeImage handles array of objects', () => {
  assert.strictEqual(normalizeImage([{ url: 'https://x/a.jpg' }]), 'https://x/a.jpg');
});

test('normalizeImage returns null for missing/invalid', () => {
  assert.strictEqual(normalizeImage(undefined), null);
  assert.strictEqual(normalizeImage(null), null);
  assert.strictEqual(normalizeImage([]), null);
  assert.strictEqual(normalizeImage({ noUrl: 'x' }), null);
});

test('normalizeYield coerces number to string', () => {
  assert.strictEqual(normalizeYield(4), '4');
});

test('normalizeYield trims string', () => {
  assert.strictEqual(normalizeYield('  4 servings  '), '4 servings');
});

test('normalizeYield takes first of array', () => {
  assert.strictEqual(normalizeYield(['4 servings', '500g']), '4 servings');
});

test('normalizeYield returns null for empty/missing', () => {
  assert.strictEqual(normalizeYield(undefined), null);
  assert.strictEqual(normalizeYield(''), null);
  assert.strictEqual(normalizeYield([]), null);
});

test('normalizeRecipe builds the full shape from a JSON-LD node', () => {
  const node = {
    '@type': 'Recipe',
    name: 'Pasta',
    description: 'Tasty.',
    image: 'https://x/a.jpg',
    recipeYield: '4 servings',
    prepTime: 'PT15M',
    cookTime: 'PT30M',
    recipeIngredient: ['  2 cups flour  ', '1 egg', ''],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Mix' },
      { '@type': 'HowToStep', text: 'Cook' }
    ]
  };
  const r = normalizeRecipe(node, 'https://example.com/pasta');
  assert.strictEqual(r.title, 'Pasta');
  assert.strictEqual(r.description, 'Tasty.');
  assert.strictEqual(r.imageUrl, 'https://x/a.jpg');
  assert.strictEqual(r.servings, '4 servings');
  assert.strictEqual(r.totalMinutes, 45); // prep+cook fallback
  assert.deepStrictEqual(r.ingredients, ['2 cups flour', '1 egg']);
  assert.deepStrictEqual(r.instructions, ['Mix', 'Cook']);
  assert.strictEqual(r.sourceUrl, 'https://example.com/pasta');
});

test('normalizeRecipe prefers totalTime over prep+cook', () => {
  const node = {
    '@type': 'Recipe',
    name: 'X',
    totalTime: 'PT1H',
    prepTime: 'PT15M',
    cookTime: 'PT30M'
  };
  const r = normalizeRecipe(node, 'https://x/');
  assert.strictEqual(r.totalMinutes, 60);
});

test('normalizeRecipe defaults missing fields cleanly', () => {
  const node = { '@type': 'Recipe', name: 'Bare' };
  const r = normalizeRecipe(node, 'https://x/');
  assert.strictEqual(r.title, 'Bare');
  assert.strictEqual(r.description, '');
  assert.strictEqual(r.imageUrl, null);
  assert.strictEqual(r.servings, null);
  assert.strictEqual(r.totalMinutes, null);
  assert.deepStrictEqual(r.ingredients, []);
  assert.deepStrictEqual(r.instructions, []);
});

const fs = require('node:fs');
const path = require('node:path');
const { scrape } = require('../lib/scrape');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function mockFetch(html, { status = 200, contentType = 'text/html; charset=utf-8' } = {}) {
  return async (_url, _opts) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => html,
    body: { getReader: () => null } // unused; we use text()
  });
}

test('scrape returns ok with normalized recipe (basic fixture)', async () => {
  const result = await scrape('https://example.com/basic', {
    fetch: mockFetch(fixture('recipe-basic.html')),
    now: new Date('2026-05-05T12:00:00Z')
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.recipe.title, 'Basic Pasta');
  assert.strictEqual(result.recipe.servings, '4 servings');
  assert.strictEqual(result.recipe.totalMinutes, 30);
  assert.strictEqual(result.recipe.ingredients.length, 3);
  assert.strictEqual(result.recipe.instructions.length, 3);
  assert.strictEqual(result.recipe.sourceUrl, 'https://example.com/basic');
});

test('scrape walks @graph and HowToSection (graph fixture)', async () => {
  const result = await scrape('https://example.com/stew', {
    fetch: mockFetch(fixture('recipe-graph.html')),
    now: new Date()
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.recipe.title, 'Sectioned Stew');
  assert.strictEqual(result.recipe.imageUrl, 'https://example.com/stew.jpg');
  assert.deepStrictEqual(result.recipe.instructions, ['Sauté onion.', 'Add broth.']);
});

test('scrape returns ok:false when no JSON-LD on page', async () => {
  const result = await scrape('https://example.com/empty', {
    fetch: mockFetch(fixture('recipe-no-ld.html')),
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /No recipe data/);
});

test('scrape returns ok:false on non-200', async () => {
  const result = await scrape('https://example.com/x', {
    fetch: mockFetch('whatever', { status: 404 }),
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /404|Couldn't reach/);
});

test('scrape returns ok:false on non-HTML content type', async () => {
  const result = await scrape('https://example.com/x', {
    fetch: mockFetch('{}', { contentType: 'application/json' }),
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /not HTML|HTML/i);
});

test('scrape surfaces fetch errors', async () => {
  const result = await scrape('https://nope.invalid/', {
    fetch: async () => { throw new Error('ENOTFOUND'); },
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /Couldn't reach/);
});
