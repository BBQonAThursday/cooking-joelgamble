---
phase: 02-library-helpers
verified: 2026-05-06T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 2: Library Helpers Verification Report

**Phase Goal:** All pure business-logic functions for ingredient normalization, alias matching, and entry extraction exist in `lib/library.js`, fully tested and ready to be called by routes and the categorization layer.
**Verified:** 2026-05-06
**Status:** PASSED
**Re-verification:** No — initial verification

---

## ROADMAP Success Criteria Verdict

| SC | Description | Status | Evidence |
|----|-------------|--------|----------|
| SC#1 | `normalizeIngredientText('2 cups of Garlic Cloves (minced)')` matches `normalizeIngredientText('garlic cloves')` | VERIFIED | `lib/library.js:93-113` (5-step pipeline); `test/library.test.js:213-219` literal SC#1 equivalence test; behavioral probe: both return `'garlic cloves'` |
| SC#2 | `extractAndSeed(state, ingredients)` does not produce three separate entries from `['garlic cloves', 'garlic clove', 'minced garlic']` | VERIFIED | `lib/library.js:328-424` (D-20 ordering); `test/library.test.js:525-548` core SC#2 test asserts `added.length === 2` (`< 3`); subset rule + D-19 stemming collapse `garlic cloves`/`garlic clove`; `minced garlic` stands alone (locked behavior per D-18) |
| SC#3 | `findEntryByText(state, text)` returns matching library entry (with `id`) using longest-alias-wins, case-insensitive, word-boundary matching | VERIFIED | `lib/library.js:262-301` (per-call regex index, `\b{alias}\b /i`); 3-key sort tuple `(length DESC, curated DESC, arrayIndex ASC)`; `test/library.test.js:367-377` MATCH-03 id assertion; longest-wins test at 389-400; word-boundary regression at 402-417 |
| SC#4 | `aliasConflict` is called inside `extractAndSeed` and prevents duplicate aliases on repeat calls | VERIFIED | `lib/library.js:361, 416` (two call sites inside `extractAndSeed`); `test/library.test.js:618-647` SC#4 + idempotency tests; behavioral probe: 2nd call returns `added: 0, aliasesAppended: 0` |
| SC#5 | All helpers are pure; `lib/library.js` has zero imports of `fs`, `http`, or Express | VERIFIED | `grep` for `node:fs`, `http`, `express`, `./storage` in `lib/library.js` returns no matches; only require is `./categorize` (line 20); 63 tests pass with plain state objects in `test/library.test.js` |

