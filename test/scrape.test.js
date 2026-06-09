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

function mockFetch(html, { status = 200, contentType = 'text/html; charset=utf-8', responseHeaders = {} } = {}) {
  const headerMap = { 'content-type': contentType };
  for (const [k, v] of Object.entries(responseHeaders)) headerMap[k.toLowerCase()] = v;
  return async (_url, _opts) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headerMap[name.toLowerCase()] != null ? headerMap[name.toLowerCase()] : null },
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

test('scrape sends Accept and Accept-Language request headers', async () => {
  let captured;
  const inner = mockFetch(fixture('recipe-basic.html'));
  const captureFetch = async (url, opts) => {
    captured = opts;
    return inner(url, opts);
  };
  await scrape('https://example.com/basic', { fetch: captureFetch, now: new Date() });
  assert.ok(captured && captured.headers, 'expected fetch to receive headers');
  const h = captured.headers;
  const accept = h.Accept || h.accept;
  const acceptLang = h['Accept-Language'] || h['accept-language'];
  assert.ok(accept, `expected Accept header to be set, got headers=${JSON.stringify(h)}`);
  assert.ok(acceptLang, `expected Accept-Language header to be set, got headers=${JSON.stringify(h)}`);
});

test('scrape returns a clearer reason when Cloudflare bot-mitigation blocks the request', async () => {
  const result = await scrape('https://www.foodandwine.com/recipes/x', {
    fetch: mockFetch('<html>Just a moment...</html>', {
      status: 403,
      responseHeaders: { 'cf-mitigated': 'challenge', 'server': 'cloudflare' }
    }),
    now: new Date()
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /bot|blocked/i);
});

// ----- parseIngredientSections + decodeHtmlEntities (Task 1 / quick-260609-nph) -----

const { parseIngredientSections, decodeHtmlEntities } = require('../lib/scrape');

// WPRM fixture HTML: 2 named groups with entities.
const WPRM_2_GROUPS = `
<div class="wprm-recipe-ingredient-group">
  <h4 class="wprm-recipe-group-name">To Saute &amp; Puree</h4>
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">2</span>
      <span class="wprm-recipe-ingredient-unit">tbsp</span>
      <span class="wprm-recipe-ingredient-name">oil</span>
    </li>
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">1</span>
      <span class="wprm-recipe-ingredient-unit">cup</span>
      <span class="wprm-recipe-ingredient-name">tomatoes</span>
      <span class="wprm-recipe-ingredient-notes">chopped</span>
    </li>
  </ul>
</div>
<div class="wprm-recipe-ingredient-group">
  <h4 class="wprm-recipe-group-name">For Matar Paneer Gravy</h4>
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">200</span>
      <span class="wprm-recipe-ingredient-unit">g</span>
      <span class="wprm-recipe-ingredient-name">paneer</span>
    </li>
  </ul>
</div>
`;

// WPRM fixture: single unnamed group (no h4 heading).
const WPRM_SINGLE_UNNAMED = `
<div class="wprm-recipe-ingredient-group">
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">1</span>
      <span class="wprm-recipe-ingredient-name">onion</span>
    </li>
  </ul>
</div>
`;

// Non-WPRM HTML: no wprm-recipe-ingredient-group divs.
const NON_WPRM_HTML = `
<html><body>
  <ul class="ingredients-list">
    <li>1 cup flour</li>
    <li>2 eggs</li>
  </ul>
</body></html>
`;

test('parseIngredientSections: 2-named-groups WPRM fixture returns 2 sections', () => {
  const sections = parseIngredientSections(WPRM_2_GROUPS);
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].heading, 'To Saute & Puree');
  assert.strictEqual(sections[1].heading, 'For Matar Paneer Gravy');
  assert.ok(sections[0].items.length >= 2, 'first group should have items');
  assert.ok(sections[1].items.length >= 1, 'second group should have items');
});

