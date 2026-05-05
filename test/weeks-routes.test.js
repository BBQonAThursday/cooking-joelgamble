const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const helpers = require('./_helpers');

const scrapeMod = require('../lib/scrape');
scrapeMod.scrape = async (url) => ({
  ok: true,
  recipe: {
    sourceUrl: url,
    title: 'Stub ' + url.split('/').pop(),
    description: '',
    imageUrl: null,
    servings: null,
    totalMinutes: 30,
    ingredients: ['ingredient-' + url.split('/').pop()],
    instructions: ['Cook.']
  }
});

let ctx;

beforeEach(async () => {
  helpers.setupDataDir();
  ctx = await helpers.startTestServer();
});

afterEach(async () => {
  await helpers.stopTestServer(ctx.server);
  helpers.teardownDataDir();
});

test('GET /this-week renders the page with empty state and active tab', async () => {
  const res = await helpers.request(ctx.port, { path: '/this-week' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /href="\/this-week"[^>]*class="tab active"/);
  assert.match(res.body, /id="this-week-panel"/);
  assert.match(res.body, /No recipes tagged for this week/);
  assert.match(res.body, /id="week-banner"/);
});

const { idForUrl } = require('../lib/id');

async function saveRecipe(port, url) {
  await helpers.request(port, { method: 'POST', path: '/recipes', body: { url } });
  return idForUrl(url);
}

test('POST /this-week/recipes/:id tags an unknown recipe (added)', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-tag-1');
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, new RegExp(`id="recipe-card-${id}"`));
  assert.match(res.body, new RegExp(`id="tag-toggle-${id}"`));
  assert.match(res.body, /class="tag-toggle is-tagged"/);
  assert.match(res.headers['x-status-toast'] || '', /Added to this week/);
});

test('POST /this-week/recipes/:id toggles off a tagged recipe (removed)', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-tag-2');
  await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  assert.strictEqual(res.status, 200);
  assert.doesNotMatch(res.body, /class="tag-toggle is-tagged"/);
  assert.match(res.headers['x-status-toast'] || '', /Removed from this week/);
});

test('POST /this-week/recipes/:id 404s for unknown id', async () => {
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/recipes/zzzzzzzzzz' });
  assert.strictEqual(res.status, 404);
});

test('POST /this-week/confirm adds tagged recipe ingredients to grocery', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-confirm-1');
  await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="week-banner"/);
  assert.match(res.body, /Confirmed ✓/);
  assert.match(res.headers['x-status-toast'] || '', /Added 1 item/);
});

test('POST /this-week/confirm with no tags returns the no-recipes toast', async () => {
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /No recipes tagged for this week/);
});

test('POST /this-week/confirm with all dupes returns "already up to date" toast', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-confirm-2');
  await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  // Second confirm — nothing to add
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  assert.match(res.headers['x-status-toast'] || '', /Already up to date/);
});

test('POST /this-week/unconfirm clears confirmation without touching grocery', async () => {
  const id = await saveRecipe(ctx.port, 'https://example.com/wk-unconf-1');
  await helpers.request(ctx.port, { method: 'POST', path: `/this-week/recipes/${id}` });
  await helpers.request(ctx.port, { method: 'POST', path: '/this-week/confirm' });
  const res = await helpers.request(ctx.port, { method: 'POST', path: '/this-week/unconfirm' });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['x-status-toast'] || '', /Confirmation cleared/);
  assert.doesNotMatch(res.body, /Confirmed ✓/);
});
