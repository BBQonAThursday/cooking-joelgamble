---
phase: 03-categorization-layering
reviewed: 2026-05-06T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - lib/calc.js
  - lib/categorize.js
  - lib/library.js
  - routes/recipes.js
  - test/calc.test.js
  - test/categorize.test.js
  - test/library.test.js
  - views/recipe.njk
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-06T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 3 layers the curated user library on top of the existing keyword categorizer with care.
The core architectural invariants requested for review hold:

1. **Import-direction rule preserved.** `lib/categorize.js` does NOT `require('./library')`. The
   inline `matchRawLibrary` walk in categorize.js mirrors `buildLibraryIndex`'s shape using the
   now-module-local `normalizeIngredientText` (moved per 03-REVISION-1 Approach A). `lib/library.js`
   imports the canonical normalizer from categorize and re-exports it for back-compat.
2. **Render-time categorization honored.** `buildGroceryView` and `decorateIngredients` build the
   library index per render and never persist categories on grocery items or recipe ingredients.
3. **`libraryEntryId: null` default applied uniformly** in both `buildGroceryView` (categorized
   AND closed items) and `decorateIngredients` (all four code paths: library hit, library miss,
   undefined library, empty library).
4. **D-34 defensive guards uniform.** Both view-builders use the same
   `(state && Array.isArray(state.library) && state.library.length > 0)` (or its `decorateIngredients`
   equivalent) gate before calling `buildLibraryIndex`. Tests cover undefined / null / non-array /
   empty library cases for `buildGroceryView`.
5. **Byte-equivalent regex compilation.** `buildLibraryIndex` and `matchRawLibrary` both run the
   stored alias through `normalizeIngredientText(alias)` then compile
   `new RegExp('\\b' + escapeRegex(normalized) + '\\b', 'i')`. For any given input alias the
   produced regex source is identical. The 03-REVISION-1 BLOCKER closure is in place and the
   D-36 test (`'1 clove garlic'` against alias `'  GARLIC  '`) verifies both forms.
6. **SC#5 byte-identical pre-existing tests.** `git diff c41ea29..HEAD -- test/categorize.test.js`
   confirms the only changes in `test/categorize.test.js` are: one added import line on line 71
   and entirely-new tests appended after the existing block. The pre-existing 25 tests are
   byte-identical. SC#5 holds for `test/calc.test.js` as well -- the diff matches the 6 authorized
   line edits in the `decorateIngredients` block.

What I found instead are quality and robustness concerns, none of which block ship.

## Warnings

### WR-01: Render layer crashes on library entries with off-list categories

