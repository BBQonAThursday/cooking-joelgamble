const express = require('express');
const storage = require('../lib/storage');
const { buildWeeklyView, sourceDomain, formatTotalTime } = require('../lib/calc');
const { tagRecipe, confirmWeek, unconfirmWeek } = require('../lib/week');
const { respondWithUpdates } = require('../lib/render');

const router = express.Router();

function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

router.get('/this-week', (req, res) => {
  res.render('this-week.njk', buildWeeklyView(storage.get(), new Date()));
});

router.post('/this-week/recipes/:id', (req, res) => {
  const today = new Date();
  const state = storage.get();
  const recipe = state.recipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).type('text').send('Not found');

  const result = tagRecipe(state, req.params.id, today);
  if (!result.ok) return res.status(400).type('text').send(result.reason);
  storage.save();

  setToast(res, result.isTagged ? 'Added to this week' : 'Removed from this week');

  const decoratedRecipe = {
    ...recipe,
    sourceDomain: sourceDomain(recipe.sourceUrl),
    totalTimeLabel: formatTotalTime(recipe.totalMinutes),
    isTagged: result.isTagged
  };
  // Two OOB fragments: re-rendered card AND re-rendered standalone toggle.
  // HTMX matches by id; whichever isn't in the current DOM is ignored.
  const currentUrl = req.headers['hx-current-url'] || '';
  const context = currentUrl.includes('/this-week') ? 'this-week' : 'recipes';
  respondWithUpdates(req, res, {
    panels: ['partials/recipe-card.njk', 'partials/tag-toggle.njk'],
    extra: { r: decoratedRecipe, id: decoratedRecipe.id, isTagged: result.isTagged, context }
  });
});

router.post('/this-week/confirm', (req, res) => {
  const today = new Date();
  const state = storage.get();
  const result = confirmWeek(state, today);
  if (!result.ok && result.reason === 'no recipes tagged') {
    setToast(res, 'No recipes tagged for this week');
    // No state change → no OOB needed; respond with empty body but the toast.
    return res.type('html').send('');
  }
  storage.save();
  if (result.addedCount === 0) {
    setToast(res, 'Already up to date - 0 items added');
  } else {
    setToast(res, `Added ${result.addedCount} item${result.addedCount === 1 ? '' : 's'} to grocery list`);
  }
  // OOB-swap the week banner.
  const view = buildWeeklyView(state, today);
  respondWithUpdates(req, res, {
    panels: ['partials/week-banner.njk'],
    extra: view
  });
});

router.post('/this-week/unconfirm', (req, res) => {
  const today = new Date();
  const state = storage.get();
  unconfirmWeek(state, today);
  storage.save();
  setToast(res, 'Confirmation cleared');
  const view = buildWeeklyView(state, today);
  respondWithUpdates(req, res, {
    panels: ['partials/week-banner.njk'],
    extra: view
  });
});

module.exports = router;
