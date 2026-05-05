const express = require('express');
const storage = require('../lib/storage');
const { buildGroceryView } = require('../lib/calc');
const { addItem, toggleChecked } = require('../lib/grocery');
const { respondWithUpdates } = require('../lib/render');

const router = express.Router();

function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

router.get('/grocery', (req, res) => {
  res.render('grocery.njk', buildGroceryView(storage.get()));
});

router.post('/grocery', (req, res) => {
  const text = req.body && typeof req.body.text === 'string' ? req.body.text : '';
  const state = storage.get();
  const result = addItem(state, text);
  if (!result.ok) return res.status(400).type('text').send('Item required');
  storage.save();
  setToast(res, 'Added');
  const view = buildGroceryView(state);
  respondWithUpdates(req, res, {
    panels: ['partials/grocery-list.njk'],
    extra: view
  });
});

router.post('/grocery/:id/check', (req, res) => {
  const state = storage.get();
  const result = toggleChecked(state, req.params.id);
  if (!result.ok) return res.status(404).type('text').send('Not found');
  storage.save();
  // OOB-swap the single row
  respondWithUpdates(req, res, {
    panels: ['partials/grocery-item.njk'],
    extra: { item: result.item }
  });
});

module.exports = router;
