---
phase: 01-foundation
reviewed: 2026-05-05T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - lib/library.js
  - lib/categorize.js
  - lib/storage.js
  - test/library.test.js
  - test/categorize.test.js
  - test/storage.test.js
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-05-05
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 1 ships three concerns: (1) state schema migration adding `library` and `libraryMigratedAt`, (2) the `\b...\b` regex fix in `lib/categorize.js` plus an explicit plurals audit, and (3) pure helpers in `lib/library.js`. The library helpers and storage migration are clean. The migration is conservative, well-tested, and matches the existing `migrate()` style.

The categorization changes contain two behavioral regressions introduced by the plurals audit. The bilateral `\b\b` fix is correct and the explicit "peanut" addition does its job, but the audit added bare `'pepper','peppers'` to `RECIPE_KEYWORDS.Veg` — which is semantically wrong (pepper is most commonly a seasoning) AND now creates a recipe-vs-grocery category mismatch for the input string `"pepper"`. Separately, the `\b\b` change converts the previously prefix-matching `'pepper'` keyword in `GROCERY_KEYWORDS.Aisle` from "matches 'peppers'" to "does not match 'peppers'", and there is no bare `'peppers'` keyword in any grocery category to take its place — so plural "peppers" on the grocery side falls through to Other.

There are no critical security issues. The library is auto-seeded later in Phase 2, so the alias-conflict contract is the load-bearing piece here; it is correct and well-tested.

## Warnings

### WR-01: Bare `'pepper'` in `RECIPE_KEYWORDS.Veg` mis-categorizes plain pepper as Veg

**File:** `lib/categorize.js:27`
**Issue:** The plurals audit added `'pepper','peppers'` to `RECIPE_KEYWORDS.Veg` to handle generic "red pepper / green pepper" inputs. But the bare keyword `'pepper'` now matches plain inputs like `"1 tsp pepper"` or `"pepper to taste"` and routes them to **Veg** instead of **Seasoning**, which is the dominant real-world meaning. Before this change, plain "pepper" fell through to `Other`; now it is actively wrong.

This is also inconsistent with `GROCERY_KEYWORDS.Aisle` which contains bare `'pepper'` (line 101), so the same string `"1 tsp pepper"` produces:
- Recipe side: `Veg`
- Grocery side: `Aisle`

That recipe/grocery mismatch will confuse users on the recipe detail page (groups by recipe category) versus the grocery list page (groups by grocery category).

**Fix:** Either (a) move bare `'pepper'` from `RECIPE_KEYWORDS.Veg` to `RECIPE_KEYWORDS.Seasoning` so it aligns with the seasoning-table membership of `'black pepper'`, `'white pepper'`, `'peppercorn'`, and (b) drop bare `'peppers'` (since `'bell peppers'`, `'jalapenos'`, `'habaneros'` are the explicit produce plurals), or — if the intent really is "red/green pepper as Veg" — add the explicit phrases `'red pepper'` and `'green pepper'` to Veg and leave bare `'pepper'` out of Veg.

```javascript
// In RECIPE_KEYWORDS.Veg, remove this line:
'pepper','peppers'

// In RECIPE_KEYWORDS.Seasoning, the existing entries already cover real seasoning use.
// If bare-pepper-as-seasoning needs an explicit catch, add 'pepper' to Seasoning.
```

### WR-02: Plural `"peppers"` no longer categorized on the grocery side after `\b\b` fix

**File:** `lib/categorize.js:101`
**Issue:** The `\b\b` regex change correctly stopped `\bpepper\b` from prefix-matching `peppers`. But `GROCERY_KEYWORDS.Aisle` still contains only the singular `'pepper'`, and no grocery category contains a bare `'peppers'` keyword. So input `"2 peppers"` (a common grocery list item) now falls through every grocery index entry and lands in **Other** — a regression in user-visible categorization.

The Phase 1 plan explicitly called out a plurals audit with regression tests. The audit added `'peppers'` to `RECIPE_KEYWORDS.Veg` (which is itself problematic — see WR-01) but did not add a `peppers` entry to any grocery category. There is no test asserting the grocery-side category of `"2 peppers"`, so this regression is not caught.

**Fix:** Add `'peppers'` somewhere in `GROCERY_KEYWORDS` (most likely Produce alongside `'bell peppers'`), and add a regression test to `test/categorize.test.js`.

```javascript
// lib/categorize.js — GROCERY_KEYWORDS.Produce, near 'bell pepper','bell peppers':
'bell pepper','bell peppers','peppers','jalapeno','jalapenos','habanero','habaneros',

// test/categorize.test.js — add:
test('groceryCategoryOf("2 peppers") classifies as Produce (plural pepper regression)', () => {
  assert.strictEqual(groceryCategoryOf('2 red peppers'), 'Produce');
  assert.strictEqual(groceryCategoryOf('2 peppers'), 'Produce');
});
```

### WR-03: `aliasConflict` does not normalize the stored alias the same way it normalizes the query when the entry was constructed by a different code path

**File:** `lib/library.js:49-61`
**Issue:** `aliasConflict` calls `aliasKey()` on both the query alias AND every stored alias on every call (`if (aliasKey(a) === key)`). That is correct for the lookup. But `newLibraryEntry` stores `aliases` exactly as provided (no normalization, no de-duplication, no length cap). A caller that does not also use `aliasConflict` to gate inserts can produce an entry with `aliases: [' Garlic ', 'GARLIC', 'garlic']` — three entries that all collapse to the same key.

