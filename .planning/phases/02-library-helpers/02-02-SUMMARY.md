---
phase: 02-library-helpers
plan: 02
subsystem: lib/library
tags: [matching, regex, longest-wins, helpers]
requires:
  - lib/library.js (Phase 2 Plan 1: escapeRegex inlined, normalizeIngredientText, aliasConflict, newLibraryEntry)
  - lib/categorize.js#buildIndex / matchCategory (algorithmic analog -- same \b{alias}\b regex + first-match-wins loop)
provides:
  - lib/library.js#findEntryByText (state, text) -> LibraryEntry | undefined
affects:
  - lib/library.js#module.exports (now lists findEntryByText alongside Plan 1 exports)
tech-stack:
  added: []
  patterns:
    - per-call regex index build (no module cache -- library state mutates at runtime)
    - 3-key sort comparator: (length DESC, curated DESC, arrayIndex ASC) via short-circuit `||` chain
    - Number(boolean) coercion to keep curated flag sortable
    - mirror lib/categorize.js#matchCategory loop (first-match-wins iteration)
key-files:
  created: []
  modified:
    - lib/library.js
    - test/library.test.js
decisions:
  - "Per-call regex index (NOT module-cached): lib/categorize.js can cache because RECIPE_KEYWORDS / GROCERY_KEYWORDS are module-load constants. state.library mutates -- a cache would race with extractAndSeed and Library tab routes. CONTEXT D-23."
  - "Index sort tuple = (length DESC, curated DESC, arrayIndex ASC). Boolean curated flag coerced via Number(...) so the comparator's subtraction stays sortable. CONTEXT D-22 / D-24."
  - "findEntryByText returns the FULL entry (with id), not just a category string -- because Phase 6 Fix shortcut needs the entry id to navigate to the Library tab and Phase 3 categorization layering needs both .recipeCategory and .groceryCategory off one entry. MATCH-03."
  - "Returns undefined on no match (NOT null and NOT a default-Other entry) -- mirrors aliasConflict's truthiness contract from Plan 1. CONTEXT D-25."
  - "Tests against the LOWERCASED RAW INPUT (callers do not need to pre-normalize) -- the regex is built `'i'` flag and the input is passed through unchanged. This is intentional: callers pass recipe-source ingredient strings like '2 cloves garlic, minced' directly."
  - "Defensively skips entries with missing/non-array aliases instead of throwing -- a tampered/legacy state row should not mask other matchable entries. T-02-02-02 mitigation."
metrics:
  duration: ~4 min
  completed: 2026-05-06
tasks_completed: 2
tasks_total: 2
---

# Phase 2 Plan 2: findEntryByText Match Function Summary

`findEntryByText(state, text)` joins `lib/library.js` -- a per-call regex index that fuses `lib/categorize.js#buildIndex` and `matchCategory` into a single function returning the owning library entry on the first matching alias, with a locked `(length DESC, curated DESC, arrayIndex ASC)` sort tuple per CONTEXT D-22 / D-24. This is the matching primitive Phase 3 categorization layering and Phase 6 Fix shortcut both depend on.

## What Shipped

### Public API addition to `lib/library.js`

```javascript
/**
 * @param {{ library?: LibraryEntry[] }} state
 * @param {string} text
 * @returns {LibraryEntry | undefined}
 */
function findEntryByText(state, text) {
  // 1. Empty/non-string text -> undefined
  // 2. Build per-call regex index: { regex: \b{escapeRegex(alias.toLowerCase())}\b /i,
  //                                  length, curated, arrayIndex, entry }
  // 3. Sort: (length DESC, curated DESC, arrayIndex ASC)
  // 4. First regex.test(text) hit -> return owning entry
  // 5. No match -> undefined
}
```

### `module.exports` shape

Phase 2 Plan 1: `{ newLibraryId, newLibraryEntry, normalizeIngredientText, aliasConflict }`
Phase 2 Plan 2: `{ newLibraryId, newLibraryEntry, normalizeIngredientText, findEntryByText, aliasConflict }`

