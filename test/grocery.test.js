const { test } = require('node:test');
const assert = require('node:assert');
const { newGroceryId, addItem } = require('../lib/grocery');

test('newGroceryId returns a g_-prefixed string', () => {
  const id = newGroceryId();
  assert.match(id, /^g_[a-z0-9]+$/);
});

test('newGroceryId returns distinct ids on successive calls', () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) ids.add(newGroceryId());
  assert.strictEqual(ids.size, 50);
});

test('addItem appends a trimmed item to grocery', () => {
  const state = { grocery: [] };
  const result = addItem(state, '  eggs  ');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item.text, 'eggs');
  assert.strictEqual(result.item.checked, false);
  assert.match(result.item.id, /^g_/);
  assert.strictEqual(state.grocery.length, 1);
  assert.strictEqual(state.grocery[0], result.item);
});

test('addItem rejects empty / whitespace text', () => {
  const state = { grocery: [] };
  assert.deepStrictEqual(addItem(state, '').ok, false);
  assert.deepStrictEqual(addItem(state, '   ').ok, false);
  assert.deepStrictEqual(addItem(state, null).ok, false);
  assert.deepStrictEqual(addItem(state, undefined).ok, false);
  assert.strictEqual(state.grocery.length, 0);
});

test('addItem caps text at 500 chars', () => {
  const state = { grocery: [] };
  const long = 'x'.repeat(600);
  const result = addItem(state, long);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item.text.length, 500);
});

test('addItem tolerates missing grocery array', () => {
  const state = {};
  addItem(state, 'milk');
  assert.ok(Array.isArray(state.grocery));
  assert.strictEqual(state.grocery.length, 1);
});
