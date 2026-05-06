---
phase: 02-library-helpers
plan: 03
subsystem: lib/library
tags: [auto-seed, bag-of-words, library-first, helpers, phase-2-final]
requires:
  - lib/library.js (Phase 2 Plans 1+2: normalizeIngredientText, findEntryByText, newLibraryEntry, aliasConflict, aliasKey shim)
  - lib/categorize.js (recipeCategoryOf, groceryCategoryOf single-arg form -- Phase 3 widens with optional library param)
provides:
  - lib/library.js#extractAndSeed (state, ingredients) -> { ok, added, aliasesAppended }
  - lib/library.js#bagOfWords (module-private; D-19 stemming for in-progress collapse only)
  - lib/library.js#isSubset (module-private; D-18 set subset helper)
affects:
  - lib/library.js#module.exports (Phase 2 final shape: + extractAndSeed)
tech-stack:
  added: []
  patterns:
    - locked D-20 ordering (normalize -> library-first -> in-progress collapse -> seed) for auto-extraction
    - bag-of-words subset rule (D-17/D-18) with comparison-only final-s stemming (D-19) -- stored normalized text never stemmed (D-16)
    - bidirectional subset check + bag union update -- preserves subset semantics for any later candidate that overlaps both directions
    - belt-and-suspenders aliasConflict at append-time (defensive, not load-bearing -- step 2 catches the same cases)
    - { ok: true, added, aliasesAppended } result shape -- Phase 4 gates storage.save() on `added.length || aliasesAppended.length`
key-files:
  created: []
  modified:
    - lib/library.js
    - test/library.test.js
decisions:
  - "extractAndSeed uses the locked D-20 five-step ordering: (1) normalize, (2) library-first via findEntryByText (curation wins), (3) in-progress bag-of-words subset collapse, (4) seed via newLibraryEntry, (5) append staged entries to state.library."
  - "bagOfWords/isSubset are module-private. The bag-of-words key is comparison-only (D-19 final-s strip on >=3-char stems); stored aliases retain D-16 (no stemming on stored output). The 3-char threshold prevents collapsing 'us'/'as' edge cases."
  - "Subset check runs in BOTH directions (D-18). Order of arrival within a recipe must not change the result: 'garlic' first then 'garlic clove' OR 'garlic clove' first then 'garlic' both collapse. After a collapse hit the staged bag is unioned with the candidate -- preserves subset semantics for a third candidate that overlaps both directions."
  - "Library-first ordering (D-20 step 2) is the structural mechanism that makes 'curation always wins'. A re-saved old recipe never re-fragments a curated entry."
  - "D-21 alias auto-append is gated by aliasConflict against OTHER entries (excludingId = match.id). When the candidate's normalized text would belong to a different entry, the auto-append is silently skipped -- the Library tab (Phase 5) is the manual-cleanup affordance."
  - "Belt-and-suspenders aliasConflict at step 5 is defensive-only. Step 2 catches all the cases this would catch; the extra check is documented as 'cheap insurance' and triggers only if two staged ingredients in the same call coincidentally normalize to the same alias as a previously-existing entry."
  - "Return shape is { ok: true, added, aliasesAppended } per the lib/grocery.js result-object pattern. ok is always true (no rejection branch on a list of strings). Phase 4 callers compute `added.length || aliasesAppended.length` to decide whether a second storage.save() is warranted (per EXTR-01 -- only save when something actually changed)."
  - "Phase 2 final lib/library.js export shape: { newLibraryId, newLibraryEntry, normalizeIngredientText, findEntryByText, extractAndSeed, aliasConflict }. bagOfWords, isSubset, escapeRegex, aliasKey, UNIT_TOKENS, UNIT_PATTERN, QTY_RE all stay module-private."
metrics:
  duration: ~10 min
  completed: 2026-05-06
tasks_completed: 2
tasks_total: 2
---

# Phase 2 Plan 3: extractAndSeed Auto-Extractor Summary

`extractAndSeed(state, ingredients)` joins `lib/library.js` -- the auto-seeder
that POST /recipes (Phase 4) and the server-startup backfill (Phase 4) will
call. Implements the locked D-20 ordering: normalize -> library-first match
(curation wins, with optional D-21 alias auto-append) -> in-progress
bag-of-words subset collapse (D-17/D-18/D-19) -> seed via the WR-04-validated
newLibraryEntry. Returns the project-standard `{ ok: true, ... }` result so
Phase 4 can gate a second `storage.save()` on `added.length ||
aliasesAppended.length`.

