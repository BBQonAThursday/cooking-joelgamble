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

// LIB-04: Manual add. Form submission from views/library.njk top form.
// On success: full panel re-render (D-67 Claude's Discretion) so the new entry
// lands at its alphabetical position with no client-side positioning logic.
router.post('/library', (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const aliasesRaw = typeof body.aliases === 'string' ? body.aliases : '';
  const recipeCategory = typeof body.recipeCategory === 'string' ? body.recipeCategory : '';
  const groceryCategory = typeof body.groceryCategory === 'string' ? body.groceryCategory : '';

  if (!name) {
    return res.status(400).type('text').send('Name required');
  }
  if (!RECIPE_CATEGORIES.includes(recipeCategory)) {
    return res.status(400).type('text').send('Invalid recipe category');
  }
  if (!GROCERY_CATEGORIES.includes(groceryCategory)) {
    return res.status(400).type('text').send('Invalid grocery category');
  }

  // Parse aliases: split on comma, trim, drop empties, dedupe via Set (D-60).
  const aliases = [...new Set(
    aliasesRaw.split(',').map(a => a.trim()).filter(Boolean)
  )];

  // Validate aliases against state.library; reject if any alias collides.
  const state = storage.get();
  for (const alias of aliases) {
    const conflict = aliasConflict(state, alias);
    if (conflict) {
      return res.status(400).type('text').send(
        `Alias '${alias}' is already used by '${conflict.name}'`
      );
    }
  }

  // Construct entry. newLibraryEntry validates categories + dedupes aliases (a second
  // dedupe is safe; it's idempotent). curated:true per LIB-04.
  let entry;
  try {
    entry = newLibraryEntry({ name, aliases, recipeCategory, groceryCategory, curated: true });
  } catch (err) {
    return res.status(400).type('text').send(err.message);
  }

  if (!Array.isArray(state.library)) state.library = [];
  state.library.push(entry);
  storage.save();

  setToast(res, 'Added entry');
  respondWithUpdates(req, res, {
    panels: ['partials/library-panel.njk'],
    extra: buildLibraryView(state)
  });
});

// LIB-05 / D-60..D-63: Edit save. Validates name + categories + alias conflicts.
// Success: row fragment + OOB-footer fragment (compound response per RESEARCH.md
// "Compound Row + Footer" -- do NOT use respondWithUpdates here; it would inject
// hx-swap-oob on the row itself, breaking the primary outerHTML swap target).
// 400: edit-form fragment with inline error (form stays open per D-61).
// 404: plain text (id not found).
router.post('/library/:id', (req, res) => {
  const id = req.params.id;
  const state = storage.get();
  const library = Array.isArray(state.library) ? state.library : [];
  const idx = library.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).type('text').send('Not found');

  const existing = library[idx];
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const aliasesRaw = typeof body.aliases === 'string' ? body.aliases : '';
  const recipeCategory = typeof body.recipeCategory === 'string' ? body.recipeCategory : '';
  const groceryCategory = typeof body.groceryCategory === 'string' ? body.groceryCategory : '';

  // Parse aliases (D-60): split on ',', trim, drop empty, dedupe via Set.
  const aliases = [...new Set(
    aliasesRaw.split(',').map(a => a.trim()).filter(Boolean)
  )];

  // Helper: build the edit-form view object that re-renders the form with the
  // user's typed values + an inline error. Used by all 400 paths.
  function renderEditFormError(errorMsg) {
    const formView = {
      id,
      name,
      aliases,
      aliasesDisplay: aliases.join(', '),
      recipeCategory,
      groceryCategory,
      curated: !!existing.curated,
      aliasError: errorMsg
    };
    const html = renderSync(req, 'partials/library-row-edit.njk', {
      entry: formView,
      RECIPE_CATEGORIES,
      GROCERY_CATEGORIES
    });
    // D-61: NO setToast on 400. The inline error is the user feedback.
    return res.status(400).type('html').send(html);
  }

  // Validation 1: name required.
  if (!name) {
    return renderEditFormError('Name is required.');
  }
  // Validation 2: recipeCategory enum.
  if (!RECIPE_CATEGORIES.includes(recipeCategory)) {
    return renderEditFormError(`Invalid recipe category '${recipeCategory}'.`);
  }
  // Validation 3: groceryCategory enum.
  if (!GROCERY_CATEGORIES.includes(groceryCategory)) {
    return renderEditFormError(`Invalid grocery category '${groceryCategory}'.`);
  }
  // Validation 4: alias conflict -- pass id as excludingId so editing one's own
  // alias is not flagged as a self-conflict (D-60 / T-05-04-04).
  for (const alias of aliases) {
    const conflict = aliasConflict(state, alias, id);
    if (conflict) {
      return renderEditFormError(
        `Alias '${alias}' is already used by '${conflict.name}'.`
      );
    }
  }

  // All valid: update in place. LIB-05 sets curated:true on save regardless of
  // prior value. The ELS spread preserves any future fields (e.g. createdAt,
  // future nutrition fields per CLAUDE.md extensibility note).
  library[idx] = {
    ...existing,
    name,
    aliases,
    recipeCategory,
    groceryCategory,
    curated: true
  };
  state.library = library;
  storage.save();

  // D-63: Compound response -- primary row fragment + OOB-footer fragment.
  // CRITICAL: do NOT use respondWithUpdates -- it would inject hx-swap-oob on
  // the row, breaking the primary swap target (RESEARCH.md Pitfall 2 / 05-PATTERNS.md).
  setToast(res, 'Saved entry');
  const updatedView = buildLibraryView(state);
  const updatedEntry = updatedView.entries.find(e => e.id === id);
  const rowHtml = renderSync(req, 'partials/library-row.njk', {
    entry: updatedEntry,
    RECIPE_CATEGORIES,
    GROCERY_CATEGORIES
  });
  const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', updatedView));
  res.type('html').send(rowHtml + '\n' + footerHtml);
});

// router.delete('/library/:id', ...)      <- Plan 05

module.exports = router;
