// Module reference (not destructured) so test/backfill.test.js's D-41
// monkey-patch (libraryMod.extractAndSeed = ...) takes effect — mirrors
// routes/recipes.js's `const scrapeMod = require('../lib/scrape')` idiom.
const libraryMod = require('./library');

/**
 * One-time startup backfill: walks state.recipes, calls extractAndSeed per recipe
 * to seed unmatched ingredient strings as curated:false library entries, sets
 * state.libraryMigratedAt to an ISO timestamp on completion.
 *
 * Idempotency: short-circuits when state.libraryMigratedAt is truthy (D-38).
 * Failure policy: per-recipe try/catch swallows throws (D-41); partial backfill
 * commits the timestamp so one bad recipe never wedges server start.
 *
 * Pure: no fs, no http, no require('./storage'). Caller persists via storage.save() (D-45).
 *
 * @param {{ recipes?: Array, library?: Array, libraryMigratedAt?: string|null }} state
 * @returns {{ alreadyRan: boolean, added: Array, aliasesAppended: Array }}
 */
function runBackfill(state) {
  // Defensive: null / undefined / non-object state.
  if (!state || typeof state !== 'object') {
    return { alreadyRan: true, added: [], aliasesAppended: [] };
  }
  // D-38: truthy short-circuit. Falsy on '', null, undefined, 0.
  if (state.libraryMigratedAt) {
    return { alreadyRan: true, added: [], aliasesAppended: [] };
  }
  // Pitfall 5 / mirrors lib/storage.js:11-15 defensive coercion.
  if (!Array.isArray(state.recipes)) state.recipes = [];
  if (!Array.isArray(state.library)) state.library = [];

  const added = [];
  const aliasesAppended = [];

  // D-39: per-recipe walk in insertion order.
  for (const recipe of state.recipes) {
    // D-40: defensive non-array guard with explicit warning.
    if (!Array.isArray(recipe && recipe.ingredients)) {
      console.warn('[backfill] skipping recipe', recipe && recipe.id, '- no ingredients array');
      continue;
    }
    // D-41: per-recipe try/catch. One bad recipe never wedges launch.
    try {
      const result = libraryMod.extractAndSeed(state, recipe.ingredients);
      for (const e of result.added) added.push(e);
      for (const a of result.aliasesAppended) aliasesAppended.push(a);
    } catch (err) {
      console.error('[backfill] failed for recipe', recipe && recipe.id, err.message);
    }
  }

  // D-41: timestamp set unconditionally. Survives partial backfill.
  state.libraryMigratedAt = new Date().toISOString();

  // D-42: alreadyRan:false on FIRST run regardless of added.length.
  return { alreadyRan: false, added, aliasesAppended };
}

module.exports = { runBackfill };