test('parseIngredientSections: section headings are ASCII-only (& decoded, no non-ASCII)', () => {
  const sections = parseIngredientSections(WPRM_2_GROUPS);
  for (const sec of sections) {
    if (sec.heading) {
      // All characters must be in ASCII range.
      assert.ok(/^[\x00-\x7F]*$/.test(sec.heading),
        'heading must be ASCII-only: ' + sec.heading);
    }
    for (const item of sec.items) {
      assert.ok(/^[\x00-\x7F]*$/.test(item), 'item must be ASCII-only: ' + item);
    }
  }
});

test('parseIngredientSections: items are plain text (tags stripped, whitespace collapsed)', () => {
  const sections = parseIngredientSections(WPRM_2_GROUPS);
  // Each item should not contain any HTML tags.
  for (const sec of sections) {
    for (const item of sec.items) {
      assert.doesNotMatch(item, /<[^>]+>/, 'item must not contain HTML tags');
      // No double spaces from collapsed whitespace.
      assert.doesNotMatch(item, /  /, 'item must not contain double spaces');
    }
  }
});

test('parseIngredientSections: single unnamed WPRM group returns [] (flat fallback)', () => {
  const sections = parseIngredientSections(WPRM_SINGLE_UNNAMED);
  assert.deepStrictEqual(sections, []);
});

test('parseIngredientSections: non-WPRM HTML returns []', () => {
  const sections = parseIngredientSections(NON_WPRM_HTML);
  assert.deepStrictEqual(sections, []);
});

test('parseIngredientSections: empty string returns []', () => {
  assert.deepStrictEqual(parseIngredientSections(''), []);
});

test('parseIngredientSections: non-string returns []', () => {
  assert.deepStrictEqual(parseIngredientSections(null), []);
  assert.deepStrictEqual(parseIngredientSections(undefined), []);
});

// WPRM fixture with entity-encoded heading and smart apostrophe in item.
const WPRM_ENTITIES = `
<div class="wprm-recipe-ingredient-group">
  <h4 class="wprm-recipe-group-name">Sauce &amp; Base</h4>
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-name">garlic&#8217;s cloves</span>
    </li>
  </ul>
</div>
<div class="wprm-recipe-ingredient-group">
  <h4 class="wprm-recipe-group-name">Topping &ndash; optional</h4>
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-name">cheese</span>
    </li>
  </ul>
</div>
`;

test('parseIngredientSections: entity decoding in headings and items (ASCII output)', () => {
  const sections = parseIngredientSections(WPRM_ENTITIES);
  assert.strictEqual(sections.length, 2);
  // &amp; decoded to &, &ndash; decoded to -.
  assert.strictEqual(sections[0].heading, 'Sauce & Base');
  assert.strictEqual(sections[1].heading, 'Topping - optional');
  // &#8217; (smart apostrophe) decoded to plain apostrophe.
  assert.ok(sections[0].items[0].includes("garlic's cloves"),
    'smart apostrophe should decode to straight apostrophe');
  // All output ASCII.
  for (const sec of sections) {
    if (sec.heading) assert.ok(/^[\x00-\x7F]*$/.test(sec.heading));
    for (const item of sec.items) assert.ok(/^[\x00-\x7F]*$/.test(item));
  }
});

test('decodeHtmlEntities: common named entities decode correctly', () => {
  assert.strictEqual(decodeHtmlEntities('&amp;'), '&');
  assert.strictEqual(decodeHtmlEntities('&lt;&gt;'), '<>');
  assert.strictEqual(decodeHtmlEntities('&quot;'), '"');
  assert.strictEqual(decodeHtmlEntities('&apos;'), "'");
  assert.strictEqual(decodeHtmlEntities('&nbsp;'), ' ');
  assert.strictEqual(decodeHtmlEntities('&ndash;'), '-');
  assert.strictEqual(decodeHtmlEntities('&mdash;'), '-');
  assert.strictEqual(decodeHtmlEntities('&hellip;'), '...');
});

