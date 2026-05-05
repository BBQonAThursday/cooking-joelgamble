const { test } = require('node:test');
const assert = require('node:assert');
const { idForUrl } = require('../lib/id');

test('idForUrl produces a 10-char base36 string', () => {
  const id = idForUrl('https://example.com/recipe');
  assert.match(id, /^[0-9a-z]{10}$/);
});

test('idForUrl is deterministic (same URL → same id)', () => {
  const a = idForUrl('https://example.com/x');
  const b = idForUrl('https://example.com/x');
  assert.strictEqual(a, b);
});

test('idForUrl differs for different URLs', () => {
  const a = idForUrl('https://example.com/a');
  const b = idForUrl('https://example.com/b');
  assert.notStrictEqual(a, b);
});
