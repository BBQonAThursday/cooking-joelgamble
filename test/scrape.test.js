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