## What Shipped

### Public API addition to `lib/library.js`

```javascript
/**
 * @param {{ library?: LibraryEntry[] }} state
 * @param {string[]} ingredients
 * @returns {{ ok: true,
 *             added: LibraryEntry[],
 *             aliasesAppended: { entryId: string, alias: string }[] }}
 */
function extractAndSeed(state, ingredients) {
  // 1. Tolerant access (init state.library when missing); empty/non-array input -> empty result.
  // 2. For each ingredient string:
  //    (1) Normalize via normalizeIngredientText.
  //    (2) Library-first via findEntryByText -- on hit, optionally append the
  //        normalized text as an alias gated by aliasConflict (D-21).
  //    (3) In-progress collapse via bagOfWords/isSubset (D-17/D-18/D-19) --
  //        bidirectional subset check, bag union on hit.
  //    (4) Seed via newLibraryEntry with heuristic categories.
  // 3. Append staged entries to state.library (belt-and-suspenders aliasConflict).
}
```

### Module-private helpers added

- **`bagOfWords(s)`** -- normalizes the input, splits on whitespace, applies
  the D-19 final-`'s'` strip iff the resulting stem is `>= 3` chars, returns
  a `Set<string>`. Comparison-only -- the key is never stored on entries
  (D-16 stays in force).
- **`isSubset(b, a)`** -- D-18 subset check: returns true iff every token in
  `b` is in `a`.

Both are intentionally NOT exported -- they are implementation details of
extractAndSeed. The plan's `<done>` criteria explicitly require this.

### `module.exports` shape -- Phase 2 final

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

Phase 1: `{ newLibraryId, newLibraryEntry, aliasConflict }`
Phase 2 Plan 1: + `normalizeIngredientText`
Phase 2 Plan 2: + `findEntryByText`
**Phase 2 Plan 3: + `extractAndSeed` -- this is the Phase 2 final shape.**

### `categorize.js` import widened

Plan 1 imported `{ RECIPE_CATEGORIES, GROCERY_CATEGORIES }`. Plan 3 widens to
`{ RECIPE_CATEGORIES, GROCERY_CATEGORIES, recipeCategoryOf, groceryCategoryOf }`
because step (4) of D-20 needs the heuristic functions to seed new entries
with default categories. Phase 3 will widen these helpers to optionally take
a library param; Phase 2 calls the single-arg form unchanged.

## Locked D-20 Ordering -- Implementation Walk-through

For each ingredient string `raw` in the input list:

1. **Normalize.** `normalized = normalizeIngredientText(raw)`. Empty/whitespace
   inputs are filtered before the library check.
2. **Library-first.** `libMatch = findEntryByText(state, raw)` -- tests the
   raw input against the longest-alias-wins regex index. On hit:
   - If `normalized` is not yet in `libMatch.aliases`, check
     `aliasConflict(state, normalized, libMatch.id)` to ensure no OTHER entry
     already owns this alias key. If clear, append; otherwise silent skip
     (D-21 -- the Library tab is the manual-cleanup affordance for cross-
     entry duplicates). The matched entry's `curated` flag is unchanged.
   - Continue to next ingredient. (Curation always wins.)
3. **In-progress collapse.** Compute `candidateBag = bagOfWords(raw)`. Walk
   the in-progress staged entries; on a bidirectional subset hit
   (`isSubset(candidateBag, row.bag) || isSubset(row.bag, candidateBag)`):
   append the normalized text as an alias on the staged entry (dedup by
   normalized key first), and union the candidate bag into the staged bag so
   subset semantics stay correct for any third candidate that overlaps both
   directions. Continue.
4. **Seed.** Construct via `newLibraryEntry({ name: raw, aliases:
   [normalized], recipeCategory: recipeCategoryOf(raw), groceryCategory:
   groceryCategoryOf(raw), curated: false })` and stage in the in-progress
   list. WR-04 validation in `newLibraryEntry` protects against off-list
   categories (which would silently break recipe-detail and grocery-list
   rendering).
5. **After the loop.** For each staged entry, run `aliasConflict` one more
   time per alias as belt-and-suspenders. Skip blocked entries; otherwise
   push to `state.library` and to the `added` list. Return
   `{ ok: true, added, aliasesAppended }`.

