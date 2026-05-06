# Phase 2: Library Helpers - Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 2 (1 modified library module, 1 modified test file)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/library.js` (modify) | utility (pure helpers) | transform | `lib/categorize.js` (regex index) + `lib/grocery.js` (result-object) + `lib/library.js` (existing factory/conflict) | exact (multi-source) |
| `test/library.test.js` (modify) | test | transform | `test/library.test.js` (existing) + `test/categorize.test.js` (regex/longest-wins/word-boundary tests) | exact |

## Pattern Assignments

### `lib/library.js` (utility, pure transform)

This file is being extended with four new pure helpers (`normalizeIngredientText`, `findEntryByText`, `extractAndSeed`, plus an internal `escapeRegex` and unit-list constant), and the existing `aliasKey` shim is being repointed to `normalizeIngredientText`. Multi-source pattern map below — each new helper has a different analog.

#### Analog 1: `lib/categorize.js#escapeRegex` (line 53-55)

**Use for:** Internal `escapeRegex` helper inlined inside `lib/library.js`. **Do NOT import** — STATE.md key-decision enforces import direction `library → categorize`, never the reverse. Inline a copy.

**Excerpt** (`lib/categorize.js:53-55`):
```javascript
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

#### Analog 2: `lib/categorize.js#buildIndex` (lines 57-71)

**Use for:** The body of `findEntryByText`. Per CONTEXT D-22 the matcher mirrors `buildIndex` exactly — same `\b{kw}\b` bilateral word-boundary regex, same length-DESC sort, same first-match-wins loop. Per CONTEXT D-23, the index is built **per call** (no module cache) because library state is not a module-load constant.

**Excerpt** (`lib/categorize.js:57-71`):
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

**Excerpt** (`lib/categorize.js:124-130`) — the `matchCategory` companion that pairs with `buildIndex` to drive the first-match-wins loop. `findEntryByText` reuses this exact structure but returns the owning entry rather than a category string:
```javascript
function matchCategory(index, text) {
  if (typeof text !== 'string' || !text.trim()) return 'Other';
  for (const entry of index) {
    if (entry.regex.test(text)) return entry.category;
  }
  return 'Other';
}
```

