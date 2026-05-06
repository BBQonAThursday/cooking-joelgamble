# Phase 3: Categorization Layering - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 8 (5 source, 3 test)
**Analogs found:** 8 / 8

## File Classification

| File (modify) | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `lib/library.js` | utility (pure helper) | transform | `lib/categorize.js#buildIndex` + `lib/library.js#findEntryByText` (existing) | exact |
| `lib/categorize.js` | utility (pure helper) | transform | self (extend `recipeCategoryOf` / `groceryCategoryOf` + edit keyword tables) | exact |
| `lib/calc.js` | view-model | transform (state -> template ctx) | self (`buildGroceryView`, `decorateIngredients` already in file) | exact |
| `routes/recipes.js` | controller (route handler) | request-response | self (`GET /recipes/:id` already calls `decorateIngredients`) | exact |
| `views/recipe.njk` | template | render | self (line 24 ingredient loop) | exact |
| `test/library.test.js` | test | assertion | self (existing `findEntryByText` tests, lines 337-477) | exact |
| `test/categorize.test.js` | test | assertion | self (existing `recipeCategoryOf` tests, lines 9-68) | exact |
| `test/calc.test.js` | test | assertion | self (existing `buildGroceryView` / `decorateIngredients` tests, lines 121-265) | exact |

## Pattern Assignments

### `lib/library.js` -> add `buildLibraryIndex` + `findEntryInIndex`, rewrite `findEntryByText` (utility, transform)

**Primary analog:** `lib/categorize.js#buildIndex` (lines 57-71) for the index-build shape; `lib/library.js#findEntryByText` (lines 262-301, existing) for the alias-walk + sort + first-match logic.

**Imports already in place** (`lib/library.js` lines 20):
```javascript
const { RECIPE_CATEGORIES, GROCERY_CATEGORIES, recipeCategoryOf, groceryCategoryOf } = require('./categorize');
```
No new imports needed; `normalizeIngredientText` and `escapeRegex` are already module-local.

**Index-build pattern to MIRROR** (`lib/categorize.js#buildIndex`, lines 57-71):
```javascript
function buildIndex(table) {
  const entries = [];
  for (const [category, keywords] of Object.entries(table)) {
    for (const kw of keywords) {
      entries.push({
        category,
        regex: new RegExp('\\b' + escapeRegex(kw.toLowerCase()) + '\\b', 'i'),
        length: kw.length
      });
    }
  }
  // Longest keyword wins.
  entries.sort((a, b) => b.length - a.length);
  return entries;
}
```

**Alias-walk + sort + match pattern to LIFT-AND-SPLIT** (existing `findEntryByText` body, `lib/library.js` lines 262-301). The existing function already builds an index inline and sorts by `(length DESC, curated DESC, arrayIndex ASC)`. Phase 3 splits this into two helpers:

Existing index-build snippet (lines 270-285) -- becomes `buildLibraryIndex(library)`:
```javascript
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
```

Existing sort (lines 290-294):
```javascript
indexEntries.sort((a, b) =>
  (b.length - a.length) ||
  (Number(b.curated) - Number(a.curated)) ||
  (a.arrayIndex - b.arrayIndex)
);
```

Existing match loop (lines 297-300) -- becomes `findEntryInIndex(index, text)`:
```javascript
for (const row of indexEntries) {
  if (row.regex.test(text)) return row.entry;
}
return undefined;
```

**D-36 normalization at index-build site** -- replace `const lower = alias.toLowerCase();` with `const lower = normalizeIngredientText(alias);` (or pass through the normalize helper before regex compile). Per CONTEXT D-36, normalize the ALIAS, not the input text. `normalizeIngredientText` is already in scope (defined at lines 93-113 of `lib/library.js`).

**D-29 wrapper rewrite** of `findEntryByText` (replaces existing lines 262-301):
```javascript
function findEntryByText(state, text) {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  const library = (state && Array.isArray(state.library)) ? state.library : [];
  if (library.length === 0) return undefined;
  return findEntryInIndex(buildLibraryIndex(library), text);
}
```

