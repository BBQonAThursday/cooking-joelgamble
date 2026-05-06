/**
 * Pure helpers for the ingredient library. No fs/http imports -- fully unit-testable
 * with plain state objects.
 *
 * Phase 1 scope: id generation, entry-shape factory, simple alias-conflict check.
 * Phase 2 Plan 1: adds normalizeIngredientText (full pipeline), inlined escapeRegex,
 * UNIT_TOKENS, and repoints aliasKey onto normalizeIngredientText so aliasConflict
 * inherits the full normalization. WR-04/IN-01/IN-02 closure lands in Plan 1 Task 2.
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

const { RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('./categorize');

// Unit/measure tokens stripped after the leading numeric chunk in normalizeIngredientText.
// Bare 'a'/'an' articles also count as quantity prefixes (e.g. 'a pinch of salt').
// Initial set per CONTEXT D-13; extend as the user's recipe corpus surfaces gaps.
const UNIT_TOKENS = [
  'cups', 'cup',
  'tablespoons', 'tablespoon', 'tbsp', 'tbs',
  'teaspoons', 'teaspoon', 'tsp',
  'ounces', 'ounce', 'oz',
  'pounds', 'pound', 'lbs', 'lb',
  'grams', 'gram', 'g',
  'kilograms', 'kilogram', 'kg',
  'milliliters', 'milliliter', 'ml',
  'liters', 'liter', 'l',
  'pinch', 'pinches', 'dash', 'dashes',
  'cloves', 'clove',
  'slices', 'slice',
  'cans', 'can',
  'packages', 'package', 'packs', 'pack',
  'bunches', 'bunch',
  'heads', 'head',
  'sprigs', 'sprig',
  'sticks', 'stick',
  'pieces', 'piece'
];

// Inlined copy of lib/categorize.js#escapeRegex. Library never imports from
// categorize for regex escaping (STATE.md import-direction rule).
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a single regex matching any token in UNIT_TOKENS. Sorted longest-first
// so 'tablespoons' matches before 'tbs', 'cups' before 'cup', etc. Built once
// at module load -- UNIT_TOKENS is a constant.
const UNIT_PATTERN = UNIT_TOKENS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

// Leading quantity chunk: optional 'a'/'an' article, OR <integer><optional-fraction-tail>
//   forms covered: '2', '1.5', '1/2', '2 1/2', 'a', 'an'
//   followed by an optional unit token (UNIT_PATTERN), followed by an optional 'of'.
// Anchored at start; one regex per call -- ReDoS-safe (bounded alternations, no nested quantifiers).
const QTY_RE = new RegExp(
  '^(?:' +
    '(?:a|an)' +                           // bare article
    '|' +
    '(?:\\d+(?:\\.\\d+)?(?:\\s+\\d+)?(?:\\s*\\/\\s*\\d+)?)' +  // 2 | 1.5 | 2 1/2 | 1/2
  ')' +
  '(?:\\s+(?:' + UNIT_PATTERN + '))?' +    // optional unit
  '(?:\\s+of)?' +                          // optional 'of'
  '\\s+',                                  // trailing space (forces at least one delimiter before the ingredient)
  'i'
);

/**
 * Normalize an ingredient string to a stable matching key.
 *
 * Order of operations (locked per CONTEXT D-13..D-16):
 *   (1) lowercase + initial trim
 *   (2) strip parentheticals (D-14) -- iterated for nested groups
 *   (3) strip trailing-comma tail (D-15) -- first comma wins
 *   (4) strip leading quantity/unit/of chunk (D-13)
 *   (5) collapse whitespace + final trim
 *
 * D-16: NO singular/plural stemming. 'clove' and 'cloves' stay distinct.
 *
 * @param {*} s
 * @returns {string} normalized key, '' for empty/whitespace/non-string input.
 */