**Adaptation for `findEntryByText`:**
- Iterate `state.library` (each entry's `aliases`) instead of `Object.entries(table)`.
- Each index row carries `{ regex, length, curated, arrayIndex, entry }` (curated + arrayIndex needed for the D-24 tiebreaker).
- Sort comparator becomes `(a, b) => (b.length - a.length) || (Number(b.curated) - Number(a.curated)) || (a.arrayIndex - b.arrayIndex)`.
- On first match, return `entry` (the owning library entry) rather than a category string.
- Return `undefined` on no match (D-25), mirroring `aliasConflict`'s contract.
- Empty/whitespace input short-circuit to `undefined` before any regex test (mirrors the `if (typeof text !== 'string' || !text.trim())` guard above).

#### Analog 3: `lib/categorize.js#recipeCategoryOf` / `groceryCategoryOf` (lines 132-138)

**Use for:** `extractAndSeed` calls these single-arg heuristics at seed time when constructing a new `LibraryEntry` via `newLibraryEntry`. The Phase 3 work will widen these to accept an optional `library` param; in Phase 2 they stay single-arg.

**Excerpt** (`lib/categorize.js:132-138`):
```javascript
function recipeCategoryOf(text) {
  return matchCategory(RECIPE_INDEX, text);
}

function groceryCategoryOf(text) {
  return matchCategory(GROCERY_INDEX, text);
}
```

**Use site inside `extractAndSeed` (D-20 step 4):**
```javascript
const entry = newLibraryEntry({
  name: originalText,
  aliases: [normalizedText],
  recipeCategory: recipeCategoryOf(originalText),
  groceryCategory: groceryCategoryOf(originalText),
  curated: false
});
```

#### Analog 4: `lib/grocery.js` result-object pattern (lines 7-14)

**Use for:** `extractAndSeed`'s return shape. Per CONTEXT discretion section: `{ ok: true, added: [<entry>...], aliasesAppended: [{ entryId, alias }...] }`. Phase 4 callers will check `added.length || aliasesAppended.length` to decide whether to call `storage.save()`.

**Excerpt** (`lib/grocery.js:7-14`):
```javascript
function addItem(state, text) {
  const trimmed = (typeof text === 'string' ? text : '').trim().slice(0, 500);
  if (!trimmed) return { ok: false, reason: 'item required' };
  if (!Array.isArray(state.grocery)) state.grocery = [];
  const item = { id: newGroceryId(), text: trimmed, checked: false };
  state.grocery.push(item);
  return { ok: true, item };
}
```

**Adaptation for `extractAndSeed`:**
- Always returns `{ ok: true, added, aliasesAppended }` — there is no validation failure path on a list of strings (empties are filtered, not rejected).
- `added` is the array of new entries appended to `state.library`.
- `aliasesAppended` is the array of `{ entryId, alias }` records produced by D-21's auto-append on existing entries.
- Tolerates missing `state.library` the same way `addItem` tolerates missing `state.grocery`: `if (!Array.isArray(state.library)) state.library = [];`.

#### Analog 5: `lib/library.js` existing structure (Phase 1 — to be extended in place)

**Use for:** The existing `newLibraryId`, `newLibraryEntry`, and `aliasConflict` are reused as-is. The `aliasKey` shim swaps from trim+lowercase to a one-line call into `normalizeIngredientText`. Per CONTEXT WR-04, `newLibraryEntry` gains category validation against `RECIPE_CATEGORIES` / `GROCERY_CATEGORIES` (imported from `lib/categorize.js`).

**Existing `aliasKey` shim to replace** (`lib/library.js:36-40`):
```javascript
// Phase 1 simple normalization: trim + lowercase only (D-04).
// Phase 2 will replace this with the full normalizeIngredientText.
function aliasKey(s) {
  return (typeof s === 'string' ? s : '').trim().toLowerCase();
}
```

**Replacement shape** (Phase 2):
```javascript
// Phase 2: aliasKey is now a thin shim over normalizeIngredientText so
// aliasConflict automatically inherits the full normalization pipeline.
function aliasKey(s) {
  return normalizeIngredientText(s);
}
```

**Existing `aliasConflict` body to KEEP unchanged** (`lib/library.js:49-61`) — only the shim it depends on changes:
```javascript
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
```

**Existing `newLibraryEntry` to extend with WR-04 validation** (`lib/library.js:24-34`):
```javascript
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
```

**Validation pattern to add** (mirrors `addItem`'s reject-on-bad-input contract from `lib/grocery.js:9`):
- Throw or assert when `recipeCategory` is not in `RECIPE_CATEGORIES`.
- Throw or assert when `groceryCategory` is not in `GROCERY_CATEGORIES`.
- Planner picks throw vs return-shape; CONTEXT WR-04 calls it "validation," and `extractAndSeed` is the first auto-caller so a throw is acceptable (tests in `extractAndSeed` will exercise it).

#### Existing exports list to grow

**Existing** (`lib/library.js:63`):
```javascript
module.exports = { newLibraryId, newLibraryEntry, aliasConflict };
```

**Phase 2 target** (per CONTEXT "Established Patterns"):
```javascript
module.exports = {
  newLibraryId,
  newLibraryEntry,
  normalizeIngredientText,
  findEntryByText,
  extractAndSeed,
  aliasConflict
};
```

`escapeRegex`, the unit-list constant, and the bag-of-words helper for D-17/D-19 stay **module-private** (not exported).

---

### `test/library.test.js` (test, transform)

**Analog 1:** `test/library.test.js` (existing — Phase 1 tests). Same file gets extended; planner appends new test blocks below the existing `aliasConflict` block.

**Analog 2:** `test/categorize.test.js` for the regex / longest-wins / word-boundary test patterns that `findEntryByText` reuses.

#### Imports / structure pattern (existing `test/library.test.js:1-3`)

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { newLibraryId, newLibraryEntry, aliasConflict } = require('../lib/library');
```

**Phase 2 import line grows** (per CONTEXT "Established Patterns"):
```javascript
const {
  newLibraryId, newLibraryEntry,
  normalizeIngredientText, findEntryByText, extractAndSeed,
  aliasConflict
} = require('../lib/library');
```

#### Plain-state-object test pattern (existing `test/library.test.js:72-82`)

CONTEXT explicitly states "Phase 1 test pattern (plain state objects, no `setupDataDir`)." This is the template for every Phase 2 test:

```javascript
test('aliasConflict returns the conflicting entry when two entries share a normalized alias', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'olive oil', aliases: ['olive oil'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const conflict = aliasConflict(state, 'garlic');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_aaaaaaaa');
});
```

**Adaptation for new tests:**
- Each test constructs its own inline `state = { library: [...] }` literal — no shared fixtures, no `beforeEach`.
- Entries embed full shape (including `curated`, `createdAt`) so the D-24 curated tiebreaker can be exercised.
- Use literal IDs like `'lb_aaaaaaaa'`, `'lb_bbbbbbbb'`, `'lb_cccccccc'` for ordering predictability instead of calling `newLibraryId()`.

#### Longest-wins / word-boundary test pattern (`test/categorize.test.js:60-68, 134-160`)

`findEntryByText`'s `'olive oil' < 'extra virgin olive oil'` longest-wins case mirrors these existing tests exactly. Use these as the test-naming and assertion template:

**Excerpt** (`test/categorize.test.js:60-68`):
```javascript
test('recipeCategoryOf prefers longer keyword (chicken broth -> Flavor not Protein)', () => {
  assert.strictEqual(recipeCategoryOf('1 cup chicken broth'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('1 cup vegetable broth'), 'Flavor');
});

test('recipeCategoryOf does not match on non-word-boundary substrings', () => {
  // "atomato" should not match "tomato"
  assert.strictEqual(recipeCategoryOf('atomato'), 'Other');
});
```

**Excerpt** (`test/categorize.test.js:134-148`) — the bilateral `\b\b` regression test. `findEntryByText` inherits this invariant and Phase 2 should add an analogous regression test (e.g., an alias `'pea'` does NOT match `'peanut butter'`):
```javascript
test('groceryCategoryOf("peanut butter") returns Aisle (pea-prefix bug fix — D-01, FND-04)', () => {
  // Regression for the \b...\b regex fix. Before the fix, the keyword
  // 'pea' (in GROCERY_KEYWORDS.Produce) prefix-matched 'peanut' so 'peanut butter'
  // would route to Produce. After the fix, only 'peanut butter' (Aisle) wins.
  assert.strictEqual(groceryCategoryOf('peanut butter'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 tbsp peanut butter'), 'Aisle');
});
```

#### Empty-input handling test pattern (`test/categorize.test.js:44-50`, `test/library.test.js:131-136`)

Use this template for `normalizeIngredientText('')`, `findEntryByText(state, '')`, and `extractAndSeed` empty-filter assertions:

**Excerpt** (`test/categorize.test.js:44-50`):
```javascript
test('recipeCategoryOf returns Other for unknown input', () => {
  assert.strictEqual(recipeCategoryOf('xyzzy unknown ingredient'), 'Other');
  assert.strictEqual(recipeCategoryOf(''), 'Other');
  assert.strictEqual(recipeCategoryOf(null), 'Other');
  assert.strictEqual(recipeCategoryOf(undefined), 'Other');
  assert.strictEqual(recipeCategoryOf(42), 'Other');
});
```

**Adaptation:**
- `normalizeIngredientText('')` returns `''`; same for `null`, `undefined`, non-strings.
- `findEntryByText(state, '')` returns `undefined`.
- `extractAndSeed` filters empty post-normalize strings before the library check (per CONTEXT discretion section).

#### Test grouping pattern (`test/library.test.js:5, 21, 70` — banner comments)

```javascript
// --- newLibraryId ----------------------------------------------------------
// --- newLibraryEntry -------------------------------------------------------
// --- aliasConflict ---------------------------------------------------------
```

Phase 2 adds banners for the new groups in the same style:
```javascript
// --- normalizeIngredientText ----------------------------------------------
// --- findEntryByText -------------------------------------------------------
// --- extractAndSeed --------------------------------------------------------
```

---

## Shared Patterns

### Pure-helper module convention
**Source:** `lib/library.js` (existing), `lib/grocery.js`, `lib/categorize.js`
**Apply to:** `lib/library.js` Phase 2 additions
- No `require('node:fs')`, no `require('node:http')`, no `require('express')`, no `require('./storage')`.
- All helpers accept `state` (or scalars) by parameter; no module-level state cache.
- `module.exports = { ... }` named-exports object at the bottom of the file. No default export.

### Result-object return shape
**Source:** `lib/grocery.js:7-14, 16-21, 23-29`
**Apply to:** `extractAndSeed`
**Excerpt:**
```javascript
return { ok: false, reason: 'item required' };
return { ok: true, item };
```
Adaptation: `extractAndSeed` always returns `{ ok: true, added, aliasesAppended }` (there is no validation-failure branch; empty inputs are filtered, not rejected).

### Tolerant state-array access
**Source:** `lib/library.js:52` and `lib/grocery.js:24, 32`
**Apply to:** Every new helper that touches `state.library`.
**Excerpts:**
```javascript
// lib/library.js:52
const library = (state && Array.isArray(state.library)) ? state.library : [];
// lib/grocery.js:24
if (!Array.isArray(state.grocery)) return { ok: false, reason: 'unknown item' };
```
Adaptation:
- `findEntryByText`: read-only path uses the `library.js:52` pattern (default to `[]`, return `undefined` on no match).
- `extractAndSeed`: write path uses the `library.js:52` read followed by `state.library.push(...)` writes; if `state.library` is missing, initialize to `[]` first (mirrors `lib/grocery.js:10` `if (!Array.isArray(state.grocery)) state.grocery = [];`).

### Truthiness contract for "found / not found"
**Source:** `lib/library.js:49-61` (`aliasConflict`)
**Apply to:** `findEntryByText`
- Return the matching entry on hit.
- Return `undefined` on miss (CONTEXT D-25 explicitly mirrors `aliasConflict` here).
- Callers test the return value as a boolean.

### Inline regex-escape helper
**Source:** `lib/categorize.js:53-55`
**Apply to:** `lib/library.js` (inlined copy, NOT imported — STATE.md import-direction rule).
**Excerpt:**
```javascript
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### Bilateral word-boundary regex pattern
**Source:** `lib/categorize.js:63`
**Apply to:** `findEntryByText`'s alias regex builder.
**Excerpt:**
```javascript
regex: new RegExp('\\b' + escapeRegex(kw.toLowerCase()) + '\\b', 'i')
```
Adaptation: `kw` becomes `alias` (the alias string from a library entry). The `'i'` flag makes the test case-insensitive against the raw input text.

### Length-DESC sort + first-match-wins iteration
**Source:** `lib/categorize.js:69, 124-130`
**Apply to:** `findEntryByText`
**Excerpts:**
```javascript
entries.sort((a, b) => b.length - a.length);
// ...
for (const entry of index) {
  if (entry.regex.test(text)) return entry.category;
}
```
Adaptation: extend the sort comparator with the curated tiebreaker (D-24):
```javascript
indexEntries.sort((a, b) =>
  (b.length - a.length) ||
  (Number(b.curated) - Number(a.curated)) ||
  (a.arrayIndex - b.arrayIndex)
);
```

### Test-file plain-state-object isolation
**Source:** `test/library.test.js` entire file (no `setupDataDir`, no `_resetForTest`)
**Apply to:** All Phase 2 test additions.
- Each test inlines its own `state = { library: [...] }`.
- No shared fixtures, no `beforeEach`.
- No file-system setup (`lib/library.js` has no fs dependency).
- Use literal IDs (`lb_aaaaaaaa`, `lb_bbbbbbbb`) rather than `newLibraryId()` calls so ordering and tiebreaker tests are deterministic.

### Code-comment style for `lib/`
**Source:** `lib/library.js:1-17` (JSDoc typedef), `lib/categorize.js:68` (`// Longest keyword wins.`), `lib/grocery.js:2-4` (intent comment)
**Apply to:** Phase 2 additions.
- JSDoc for typedefs and exported function contracts.
- Single-line `//` comments for non-obvious algorithm steps (e.g., the curated tiebreaker rationale, the bag-of-words stemming caveat).
- Phase / decision references in comments where relevant (existing pattern: `// Phase 1 simple normalization: trim + lowercase only (D-04).`).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Both files have strong analogs. |

The bag-of-words / subset-collapse logic in `extractAndSeed` (D-17/D-18/D-19) has no direct codebase analog — it is a new pattern. The planner should:
1. Implement it as a small private helper inside `lib/library.js` (e.g., `bagOfWords(s)` returning `Set<string>` after the comparison-only `'s'`-strip).
2. Use `Set` operations for the subset check: `[...a].every(x => b.has(x))`.
3. Cross-reference RESEARCH.md if available for any JS Set idioms; otherwise this is straightforward standard-library code.

The `normalizeIngredientText` pipeline (D-13/D-14/D-15/D-16) is also new behavior with no direct codebase analog. The planner builds it as a sequential transform per CONTEXT D-13..D-16's locked order of operations:
1. lowercase + initial trim
2. strip parentheticals (greedy `\(.*?\)` iterated until no match)
3. strip trailing-comma tail (split on first `,`)
4. strip leading `<number><fraction>? <unit>?` chunk plus optional trailing `'of'`
5. collapse whitespace + final trim

The unit-list constant lives at module-top, the same way `RECIPE_CATEGORIES` lives at the top of `lib/categorize.js:1`.

---

## Metadata

**Analog search scope:**
- `lib/categorize.js` (regex index, escape helper, single-arg category functions, longest-wins)
- `lib/library.js` (Phase 1 existing — factory, conflict, shim)
- `lib/grocery.js` (result-object pattern, tolerant state access)
- `test/library.test.js` (plain-state test isolation, banner comment style)
- `test/categorize.test.js` (longest-wins, word-boundary, empty-input test patterns)

**Files scanned:** 5

**Pattern extraction date:** 2026-05-06
