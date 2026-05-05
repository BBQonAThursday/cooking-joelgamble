const { test } = require('node:test');
const assert = require('node:assert');
const { extractJsonLdScripts } = require('../lib/scrape');

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