test('decodeHtmlEntities: numeric decimal entities decode to ASCII', () => {
  // &#8217; is right single quote U+2019 -> '
  assert.strictEqual(decodeHtmlEntities('&#8217;'), "'");
  // &#8220; is left double quote U+201C -> "
  assert.strictEqual(decodeHtmlEntities('&#8220;'), '"');
  // &#8221; is right double quote U+201D -> "
  assert.strictEqual(decodeHtmlEntities('&#8221;'), '"');
  // &#8211; is en dash U+2013 -> -
  assert.strictEqual(decodeHtmlEntities('&#8211;'), '-');
  // &#8212; is em dash U+2014 -> -
  assert.strictEqual(decodeHtmlEntities('&#8212;'), '-');
  // &#160; is non-breaking space U+00A0 -> space
  assert.strictEqual(decodeHtmlEntities('&#160;'), ' ');
  // &#65; is 'A' (safe ASCII)
  assert.strictEqual(decodeHtmlEntities('&#65;'), 'A');
});

test('decodeHtmlEntities: numeric hex entities decode to ASCII', () => {
  // &#x2019; is right single quote -> '
  assert.strictEqual(decodeHtmlEntities('&#x2019;'), "'");
  // &#x201C; is left double quote -> "
  assert.strictEqual(decodeHtmlEntities('&#x201C;'), '"');
  // &#x2013; is en dash -> -
  assert.strictEqual(decodeHtmlEntities('&#x2013;'), '-');
});

test('decodeHtmlEntities: raw non-ASCII Unicode stripped/mapped to ASCII', () => {
  // Smart quote characters in raw UTF-8.
  assert.strictEqual(decodeHtmlEntities('‘hello’'), "'hello'");
  // En/em dash.
  assert.strictEqual(decodeHtmlEntities('a–b'), 'a-b');
  assert.strictEqual(decodeHtmlEntities('a—b'), 'a-b');
  // Ellipsis.
  assert.strictEqual(decodeHtmlEntities('wait…'), 'wait...');
  // Non-breaking space.
  assert.strictEqual(decodeHtmlEntities('a b'), 'a b');
  // Arbitrary high codepoint stripped.
  assert.strictEqual(decodeHtmlEntities('café'), 'caf');
});

test('decodeHtmlEntities: output is always ASCII-only', () => {
  const inputs = ['&amp;', '&mdash;', '&#8217;', '&#x201C;', '…', 'plain text'];
  for (const inp of inputs) {
    const out = decodeHtmlEntities(inp);
    assert.ok(/^[\x00-\x7F]*$/.test(out), 'output must be ASCII-only for input: ' + inp);
  }
});

test('normalizeRecipe includes ingredientSections when WPRM html provided', () => {
  const node = {
    '@type': 'Recipe',
    name: 'Curry',
    recipeIngredient: ['2 tbsp oil', '1 cup tomatoes', '200g paneer'],
    recipeInstructions: []
  };
  const result = normalizeRecipe(node, 'https://example.com/', WPRM_2_GROUPS);
  // Flat ingredients from JSON-LD node must be unchanged.
  assert.deepStrictEqual(result.ingredients, ['2 tbsp oil', '1 cup tomatoes', '200g paneer']);
  // ingredientSections populated from WPRM html.
  assert.ok(Array.isArray(result.ingredientSections), 'ingredientSections must be an array');
  assert.strictEqual(result.ingredientSections.length, 2);
  assert.strictEqual(result.ingredientSections[0].heading, 'To Saute & Puree');
  assert.strictEqual(result.ingredientSections[1].heading, 'For Matar Paneer Gravy');
});

test('normalizeRecipe ingredientSections is [] when no WPRM html (flat fallback)', () => {
  const node = { '@type': 'Recipe', name: 'Bare', recipeIngredient: ['salt'] };
  const result = normalizeRecipe(node, 'https://example.com/');
  assert.deepStrictEqual(result.ingredientSections, []);
  assert.deepStrictEqual(result.ingredients, ['salt']);
});

test('normalizeRecipe ingredientSections is [] for non-WPRM html', () => {
  const node = { '@type': 'Recipe', name: 'Plain', recipeIngredient: ['flour'] };
  const result = normalizeRecipe(node, 'https://example.com/', NON_WPRM_HTML);
  assert.deepStrictEqual(result.ingredientSections, []);
  assert.deepStrictEqual(result.ingredients, ['flour']);
});
