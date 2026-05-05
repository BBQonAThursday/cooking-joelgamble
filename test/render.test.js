const { test } = require('node:test');
const assert = require('node:assert');
const { injectOob } = require('../lib/render');

test('injectOob adds hx-swap-oob to the root element', () => {
  const html = '<div id="recipes-panel" class="x">child</div>';
  const out = injectOob(html);
  assert.match(out, /hx-swap-oob="true"/);
  assert.match(out, /id="recipes-panel"/);
});

test('injectOob is idempotent if hx-swap-oob already present', () => {
  const html = '<div id="x" hx-swap-oob="true">y</div>';
  const out = injectOob(html);
  assert.strictEqual(out.match(/hx-swap-oob="true"/g).length, 1);
});

test('injectOob preserves leading whitespace handling', () => {
  const html = '\n  <section id="recipes-panel"></section>';
  const out = injectOob(html);
  assert.match(out, /<section id="recipes-panel" hx-swap-oob="true">/);
});