function normalizeIngredientText(s) {
  if (typeof s !== 'string') return '';
  // (1) lowercase + initial trim
  let out = s.toLowerCase().trim();
  if (!out) return '';
  // (2) strip parentheticals (D-14): iterate until no match -- handles nested cases like 'a (b (c)) d'.
  // The bracket-class form '\([^()]*\)' is flat and ReDoS-safe; nested groups collapse across passes.
  let prev;
  do {
    prev = out;
    out = out.replace(/\([^()]*\)/g, ' ');
  } while (out !== prev);
  // (3) strip trailing-comma tail (D-15): first comma wins.
  const comma = out.indexOf(',');
  if (comma >= 0) out = out.slice(0, comma);
  // (4) strip leading quantity/unit/of chunk (D-13).
  out = out.replace(QTY_RE, '');
  // (5) collapse whitespace + final trim.
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function newLibraryId() {
  // Mirror newGroceryId: non-cryptographic, single-user app, collision risk negligible.
  return 'lb_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Construct a new library entry. Throws on invalid input.
 *
 * @param {{ name: string, recipeCategory: string, groceryCategory: string, aliases?: string[], curated?: boolean }} input
 * @returns {LibraryEntry}
 *
 * Validation:
 *  - name: required, trimmed; empty/whitespace/non-string throws (IN-02).
 *  - recipeCategory: must be in RECIPE_CATEGORIES (from lib/categorize.js); throws otherwise (WR-04).
 *  - groceryCategory: must be in GROCERY_CATEGORIES; throws otherwise (WR-04).
 *  - aliases: defensively copied (IN-01); deduplicated by normalized key (aliasKey/normalizeIngredientText) -- WR-03 closure.
 *  - curated: coerced to boolean.
 */
function newLibraryEntry({ name, recipeCategory, groceryCategory, aliases, curated } = {}) {
  // IN-02: name is required and trimmed. Empty/whitespace/non-string is a programmer error.
  const trimmedName = (typeof name === 'string' ? name : '').trim();
  if (!trimmedName) {
    throw new Error('newLibraryEntry: name is required (got ' + JSON.stringify(name) + ')');
  }
  // WR-04: validate categories against the canonical category lists. Library entries with
  // off-list categories silently break the recipe-detail and grocery-list rendering layers
  // (which group by exact category match). extractAndSeed (Phase 2 Plan 3) is the first
  // auto-caller, so the validation must land before that plan ships.
  if (!RECIPE_CATEGORIES.includes(recipeCategory)) {
    throw new Error('newLibraryEntry: invalid recipeCategory ' + JSON.stringify(recipeCategory) +
      ' (must be one of ' + RECIPE_CATEGORIES.join(', ') + ')');
  }
  if (!GROCERY_CATEGORIES.includes(groceryCategory)) {
    throw new Error('newLibraryEntry: invalid groceryCategory ' + JSON.stringify(groceryCategory) +
      ' (must be one of ' + GROCERY_CATEGORIES.join(', ') + ')');
  }
  // IN-01: defensive copy of the caller's aliases array.
  // WR-03 carryover: dedup within-entry aliases by normalized key so callers can pass
  // ['garlic', 'GARLIC', '  garlic  '] without producing three same-key entries.
  const inputAliases = Array.isArray(aliases) ? aliases : [];
  const seen = new Set();
  const dedupedAliases = [];
  for (const a of inputAliases) {
    const key = aliasKey(a); // empty key (whitespace, non-string) drops the alias.
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedupedAliases.push(a);
  }
  return {
    id: newLibraryId(),
    name: trimmedName,
    aliases: dedupedAliases,
    recipeCategory: recipeCategory,
    groceryCategory: groceryCategory,
    curated: !!curated,
    createdAt: new Date().toISOString()
  };
}

// Phase 2: aliasKey is a thin shim over normalizeIngredientText so aliasConflict
// automatically inherits the full normalization pipeline (D-13..D-16).
function aliasKey(s) {
  return normalizeIngredientText(s);
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

module.exports = {
  newLibraryId,
  newLibraryEntry,
  normalizeIngredientText,
  aliasConflict
};
