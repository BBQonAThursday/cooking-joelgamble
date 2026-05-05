const express = require('express');
const storage = require('../lib/storage');
const scrapeMod = require('../lib/scrape');
const { idForUrl } = require('../lib/id');
const { respondWithUpdates } = require('../lib/render');

const router = express.Router();

function setToast(res, msg) {
  // Single ASCII line, capped to a sane size.
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

router.post('/recipes', async (req, res, next) => {
  try {
    const url = req.body && typeof req.body.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      return res.status(400).type('text').send('Missing url');
    }

    const result = await scrapeMod.scrape(url, { fetch: globalThis.fetch, now: new Date() });
    if (!result.ok) {
      setToast(res, result.reason);
      return respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
    }

    const id = idForUrl(url);
    const now = new Date().toISOString();
    const state = storage.get();
    const existingIdx = state.recipes.findIndex(r => r.id === id);
    const entry = { id, addedAt: now, ...result.recipe };
    let toastVerb;
    if (existingIdx >= 0) {
      state.recipes[existingIdx] = entry;
      toastVerb = 'Updated';
    } else {
      state.recipes.unshift(entry);
      toastVerb = 'Saved';
    }
    storage.save();

    setToast(res, `${toastVerb}: ${entry.title}`);
    respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