Phase 1 is intentionally minimal here (D-04 defers full normalization to Phase 2), but the contract of "an entry's alias list is curated and unique" is not enforced by these helpers. When Phase 2 wires up auto-seeding via `extractAndSeed`, this constraint silently relies on every caller doing the right thing.

**Fix:** Either (a) document this contract explicitly in the JSDoc on `newLibraryEntry` (callers must pre-normalize and de-duplicate), or (b) defer the safety to Phase 2 where the auto-seed code lands. At minimum add a comment noting that aliases are stored verbatim and the helper does not deduplicate. If (a), a one-line de-dup using `aliasKey` would solidify the invariant cheaply.

```javascript
function newLibraryEntry({ name, recipeCategory, groceryCategory, aliases, curated } = {}) {
  // Phase 1: aliases stored verbatim. Callers are responsible for normalization
  // and uniqueness. Phase 2 will add full normalization and de-dup.
  return {
    id: newLibraryId(),
    name,
    aliases: aliases || [],
    // ...
  };
}
```

### WR-04: `newLibraryEntry` accepts unknown category strings without validation

**File:** `lib/library.js:24-34`
**Issue:** `newLibraryEntry` writes whatever `recipeCategory` / `groceryCategory` strings the caller passes — including `undefined`, `''`, `'XYZ'`, or a misspelled `'Vegg'`. The JSDoc says "One of RECIPE_CATEGORIES" but nothing enforces it. A caller that passes the wrong shape produces an entry that will silently break the recipe detail / grocery list rendering layer (which groups by exact category match).

This is a classic "phase 1 helper with no validation" smell. It is amplified by the fact that the caller surface for this helper is a future auto-seed (Phase 2) that takes its inputs from the heuristic — so an off-by-one-string mistake won't be caught by tests on this helper alone.

**Fix:** Either validate against the imported `RECIPE_CATEGORIES` / `GROCERY_CATEGORIES`, or document that validation is the caller's responsibility. Validation is the safer default; the cost is one `require` and two `.includes()` checks.

```javascript
const { RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('./categorize');

function newLibraryEntry({ name, recipeCategory, groceryCategory, aliases, curated } = {}) {
  if (!RECIPE_CATEGORIES.includes(recipeCategory)) {
    throw new Error(`invalid recipeCategory: ${recipeCategory}`);
  }
  if (!GROCERY_CATEGORIES.includes(groceryCategory)) {
    throw new Error(`invalid groceryCategory: ${groceryCategory}`);
  }
  // ...
}
```

If validation is left to Phase 2, add a JSDoc note "no validation — callers are trusted".

## Info

### IN-01: `newLibraryEntry` stores the caller's `aliases` array by reference

**File:** `lib/library.js:28`
**Issue:** `aliases: aliases || []` keeps a reference to the caller's array. If the caller later pushes to that array (e.g., a builder pattern), the stored entry mutates too. Pure-helper convention in this repo prefers defensive copies for owned state.
**Fix:** `aliases: Array.isArray(aliases) ? aliases.slice() : []`. Cheap, removes a class of caller-side surprises.

### IN-02: `newLibraryEntry` does not validate or default `name`

**File:** `lib/library.js:27`
**Issue:** Passing `{}` to `newLibraryEntry` produces `{ id: 'lb_...', name: undefined, ... }`. Empty/whitespace `name` similarly slips through. Phase 1 callers (only tests today) all pass a name, but the helper is the public contract for Phase 2 auto-seeding.
**Fix:** Either trim and require name (throw on empty) or document the contract. Same trade-off as WR-04.

### IN-03: `aliasConflict` returns the entry on conflict — JSDoc says "callers test as boolean"

**File:** `lib/library.js:42-48`
**Issue:** The JSDoc says callers will use the return value as a boolean, but the function returns the conflicting entry object on success. That is useful — callers may want to surface "alias already used by 'olive oil' (lb_xxx)" — but the doc undersells the API. Returning the entry is the right call; the doc just doesn't reflect it.
**Fix:** Update the JSDoc to "Returns the conflicting entry (truthy) on a hit, or undefined when no conflict. The entry is returned so callers can render an informative toast; truthiness is the gate, the entry is the payload."

### IN-04: `migrate()` accepts the same shape from `replace(next)` without enforcing entry-shape validation

**File:** `lib/storage.js:8-17`, `lib/storage.js:57`
**Issue:** `migrate()` only validates top-level field types (arrays vs string vs null). It does not validate that each entry inside `state.library` has the canonical shape. A direct `storage.replace({ library: [{ id: 5, name: null }] })` is preserved as-is. This is consistent with how `recipes`, `weeks`, and `grocery` are handled (no per-entry validation), so it is a documented convention rather than a bug, but it is worth flagging because Phase 2 auto-seeding will write into this collection and tests should assert that the auto-seeder always produces canonical-shape entries.
**Fix:** No change needed in Phase 1 storage code. Note this in the Phase 2 plan: auto-seed must produce canonical entries (use `newLibraryEntry`), and add a test that the round-trip through `migrate()` preserves all required fields.

---

_Reviewed: 2026-05-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