---

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `normalizeIngredientText` returns `''` on empty/whitespace/non-string input | VERIFIED | `lib/library.js:94, 97`; tests at `test/library.test.js:144-150` (5 assertions) |
| 2 | `normalizeIngredientText` strips parens (D-14), comma tail (D-15), leading qty/unit/of (D-13); does NOT stem (D-16); collapses whitespace | VERIFIED | `lib/library.js:99-111`; tests at `test/library.test.js:157-240` (10 test groups, ~40 assertions including the messy-input corpus) |
| 3 | `findEntryByText` returns the matching entry with `id`, longest-alias-wins, curated tiebreaker, array-order tiebreaker, undefined on miss | VERIFIED | `lib/library.js:262-301`; tests at `test/library.test.js:339-478` (12 tests including MATCH-03 id assertion, longest-wins, peanut-butter regression, curated tiebreaker in both array orders) |
| 4 | `findEntryByText` is case-insensitive against the raw input (no caller pre-normalization required) | VERIFIED | `lib/library.js:278` regex constructed with `'i'` flag; test at `test/library.test.js:379-387` |
| 5 | `extractAndSeed` collapses subset-rule (D-17/D-18/D-19) within a single recipe; D-19 final-`'s'` strip on bag-of-words key only (D-16 preserved on stored output) | VERIFIED | `lib/library.js:132-145, 377-393`; tests at `test/library.test.js:550-575` (positive subset, negative subset, D-19 stemming) |
| 6 | `extractAndSeed` library-first ordering (D-20 step 2): existing curated entry absorbs new aliases instead of seeding new entries | VERIFIED | `lib/library.js:353-371`; test at `test/library.test.js:577-597` asserts `added.length === 0`, `aliasesAppended` carries `'minced garlic'`, curated flag preserved |
| 7 | D-21 alias auto-append is gated by `aliasConflict(state, normalized, libMatch.id)` — silent skip when another entry owns the alias | VERIFIED | `lib/library.js:361-369`; test at `test/library.test.js:599-616` asserts both entries' aliases unchanged when cross-entry duplicate detected |
| 8 | `extractAndSeed` is idempotent: repeat calls produce `added: 0, aliasesAppended: 0` | VERIFIED | `lib/library.js:353-369` (library-first short-circuit + alias dedup); tests at `test/library.test.js:618-647` (single-ingredient + realistic 4-ingredient recipe) |
| 9 | `extractAndSeed` returns exactly `{ ok: true, added: [], aliasesAppended: [] }` shape — no extra fields | VERIFIED | `lib/library.js:332, 423` (return statements); test at `test/library.test.js:649-656` asserts `Object.keys(result).sort() === ['added', 'aliasesAppended', 'ok']` |
| 10 | `newLibraryEntry` validates input: throws on bad recipeCategory, bad groceryCategory, missing name (WR-04, IN-02 closure) | VERIFIED | `lib/library.js:174-191`; tests at `test/library.test.js:244-273` (5 throw cases) |
| 11 | `newLibraryEntry` defensively copies aliases (IN-01) and dedupes within-entry by normalized key (WR-03 closure) | VERIFIED | `lib/library.js:195-203`; tests at `test/library.test.js:276-294` |
| 12 | `aliasKey` is a one-line shim over `normalizeIngredientText`, so `aliasConflict` inherits full normalization (D-05 follow-through) | VERIFIED | `lib/library.js:217-219`; tests at `test/library.test.js:298-335` (3 messy-input cases) |
| 13 | `lib/library.js` is pure (no fs/http/express/storage imports) | VERIFIED | `grep` for forbidden requires returns no matches; only `require('./categorize')` for `RECIPE_CATEGORIES, GROCERY_CATEGORIES, recipeCategoryOf, groceryCategoryOf` |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/library.js` | `normalizeIngredientText`, `escapeRegex` (inlined), `UNIT_TOKENS`, validated `newLibraryEntry` | VERIFIED | Lines 25-45 (UNIT_TOKENS), 49-51 (escapeRegex inlined; not imported), 93-113 (normalizeIngredientText), 174-213 (validated newLibraryEntry) |
| `lib/library.js` | `findEntryByText` exported alongside Plan-1 helpers | VERIFIED | Line 262 (`function findEntryByText(`); listed in `module.exports` at line 430 |
| `lib/library.js` | `extractAndSeed` exported alongside Plans-1/2 helpers | VERIFIED | Line 328 (`function extractAndSeed(`); listed in `module.exports` at line 431 |
| `lib/library.js` | Module-private `bagOfWords`, `isSubset` (NOT exported) | VERIFIED | Lines 132-154; not in `module.exports` (line 426-433); confirmed by `node -e "Object.keys(require('./lib/library')).sort()"` returning exactly the 6 public functions |
| `test/library.test.js` | `normalizeIngredientText` corpus + WR-04 validation tests + messy `aliasConflict` tests | VERIFIED | Lines 142-335; literal `normalizeIngredientText('2 cups of Garlic Cloves (minced)')` SC#1 equivalence at 213-219 |
| `test/library.test.js` | `findEntryByText` test block: longest-wins, word-boundary regression, curated tiebreaker, no-match, empty-input, MATCH-03 id assertion | VERIFIED | Lines 337-478 (12 tests); `'longest alias wins'` test name at line 389; MATCH-03 id-format assertion at line 376 |
| `test/library.test.js` | `extractAndSeed` test block: SC#2 core, library-first wins, D-21 cross-entry, idempotency | VERIFIED | Lines 480-669 (15 tests); literal `'extractAndSeed creates at most one entry'` test name at line 525; idempotency tests at 618-647 |

**Final Artifact Status:** All artifacts VERIFIED (exists ✓, substantive ✓, wired ✓, data flows ✓ — pure helpers are exercised by 63 tests in test/library.test.js).

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/library.js#aliasKey` | `lib/library.js#normalizeIngredientText` | One-line shim | WIRED | Line 218 `return normalizeIngredientText(s)`; messy-input tests at `test/library.test.js:298-335` confirm aliasConflict inherits full normalization |
| `lib/library.js#newLibraryEntry` | `RECIPE_CATEGORIES + GROCERY_CATEGORIES` | Module-top require + `.includes()` | WIRED | Line 20 require; lines 184, 188 `.includes()` checks throw on miss |
| `lib/library.js#findEntryByText` | Inlined `escapeRegex` | Regex builder per alias | WIRED | Line 278 `'\\b' + escapeRegex(lower) + '\\b'`; only one `function escapeRegex(` exists in file (line 49); not imported from categorize.js |
| `lib/library.js#findEntryByText` | `state.library` aliases | Per-call regex index, sorted (length DESC, curated DESC, arrayIndex ASC) | WIRED | Lines 270-285 (build); 290-294 (sort comparator with literal 3-key chain `(b.length - a.length) || (Number(b.curated) - Number(a.curated)) || (a.arrayIndex - b.arrayIndex)`); 297-299 (first-match-wins) |
| `lib/library.js#extractAndSeed` | `findEntryByText` | Library-first matching (D-20 step 2) | WIRED | Line 353 `findEntryByText(state, original)`; library-first wins test at `test/library.test.js:577-597` |
| `lib/library.js#extractAndSeed` | `aliasConflict` | D-21 cross-entry guard + step-5 belt-and-suspenders | WIRED | Line 361 (D-21 gate inside auto-append branch); line 416 (step-5 check); idempotency test at 618-647 confirms duplicate prevention |
| `lib/library.js#extractAndSeed` | `recipeCategoryOf + groceryCategoryOf` | Heuristic categories at seed time (D-20 step 4) | WIRED | Line 401-402 calls; require widened at line 20 to include both single-arg helpers; tests at `test/library.test.js:505-523` verify Veg/Produce for `'garlic'` and Other/Other for `'xyzzy'` |
| `lib/library.js#extractAndSeed` | `newLibraryEntry` (validated) | Single source of truth for new-entry construction (WR-04) | WIRED | Line 398-404 calls; the WR-04 validation in the factory means `extractAndSeed` cannot produce off-list-category entries |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm test` exits 0 with 246/246 passing | `npm test` | `tests 246 / pass 246 / fail 0` | PASS |
| Module exports exactly the 6 Phase 2 final functions | `node -e "console.log(Object.keys(require('./lib/library')).sort().join(','))"` | `aliasConflict,extractAndSeed,findEntryByText,newLibraryEntry,newLibraryId,normalizeIngredientText` | PASS |
| SC#1: `normalizeIngredientText('2 cups of Garlic Cloves (minced)') === normalizeIngredientText('garlic cloves')` | Direct node probe | Both return `'garlic cloves'`; equality `true` | PASS |
| SC#2: `extractAndSeed` produces fewer than 3 entries from the 3-string corpus | Direct node probe | `added.length === 2` (< 3 — satisfies SC wording "do not produce three separate library entries") | PASS |
| SC#3: longest-alias-wins matching | Direct node probe with `'olive oil'` + `'extra virgin olive oil'` library, query `'1 tbsp extra virgin olive oil'` | Returns `lb_bbbbbbbb` (the longer-alias entry) | PASS |
| SC#4: idempotent on repeat calls | Direct node probe | 2nd call: `added: 0, aliasesAppended: 0`, library size unchanged at 1 | PASS |
| SC#4: aliasConflict gates extractAndSeed against pre-existing entries | Direct node probe with state already containing `'salt'` alias | `extractAndSeed(state, ['salt'])` returns `added: 0, aliasesAppended: 0`, library size unchanged at 1 | PASS |
| SC#5: pure helpers (no fs/http/express/storage imports) | `grep -E "node:fs|http|express|./storage" lib/library.js` | No matches | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FND-03 | 02-01-PLAN, 02-02-PLAN | `lib/library.js` module with pure helpers `newLibraryId`, `normalizeIngredientText`, `findEntryByText`, `extractAndSeed`, `aliasConflict`. Pure functions, no fs/http, fully unit-testable. | SATISFIED | All 5 functions exported (`module.exports` at lib/library.js:426-433); pure (no forbidden imports verified by grep); 63 tests in test/library.test.js verify with plain state objects |
| EXTR-02 | 02-03-PLAN | `extractAndSeed` normalizes each ingredient string (trim, lowercase, strip leading qty/unit, drop trailing parens) before alias-match check. New entries: `name=original_text`, `aliases=[normalized_text]`, categories=heuristic, `curated:false`. | SATISFIED | `lib/library.js:343-405`: line 344 trims raw, 347 normalizes, 353 library-first match, 401-403 use single-arg `recipeCategoryOf`/`groceryCategoryOf`, 404 sets `curated: false`, 399-400 set `name: original` and `aliases: [normalized]`; tests at `test/library.test.js:505-523` |
| EXTR-04 | 02-01-PLAN | `aliasConflict(state, alias, excludingId?)` returns truthy when normalized alias exists in another entry. Auto-extract uses this to skip duplicates; route handlers use it to reject conflicting alias edits. | SATISFIED | `lib/library.js:228-240` (function); aliasKey shim at line 217-219 routes both sides through `normalizeIngredientText`; called inside `extractAndSeed` at lines 361 and 416 (D-21 + step-5 guards); messy-input tests at `test/library.test.js:298-335` and idempotency tests at 618-647 |

**Orphaned requirements:** None. REQUIREMENTS.md traceability table maps FND-03 to "Phase 1 + 2", EXTR-02 to "Phase 2", EXTR-04 to "Phase 2" — all three claimed by Phase 2 plans and verified above.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TODO/FIXME/PLACEHOLDER comments in `lib/library.js` or `test/library.test.js` (verified via grep) | — | — |
| (none) | — | No hardcoded empty data flows: `extractAndSeed` populates `state.library` via real entries from `newLibraryEntry`; `findEntryByText` returns real entries from the regex index | — | — |
| (none) | — | No console-only handlers: every function has substantive logic (verified by file inspection) | — | — |

The Phase 2 review (`02-REVIEW.md`) flagged 4 WARNINGs and 4 INFO findings, all in lower bands (no BLOCKER). Summary of carried-forward concerns (not gaps for this verification, but tracked for future phase review):
- **WR-01/WR-04** (review): `findEntryByText` builds regex from raw stored alias; whitespace-noisy aliases (e.g., `'  garlic  '`) would silently fail to match. `extractAndSeed` always seeds with the normalized form, so v1 callers are unaffected; concern is latent for Phase 5 Library tab routes that don't yet exist.
- **WR-02** (review): Single-letter unit tokens `'g'`/`'l'` survive only by trailing `\s+` regex; fragile if QTY_RE is refactored.
- **WR-03** (review): Step-5 belt-and-suspenders fallback in `extractAndSeed` lacks a test that exercises a state where step-2 misses but step-5 catches.
- **IN-01/IN-02** (review): Stored entry `name` and first deduped alias retain raw input form rather than normalized form — display polish concern, not a correctness gap.

These are tracked in `02-REVIEW.md` and surfaced for the user to decide whether to address in Phase 3 (the next phase that consumes these helpers) or carry as future-phase debt. None affect Phase 2's success criteria observation, so they do not block phase closure.

---

## Test Suite Status

- **`npm test`** exits 0 with `246/246 passing` (matches the requested baseline).
- **`test/library.test.js`** contains 63 tests:
  - 15 baseline tests from Phase 1 (newLibraryId, newLibraryEntry shape, aliasConflict basic).
  - 21 Plan 1 tests (normalizeIngredientText corpus, newLibraryEntry validation, messy aliasConflict).
  - 12 Plan 2 tests (findEntryByText longest-wins, word-boundary, tiebreakers, no-match).
  - 15 Plan 3 tests (extractAndSeed SC#2, library-first wins, D-21 guard, idempotency, return shape).
- **All Phase 1 regression tests pass after the Phase 2 `aliasKey` shim repoint** (lines 76-140).

---

## Gaps Summary

**No gaps.** All 5 ROADMAP success criteria are observable in the actual code and verified by behavioral spot-checks. All 13 derived observable truths are verified. All 3 declared requirements (FND-03, EXTR-02, EXTR-04) are satisfied by the implementation. The full project test suite passes at 246/246. `lib/library.js` is a pure helper module with the exact Phase 2 final export shape `{ newLibraryId, newLibraryEntry, normalizeIngredientText, findEntryByText, extractAndSeed, aliasConflict }`.

The Phase 2 code review (`02-REVIEW.md`) flagged 4 WARNINGs and 4 INFO findings, but none are critical or block goal achievement; they are tracked as latent concerns for Phase 3+ to address as those phases consume the helpers.

Phase 2 goal is **achieved**: all pure business-logic functions for ingredient normalization, alias matching, and entry extraction exist in `lib/library.js`, are fully tested (63 tests in test/library.test.js, 246 total project-wide), and are ready to be called by Phase 3's categorization layering and Phase 4's auto-extract route handler.

---

_Verified: 2026-05-06_
_Verifier: Claude (gsd-verifier)_
