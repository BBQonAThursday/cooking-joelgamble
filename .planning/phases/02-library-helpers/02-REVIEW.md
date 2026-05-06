---
phase: 02-library-helpers
reviewed: 2026-05-06T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - lib/library.js
  - test/library.test.js
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-06
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

The Phase 2 implementation of `lib/library.js` is well structured and matches the locked decisions in 02-CONTEXT.md (D-13..D-25). The normalization pipeline, the longest-alias-wins index in `findEntryByText`, and the D-20 ordering inside `extractAndSeed` are all correctly translated from the plan. The test suite is dense and exercises the decisions explicitly (subset rule positive/negative, curated tiebreaker, idempotency on re-save, paren-then-quantity nesting).

The defects below are all in the WARNING / INFO band: a divergence between how `findEntryByText` consumes stored aliases (raw, regex over `\b` boundaries) versus how `aliasConflict` consumes them (normalized via `normalizeIngredientText`), an entry-name-uses-raw-input quality concern flagged by the locked decision but worth surfacing, a missed test for the alias-pollution case, and a single-letter unit token (`'g'`, `'l'`) that survives only by accident of word-boundary semantics. No BLOCKER-grade defects were found.

## Warnings

### WR-01: `findEntryByText` regex uses raw stored alias (whitespace/case noise breaks matching)