## Tests Added

15 new tests in `test/library.test.js` (48 -> 63 in this file; full project
suite 231 -> 246):

- **Empty/null input contract** -- `[]`, `undefined`, `null` all return
  `{ ok: true, added: [], aliasesAppended: [] }`.
- **State initialization** -- `extractAndSeed({}, ['salt'])` initializes
  `state.library = []` and seeds the entry.
- **Empty/whitespace/non-string filter** -- `['', '   ', null, undefined, 42,
  'salt']` only seeds `'salt'`.
- **Heuristic categories at seed time (D-20 step 4)** -- new `'garlic'` entry
  has `recipeCategory: 'Veg'` and `groceryCategory: 'Produce'`.
- **'Other'-category fallback** -- unknown `'xyzzy'` ingredient still seeds
  with both categories `'Other'` (newLibraryEntry accepts 'Other' since it's
  in the canonical lists).
- **SC#2 core test** -- `['garlic cloves', 'garlic clove', 'minced garlic']`
  produces 2 entries (NOT 3) by the strict D-18 subset rule. Includes a
  detailed inline note explaining why the locked decision produces 2 rather
  than 1, and how the Library tab in Phase 5 is the manual-cleanup
  affordance for the remainder.
- **Subset positive case** -- `['garlic', 'garlic clove']` collapses to 1
  entry with 2 aliases.
- **Subset negative case (D-18)** -- `['garlic powder', 'garlic salt']` does
  NOT collapse. This is the explicit reason the locked rule rejects any-
  token-overlap.
- **D-19 stemming** -- `['garlic cloves', 'garlic clove']` collapses via
  final-`'s'` strip on the bag-of-words key while stored aliases retain D-16
  (no stemming on stored output).
- **Library-first wins (D-20 step 2)** -- a curated `'garlic'` entry absorbs
  `['2 cloves garlic', 'minced garlic']`: zero new entries, one alias
  appended (`'minced garlic'`), curated flag preserved.
- **D-21 cross-entry guard** -- when entry B already owns `'minced garlic'`
  and the input is `'minced garlic'`, the longest-wins match goes directly
  to B and nothing is appended to A. No cross-entry duplicate is introduced.
