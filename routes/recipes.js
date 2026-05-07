const express = require('express');
const storage = require('../lib/storage');
const scrapeMod = require('../lib/scrape');
const { idForUrl } = require('../lib/id');
const { respondWithUpdates } = require('../lib/render');
const { sourceDomain, formatTotalTime, decorateIngredients } = require('../lib/calc');
// Module reference (not destructured) so test/recipes.test.js's D-48
// monkey-patch (libraryMod.extractAndSeed = ...) takes effect — mirrors
// the scrapeMod idiom used at line 3 of this file.
const libraryMod = require('../lib/library');

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

    // [PHASE 4 EXTR-01] Auto-extract: synchronous, best-effort (D-46/D-47/D-48).
    try {
      const extractResult = libraryMod.extractAndSeed(state, entry.ingredients);
      if (extractResult.added.length || extractResult.aliasesAppended.length) {
        storage.save();
      }
    } catch (err) {
      console.error('[extract] failed for recipe', entry.id, err.message);
    }

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
  const { mondayOf } = require('../lib/week');
  const monday = mondayOf(new Date());
  const week = (state.weeks || []).find(w => w.weekStart === monday);
  const isTagged = !!(week && week.recipeIds.includes(recipe.id));
  const decorated = {
    ...recipe,
    sourceDomain: sourceDomain(recipe.sourceUrl),
    totalTimeLabel: formatTotalTime(recipe.totalMinutes),
    isTagged,
    ingredientGroups: decorateIngredients(recipe.ingredients, state.library)
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
