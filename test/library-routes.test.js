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

// Helper: post the manual-add form and extract the new entry's id from the rendered row.
// Used by tests in plans 03..05. ID format mirrors newLibraryId('lb_' + 8 base36 chars).
async function addLibraryEntry(port, fields) {
  const res = await helpers.request(port, {
    method: 'POST',
    path: '/library',
    body: fields // { name, aliases, recipeCategory, groceryCategory }
  });
  const m = res.body.match(/id="library-row-(lb_[a-z0-9]+)"/);
  return m ? m[1] : null;
}

// Wave 0 smoke: file loads, helpers import, server boots. Real /library coverage
// arrives in plans 02..06.
test('Wave 0 smoke: test scaffold loads and server boots', async () => {
  const res = await helpers.request(ctx.port, { path: '/healthz' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, 'ok');
});

module.exports = { addLibraryEntry };
