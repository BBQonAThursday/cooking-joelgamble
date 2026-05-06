/**
 * Pure helpers for the ingredient library. No fs/http imports -- fully unit-testable
 * with plain state objects.
 *
 * Phase 1 scope: id generation, entry-shape factory, simple alias-conflict check.
 * Phase 2 will add normalizeIngredientText, findEntryByText, extractAndSeed and will
 * replace the trivial alias normalization here with the full normalization function.
 *
 * @typedef {Object} LibraryEntry
 * @property {string}   id              - 'lb_' + 8 base36 chars (see newLibraryId).
 * @property {string}   name            - Canonical display name.
 * @property {string[]} aliases         - Match strings; case/whitespace handling is per-callsite.
 * @property {string}   recipeCategory  - One of RECIPE_CATEGORIES.
 * @property {string}   groceryCategory - One of GROCERY_CATEGORIES.
 * @property {boolean}  curated         - True when user has confirmed the entry.
 * @property {string}   createdAt       - ISO-8601 timestamp.
 */

function newLibraryId() {
  // Mirror newGroceryId: non-cryptographic, single-user app, collision risk negligible.
  return 'lb_' + Math.random().toString(36).slice(2, 10);
}

function newLibraryEntry({ name, recipeCategory, groceryCategory, aliases, curated } = {}) {
  return {
    id: newLibraryId(),
    name: name,
    aliases: aliases || [],
    recipeCategory: recipeCategory,
    groceryCategory: groceryCategory,
    curated: !!curated,
    createdAt: new Date().toISOString()
  };
}

// Phase 1 simple normalization: trim + lowercase only (D-04).
// Phase 2 will replace this with the full normalizeIngredientText.
function aliasKey(s) {
  return (typeof s === 'string' ? s : '').trim().toLowerCase();
}

/**
 * Returns the first library entry whose aliases contain a normalized match for `alias`,
 * skipping the entry whose id equals `excludingId`. Returns undefined when no conflict.
 *
 * Truthiness contract: callers test the return value as boolean to decide whether to
 * reject (see Phase 1 success criterion #3, ROADMAP).
 */
function aliasConflict(state, alias, excludingId) {
  const key = aliasKey(alias);
  if (!key) return undefined;
  const library = (state && Array.isArray(state.library)) ? state.library : [];
  for (const entry of library) {
    if (excludingId && entry.id === excludingId) continue;
    const entryAliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    for (const a of entryAliases) {
      if (aliasKey(a) === key) return entry;
    }
  }
  return undefined;
}

module.exports = { newLibraryId, newLibraryEntry, aliasConflict };