**File:** `lib/library.js:274-284`
**Issue:** `newLibraryEntry` (lines 195-203) dedupes input aliases by their normalized key but **stores the original string** in `entry.aliases`. `findEntryByText` then builds its match regex from the raw stored alias with only `.toLowerCase()` applied — no trim, no normalization. If a caller (e.g. the Phase 5 Library tab routes that don't yet exist but are imminent) ever passes an alias with leading/trailing whitespace such as `'  garlic  '`, the resulting regex is `/\b  garlic  \b/i`, which **cannot match clean ingredient text** like `'2 cloves garlic'`. The lookup silently fails while `aliasConflict` (which routes both sides through `aliasKey` → `normalizeIngredientText`) still treats it as a duplicate. Two helpers disagree on whether the entry is reachable.

`extractAndSeed` happens to avoid this in v1 because it always seeds with `aliases: [normalized]`, but the asymmetry is a latent footgun for Phase 5 routes and for any user-curated alias entered through a form without aggressive trimming.

**Fix:** Either trim/normalize the alias before storing it in `newLibraryEntry`, OR normalize it before building the regex in `findEntryByText`. The first is preferable because it keeps the displayed library data clean.

```javascript
// In newLibraryEntry, change the dedup loop body:
for (const a of inputAliases) {
  const key = aliasKey(a);
  if (!key || seen.has(key)) continue;
  seen.add(key);
  dedupedAliases.push(key);   // store the normalized form, not the raw input
}
```

A defensive alternative inside `findEntryByText` (line 276):
```javascript
const lower = alias.toLowerCase().trim();
if (!lower) continue;
```

### WR-02: Single-letter unit tokens (`'g'`, `'l'`) match overlong ingredient strings only by lucky regex backtracking

**File:** `lib/library.js:31, 34, 56-76`
**Issue:** `UNIT_TOKENS` includes the single-letter abbreviations `'g'` (grams) and `'l'` (liters). The QTY_RE composes these into the unit alternation. For a recipe-realistic input like `'2 great big onions'` the QTY_RE *correctly* refuses to consume `'great'` as a unit only because the trailing `\s+` in the regex fails after `'g'` lands inside the word `'great'`. This works today, but it is fragile: if anyone later relaxes the trailing `\s+` requirement (or appends a word-boundary look-around), the regex would happily strip `'2 g'` from `'2 great big onions'`, leaving `'reat big onions'` — a silent data corruption.

The same issue exists for `'l'` against words starting with `'l'` (`'2 large eggs'` is in the test corpus and currently survives only because `'large'` is not in UNIT_TOKENS — but the same regex wouldn't protect `'2 lemons'` if anyone ever added a unit alias starting with `'l'` immediately followed by a non-space word char).

**Fix:** Tighten QTY_RE to require a word boundary after the unit token, OR drop the bare `'g'` / `'l'` aliases (recipes overwhelmingly use `'gram'`/`'grams'` and `'liter'`/`'liters'`). Recommended: require `\b` after the unit so accidental in-word matches are impossible regardless of trailing whitespace logic.

```javascript
'(?:\\s+(?:' + UNIT_PATTERN + ')\\b)?' +    // optional unit, anchored on word boundary
```

### WR-03: Step-5 belt-and-suspenders check has no test coverage for the divergence it actually catches

**File:** `lib/library.js:413-421`, `test/library.test.js`
**Issue:** The step-5 fallback in `extractAndSeed` uses `aliasConflict(state, alias)` (normalized-key matching) to block entries whose aliases conflict with an existing library entry. The comment claims "in practice step (2) catches this; the extra check is cheap insurance." That's only partly true — step 2 uses `findEntryByText`'s `\b`-regex match against raw text, which can miss conflicts that the normalized-key match would catch (e.g., a library entry whose alias was stored as `'2 cups of garlic cloves (minced)'` and a candidate `'garlic cloves'` — `\b2 cups of garlic cloves (minced)\b` does not match `'garlic cloves'`, but both normalize to `'garlic cloves'` and `aliasConflict` would catch them).

So the fallback is doing real work in real cases — but the test suite does not cover any scenario where step 5 actually blocks a candidate that survived step 2. Without coverage, a future refactor that simplifies away the fallback would not break any test.

**Fix:** Add a test that constructs a state where step 2 misses (raw stored alias contains noise that prevents `\b`-regex matching) but step 5 blocks. Example skeleton:

```javascript
test('extractAndSeed: step-5 fallback blocks cross-entry duplicate that step-2 regex missed', () => {
  // Stored alias has whitespace noise; \balias\b won't match a clean candidate,
  // but aliasKey-normalized comparison will.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic cloves',
        aliases: ['  garlic cloves  '],   // whitespace noise -- regex won't match
        recipeCategory: 'Veg', groceryCategory: 'Produce',
        curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const result = extractAndSeed(state, ['garlic cloves']);
  // Step 2 misses (regex \b  garlic cloves  \b doesn't match 'garlic cloves').
  // Step 5 catches via normalized aliasConflict and blocks the new entry.
  assert.strictEqual(result.added.length, 0);
  assert.strictEqual(state.library.length, 1);
});
```

(This test will currently FAIL because step 5's pre-existing entry has alias `'  garlic cloves  '`. `aliasConflict` normalizes both sides to `'garlic cloves'` and blocks. Confirms the fallback works AND that WR-01 is a real concern.)

### WR-04: Whitespace-trim missing on `findEntryByText` regex construction

**File:** `lib/library.js:275-284`
**Issue:** Inside the alias-index build loop, `findEntryByText` skips aliases via `if (typeof alias !== 'string' || !alias.trim()) continue;` — but it then uses `alias.toLowerCase()` (un-trimmed) for the regex source. If a stored alias is `' garlic'` (leading space only — passes the `!alias.trim()` falsy guard because the trimmed value is non-empty), the regex becomes `/\b garlic\b/i`. `\b` immediately followed by `' '` is satisfiable only when the input has a `\b` right before whitespace — which is the case in normal text — but the leading space then eats one character of input that wouldn't otherwise be present, distorting the match position. More importantly, the `length` field used for the longest-alias sort is `lower.length` including the noise, so a noise-padded short alias can falsely outrank a clean longer alias.

This is the same root cause as WR-01 surfaced in a slightly different consumer. The fix is the same: trim before constructing the regex (and the length).

**Fix:**
```javascript
const lower = alias.toLowerCase().trim();
if (!lower) continue;
indexEntries.push({
  regex: new RegExp('\\b' + escapeRegex(lower) + '\\b', 'i'),
  length: lower.length,
  // ...
});
```

## Info

### IN-01: `entry.name` defaults to the raw user input — Library tab will display ugly canonical names

**File:** `lib/library.js:398-405`
**Issue:** Per the locked D-20 step 4, `extractAndSeed` calls `newLibraryEntry({ name: original, ... })` where `original` is the trimmed-but-otherwise-unchanged ingredient string. For real recipe ingredients like `'2 cloves garlic, minced'`, the canonical entry name becomes `'2 cloves garlic, minced'` — which is what the user will see in the Phase 5 Library tab as the "name of this ingredient." The aliases will be clean (`['garlic']`), but the displayed canonical is noisy.

This is a locked decision (the plan explicitly says `name: original_text`), so it is INFO not WARNING. Flagging it because Phase 5 will surface it visibly to the user, and a small change here — using `normalized` for the seeded name (the user can always rename in the Library tab) — would dramatically improve the auto-seed UX.

**Fix (optional, requires plan amendment):**
```javascript
const entry = newLibraryEntry({
  name: normalized,                      // was: original
  aliases: [normalized],
  recipeCategory: recipeCategoryOf(original),
  groceryCategory: groceryCategoryOf(original),
  curated: false
});
```

### IN-02: `newLibraryEntry` dedupe stores the first raw alias variant rather than the normalized form

**File:** `lib/library.js:198-203`
**Issue:** The dedup loop uses the normalized alias as the dedup key but pushes the **raw input** into `dedupedAliases`. So `aliases: ['  GARLIC  ', 'garlic']` produces stored aliases `['  GARLIC  ']` (the first survivor), not `['garlic']`. This is the same root cause as WR-01 from a different angle. Fixing WR-01 by storing the normalized form (`dedupedAliases.push(key)` instead of `dedupedAliases.push(a)`) closes both at once. The existing test on lines 283-294 only exercises this with `'garlic'` as the first variant (clean), so the noisy-first-variant case is not visible in the test output.

**Fix:** See WR-01.

### IN-03: Redundant `entry &&` short-circuit in `findEntryByText`

**File:** `lib/library.js:280`
**Issue:** Line 273 already guarded `entry &&` when extracting `aliases`, and the inner loop only runs when `aliases.length > 0`. So at line 280's `curated: !!(entry && entry.curated)`, `entry` is provably truthy. The double-guard is harmless but slightly misleading — a reader might infer entry can be null inside the loop, which it cannot.

**Fix:**
```javascript
curated: !!entry.curated,
```

### IN-04: `bagOfWords` and `isSubset` are module-private — consider exporting for test introspection

**File:** `lib/library.js:132-154`
**Issue:** Both helpers are private. The current tests verify their behavior indirectly by observing `extractAndSeed` outputs, which works for the cases tested but offers poor diagnostics when a regression lands. Exporting them (as `_bagOfWords` / `_isSubset` per the project's `_resetForTest` convention) would let future tests assert subset semantics directly, which would have caught the (hypothetical) bug where `'garlic powder'` and `'garlic salt'` collapse if the stemming rule changes. Optional and low-risk.

**Fix:** Add to `module.exports` with leading underscore convention.

```javascript
module.exports = {
  newLibraryId,
  newLibraryEntry,
  normalizeIngredientText,
  findEntryByText,
  extractAndSeed,
  aliasConflict,
  // Test introspection
  _bagOfWords: bagOfWords,
  _isSubset: isSubset
};
```

---

_Reviewed: 2026-05-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
