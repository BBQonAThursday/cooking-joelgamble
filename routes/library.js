const express = require('express');
const storage = require('../lib/storage');
const { buildLibraryView, buildGroceryView, decorateIngredients } = require('../lib/calc');
const { RECIPE_CATEGORIES, GROCERY_CATEGORIES, recipeCategoryOf, groceryCategoryOf, normalizeIngredientText } = require('../lib/categorize');
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

// Phase 6 D-72/D-73: Save handlers pick one of three OOB shapes based on
// HX-Current-URL. Returns true if a response was written; false if the caller
// should handle the /library default branch itself.
//   /grocery*           -> OOB-only <section id="grocery-list"> (empty primary).
//   /recipes/:id        -> OOB-only <section id="recipe-ingredient-groups-{id}">.
//   anything else       -> false; caller handles (e.g. row + footer for /library).
// The /recipes branch uses a regex (NOT substring) so the recipes-INDEX page (/)
// doesn't false-match (RESEARCH Pitfall 1) and so the recipeId is captured.
function respondPerSurface(req, res, state) {
  const currentUrl = req.headers['hx-current-url'] || '';
  if (currentUrl.includes('/grocery')) {
    const view = buildGroceryView(state);
    const html = injectOob(renderSync(req, 'partials/grocery-list.njk', view));
    res.type('html').send(html);
    return true;
  }
  const recipeMatch = currentUrl.match(/^[^?#]*\/recipes\/([a-z0-9]+)/i);
  if (recipeMatch) {
    const recipeId = recipeMatch[1];
    const recipe = (state.recipes || []).find(r => r.id === recipeId);
    if (recipe) {
      const ingredientGroups = decorateIngredients(recipe.ingredients, state.library);
      const html = injectOob(renderSync(req, 'partials/recipe-ingredient-groups-oob.njk', {
        recipe: { id: recipe.id, ingredientGroups }
      }));
      res.type('html').send(html);
      return true;
    }
    // Stale HX-Current-URL pointing to a deleted recipe -- fall through to the
    // /library default branch (caller). Don't 404 -- the entry mutation
    // succeeded; failing to refresh a stale tab is recoverable.
  }
  return false;
}

// FIX-01 / D-75 / D-76: Categorize editor fragment for unmatched items.
// Pre-fills name via normalizeIngredientText; dropdowns via heuristic categorizeOf.
// MUST be registered before GET /library/:id (Express first-match) -- otherwise
// the wildcard would capture :id == 'categorize-edit'.
router.get('/library/categorize-edit', (req, res) => {
  const text = typeof req.query.text === 'string' ? req.query.text : '';
  const surface = typeof req.query.surface === 'string' ? req.query.surface : 'grocery';
  const itemId = typeof req.query.itemId === 'string' ? req.query.itemId : '';
  const recipeId = typeof req.query.recipeId === 'string' ? req.query.recipeId : '';
  const index = typeof req.query.index === 'string' ? req.query.index : '';
  // surfaceItemId mirrors the source row's outer id so HTMX outerHTML toggles
  // back correctly (RESEARCH Pitfall 2). For grocery: grocery-item-{itemId}.
  // For recipe: a stable composite the template treats as opaque:
  // recipe-{recipeId}-{flatIndex}.
  const surfaceItemId = surface === 'recipe'
    ? `recipe-${recipeId}-${index}`
    : `grocery-item-${itemId}`;
  const prefilledName = normalizeIngredientText(text);
  const prefilledRecipeCategory = recipeCategoryOf(text);
  const prefilledGroceryCategory = groceryCategoryOf(text);
  const html = renderSync(req, 'partials/library-categorize-editor.njk', {
    surface, itemId, recipeId, index, surfaceItemId,
    prefilledName, prefilledRecipeCategory, prefilledGroceryCategory,
    RECIPE_CATEGORIES, GROCERY_CATEGORIES,
    categorizeError: ''
  });
  res.type('html').send(html);
});

// FIX-01 / FIX-02: Cancel target. Re-renders the original surface row from
// current state so the editor's outerHTML swap restores the pre-edit row.
// MUST be registered before GET /library/:id (Express first-match).
router.get('/library/cancel-fix', (req, res) => {
  const surface = typeof req.query.surface === 'string' ? req.query.surface : '';
  const itemId = typeof req.query.itemId === 'string' ? req.query.itemId : '';
  const recipeId = typeof req.query.recipeId === 'string' ? req.query.recipeId : '';
  const indexStr = typeof req.query.index === 'string' ? req.query.index : '';
  const index = indexStr === '' ? -1 : parseInt(indexStr, 10);
  const state = storage.get();
  if (surface === 'grocery') {
    const view = buildGroceryView(state);
    // Find the item across categorizedGroups[].items and closedItems[].
    let item;
    for (const group of (view.categorizedGroups || [])) {
      item = (group.items || []).find(i => i.id === itemId);
      if (item) break;
    }
    if (!item) item = (view.closedItems || []).find(i => i.id === itemId);
    if (!item) return res.status(404).type('text').send('Not found');
    const html = renderSync(req, 'partials/grocery-item.njk', { item });
    return res.type('html').send(html);
  }
  if (surface === 'recipe') {
    const recipe = (state.recipes || []).find(r => r.id === recipeId);
    if (!recipe) return res.status(404).type('text').send('Not found');
    // The pencil's hx-get sends `index` = ing.flatIndex (cross-group flat
    // index attached by decorateIngredients). Walk groups in template order
    // and pick the matching ingredient.
    const groups = decorateIngredients(recipe.ingredients, state.library);
    let foundGroup, foundIng;
    for (const group of groups) {
      for (const ing of group.items) {
        if (ing.flatIndex === index) {
          foundGroup = group;
          foundIng = ing;
          break;
        }
      }
      if (foundIng) break;
    }
    if (!foundIng) return res.status(404).type('text').send('Not found');
    const html = renderSync(req, 'partials/recipe-ingredient-line.njk', {
      recipe, group: foundGroup, ing: foundIng, index
    });
    return res.type('html').send(html);
  }
  return res.status(400).type('text').send('Unknown surface');
});

// FIX-01 / D-74: Categories-only Fix editor fragment for an existing entry.
// Surface-relative outer id so the editor toggles back to the SOURCE row,
// not a Library-tab row (RESEARCH Pitfall 2).
router.get('/library/:id/categories-edit', (req, res) => {
  const state = storage.get();
  const entry = entryViewById(state, req.params.id);
  if (!entry) return res.status(404).type('text').send('Not found');
  const surface = typeof req.query.surface === 'string' ? req.query.surface : 'library';
  const itemId = typeof req.query.itemId === 'string' ? req.query.itemId : '';
  const recipeId = typeof req.query.recipeId === 'string' ? req.query.recipeId : '';
  const index = typeof req.query.index === 'string' ? req.query.index : '';
  const surfaceItemId = surface === 'recipe'
    ? `recipe-${recipeId}-${index}`
    : surface === 'library'
      ? `library-${entry.id}`
      : `grocery-item-${itemId}`;
  const html = renderSync(req, 'partials/library-fix-editor.njk', {
    entry, surface, itemId, recipeId, index, surfaceItemId,
    RECIPE_CATEGORIES, GROCERY_CATEGORIES
  });
  res.type('html').send(html);
});

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

// LIB-04 + Phase 6 D-75/D-77: Manual add (Library tab) AND Categorize submission
// (inline editor on /grocery and /recipes/:id). Categorize mode is detected via
// the hidden surfaceItemId field that the Categorize editor includes.
//
// In Categorize mode (D-77):
//   - 400 paths re-render library-categorize-editor.njk with categorizeError
//     slot, preserving typed values. Form stays open.
//   - Name conflict: case-insensitive equality on entry.name OR aliasConflict
//     against the typed name returns 400. Mirrors Phase 5 D-61 verbatim.
//   - 200 path branches on HX-Current-URL via respondPerSurface (D-75).
//
// In Library tab mode (no surfaceItemId): existing Phase 5 contract preserved.
//   - 400 paths return plain-text body (LIB-04).
//   - 200 path: respondWithUpdates(library-panel) full re-render (D-67).
router.post('/library', (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const aliasesRaw = typeof body.aliases === 'string' ? body.aliases : '';
  const recipeCategory = typeof body.recipeCategory === 'string' ? body.recipeCategory : '';
  const groceryCategory = typeof body.groceryCategory === 'string' ? body.groceryCategory : '';
  // Categorize-mode hidden fields (Plan 02 editor).
  const surfaceItemId = typeof body.surfaceItemId === 'string' ? body.surfaceItemId : '';
  const surface = typeof body.surface === 'string' ? body.surface : '';
  const itemId = typeof body.itemId === 'string' ? body.itemId : '';
  const recipeId = typeof body.recipeId === 'string' ? body.recipeId : '';
  const index = typeof body.index === 'string' ? body.index : '';
  const isCategorizeMode = !!surfaceItemId;

  // D-77: 400 helper -- re-renders library-categorize-editor.njk with the user's
  // typed values + an inline error. Used ONLY in Categorize mode. NO setToast
  // (D-78 silent-400; mirrors Phase 5 D-61).
  function renderCategorizeError(errorMsg) {
    const html = renderSync(req, 'partials/library-categorize-editor.njk', {
      prefilledName: name,
      prefilledRecipeCategory: recipeCategory,
      prefilledGroceryCategory: groceryCategory,
      surfaceItemId, surface, itemId, recipeId, index,
      categorizeError: errorMsg,
      RECIPE_CATEGORIES, GROCERY_CATEGORIES
    });
    return res.status(400).type('html').send(html);
  }

  if (!name) {
    return isCategorizeMode
      ? renderCategorizeError('Name is required.')
      : res.status(400).type('text').send('Name required');
  }
  if (!RECIPE_CATEGORIES.includes(recipeCategory)) {
    return isCategorizeMode
      ? renderCategorizeError(`Invalid recipe category '${recipeCategory}'.`)
      : res.status(400).type('text').send('Invalid recipe category');
  }
  if (!GROCERY_CATEGORIES.includes(groceryCategory)) {
    return isCategorizeMode
      ? renderCategorizeError(`Invalid grocery category '${groceryCategory}'.`)
      : res.status(400).type('text').send('Invalid grocery category');
  }

  // Parse aliases: split on comma, trim, drop empties, dedupe via Set (D-60).
  // Categorize editor has no aliases input -> aliasesRaw is '' -> aliases = [].
  const aliases = [...new Set(
    aliasesRaw.split(',').map(a => a.trim()).filter(Boolean)
  )];

  const state = storage.get();

  // D-77: Categorize-mode name conflict. Case-insensitive equality on entry.name
  // OR aliasConflict on the typed name. The Library tab's manual-add path
  // (newLibraryEntry below) handles name uniqueness via createdAt/dedupe, but
  // Categorize needs the explicit early-out so the inline error surfaces with
  // the typed values preserved.
  if (isCategorizeMode) {
    const lcName = name.toLowerCase();
    const conflictByName = (state.library || []).find(e =>
      typeof e.name === 'string' && e.name.toLowerCase() === lcName
    );
    if (conflictByName) {
      return renderCategorizeError(
        `Name "${name}" is already used by entry "${conflictByName.name}". Open it in the Library tab.`
      );
    }
    const conflictByAlias = aliasConflict(state, name);
    if (conflictByAlias) {
      return renderCategorizeError(
        `Name "${name}" is already used by entry "${conflictByAlias.name}". Open it in the Library tab.`
      );
    }
  }

  // Validate aliases against state.library; reject if any alias collides.
  for (const alias of aliases) {
    const conflict = aliasConflict(state, alias);
    if (conflict) {
      return isCategorizeMode
        ? renderCategorizeError(`Alias "${alias}" is already used by "${conflict.name}".`)
        : res.status(400).type('text').send(
            `Alias '${alias}' is already used by '${conflict.name}'`
          );
    }
  }

  // Construct entry. newLibraryEntry validates categories + dedupes aliases (a second
  // dedupe is safe; it's idempotent). curated:true per LIB-04 / D-74.
  let entry;
  try {
    entry = newLibraryEntry({ name, aliases, recipeCategory, groceryCategory, curated: true });
  } catch (err) {
    return isCategorizeMode
      ? renderCategorizeError(err.message)
      : res.status(400).type('text').send(err.message);
  }

  if (!Array.isArray(state.library)) state.library = [];
  state.library.push(entry);
  storage.save();

  // D-78: success toast is the existing Phase 5 'Added entry' (verb-only ASCII).
  setToast(res, 'Added entry');

  // D-75: Categorize success branches on HX-Current-URL. /grocery and
  // /recipes/:id surfaces get OOB-only responses; /library (or no header)
  // keeps the existing Phase 5 respondWithUpdates(library-panel) shape.
  if (respondPerSurface(req, res, state)) return;
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

// FIX-01 / D-74: Categories-only Save. Distinct from POST /library/:id which
// accepts the full form (name + aliases + categories). This endpoint NEVER
// touches name/aliases. Validates each category against the enum, sets
// curated:true on the entry, persists, and returns a per-surface OOB fragment
// driven by HX-Current-URL (D-72/D-73). 400 returns the Fix editor fragment
// re-rendered (no toast per D-78). 404 returns plain text.
router.post('/library/:id/categories', (req, res) => {
  const id = req.params.id;
  const state = storage.get();
  const library = Array.isArray(state.library) ? state.library : [];
  const idx = library.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).type('text').send('Not found');

  const existing = library[idx];
  const body = req.body || {};
  const recipeCategory = typeof body.recipeCategory === 'string' ? body.recipeCategory : '';
  const groceryCategory = typeof body.groceryCategory === 'string' ? body.groceryCategory : '';
  // Hidden surface fields the editor round-trips so a 400 re-render targets the
  // correct surface row (matches the editor's outer DOM id).
  const surface = typeof body.surface === 'string' ? body.surface : 'library';
  const itemId = typeof body.itemId === 'string' ? body.itemId : '';
  const recipeId = typeof body.recipeId === 'string' ? body.recipeId : '';
  const index = typeof body.index === 'string' ? body.index : '';
  const surfaceItemId = typeof body.surfaceItemId === 'string' && body.surfaceItemId
    ? body.surfaceItemId
    : `library-${id}`;

  // 400 helper: re-render Fix editor fragment with a synthetic entry view that
  // preserves the user's typed values. NO setToast (D-78 silent-400).
  function renderFixEditorError() {
    const formEntry = {
      id, name: existing.name, recipeCategory, groceryCategory
    };
    const html = renderSync(req, 'partials/library-fix-editor.njk', {
      entry: formEntry,
      surface, itemId, recipeId, index, surfaceItemId,
      RECIPE_CATEGORIES, GROCERY_CATEGORIES
    });
    return res.status(400).type('html').send(html);
  }

  if (!RECIPE_CATEGORIES.includes(recipeCategory)) return renderFixEditorError();
  if (!GROCERY_CATEGORIES.includes(groceryCategory)) return renderFixEditorError();

  // Mutate. ELS spread preserves name/aliases/createdAt and any future fields.
  // curated:true per D-74 -- saving categories asserts user has reviewed.
  library[idx] = { ...existing, recipeCategory, groceryCategory, curated: true };
  state.library = library;
  storage.save();

  // D-78: verb-only ASCII toast.
  setToast(res, 'Saved categories');

  // D-72/D-73: per-surface OOB shape.
  if (respondPerSurface(req, res, state)) return;

  // Default branch (HX-Current-URL is /library or absent): row fragment +
  // OOB-footer fragment, mirroring Phase 5 D-63.
  const updatedView = buildLibraryView(state);
  const updatedEntry = updatedView.entries.find(e => e.id === id);
  const rowHtml = renderSync(req, 'partials/library-row.njk', {
    entry: updatedEntry, RECIPE_CATEGORIES, GROCERY_CATEGORIES
  });
  const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', updatedView));
  res.type('html').send(rowHtml + '\n' + footerHtml);
});

// LIB-06 / D-64..D-67: Delete entry. Removes from state.library; NEVER mutates state.recipes.
// Success response: OOB footer fragment only (empty primary body).
// HTMX outerHTML on #library-row-:id with an empty/OOB-only body removes the row element.
// 404: plain text (existing convention).
router.delete('/library/:id', (req, res) => {
  const id = req.params.id;
  const state = storage.get();
  const library = Array.isArray(state.library) ? state.library : [];
  const idx = library.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).type('text').send('Not found');

  // Remove the entry. CRITICAL invariant (LIB-06): do NOT touch state.recipes.
  // Categorization for any recipe ingredient strings that previously matched
  // this entry's aliases will fall back to the heuristic on the next render
  // (lib/calc.js#decorateIngredients + buildGroceryView already handle missing
  // library entries via the existing fallback path).
  library.splice(idx, 1);
  state.library = library;
  storage.save();

  // D-67: generic toast. Do NOT interpolate the deleted entry's name (HTTP header ASCII safety).
  setToast(res, 'Removed entry');

  // Compound response: OOB footer only (no primary row fragment).
  // HTMX outerHTML on #library-row-:id replaces the element with whatever is in
  // the primary (non-OOB) response body. Since the body contains only the OOB
  // footer fragment (which HTMX extracts and swaps separately), the primary swap
  // target sees an empty/invisible result and the row is removed from the DOM.
  const updatedView = buildLibraryView(state);
  const footerHtml = injectOob(renderSync(req, 'partials/library-footer.njk', updatedView));
  res.type('html').send(footerHtml);
});

module.exports = router;