(Plan 3 will further grow this to include `extractAndSeed`.)

### Algorithmic mirror to `lib/categorize.js`

`findEntryByText` deliberately uses the same `\b{escaped-alias}\b` bilateral word-boundary regex shape as `lib/categorize.js#buildIndex`, and the same first-match-wins iteration as `lib/categorize.js#matchCategory`. The difference: it returns the full entry (with `id`), it sorts by a 3-key tuple instead of length only, and it builds the index per call (not at module load) because library state is mutable.

## Tests Added

**12 new tests** in `test/library.test.js` (36 -> 48 in this file; full suite 219 -> 231):

- `findEntryByText returns undefined for empty/whitespace/non-string text input` -- `''`, `'   '`, `null`, `undefined`, `42` all -> `undefined`.
- `findEntryByText returns undefined when state has no library` -- `{}`, `{library:null}`, `{library:'nope'}` -- tolerant.
- `findEntryByText returns undefined when no alias matches` -- baseline no-match.
- `findEntryByText returns the matching entry (with id, MATCH-03)` -- entry has `id` matching `/^lb_[0-9a-z]{8}$/`.
- `findEntryByText is case-insensitive against the raw input` -- alias `'olive oil'` matches input `'OLIVE OIL'`.
- `findEntryByText: longest alias wins (D-22)` -- entry with alias `'extra virgin olive oil'` beats entry with alias `'olive oil'` on a query containing both.
- `findEntryByText: word-boundary regression -- alias "pea" does NOT match "peanut butter"` -- mirrors the `lib/categorize.js` Phase 1 pea-prefix-bug regression. Includes a sanity assertion that `\bpea\b` DOES match `'a pea'` (regex isn't broken in the other direction).
- `findEntryByText: \bpea\b does NOT match "peas" either (no stemming, no prefix match)` -- confirms the bilateral `\b\b` regex is strict; demonstrates the user-side remedy (push `'peas'` as a separate alias on the same entry).
- `findEntryByText: curated tiebreaker -- curated wins over uncurated on equal-length aliases (D-24)` -- exercised in BOTH array orders (curated first AND uncurated first).
- `findEntryByText: array-order tiebreaker on equal length + equal curation (D-24)` -- earlier array index wins.
- `findEntryByText: skips entries with missing or non-array aliases without crashing` -- malformed rows do not mask matchable rows.
- `findEntryByText: returns undefined when library is empty` -- `state.library = []` returns `undefined`.

## Verification

- `node --test test/library.test.js` -> 48/48 pass.
- `npm test` -> 231/231 pass (was 219 before this plan; +12 new findEntryByText tests).
- `lib/library.js` contains `function findEntryByText(` -- verified.
- `lib/library.js` has exactly one `function escapeRegex(` definition -- the Plan 1 inlined copy is reused, no second definition added (verified via grep).
- `findEntryByText` does NOT call any `categorize.js` function (the `categorize` references inside the body are comment-only -- the algorithm mirror reference and the `RECIPE_CATEGORIES`/`GROCERY_CATEGORIES` import is for `newLibraryEntry`, not `findEntryByText`).
- `module.exports` lists `findEntryByText` between `normalizeIngredientText` and `aliasConflict` -- matches the order CONTEXT specifies.
- The sort comparator is the literal `(b.length - a.length) || (Number(b.curated) - Number(a.curated)) || (a.arrayIndex - b.arrayIndex)` chain.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed broken sanity assertion in the peanut-butter regression test**

- **Found during:** Task 2 -- writing the test block as the plan literally specified.
- **Issue:** The plan's Task 2 Step 2 included this assertion inside the `'pea' does NOT match 'peanut butter'` test:
  ```javascript
  // Sanity: an exact match still works.
  assert.ok(findEntryByText(state, '1 cup peas'));   // 'pea' \b matches the start of 'peas'? -- NO, \b is between [\w][\W]; 'peas' has no \W before 's'. So:
  // Actually \bpea\b only matches the standalone token 'pea'. 'peas' won't match.
  // Adjust the assertion:
  ```
  The plan author noticed mid-write that `\bpea\b` will not match `peas` (because the `s` is `\w` -- no boundary), and wrote a comment saying "Adjust the assertion:" but did not actually adjust the assertion. As written, the `assert.ok(findEntryByText(state, '1 cup peas'))` would fail because `findEntryByText` correctly returns `undefined` for that input.
- **Fix:** Replaced the broken sanity assertion with one that actually exercises the regex in the positive direction: `assert.ok(findEntryByText(state, 'a pea'))` and `assert.strictEqual(findEntryByText(state, 'a pea').id, 'lb_aaaaaaaa')`. The `peas` non-match case is fully covered by the next test (`\bpea\b does NOT match "peas" either`), so dropping it from the peanut-butter test costs no coverage.
- **Files modified:** `test/library.test.js` (one assertion replacement + comment block in the peanut-butter regression test).
- **Commit:** `20a5e38`.
- **Why this is Rule 1 not Rule 4:** The plan's behavior list and `<done>` criteria both specify "alias 'pea' does NOT match 'peanut butter'" -- the broken sanity line was an in-progress note the planner left in. Removing it does not change behavior, scope, or contract. The next test (which IS in the plan) covers the `peas` case completely.

No other deviations. The plan's implementation specification, sort tuple, exports order, and test list landed exactly as written.

## Authentication Gates

None encountered. Plan 2 is a pure helper function with no I/O, no auth surface.

## Known Stubs

None. `findEntryByText` is fully implemented and tested. Phase 3's `recipeCategoryOf(library, text)` and `groceryCategoryOf(library, text)` will call it as their first step (library hit -> use entry's category; library miss -> heuristic fallback).

