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

const { RECIPE_CATEGORIES, GROCERY_CATEGORIES, recipeCategoryOf, groceryCategoryOf } = require('./categorize');

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

/**
 * Build the bag-of-words comparison key used by extractAndSeed's in-progress
 * collapse step (D-17, D-18, D-19). Comparison-only -- the key is NEVER stored
 * on entries (D-16 stays in force: stored normalized text retains its singular
 * vs. plural distinction).
 *
 *   1. Run the input through normalizeIngredientText.
 *   2. Split on whitespace.
 *   3. Apply final-'s' strip to each token if the resulting stem is at least 3 chars
 *      (D-19 -- 'cloves' -> 'clove'; 'lentils' -> 'lentil'; 'us' -> 'us'; 'as' -> 'as').
 *   4. Drop empty tokens. The quantity-and-of strip in normalize already eats most
 *      stop tokens; an explicit stop list is intentionally tiny.
 *   5. Return a Set<string>.
 *
 * Subset comparison (D-18): a is collapsed into b iff every token in a is also in b.
 * Module-private -- not exported; an implementation detail of extractAndSeed.
 */
function bagOfWords(s) {
  const norm = normalizeIngredientText(s);
  const out = new Set();
  if (!norm) return out;
  const tokens = norm.split(/\s+/);
  for (const t of tokens) {
    if (!t) continue;
    // D-19 final-'s' strip iff the resulting stem is >= 3 chars.
    let stem = t;
    if (t.endsWith('s') && t.length - 1 >= 3) stem = t.slice(0, -1);
    out.add(stem);
  }
  return out;
}