**File:** `lib/calc.js:102`, `lib/calc.js:167`
**Issue:**
Both `buildGroceryView` and `decorateIngredients` do `buckets.get(category).push(...)` without
checking that `category` is in `GROCERY_CATEGORIES` / `RECIPE_CATEGORIES`. `category` comes from
`groceryCategoryOf` / `recipeCategoryOf`, which return `entry.recipeCategory` /
`entry.groceryCategory` directly when a library hit occurs (D-27: "no further validation -- entry
categories are validated at newLibraryEntry time").

That assumption holds for entries created via `newLibraryEntry`, but `state.library` is loaded from
disk via `lib/storage.js`. If `data/state.json` ever contains a library entry with a malformed
category -- hand-edited file, schema migration from a future version, partial write recovery from a
crashed `state.json.tmp`, or even a legacy curated entry created before the WR-04 validation landed
in Plan 1 -- then `buckets.get(category)` returns `undefined` and `.push` throws. Both
`buildGroceryView` (the home tab the user lands on) and `decorateIngredients` (the recipe-detail
page) would 500 on every request until the user manually fixes the JSON.

CLAUDE.md describes the trust model as "single user, LAN-only" with no auth, so this isn't a
security issue. It IS a robustness issue: the categorizer is the part of the system the user is
actively curating, so hand-edits are the most likely pathway to a malformed entry, and the failure
mode is a hard crash on the most-trafficked routes.

**Fix:**
Either (a) make the category lookup tolerant by falling back to 'Other' when `buckets.get(category)`
is undefined, or (b) add a `migrate()` step in `lib/storage.js` that drops/coerces library entries
with off-list categories. (a) is the smaller change:

```js
// in buildGroceryView (calc.js:102)
const bucket = buckets.get(category) || buckets.get('Other');
bucket.push({ ...item, libraryEntryId });

// in decorateIngredients (calc.js:167)
const bucket = buckets.get(category) || buckets.get('Other');
bucket.push({ text, libraryEntryId });
```

Optionally pair with a one-line warn in storage.js#migrate when a library entry is rewritten so
the user knows to clean up.

### WR-02: `routes/recipes.js` GET /recipes/:id crashes on a malformed week record

**File:** `routes/recipes.js:57-58`
**Issue:**
```js
const week = (state.weeks || []).find(w => w.weekStart === monday);
const isTagged = !!(week && week.recipeIds.includes(recipe.id));
```

If a week record exists for `monday` but has `recipeIds` missing/null/non-array, the
`.includes(...)` call throws and the recipe-detail page 500s. This isn't introduced by Phase 3 --
the line was previously `decorateIngredients(recipe.ingredients)` and is now
`decorateIngredients(recipe.ingredients, state.library)` -- but it sits two lines above the Phase 3
change in the same function, so it's in scope of this review and worth flagging while the file is
open.

**Fix:**
Guard the array access:

```js
const isTagged = !!(week && Array.isArray(week.recipeIds) && week.recipeIds.includes(recipe.id));
```

This mirrors the tolerant `Array.isArray(...)` checks elsewhere in `lib/calc.js` and
`lib/library.js`.

## Info

### IN-01: Per-item double iteration of the library index in `buildGroceryView` and `decorateIngredients`

**File:** `lib/calc.js:96-101`, `lib/calc.js:162-166`
**Issue:**
For each grocery item / ingredient, the code calls BOTH `findEntryInIndex(libraryIndex, text)`
(to get `libraryEntryId`) AND `groceryCategoryOf(text, libraryIndex)` /
`recipeCategoryOf(text, libraryIndex)` (to get `category`). Each call walks the index from the top
in sorted order until first regex match. That's two regex walks per item where one would do --
the index rows already carry `recipeCategory` and `groceryCategory` (set in `buildLibraryIndex`,
lib/library.js:206-207) so the "find" call already has the category in hand.

This is a render-path concern (called for every grocery item and every recipe ingredient on every
page load). Performance is out of v1 scope per the review charter, so I'm logging this as info.
There's also a correctness benefit: collapsing to a single walk eliminates the (theoretical)
possibility of the two walks disagreeing if the index is ever mutated mid-render (it isn't today,
but the divergence surface exists).

**Fix:**
Use the row's stored category directly. Sketch:

```js
// in buildGroceryView (calc.js:94-103)
for (const item of unchecked) {
  let libraryEntryId = null;
  let category;
  if (libraryIndex) {
    for (const row of libraryIndex) {
      if (row.regex.test(item.text)) {
        libraryEntryId = row.entry.id;
        category = row.groceryCategory;
        break;
      }
    }
  }
  if (!category) category = groceryCategoryOf(item.text); // heuristic fallback
  buckets.get(category).push({ ...item, libraryEntryId });
}
```

Same shape for `decorateIngredients`.

### IN-02: `extractAndSeed` rebuilds the library index per ingredient

**File:** `lib/library.js:316`
**Issue:**
The for-loop inside `extractAndSeed` calls `findEntryByText(state, original)` per ingredient.
`findEntryByText` runs `buildLibraryIndex(state.library)` every call (lib/library.js:263). On a
recipe with N ingredients and a library of M entries, that's O(N*M) regex compiles where O(N + M)
suffices (build the index once at the top of the loop, reuse for every iteration).

This is the same D-33 invariant that the render path already honors. Performance is out of v1
scope; the asymmetry is worth noting because Phase 4 will start calling `extractAndSeed` from the
recipe save path, where M grows over time.

**Fix:**
Hoist the index outside the for-loop and use `findEntryInIndex` per iteration:

```js
function extractAndSeed(state, ingredients) {
  // ... existing guards ...
  if (!Array.isArray(state.library)) state.library = [];
  // Build the read-side index once. The mutation steps below append to state.library;
  // newly-added entries are captured in the inProgress staging array, so the stale
  // index does not need to be rebuilt mid-loop -- the inProgress collapse step (3)
  // handles the same-call duplicate suppression.
  const libraryIndex = buildLibraryIndex(state.library);
  // ...
  const libMatch = findEntryInIndex(libraryIndex, original);
}
```

The "stale index over the loop" caveat is real but already correct: step (3) (in-progress
collapse) is the duplicate-suppression mechanism for entries seeded earlier in the SAME call. The
final `aliasConflict` guard at step (5) re-walks `state.library` so cross-entry collisions still
surface. So hoisting is safe.

### IN-03: `isPreBuiltLibraryIndex` discriminator is structural, not nominal

**File:** `lib/categorize.js:233-235`
**Issue:**
`isPreBuiltLibraryIndex(arg)` returns true iff the first element has `.regex instanceof RegExp`.
Today no `LibraryEntry` shape carries a `regex` field, so the discriminator works -- but this is a
"this happens to be true" invariant, not an enforced one. If a future schema bump adds anything
named `regex` to `LibraryEntry` (e.g. for a stored validation regex), every raw-library callsite
silently misroutes to the pre-built-index branch and the `.test()` calls explode at runtime.

**Fix:**
Add a sentinel field to the index rows so the discriminator can check for something that ONLY
the index has. Cheapest version:

```js
// in lib/library.js#buildLibraryIndex
rows.push({
  __libraryIndexRow: true,   // sentinel
  regex: ...,
  // ... rest unchanged
});

// in lib/categorize.js
function isPreBuiltLibraryIndex(arg) {
  return Array.isArray(arg) && arg.length > 0 && arg[0] && arg[0].__libraryIndexRow === true;
}
```

Alternative: a JSDoc-only convention is fine if the team is comfortable enforcing it via review.
The risk is low; flagged for awareness.

### IN-04: Inlined `escapeRegex` duplication between `lib/categorize.js` and `lib/library.js`

**File:** `lib/categorize.js:55-57`, `lib/library.js:32-34`
**Issue:**
Both modules define an identical 3-line `escapeRegex` helper. The library.js copy carries a
comment explicitly justifying the duplication ("Library never imports from categorize for regex
escaping"), and now that `normalizeIngredientText` was moved into categorize.js (and library.js
re-exports it), the duplication justification has thinned -- library.js is already importing
`normalizeIngredientText` from categorize.js, so importing `escapeRegex` from the same place
would not introduce a new coupling.

This is a style nit; both copies are 3 lines and identical, the maintenance cost is trivial, and
the explicit comment shows the duplication is intentional. Logging only because the
"library never imports from categorize" rationale no longer holds after the 03-REVISION-1 move.

**Fix:**
Either export `escapeRegex` from `lib/categorize.js` and have `lib/library.js` import it, or
update the inline comment in `lib/library.js:29-31` to drop the now-stale "Library never imports
from categorize for regex escaping" line. Either is fine.

---

_Reviewed: 2026-05-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