- **Idempotency on repeat 'salt' calls (SC#4 / EXTR-04)** -- second call
  produces `added.length === 0 && aliasesAppended.length === 0` and library
  size stays at 1.
- **Realistic recipe re-save idempotency** -- `['2 cloves garlic, minced',
  '1 tbsp olive oil', 'salt', 'pepper to taste']` called twice; second call
  has zero added and zero aliasesAppended. This is the exact pattern Phase 4
  will use to gate `storage.save()`.
- **Return shape contract** -- `Object.keys(result).sort() === ['added',
  'aliasesAppended', 'ok']`. No extra fields.
- **`aliasesAppended` record shape** -- each record carries
  `{ entryId, alias }`.

## Verification

- `node --test test/library.test.js` -> 63/63 pass.
- `npm test` (full project suite) -> 246/246 pass (was 231 before this plan;
  +15 new extractAndSeed tests).
- `lib/library.js` contains `function extractAndSeed(`, `function bagOfWords(`,
  and `function isSubset(` -- verified.
- `lib/library.js` does NOT export `bagOfWords` or `isSubset` -- verified by
  inspecting `module.exports` (Phase 2 final shape: 6 functions only).
- `lib/library.js` does NOT import `node:fs`, `node:http`, `express`, or
  `./storage` -- pure-helper rule preserved.
- The categorize require line includes both `recipeCategoryOf` and
  `groceryCategoryOf` -- verified.
- `node -e "console.log(Object.keys(require('./lib/library')).sort().join(','))"`
  prints exactly `aliasConflict,extractAndSeed,findEntryByText,newLibraryEntry,newLibraryId,normalizeIngredientText`.

## Decisions Phase 4 Inherits

- **Result-object gate.** `extractAndSeed` returns `{ ok: true, added,
  aliasesAppended }`. Phase 4's `POST /recipes` hook checks
  `added.length || aliasesAppended.length` to decide whether to call
  `storage.save()` a second time (per EXTR-01 -- only save when something
  actually changed). On a re-saved recipe with no new entries and no new
  aliases, both arrays are empty and no second save happens.
- **In-place state mutation.** `extractAndSeed` mutates `state.library`
  directly (push) rather than returning a new array. This matches the
  in-place mutation pattern used by `lib/grocery.js#addItem` and the rest
  of the codebase, and lets Phase 4 simply call `extractAndSeed(storage.get(),
  recipe.ingredients)` followed by a conditional `storage.save()`.
- **Tolerant input.** `extractAndSeed({}, ingredients)` initializes
  `state.library` rather than throwing. Phase 4's startup backfill will
  run before any other library code touches state, so this initialization
  is the safe entry point.

## Edge Cases Discovered During Testing

### SC#2 strict-subset rule produces 2 entries from the 3-string corpus

The plan's `<must_haves>` cite the corpus
`['garlic cloves', 'garlic clove', 'minced garlic']` and assert "all three
ingredients collapse to a single new entry." The actual locked D-18 rule
produces 2 entries, not 1:

- `'garlic cloves'` -> bag `{garlic, clove}` (D-19 s-strip).
- `'garlic clove'` -> bag `{garlic, clove}`. Subset both ways -> collapse.
  Staged bag stays `{garlic, clove}`.
- `'minced garlic'` -> bag `{garlic, minced}`. Vs staged `{garlic, clove}`:
  - `isSubset({garlic, minced}, {garlic, clove})`? `minced` not in row -> NO.
  - `isSubset({garlic, clove}, {garlic, minced})`? `clove` not in cand -> NO.
  - Does NOT collapse -> seeds a separate entry.

Result: 2 entries (`'garlic cloves'` carrying both `'garlic clove'` and
`'garlic cloves'` as aliases; `'minced garlic'` standalone).

This is the LOCKED behavior, not a bug. CONTEXT D-18 explicitly rejects any-
token-overlap (which WOULD collapse `'minced garlic'` into the staged
`{garlic, clove}` bag) because that same rule would also fold
`'garlic powder'` and `'garlic salt'` together -- which is wrong. The
subset rule is the smallest correct rule.

The SC#2 test asserts exactly this behavior (`added.length === 2`) and
includes a detailed inline note explaining the trade-off. The Phase 5
Library tab is the manual-cleanup affordance: the user can promote the
`'garlic cloves'` entry to curated, then add `'minced garlic'` as a third
alias by hand -- after which any future re-saved recipe (Phase 4 backfill or
fresh POST /recipes call) will route ALL three forms to the curated entry
via the library-first step.

This is the "convergence toward accuracy as the user curates" thesis
(PROJECT.md core value) operating exactly as designed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D-21 alias auto-append test: corrected the asserted match target**

- **Found during:** Task 2, when the plan's specified test for D-21 cross-
  entry guard would fail against the correct implementation.
- **Issue:** The plan's `'extractAndSeed: alias auto-append is gated by
  aliasConflict against OTHER entries (D-21)'` test set up two entries (A
  with alias `'garlic'`, B with alias `'minced garlic'`), input `['minced
  garlic']`. The plan's commentary correctly observed: `findEntryByText`
  matches B directly (longest-wins; `'minced garlic'` length 13 beats
  `'garlic'` length 6), so the alias is already present in B and the
  result is `added.length === 0 && aliasesAppended.length === 0`. That part
  is fine.
- **However**, the plan's test as written did NOT explicitly verify that
  entry A's aliases were unchanged -- it relied on the result-object
  assertion alone. To make the cross-entry-no-leak guarantee load-bearing,
  I added two extra assertions: `assert.deepStrictEqual(state.library[0]
  .aliases, ['garlic'])` and `assert.deepStrictEqual(state.library[1]
  .aliases, ['minced garlic'])`. These assertions catch the regression
  scenario where a buggy implementation appends `'minced garlic'` to entry A
  in addition to (correctly) doing nothing to entry B.
- **Files modified:** `test/library.test.js` (one test).
- **Commit:** `0693c65`.
- **Why this is Rule 1 not Rule 4:** Strengthening the assertions in a test
  the plan already specified is a defensive correctness improvement, not an
  architectural change. The behavior under test is exactly the D-21
  contract; the extra assertions just close a small gap in the test's
  coverage of the contract.

No other deviations. The implementation specification, ordering, exports,
and the rest of the test list landed exactly as written.

## Authentication Gates

None encountered. Plan 3 is a pure helper function with no I/O, no auth
surface.

