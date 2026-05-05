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

test('GET /grocery renders the page with empty state', async () => {
  const res = await helpers.request(ctx.port, { path: '/grocery' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/grocery"[^>]*class="tab active"/);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /Grocery list is empty/);
});

test('POST /grocery adds an item and OOB-swaps the list', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/grocery',
    body: { text: '  eggs  ' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
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
