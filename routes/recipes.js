const express = require('express');
const storage = require('../lib/storage');
const scrapeMod = require('../lib/scrape');
const { idForUrl } = require('../lib/id');
const { respondWithUpdates } = require('../lib/render');
const { sourceDomain, formatTotalTime } = require('../lib/calc');

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

router.get('/recipes/:id', (req, res) => {
  const state = storage.get();
  const recipe = state.recipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).type('text').send('Not found');
  const decorated = {
    ...recipe,
    sourceDomain: sourceDomain(recipe.sourceUrl),
    totalTimeLabel: formatTotalTime(recipe.totalMinutes)
  };
  res.render('recipe.njk', { recipe: decorated });
});

router.delete('/recipes/:id', (req, res) => {
  const state = storage.get();
  const idx = state.recipes.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).type('text').send('Not found');
  const [removed] = state.recipes.splice(idx, 1);
  storage.save();
  setToast(res, `Deleted: ${removed.title}`);
  respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
});

module.exports = router;