**D-29 returned-object shape** -- per CONTEXT, `findEntryInIndex` returns the matched entry-shaped object (with at minimum `id`, `recipeCategory`, `groceryCategory`). The existing `findEntryByText` returns `row.entry` (the whole library entry). Phase 3 keeps the same return: `row.entry`. The new `buildLibraryIndex` rows must additionally carry `recipeCategory` and `groceryCategory` so `categorize.js` callers can categorize without a second entry lookup -- either from the row directly or via the entry reference.

**Module exports update** (`lib/library.js` lines 426-433):
```javascript
module.exports = {
  newLibraryId,
  newLibraryEntry,
  normalizeIngredientText,
  findEntryByText,
  buildLibraryIndex,    // NEW (D-29)
  findEntryInIndex,     // NEW (D-29)
  extractAndSeed,
  aliasConflict
};
```

---

### `lib/categorize.js` -> extend signatures + edit keyword tables (utility, transform)

**Primary analog:** the file itself. The `matchCategory` loop (lines 124-130) is extended with a library-first prefix; the keyword table edits are surgical.

**Existing `matchCategory` pattern** (lines 124-130):
```javascript
function matchCategory(index, text) {
  if (typeof text !== 'string' || !text.trim()) return 'Other';
  for (const entry of index) {
    if (entry.regex.test(text)) return entry.category;
  }
  return 'Other';
}
```

**Existing single-arg signatures to EXTEND** (lines 132-138):
```javascript
function recipeCategoryOf(text) {
  return matchCategory(RECIPE_INDEX, text);
}

function groceryCategoryOf(text) {
  return matchCategory(GROCERY_INDEX, text);
}
```

