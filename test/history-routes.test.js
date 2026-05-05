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

test('GET /history shows empty state when there are no past weeks', async () => {
  const res = await helpers.request(ctx.port, { path: '/history' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/history"[^>]*class="tab active"/);
  assert.match(res.body, /No past weeks yet/);
});

test('GET /history lists past weeks (reads state directly to seed)', async () => {
  // Seed state directly
  const storage = require('../lib/storage');
  const state = storage.get();
  state.recipes.push({ id: 'a', title: 'Old Recipe', addedAt: '2026-04-20T00:00:00Z' });
  state.weeks.push({ weekStart: '2026-04-20', recipeIds: ['a'], confirmed: true, modifiedAfterConfirm: false });
  storage.save();

  const res = await helpers.request(ctx.port, { path: '/history' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /2026-04-20/);
  assert.match(res.body, /Old Recipe/);
});