## Threat Flags

None. Plan 2's threat register is fully mitigated:

- **T-02-02-01 (ReDoS):** Each alias regex is `\b{escapeRegex(alias)}\b` -- bounded character class on each side, no nested quantifiers. `escapeRegex` neutralizes regex metacharacters in alias text. Aliases are user-curated or auto-extracted from recipe ingredients (bounded length). Per-call build is O(N aliases) and library sizes are low-thousands per CONTEXT D-23. ReDoS-safe.
- **T-02-02-02 (Tampering):** The `Array.isArray(entry.aliases)` guard skips malformed entries without throwing -- a tampered/legacy state row cannot mask other matchable entries.

No new security-relevant surface introduced beyond the plan's threat model.

## Next Up

- **Wave 3 (Plan 02-03):** `extractAndSeed` -- the auto-seeder. Per CONTEXT D-20 step 2, its FIRST step is `findEntryByText(state, originalText)` (library check first). If a hit, no seed. If a miss, normalize the ingredient and create a new uncurated `newLibraryEntry`. Plan 02-02 lands the matching primitive Plan 03 depends on.
- **Phase 3:** `lib/categorize.js#recipeCategoryOf` and `groceryCategoryOf` will be widened to take a library param and call `findEntryByText` first -- library hit returns `entry.recipeCategory` / `entry.groceryCategory`; library miss falls through to the existing keyword heuristic.

## Self-Check: PASSED

Verified:
- `lib/library.js` exists at the worktree path with `findEntryByText` defined at line 221 (verified via grep).
- `test/library.test.js` exists at the worktree path with 48 tests (36 from Plan 1 + 12 new for findEntryByText), all passing.
- Commit `a7b5496` (Task 1 -- feat: add findEntryByText) present in `git log` of branch `worktree-agent-aa8190028c5cb5656`.
- Commit `20a5e38` (Task 2 -- test: add findEntryByText tests) present in same git log.
- `node --test test/library.test.js` exits 0 with 48/48 passing; `npm test` exits 0 with 231/231 passing.
