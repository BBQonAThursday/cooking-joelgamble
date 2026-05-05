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