**D-26 + D-27 + D-28 extension shape** -- two-arg form: when arg 2 is provided, call into `lib/library.js#findEntryInIndex` first; on a hit return `match.recipeCategory` / `match.groceryCategory` directly (D-27, D-28: even when the entry's category is `'Other'`, return `'Other'` -- do NOT fall through). On no library hit, fall through to existing `matchCategory(RECIPE_INDEX, text)` / `matchCategory(GROCERY_INDEX, text)`.

**D-26 overload sniffing** (per CONTEXT "Claude's Discretion") -- the second arg can be either the raw `state.library` array or a pre-built index. Discriminator: `Array.isArray(arg) && arg.length > 0 && !arg[0].regex` -> raw library (build index inline); else -> already an index. Same import-direction rule still holds: `lib/categorize.js` requires `lib/library.js#buildLibraryIndex` and `findEntryInIndex` -- this is the ONE allowed direction (library-aware categorize) per STATE.md.

WAIT: the project's locked import-direction rule is "library imports from categorize, never reverse." Re-check D-30: "categorize never imports library." Resolution: `recipeCategoryOf(text, libraryOrIndex)` accepts the index/library by parameter -- the CALLER (calc.js) is responsible for building the index via `lib/library.js#buildLibraryIndex`. `lib/categorize.js` does NOT require `lib/library.js`; it just iterates the passed-in index using `entry.regex.test(text)` (same shape as existing `matchCategory`) and returns `entry.recipeCategory` / `entry.groceryCategory`. Confirm in the planner: NO `require('./library')` lands in `lib/categorize.js`.

**D-35 keyword edits** -- surgical:
- Line 27 of current `lib/categorize.js`: `RECIPE_KEYWORDS.Veg` ends with `'pepper','peppers'`. **Remove** these two bare tokens. Bell variants (`'bell pepper','bell peppers','jalapeno','jalapenos','habanero','habaneros'`) stay on line 20. Seasonings (`'black pepper','white pepper','peppercorn'`) on line 30 are unchanged.
- `GROCERY_KEYWORDS.Produce` (lines 78-86) currently has NO `'pepper'` or `'peppers'`. **Add** both. Insert near other singletons/plurals such that the ordering style stays consistent (e.g. extend the bell-pepper line, or append a new line).

**Why now (D-35):** Phase 4 backfill seeds new library entries with categories computed via these heuristics. Wrong category at backfill time gets baked into the library; user has to fix manually. Fix in Phase 3 keeps the backfill clean.

---

### `lib/calc.js` -> thread library into `buildGroceryView` + `decorateIngredients` (view-model, transform)

**Primary analog:** the file itself (`buildGroceryView` lines 80-104, `decorateIngredients` lines 128-140).

**Imports update** (line 1-2):
```javascript
const { mondayOf } = require('./week');
const { recipeCategoryOf, groceryCategoryOf, RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('./categorize');
const { buildLibraryIndex, findEntryInIndex } = require('./library');  // NEW per D-33
```
First time `lib/calc.js` requires `lib/library.js` -- per CONTEXT integration-points note: calc -> library -> categorize is acyclic.

**Existing `buildGroceryView` pattern to EXTEND** (lines 80-104):
```javascript
function buildGroceryView(state) {
  const items = Array.isArray(state && state.grocery) ? state.grocery : [];
  const unchecked = items.filter(g => !g.checked);
  const checked = items.filter(g => g.checked);

  const buckets = new Map(GROCERY_CATEGORIES.map(c => [c, []]));
  for (const item of unchecked) {
    buckets.get(groceryCategoryOf(item.text)).push({ ...item });
  }
  // ...
}
```

**D-32 + D-33 + D-34 extension shape:**
1. At top of function, build the index ONCE (D-33): `const libraryIndex = (Array.isArray(state.library) && state.library.length > 0) ? buildLibraryIndex(state.library) : null;` (D-34 defensive guard).
2. For each item (unchecked AND checked -- D-32), look up `findEntryInIndex(libraryIndex, item.text)` once and capture `libraryEntryId = match ? match.id : null` (D-31 null contract).
3. Pass the index through to `groceryCategoryOf(item.text, libraryIndex)` (D-26 second-arg form).
4. Spread `{ ...item, libraryEntryId }` into the bucket (closed items get same field per D-32).

**Existing `decorateIngredients` pattern to EXTEND** (lines 128-140):
```javascript
function decorateIngredients(ingredients) {
  const buckets = new Map(RECIPE_CATEGORIES.map(c => [c, []]));
  for (const text of (ingredients || [])) {
    if (typeof text !== 'string' || !text.trim()) continue;
    buckets.get(recipeCategoryOf(text)).push(text);
  }
  const groups = [];
  for (const cat of RECIPE_CATEGORIES) {
    const items = buckets.get(cat);
    if (items.length > 0) groups.push({ category: cat, items });
  }
  return groups;
}
```

**D-31 + D-33 + D-34 extension shape:**
1. New optional second arg: `decorateIngredients(ingredients, library)` -- accepts `state.library` (array form for ergonomics matching SC#1).
2. Build index once at top: `const libraryIndex = (Array.isArray(library) && library.length > 0) ? buildLibraryIndex(library) : null;`.
3. Per-item: `const match = libraryIndex ? findEntryInIndex(libraryIndex, text) : undefined;` and `const libraryEntryId = match ? match.id : null;`.
4. Push `{ text, libraryEntryId }` into the bucket (NOT bare string -- D-31).
5. Pass index into `recipeCategoryOf(text, libraryIndex)`.

**D-31 critical contract:** items in `group.items` change from `string` to `{ text, libraryEntryId }`. `group` shape unchanged. Template downstream (`views/recipe.njk` line 24) reads `ing.text`.

---

### `routes/recipes.js` -> thread `state.library` into `decorateIngredients` call (controller, request-response)

**Primary analog:** existing `GET /recipes/:id` handler (lines 51-67).

**Existing call site** (line 64):
```javascript
ingredientGroups: decorateIngredients(recipe.ingredients)
```

**Phase 3 update** (single-line change):
```javascript
ingredientGroups: decorateIngredients(recipe.ingredients, state.library)
```

`state` is already in scope (line 52: `const state = storage.get();`). No new imports needed -- `decorateIngredients` is already imported on line 6.

**Important:** `routes/grocery.js` does NOT need a similar update -- `buildGroceryView(state)` reads `state.library` internally (D-33 happens inside the view-builder). Confirmed in CONTEXT integration-points.

---

### `views/recipe.njk` -> ingredient loop reads `ing.text` (template, render)

**Primary analog:** the file itself, line 24.

**Existing template** (line 24):
```nunjucks
{% for ing in group.items %}<li>{{ ing }}</li>{% endfor %}
```

**Phase 3 update** (single-line change per D-31):
```nunjucks
{% for ing in group.items %}<li>{{ ing.text }}</li>{% endfor %}
```

No other template changes. Phase 6 will later add the Fix affordance reading `ing.libraryEntryId` -- already populated per D-31.

---

### `test/library.test.js` -> add `buildLibraryIndex` + `findEntryInIndex` tests (test, assertion)

**Primary analog:** existing `findEntryByText` test block (lines 337-477) -- 12 tests.

**SC#5 constraint:** the existing 12 `findEntryByText` tests MUST continue to pass without modification (verifies the wrapper-rewrite per D-29). Do NOT edit lines 337-477.

**Imports update** (lines 3-7):
```javascript
const {
  newLibraryId, newLibraryEntry,
  normalizeIngredientText, findEntryByText, extractAndSeed,
  aliasConflict,
  buildLibraryIndex, findEntryInIndex   // NEW
} = require('../lib/library');
```

**Test pattern to FOLLOW** (lines 339-350 -- shape for guard tests):
```javascript
test('findEntryByText returns undefined for empty/whitespace/non-string text input', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(findEntryByText(state, ''), undefined);
  assert.strictEqual(findEntryByText(state, '   '), undefined);
  assert.strictEqual(findEntryByText(state, null), undefined);
  assert.strictEqual(findEntryByText(state, undefined), undefined);
  assert.strictEqual(findEntryByText(state, 42), undefined);
});
```

**Test cases to add (per D-29, D-36, "Claude's Discretion" sort comparator):**
- `buildLibraryIndex([])` returns `[]`.
- `buildLibraryIndex` returns rows with shape `{ entryId | entry, alias, regex, length, curated, arrayIndex, recipeCategory, groceryCategory }` (verify each field).
- Returned array is sorted `(length DESC, curated DESC, arrayIndex ASC)` per D-22..D-24.
- D-36: stored alias with leading/trailing whitespace or mixed case (e.g. `'  GARLIC  '`) produces a regex matching `'garlic'`. Re-confirm length is the post-normalize length.
- `findEntryInIndex(index, text)` returns `undefined` for empty index, no match, non-string text.
- `findEntryInIndex` returns the matched entry with `id` (MATCH-03).
- Pre-built index path: build once, call `findEntryInIndex` twice with different inputs -- second call does not rebuild.
- Confirmation that `findEntryByText` (now a wrapper) still passes all 12 existing tests **without modification** (this is verified by `npm test`, no new test required).

**Phase 2 D-36 carry note for SUMMARY:** if the existing line-385 / line-379 case `'OLIVE OIL'` was passing only because of `alias.toLowerCase()`, it will now pass via `normalizeIngredientText`. Re-confirm green at run time; if a Phase 2 test asserts the raw-alias regex source explicitly (none of the 12 do), document the change in 03-SUMMARY.md.

---

### `test/categorize.test.js` -> add library-priority + heuristic-fallback + D-35 keyword tests (test, assertion)

**Primary analog:** existing `recipeCategoryOf` block (lines 9-68) and `groceryCategoryOf` block (lines 76-167).

**SC#5 constraint:** do NOT modify existing tests. All 28 existing tests must pass without edit -- backwards-compatible signature extension.

**Imports update** (line 3, 70):
```javascript
const { recipeCategoryOf, RECIPE_CATEGORIES } = require('../lib/categorize');
// ...later...
const { groceryCategoryOf, GROCERY_CATEGORIES } = require('../lib/categorize');
// NEW imports for library-aware tests:
const { buildLibraryIndex } = require('../lib/library');
```

**Test pattern to FOLLOW** (lines 9-14 -- shape for category assertions):
```javascript
test('recipeCategoryOf maps animal proteins to Protein', () => {
  assert.strictEqual(recipeCategoryOf('500g boneless chicken thighs'), 'Protein');
  assert.strictEqual(recipeCategoryOf('1 lb ground beef'), 'Protein');
  assert.strictEqual(recipeCategoryOf('2 salmon fillets'), 'Protein');
  assert.strictEqual(recipeCategoryOf('3 eggs, beaten'), 'Protein');
});
```

**Test cases to add:**
- **D-26 library priority (recipe):** library entry `{ aliases: ['black pepper'], recipeCategory: 'Flavor' }` overrides heuristic `'Seasoning'` for `'1 tsp black pepper'`. Build index via `buildLibraryIndex(state.library)`, pass to `recipeCategoryOf('1 tsp black pepper', index)`.
- **D-26 library priority (grocery):** same shape with `groceryCategoryOf`.
- **D-26 raw-array form (SC#1 ergonomics):** `recipeCategoryOf('peanut butter', state.library)` works -- inline-builds the index when arg 2 lacks `.regex`.
- **D-27 entry category is source of truth:** library hit returns `entry.recipeCategory` directly; no second lookup.
- **D-28 library-`'Other'` does NOT fall through:** entry with `recipeCategory: 'Other'` returns `'Other'` even when the heuristic would say `'Veg'`.
- **D-26 heuristic fallback when library empty/missing:** `recipeCategoryOf(text, [])` -> heuristic. `recipeCategoryOf(text, null)` -> heuristic. `recipeCategoryOf(text)` (no arg) -> heuristic (existing behavior preserved -- SC#5).
- **D-26 heuristic fallback on no library match:** library has unrelated entries; input matches none; heuristic still wins.
- **D-35 pepper-keyword regression:**
  - `recipeCategoryOf('1 tsp black pepper')` -> `'Seasoning'` (no longer false-positive Veg).
  - `recipeCategoryOf('1 tsp red pepper flakes')` -> `'Seasoning'` (existing `'red pepper flake'` keyword wins).
  - `recipeCategoryOf('2 red bell peppers')` -> `'Veg'` (bell variant unchanged).
  - `groceryCategoryOf('peppers')` -> `'Produce'` (newly added plural).
  - `groceryCategoryOf('1 red pepper')` -> `'Produce'` (newly added singular).
  - `groceryCategoryOf('2 red bell peppers')` -> `'Produce'` (bell variant unchanged).

---

### `test/calc.test.js` -> add `buildGroceryView`/`decorateIngredients` library threading tests (test, assertion)

**Primary analog:** existing `buildGroceryView` block (lines 121-184) and `decorateIngredients` block (lines 225-265).

**SC#5 constraint:** do NOT modify existing tests. All 21 existing tests must pass.

**Imports update** (line 119, 225):
```javascript
const { buildGroceryView } = require('../lib/calc');
// ...later...
const { decorateIngredients } = require('../lib/calc');
```
No new imports needed -- both helpers already imported.

**Test pattern to FOLLOW** (lines 121-137 -- buildGroceryView grouping shape):
```javascript
test('buildGroceryView partitions checked vs unchecked', () => {
  const state = {
    grocery: [
      { id: 'g_a', text: '1 onion', checked: false },
      { id: 'g_b', text: '1 cup milk', checked: true },
      { id: 'g_c', text: '1 tsp salt', checked: false }
    ]
  };
  const view = buildGroceryView(state);
  // ...assertions...
});
```

**Test pattern to FOLLOW** (lines 227-242 -- decorateIngredients shape):
```javascript
test('decorateIngredients groups ingredients by recipe category in canonical order', () => {
  const ingredients = [
    '500g chicken thighs',
    '1 medium onion',
    '1 tsp salt',
    '2 tbsp olive oil',
    'something-uncategorized'
  ];
  const groups = decorateIngredients(ingredients);
  assert.deepStrictEqual(groups.map(g => g.category), ['Protein', 'Veg', 'Seasoning', 'Flavor', 'Other']);
  // ...
});
```

**Test cases to add (`buildGroceryView`):**
- **D-32 + D-33 library threading:** state with `grocery: [{ id: 'g_a', text: '1 black pepper', checked: false }]` and `library: [{ id: 'lb_aaaaaaaa', aliases: ['black pepper'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, ... }]`. View item carries `libraryEntryId: 'lb_aaaaaaaa'` and is bucketed under `'Aisle'` (library-driven), not heuristic.
- **D-31 null contract:** state with empty library -> every item view has `libraryEntryId: null`.
- **D-32 checked items get `libraryEntryId` too:** mirror the test above with `checked: true` -> closed item carries the same field.
- **D-34 defensive guard:** `state.library` undefined / `null` / `'not-an-array'` -> no crash, every item view has `libraryEntryId: null`, behavior identical to today.
- **SC#5 backwards compat:** existing test "buildGroceryView groups unchecked items by grocery category in canonical order" still passes (state has no `library` field).

**Test cases to add (`decorateIngredients`):**
- **D-31 item shape:** `decorateIngredients(['1 onion'], library)` returns `[{ category: 'Veg', items: [{ text: '1 onion', libraryEntryId: 'lb_...' }] }]` when library has matching alias `'onion'`.
- **D-31 null contract:** `decorateIngredients(['xyzzy'])` (no library arg) -> items shape `[{ text: 'xyzzy', libraryEntryId: null }]`.
- **D-31 null contract on empty library:** `decorateIngredients(['1 onion'], [])` -> `libraryEntryId: null` (no match path taken, defensive guard).
- **D-31 null contract on undefined library:** `decorateIngredients(['1 onion'], undefined)` -> identical to single-arg behavior.
- **SC#5 backwards compat:** existing test "decorateIngredients groups ingredients by recipe category in canonical order" still passes -- but item assertion currently checks bare strings (`groups[0].items === ['500g chicken thighs']`). PER D-31, items become objects. **This is a behavior change to existing tests.** The CONTEXT (lines 102-103) says "Do NOT modify existing tests" but D-31 explicitly changes the shape. Resolution: existing `decorateIngredients` tests at lines 227-265 of `test/calc.test.js` use `assert.deepStrictEqual(groups[0].items, ['500g chicken thighs'])` -- this WILL FAIL after D-31 lands.
  - **Planner action required:** confirm with the user / 03-CONTEXT whether existing decorateIngredients item-shape assertions count as "existing tests must pass" (CONTEXT line 102) or "expected to update for shape change" (D-31 implication). This is a hard contradiction in CONTEXT and must be resolved at planning time, not implementation time. Suggested resolution: SC#5 means "no test renames / no removed coverage / no refactored test bodies" -- but the four specific item-list assertions on lines 237-241, 247, 257, 264 of `test/calc.test.js` necessarily evolve from string literals to `{ text, libraryEntryId: null }` objects to match the new contract. Document this evolution in 03-SUMMARY.md as the one allowed test change.

---

## Shared Patterns

### Backwards-compatible signature extension (cross-cutting D-26 / D-31 / D-34)
**Source pattern:** `lib/categorize.js#matchCategory` -- pure-function shape that tolerates missing args.
**Apply to:** `recipeCategoryOf`, `groceryCategoryOf` (extend with optional `libraryOrIndex`), `decorateIngredients` (extend with optional `library`).
**Rule:** When the new arg is `undefined`/`null`/empty array, behavior is byte-identical to the pre-Phase-3 single-arg call. SC#5 enforces this via existing tests passing without modification.

### Render-time index build (D-33)
**Source pattern:** `lib/categorize.js#buildIndex` (lines 57-71) -- module-load constant index.
**Apply to:** `buildGroceryView`, `decorateIngredients` -- but at RENDER scope, not module scope, because `state.library` mutates.
**Rule:** Build the index ONCE at the top of the view-builder function via `buildLibraryIndex(state.library)`, then pass it to every per-item categorize call. Per-render cost: `O(library_size)` build + `O(items x library_size)` match. No precomputed categories on stored items (PROJECT.md constraint).

### Defensive state guards (D-34)
**Source pattern:** `lib/library.js#aliasConflict` line 231 (`const library = (state && Array.isArray(state.library)) ? state.library : [];`) and `lib/calc.js#buildView` line 24 (`Array.isArray(state && state.recipes) ? state.recipes : [];`).
**Apply to:** every place that reads `state.library` -- `buildGroceryView` and `decorateIngredients` callers.
**Rule:** `Array.isArray(state.library) && state.library.length > 0` -> build index; otherwise skip the build and call categorize without the second arg. Prevents crashes on uninitialized state.library and on legacy state files.

### Word-boundary regex with escapeRegex (cross-cutting)
**Source pattern:** `lib/categorize.js` line 63 (`new RegExp('\\b' + escapeRegex(kw.toLowerCase()) + '\\b', 'i')`) and `lib/library.js` line 278 (identical pattern).
**Apply to:** `buildLibraryIndex` -- with D-36 normalization: `new RegExp('\\b' + escapeRegex(normalizeIngredientText(alias)) + '\\b', 'i')`.
**Rule:** Always bilateral `\b...\b` to prevent prefix matches (e.g., `'pea'` does not match `'peanut'`). `escapeRegex` is module-private in both files (anti-import-cycle per STATE.md).

### `null` vs `undefined` for `libraryEntryId` (D-31, D-32)
**Source pattern:** new convention; `findEntryByText` returns `undefined` (Phase 2 D-25) but the view-layer normalizes to `null`.
**Apply to:** `buildGroceryView` item views, `decorateIngredients` item objects.
**Rule:** `match ? match.id : null`. Use `null` (NOT `undefined`) so templates can write `{% if ing.libraryEntryId %}` reliably across Nunjucks's truthiness handling.

### Test convention: plain state objects, no fs (cross-cutting)
**Source pattern:** existing `test/library.test.js` lines 76-86 -- inline state literal.
**Apply to:** all new tests in `test/library.test.js`, `test/categorize.test.js`, `test/calc.test.js`.
**Rule:** Build state objects inline; no `setupDataDir`, no temp files, no module-cache resets. Per `.planning/codebase/TESTING.md` -- pure helpers are tested with literals.

---

## No Analog Found

Every Phase 3 file has a strong existing analog (most files modify themselves). No "no analog" entries.

## Metadata

**Analog search scope:** `lib/`, `routes/`, `views/`, `test/`.
**Files scanned:** 8 total (5 source + 3 test).
**Pattern extraction date:** 2026-05-06.
**Carryovers explicitly mapped:** D-35 (Phase 1 categorize regression -> `lib/categorize.js` keyword tables); D-36 (02-REVIEW WR-01 raw-alias divergence -> `lib/library.js#buildLibraryIndex` normalize-before-regex).

---

## PLANNER NOTE: SC#5 vs D-31 contradiction in `test/calc.test.js`

CONTEXT line 102-103 says "Do NOT modify existing tests" for `test/calc.test.js`. D-31 changes `decorateIngredients` items from bare strings to `{ text, libraryEntryId }` objects. The existing tests at `test/calc.test.js` lines 237-241, 247, 257, 264 assert bare-string item shapes:

```javascript
assert.deepStrictEqual(groups[0].items, ['500g chicken thighs']);   // line 237
assert.deepStrictEqual(groups[1].items, ['1 medium onion']);         // line 238
assert.deepStrictEqual(groups[2].items, ['1 tsp salt']);             // line 239
assert.deepStrictEqual(groups[3].items, ['2 tbsp olive oil']);       // line 240
assert.deepStrictEqual(groups[4].items, ['something-uncategorized']); // line 241
assert.deepStrictEqual(groups[0].items, ['1 onion', '1 carrot', '1 tomato']); // line 257
```

These four tests MUST change to assert the new object shape. Plan should: (a) flag this as the one allowed test-shape change; (b) document it in 03-SUMMARY.md; (c) preserve every OTHER assertion in those tests (`groups.map(g => g.category)`, `groups.length`, etc.) byte-identical. Suggest a one-paragraph note in the plan that explicitly authorizes these line edits as part of the D-31 contract.
