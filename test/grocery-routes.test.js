const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const helpers = require('./_helpers');

let ctx;

beforeEach(async () => {
  helpers.setupDataDir();
  ctx = await helpers.startTestServer();
});

afterEach(async () => {
  await helpers.stopTestServer(ctx.server);
  helpers.teardownDataDir();
});

async function addItem(port, text) {
  const res = await helpers.request(port, { method: 'POST', path: '/grocery', body: { text } });
  // Extract id from rendered body
  const m = res.body.match(/id="grocery-item-(g_[a-z0-9]+)"/);
  return m ? m[1] : null;
}

test('GET /grocery renders the page with empty state', async () => {
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/grocery"[^>]*class="tab active"/);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /Grocery list is empty/);
});

test('POST /grocery adds an item and OOB-swaps the list with category grouping', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/grocery',
    body: { text: '  eggs  ' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, /<h3 class="grocery-category">Dairy<\/h3>/);
  assert.match(res.body, />eggs</);
  assert.match(res.headers['x-status-toast'] || '', /Added/);
});

test('POST /grocery rejects empty text with 400', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/grocery',
    body: { text: '   ' }
  });
  assert.strictEqual(res.status, 400);
});

test('POST /grocery/:id/check toggles checked state', async () => {
  const id = await addItem(ctx.port, 'eggs');
  assert.ok(id);
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/grocery/${id}/check` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, new RegExp(`id="grocery-item-${id}"`));
  assert.match(res.body, /class="grocery-item is-checked"/);
  assert.match(res.body, /hx-swap-oob="true"/);
});

test('POST /grocery/:id/check 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/grocery/g_nope/check' });
  assert.strictEqual(res.status, 404);
});

test('DELETE /grocery/:id removes the item and OOB-swaps the list', async () => {
  const id = await addItem(ctx.port, 'eggs');
  const res = await helpers.request(ctx.port, { method: 'DELETE', path: `/grocery/${id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /Grocery list is empty/);
  assert.match(res.headers['x-status-toast'] || '', /Removed/);
});

test('DELETE /grocery/:id 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'DELETE', path: '/grocery/g_nope' });
  assert.strictEqual(res.status, 404);
});

test('POST /grocery/clear-checked removes only checked items', async () => {
  const idA = await addItem(ctx.port, 'eggs');
  const idB = await addItem(ctx.port, 'milk');
  await helpers.request(ctx.port, { method: 'POST', path: `/grocery/${idA}/check` });
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/grocery/clear-checked' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, />milk</);
  assert.doesNotMatch(res.body, />eggs</);
  assert.match(res.headers['x-status-toast'] || '', /Cleared 1 item/);
});

test('POST /grocery/clear-checked with nothing checked says so', async () => {
  await addItem(ctx.port, 'eggs');
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/grocery/clear-checked' });
  assert.match(res.headers['x-status-toast'] || '', /Nothing to clear/);
});
