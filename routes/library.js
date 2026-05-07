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

// Stubs for Plans 03/04/05 -- return 404 so tests can assert the routes are not yet wired.
// (These will be replaced in subsequent plans; the 404s are intentional placeholders.)
// router.get('/library/:id', ...)         <- Plan 03
// router.get('/library/:id/edit', ...)    <- Plan 03
// router.post('/library', ...)            <- Plan 03
// router.post('/library/:id', ...)        <- Plan 04
// router.delete('/library/:id', ...)      <- Plan 05

module.exports = router;