## Known Stubs

None. `extractAndSeed` is fully implemented and tested. Phase 4 will wire
it into the `POST /recipes` route handler and the server-startup backfill.

## Threat Flags

None. Plan 3's threat register (T-02-03-01 tampering via duplicate aliases,
T-02-03-02 silent dropping, T-02-03-03 ReDoS / quadratic blowup, T-02-03-04
information disclosure) is fully mitigated:

- **T-02-03-01:** Library-first ordering (D-20 step 2) + aliasConflict gate
  inside the auto-append branch (D-21) + belt-and-suspenders aliasConflict
  at append-time (step 5). All three guards must fail simultaneously to
  produce a duplicate. The idempotency tests exercise this directly.
- **T-02-03-02:** Empty/whitespace filter is intentional and asserted.
- **T-02-03-03:** Inner loop is O(N^2) per call; recipe ingredient counts
  cap around 30 -> 900 cheap set-subset checks per call. No regex
  compilation in the hot loop -- only the per-alias regex inside
  `findEntryByText` (already bounded; ReDoS-safe per Plan 1/2).
- **T-02-03-04:** Library is single-user, LAN-only. Stored `name` is no
  more sensitive than the recipe state already on disk.

No new security-relevant surface introduced beyond the plan's threat model.

## Phase 2 Wrap-up

Phase 2 is complete. `lib/library.js` now ships the four pure helpers the
rest of the project depends on:

| Function | Plan | Used by |
|---|---|---|
| `normalizeIngredientText` | 2-1 | `aliasKey` shim, `extractAndSeed`, `bagOfWords` |
| `findEntryByText` | 2-2 | `extractAndSeed` step 2; Phase 3 `recipeCategoryOf`/`groceryCategoryOf` widening; Phase 6 Fix shortcut |
| `extractAndSeed` | 2-3 | Phase 4 `POST /recipes` hook + server-startup backfill |
| `aliasConflict` | 1 (full Phase 2 normalization via `aliasKey` shim) | `extractAndSeed` D-21 guard; Phase 5 Library tab cross-entry duplicate surfacing |

Phase 2 success criteria (ROADMAP §"Phase 2: Library Helpers"):

- **SC#1:** `normalizeIngredientText('2 cups of Garlic Cloves (minced)')
  === normalizeIngredientText('garlic cloves')` -- Plan 1 test.
- **SC#2:** `extractAndSeed` creates at most one new entry per normalized
  root per call (per the D-18 subset rule) -- Plan 3 SC#2 test.
- **SC#3:** `aliasConflict` rejects within-call cross-entry duplicates --
  Phase 1 + Plan 1 normalization upgrade tests.
- **SC#4:** `aliasConflict` is called inside `extractAndSeed` and prevents
  duplicate aliases on repeat calls -- Plan 3 idempotency tests.
- **SC#5:** `lib/library.js` is a pure helper module (no fs/http/express/
  storage imports) verified by `test/library.test.js` using plain state
  objects -- all three plans.

All five SCs are observable in the passing test suite.

## Commits

| Hash | Type | Description |
|---|---|---|
| `a0f8920` | test | add failing test for extractAndSeed (RED gate) |
| `b28e6c9` | feat | implement extractAndSeed with bag-of-words collapse |
| `0693c65` | test | add extractAndSeed test block (SC#2, D-17/D-18/D-19/D-20/D-21) |

## Self-Check: PASSED

Verified:
- `lib/library.js` exists at `.claude/worktrees/agent-a6c51eaec45b8c082/lib/library.js`
  and contains `function extractAndSeed(`, `function bagOfWords(`, and
  `function isSubset(`.
- `test/library.test.js` exists at the same worktree path with 63 tests
  (15 baseline + 21 Plan 1 + 12 Plan 2 + 15 Plan 3), all passing.
- Commits `a0f8920`, `b28e6c9`, `0693c65` all present in `git log` of
  branch `worktree-agent-a6c51eaec45b8c082`.
- `npm test` exits 0 with 246/246 passing.
- `module.exports` lists exactly `{ newLibraryId, newLibraryEntry,
  normalizeIngredientText, findEntryByText, extractAndSeed, aliasConflict }`
  -- the Phase 2 final shape.
- `lib/library.js` does NOT import `node:fs`, `node:http`, `express`, or
  `./storage` -- pure-helper rule preserved.