// D-18 subset check: does set `a` contain every token in `b`?
// Module-private -- only used inside extractAndSeed's collapse loop.
function isSubset(b, a) {
  for (const x of b) {
    if (!a.has(x)) return false;
  }
  return true;
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

/**
 * Find the library entry whose alias best matches `text`.
 *
 * Algorithm (D-22, D-23, D-24):
 *   1. For each alias in every state.library entry, build a bilateral
 *      word-boundary regex \b{alias}\b (case-insensitive).
 *   2. Sort the alias index by (length DESC, curated DESC, arrayIndex ASC).
 *   3. Test each regex against the lowercased raw input; first match wins.
 *
 * Returns the matched entry (with id, per MATCH-03) or undefined on no match
 * (per D-25 -- mirrors aliasConflict's truthiness contract).
 *
 * The index is rebuilt per call -- library state is not a module-load constant
 * so a module-level cache would race with state mutations from extractAndSeed
 * and the Library tab routes.
 *
 * @param {{ library?: LibraryEntry[] }} state
 * @param {string} text
 * @returns {LibraryEntry | undefined}
 */
function findEntryByText(state, text) {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  const library = (state && Array.isArray(state.library)) ? state.library : [];
  if (library.length === 0) return undefined;

  // Build the alias index. Each row carries the regex, the length (for the
  // longest-wins sort), the entry's curated flag, the entry's array index
  // (for the array-order tiebreaker), and the owning entry itself.
  const indexEntries = [];
  for (let arrayIndex = 0; arrayIndex < library.length; arrayIndex++) {
    const entry = library[arrayIndex];
    const aliases = (entry && Array.isArray(entry.aliases)) ? entry.aliases : [];
    for (const alias of aliases) {
      if (typeof alias !== 'string' || !alias.trim()) continue;
      const lower = alias.toLowerCase();
      indexEntries.push({
        regex: new RegExp('\\b' + escapeRegex(lower) + '\\b', 'i'),
        length: lower.length,
        curated: !!(entry && entry.curated),
        arrayIndex,
        entry
      });
    }
  }
  if (indexEntries.length === 0) return undefined;

  // D-24 sort: longest alias first; on tie, curated wins; on tie, earlier
  // array index wins. The Number(...) coercion keeps booleans sortable.
  indexEntries.sort((a, b) =>
    (b.length - a.length) ||
    (Number(b.curated) - Number(a.curated)) ||
    (a.arrayIndex - b.arrayIndex)
  );

  // First-match-wins. Mirrors lib/categorize.js#matchCategory.
  for (const row of indexEntries) {
    if (row.regex.test(text)) return row.entry;
  }
  return undefined;
}

/**
 * Walk a list of ingredient strings and grow state.library accordingly.
 *
 * Per-ingredient ordering (D-20):
 *   1. Normalize via normalizeIngredientText.
 *   2. Library check first -- findEntryByText(state, originalText). On match:
 *      append the normalized text to that entry's aliases if not already present
 *      (gated by aliasConflict against the rest of the library, D-21).
 *      Continue to next ingredient. (Curation always wins.)
 *   3. In-progress collapse -- compare the candidate's bag-of-words key against
 *      every in-progress new-entry's bag-of-words. On a subset hit, append the
 *      candidate's normalized text as an alias to that in-progress entry.
 *      Continue. (D-17 / D-18 / D-19.)
 *   4. Seed new entry -- newLibraryEntry({ name, aliases: [normalized],
 *      categories: heuristic guess, curated: false }). Stage in the in-progress list.
 *   5. After the loop: append all in-progress new entries to state.library.
 *
 * Returns { ok: true, added, aliasesAppended }. Phase 4 callers check
 * `added.length || aliasesAppended.length` to decide on a second storage.save()
 * (per EXTR-01 -- only save when something actually changed).
 *
 * @param {{ library?: LibraryEntry[] }} state
 * @param {string[]} ingredients
 * @returns {{ ok: true, added: LibraryEntry[], aliasesAppended: { entryId: string, alias: string }[] }}
 */
function extractAndSeed(state, ingredients) {
  const added = [];
  const aliasesAppended = [];
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return { ok: true, added, aliasesAppended };
  }
  // Tolerant access -- mirror lib/grocery.js#addItem's `if (!Array.isArray(...)) state.x = []`.
  if (!state || typeof state !== 'object') return { ok: true, added, aliasesAppended };
  if (!Array.isArray(state.library)) state.library = [];

  // In-progress new entries -- staged here, appended to state.library at the end.
  // Each row: { entry, bag } where bag is the bag-of-words for the entry's first alias,
  // unioned with every later candidate that collapses into it.
  const inProgress = [];

  for (const raw of ingredients) {
    const original = (typeof raw === 'string') ? raw.trim() : '';
    if (!original) continue;
    // (1) Normalize.
    const normalized = normalizeIngredientText(original);
    if (!normalized) continue;

    // (2) Library-first check -- curation wins over auto-seeding.
    //     Test the RAW input (lowercased internally by findEntryByText) against
    //     existing aliases via the longest-alias-wins regex index.
    const libMatch = findEntryByText(state, original);
    if (libMatch) {
      // Auto-append the normalized text as a new alias if it's not already there
      // and no OTHER entry already owns the same normalized key (D-21).
      const existingAliasKeys = new Set(
        (Array.isArray(libMatch.aliases) ? libMatch.aliases : []).map(aliasKey)
      );
      if (!existingAliasKeys.has(normalized)) {
        const otherOwner = aliasConflict(state, normalized, libMatch.id);
        if (!otherOwner) {
          if (!Array.isArray(libMatch.aliases)) libMatch.aliases = [];
          libMatch.aliases.push(normalized);
          aliasesAppended.push({ entryId: libMatch.id, alias: normalized });
        }
        // else: alias is already owned by a different entry -- silent skip per D-21.
        // The Library tab will surface this as a cross-entry duplicate the user resolves manually.
      }
      continue;
    }

    // (3) In-progress collapse check (D-17 / D-18 / D-19).
    //     Compare the candidate's bag-of-words against every staged new-entry's bag.
    //     Subset in either direction collapses (D-18). The bag union update keeps
    //     subset semantics correct for any later candidate that overlaps both directions.
    const candidateBag = bagOfWords(original);
    let collapsed = false;
    for (const row of inProgress) {
      if (isSubset(candidateBag, row.bag) || isSubset(row.bag, candidateBag)) {
        // Append the candidate's normalized text as an alias on the staged entry,
        // unless an equivalent alias is already there.
        const existingKeys = new Set(row.entry.aliases.map(aliasKey));
        if (!existingKeys.has(normalized)) {
          row.entry.aliases.push(normalized);
        }
        // Update the staged bag to be the union -- preserves subset semantics
        // for any later candidate that overlaps both directions.
        for (const t of candidateBag) row.bag.add(t);
        collapsed = true;
        break;
      }
    }
    if (collapsed) continue;

    // (4) Seed new entry. Use the WR-04-validated factory; categories come from
    //     the single-arg heuristic (Phase 3 widens these with an optional library param).
    const entry = newLibraryEntry({
      name: original,
      aliases: [normalized],
      recipeCategory: recipeCategoryOf(original),
      groceryCategory: groceryCategoryOf(original),
      curated: false
    });
    inProgress.push({ entry, bag: candidateBag });
  }

  // (5) Append staged new entries to state.library. Belt-and-suspenders: each
  //     goes through aliasConflict one more time -- a candidate that survived
  //     in-progress collapse but happens to share an alias with an existing
  //     library entry is silently skipped. In practice step (2) catches this;
  //     the extra check is cheap insurance.
  for (const { entry } of inProgress) {
    let blocked = false;
    for (const alias of entry.aliases) {
      if (aliasConflict(state, alias)) { blocked = true; break; }
    }
    if (blocked) continue;
    state.library.push(entry);
    added.push(entry);
  }

  return { ok: true, added, aliasesAppended };
}

module.exports = {
  newLibraryId,
  newLibraryEntry,
  normalizeIngredientText,
  findEntryByText,
  extractAndSeed,
  aliasConflict
};
