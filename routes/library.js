const express = require('express');
const storage = require('../lib/storage');
const { buildLibraryView } = require('../lib/calc');
const { RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('../lib/categorize');
const { aliasConflict, newLibraryEntry } = require('../lib/library');
const { respondWithUpdates, renderSync, injectOob } = require('../lib/render');

const router = express.Router();

function setToast(res, msg) {
  const safe = String(msg).replace(/[\r\n]/g, ' ').slice(0, 200);
  res.set('X-Status-Toast', safe);
}

// LIB-02 / LIB-03: full-page GET. Reads q + filter from query params (D-58).
// Always returns the full page -- HTMX with hx-target=#library-panel and
// hx-swap=outerHTML extracts the panel automatically (RESEARCH.md Pitfall 4).
router.get('/library', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const filter = typeof req.query.filter === 'string' ? req.query.filter : 'All';
  res.render('library.njk', buildLibraryView(storage.get(), { q, filter }));
});

// Helper: find the entry view for a single library entry id, including the
// recipeCount-derived deleteConfirm and unused flag from buildLibraryView.
// Returns the decorated entry view, or undefined if not found.
function entryViewById(state, id) {
  const view = buildLibraryView(state);
  return view.entries.find(e => e.id === id);
}

// LIB-05 / D-62: Cancel target -- returns ONLY the read-only row fragment.
// HTMX outerHTML-swaps it into #library-row-:id, replacing the edit form.
router.get('/library/:id', (req, res) => {
  const state = storage.get();
  const entry = entryViewById(state, req.params.id);
  if (!entry) return res.status(404).type('text').send('Not found');
  const html = renderSync(req, 'partials/library-row.njk', {
    entry,
    RECIPE_CATEGORIES,
    GROCERY_CATEGORIES
  });
  res.type('html').send(html);
});

// LIB-05 / D-60: Edit target -- returns ONLY the edit-form fragment.
// HTMX outerHTML-swaps it into #library-row-:id, replacing the read-only row.
router.get('/library/:id/edit', (req, res) => {
  const state = storage.get();
  const entry = entryViewById(state, req.params.id);
  if (!entry) return res.status(404).type('text').send('Not found');
  const html = renderSync(req, 'partials/library-row-edit.njk', {
    entry,
    RECIPE_CATEGORIES,
    GROCERY_CATEGORIES
  });
  res.type('html').send(html);
});

// Stubs for Plans 04/05 -- return 404 so tests can assert the routes are not yet wired.
// router.post('/library/:id', ...)        <- Plan 04
// router.delete('/library/:id', ...)      <- Plan 05

module.exports = router;
