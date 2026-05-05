const { test } = require('node:test');
const assert = require('node:assert');
const { newGroceryId, addItem, toggleChecked, removeItem, clearChecked } = require('../lib/grocery');

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

test('toggleChecked flips an item from unchecked to checked', () => {
  const state = { grocery: [{ id: 'g_a', text: 'eggs', checked: false }] };
  const result = toggleChecked(state, 'g_a');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item.checked, true);
  assert.strictEqual(state.grocery[0].checked, true);
});

test('toggleChecked flips a checked item back to unchecked', () => {
  const state = { grocery: [{ id: 'g_a', text: 'eggs', checked: true }] };
  toggleChecked(state, 'g_a');
  assert.strictEqual(state.grocery[0].checked, false);
});

test('toggleChecked rejects an unknown id', () => {
  const state = { grocery: [{ id: 'g_a', text: 'eggs', checked: false }] };
  const result = toggleChecked(state, 'g_zzz');
  assert.deepStrictEqual(result, { ok: false, reason: 'unknown item' });
});

test('removeItem removes the item by id', () => {
  const state = { grocery: [
    { id: 'g_a', text: 'a', checked: false },
    { id: 'g_b', text: 'b', checked: false }
  ]};
  const result = removeItem(state, 'g_a');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.item.text, 'a');
  assert.strictEqual(state.grocery.length, 1);
  assert.strictEqual(state.grocery[0].id, 'g_b');
});

test('removeItem rejects an unknown id', () => {
  const state = { grocery: [{ id: 'g_a', text: 'a', checked: false }] };
  const result = removeItem(state, 'g_zzz');
  assert.deepStrictEqual(result, { ok: false, reason: 'unknown item' });
  assert.strictEqual(state.grocery.length, 1);
});

test('clearChecked removes only checked items', () => {
  const state = { grocery: [
    { id: 'g_a', text: 'a', checked: true },
    { id: 'g_b', text: 'b', checked: false },
    { id: 'g_c', text: 'c', checked: true }
  ]};
  const result = clearChecked(state);
  assert.strictEqual(result.clearedCount, 2);
  assert.strictEqual(state.grocery.length, 1);
  assert.strictEqual(state.grocery[0].id, 'g_b');
});

test('clearChecked is a no-op when none are checked', () => {
  const state = { grocery: [{ id: 'g_a', text: 'a', checked: false }] };
  const result = clearChecked(state);
  assert.strictEqual(result.clearedCount, 0);
  assert.strictEqual(state.grocery.length, 1);
});

test('clearChecked tolerates missing grocery array', () => {
  const state = {};
  const result = clearChecked(state);
  assert.strictEqual(result.clearedCount, 0);
});
