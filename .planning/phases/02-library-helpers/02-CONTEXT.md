# Phase 2: Library Helpers - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 ships the four pure helpers in `lib/library.js` that everything downstream calls: `normalizeIngredientText`, `findEntryByText`, `extractAndSeed`, and a fully-implemented `aliasConflict` (replacing Phase 1's trim+lowercase placeholder). All four are pure functions — no `fs`, no `http`, no `express`, no `require('./storage')`. State is passed in by callers. Phase 1's `newLibraryId` and `newLibraryEntry` factory stay as-is and are reused by `extractAndSeed`.

In scope: `normalizeIngredientText`, `findEntryByText`, `extractAndSeed`, full `aliasConflict`, supporting unit and stop-word constants, and exhaustive unit tests using plain state objects.

Out of scope (later phases): `recipeCategoryOf`/`groceryCategoryOf` library-param wiring (Phase 3), `POST /recipes` extractAndSeed hook (Phase 4), server-startup backfill (Phase 4), Library tab routes (Phase 5), Fix shortcut (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Normalization scope (`normalizeIngredientText`) — FND-03 / EXTR-02

- **D-13:** `normalizeIngredientText` strips a leading **`<number><fraction>? <unit>?`** chunk plus an optional trailing `'of'`. The unit list is a module-level constant in `lib/library.js` (e.g. `cups`, `cup`, `tbsp`, `tablespoon`, `tablespoons`, `tsp`, `teaspoon`, `teaspoons`, `oz`, `ounce`, `ounces`, `lb`, `lbs`, `pound`, `pounds`, `g`, `gram`, `grams`, `kg`, `ml`, `l`, `liter`, `liters`, `pinch`, `dash`, `clove`, `cloves`, `slice`, `slices`, `can`, `cans`, `package`, `packages`, `bunch`, `bunches`, `head`, `heads` — initial set; planner can extend with the user's actual recipe corpus). Numeric forms covered: integers (`2`), decimals (`1.5`), simple fractions (`1/2`), mixed numbers (`2 1/2`), and articles like `a`/`an` (`'a pinch of salt'`). Examples:
  - `'2 cups of garlic'` → `'garlic'`
  - `'1/2 lb chicken'` → `'chicken'`
  - `'a pinch of salt'` → `'salt'`
  - `'2 1/2 cups flour'` → `'flour'`

- **D-14:** Strip **all parenthetical groups** — at any position in the string, regardless of nesting. Implementation: greedy `\(.*?\)` replacement applied iteratively until no match. Examples:
  - `'2 cups garlic (minced)'` → `'garlic'` (paren strip → `'2 cups garlic'` → quantity strip)
  - `'1 (14 oz) can tomatoes'` → `'can tomatoes'` (paren strip → `'1 can tomatoes'` → quantity strip drops the leading `'1 can'` if `can` is in the unit list)
  - `'pasta (e.g. penne or rigatoni)'` → `'pasta'`

- **D-15:** Strip **trailing comma + everything after it**. Conservative cut — only the comma is the signal. No curated prep-words list (rejected: a wrong word silently loses real ingredient text; e.g. `'cream cheese'` would lose `'cheese'` if `'cream'` were on the list). Examples:
  - `'garlic, minced'` → `'garlic'`
  - `'garlic, minced, optional'` → `'garlic'` (first comma wins)
  - `'garlic minced'` → `'garlic minced'` (no comma → unchanged)

- **D-16:** **No singular/plural stemming on stored normalized text.** `'clove'` and `'cloves'`, `'tomato'` and `'tomatoes'`, etc., remain distinct in `normalizeIngredientText` output. Both forms become aliases of one entry over time as the user curates. (Comparison-only stemming for the bag-of-words key — see D-19 — is a separate concern.)

- **Order of operations** (Claude's discretion, but locked here for the planner): (1) lowercase + initial `trim`, (2) strip parentheticals (D-14), (3) strip trailing-comma tail (D-15), (4) strip leading quantity/unit/of chunk (D-13), (5) collapse whitespace + final `trim`. The lowercase pass runs first so unit/stop matches are case-insensitive. The order is encoded as a single function with sequential transforms — no per-step exports.

### Within-recipe collapse strategy (`extractAndSeed`) — EXTR-02 / SC#2

- **D-17:** Same-recipe duplicate detection uses **bag-of-words token sets**. Each candidate ingredient string is normalized (per D-13..D-16), split on whitespace, filtered through a tiny stop-token set (e.g. `''`, after the quantity strip there should be very few stop tokens left — be conservative), then compared as a `Set<string>`. Storage keeps the original normalized string; the bag-of-words key is computed only for collapse comparison.

- **D-18:** Two ingredients collapse only when **one set is a subset of the other** (after D-19's comparison stemming). Conservative — `'garlic powder'` ({garlic, powder}) and `'garlic salt'` ({garlic, salt}) do NOT collapse (neither is a subset). `'garlic'` ({garlic}) ⊆ `'garlic clove'` ({garlic, clove}) → collapse. Rejected: any-token-overlap (folds all `garlic*` into one); shared-head-token (English-syntax-coupled, misses `'minced garlic'`).

- **D-19:** **Comparison-only token stemming.** When building the bag-of-words key for D-17/D-18 (only — the stored `normalizeIngredientText` output is unaffected and D-16 still holds), apply a final-`'s'` strip to each token if the resulting stem is at least 3 chars. So the comparison-key for `'garlic cloves'` is `{garlic, clove}`, matching `'garlic clove'`'s key `{garlic, clove}` exactly. Internal-only — never user-visible. Mangling cases like `'lentils'` → `'lentil'` are acceptable since this never appears in stored data.

- **D-20:** **Order of operations inside `extractAndSeed`** (per ingredient string):
  1. Normalize via `normalizeIngredientText`.
  2. **Library check first:** `findEntryByText(state, originalText)`. If a match exists:
     - If the normalized text is not yet in the matched entry's `aliases`, append it (passing `aliasConflict` against the rest of `state.library` with `excludingId = match.id`).
     - Continue to next ingredient.
  3. **In-progress collapse check:** test the candidate against the in-progress new-entries list (this call's bag-of-words seeds) using the D-18 subset rule. If a hit, append the new alias to the in-progress entry. Continue.
  4. **Seed new entry:** call `newLibraryEntry({ name: original_text, aliases: [normalized_text], recipeCategory: recipeCategoryOf(original_text), groceryCategory: groceryCategoryOf(original_text), curated: false })` and append to the in-progress list.
  5. After all ingredients processed: append all in-progress new entries to `state.library` and return a result object describing what changed.

  The library-first ordering ensures user curation always wins — re-saving an old recipe never re-fragments curated entries.

- **D-21:** When `extractAndSeed` matches an **existing** library entry but the normalized text is not yet in that entry's aliases, **auto-append** the alias. Gate the append on `aliasConflict(state, normalized_text, excludingId = match.id)` returning falsy — if the alias already belongs to a *different* entry, do nothing (this is the cross-entry duplicate case the Library tab will surface for manual resolution). The entry's `curated` flag is unchanged by this auto-append (it's not user input).

### `findEntryByText` matching algorithm — FND-03 / MATCH-03

- **D-22:** Match strategy is a **longest-alias-first regex index over `state.library` aliases**, tested against the **raw input text** (not normalized). For each alias `a` in every entry, build `new RegExp('\\b' + escapeRegex(a.toLowerCase()) + '\\b', 'i')`. Sort by alias length descending. Test the input (lowercased) against each regex in order; the first match's owning entry wins. This mirrors `lib/categorize.js#buildIndex` exactly — same pattern, same word-boundary fix that landed in Phase 1. Rejected: normalize-then-string-equal (loses longest-alias-wins; `'olive oil'` wouldn't match `'extra virgin olive oil'` unless the entry has the exact phrase). The `escapeRegex` helper from `lib/categorize.js` will be inlined or duplicated into `lib/library.js` — do not import from `categorize.js` (Phase 3 wires the dependency the other direction).

- **D-23:** **Build the index per call** inside `findEntryByText(state, text)`. No module-level cache, no caller-built index parameter. Mirrors the `categorize.js#buildIndex` pattern (which builds at module load because the keyword tables are constants). For typical recipe sizes (≤30 ingredients) and library sizes (a few hundred entries early on, low thousands long-term), the build cost is negligible and per-call eliminates cache-invalidation bugs entirely.

- **D-24:** **Tiebreaker on equal-length matching aliases:** `curated: true` wins over `curated: false`. If both are curated (or both uncurated), array order wins — no further tiebreak. This honors the "curation as source of truth" principle — a user-confirmed entry beats an auto-seeded one even if the auto-seeded entry sorts first. Implementation: sort alias entries by `(length DESC, curated DESC, arrayIndex ASC)` once; first regex match wins after sort.

- **D-25:** **Return `undefined` on no match.** Mirrors `aliasConflict`'s contract from Phase 1. Callers test truthiness: `if (entry) ... else { fall back to heuristic }`. The returned entry includes `id` (per MATCH-03) so the Phase 6 Fix shortcut can navigate to the entry. Rejected: `null` (inconsistent with `aliasConflict`); result object (GC pressure on a hot render path; overkill for a query).

### Claude's Discretion

- **Stop-token list for the bag-of-words key.** D-13's quantity strip already eats `of` and the article tokens, so the stop-token list inside `extractAndSeed`'s collapse step should be tiny — likely empty or just `''`. Planner picks the exact list; pitfall to flag in research is "don't add seasoning words like `salt` or `pepper` to stop tokens — that breaks legitimate ingredients."
- **Final unit-list contents** in D-13. The list above is an initial set; the planner audits the user's `state.recipes[].ingredients` corpus to extend it where needed. Anything missed degrades gracefully — the leading numeric token still strips, only the unit word survives until the user curates the entry.
- **Test corpus for messy inputs.** Phase 1 D-05 deferred messy-input tests to Phase 2. Build a representative corpus of ~20 strings spanning all D-13/D-14/D-15 cases (`'2 cups of garlic'`, `'1 (14 oz) can diced tomatoes (drained)'`, `'2 cloves garlic, minced'`, `'a pinch of salt'`, `'2 1/2 cups all-purpose flour, sifted'`, etc.). Each string asserts both the normalized output AND the expected `aliasConflict` collapse with a sibling string.
- **`extractAndSeed` return shape.** Use the project's `{ ok: true, ... }` convention from `lib/grocery.js`. Specifically: `{ ok: true, added: [<entry>...], aliasesAppended: [{ entryId, alias }...] }`. Phase 4's `POST /recipes` hook checks `added.length || aliasesAppended.length` to decide whether to call `storage.save()` a second time (per EXTR-01 — only save when something actually changed).
- **Empty / whitespace inputs.** `normalizeIngredientText('')` returns `''`. `findEntryByText(state, '')` returns `undefined` immediately (no regex tests). `extractAndSeed` filters empty post-normalize strings before the library check.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & locked decisions
- `.planning/PROJECT.md` — Core value, constraints, key decisions table (entry shape, library-first matching, render-time categorization, no-nutrition-in-v1).
- `.planning/REQUIREMENTS.md` §FND, §EXTR — FND-03 (extended), EXTR-02 (auto-extract normalize pre-pass), EXTR-04 (aliasConflict).
- `.planning/STATE.md` — "Key Decisions Locked In" and "Architecture Conventions" sections; ID format, import direction, render-time categorization rule.
- `.planning/ROADMAP.md` §"Phase 2: Library Helpers" — 5 success criteria, dependency on Phase 1.
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-04 (Phase 1 trivial `aliasKey` is replaced by `normalizeIngredientText` in Phase 2), D-06/D-07 (entry shape via factory), D-11 (`newLibraryId` pattern).

### Existing code & conventions
- `.planning/codebase/CONVENTIONS.md` — CommonJS, 2-space indent, single quotes, `*.test.js` colocated under `test/`, `_resetForTest()` exposure pattern.
- `.planning/codebase/ARCHITECTURE.md` — Pure helpers in `lib/`, side effects in `routes/`, no precomputed categories on stored items, atomic temp-file rename.
- `.planning/codebase/TESTING.md` — `node:test` patterns; `lib/library.js` tests do NOT need `setupDataDir` (no fs).

### Files to modify in Phase 2
- `lib/library.js` — Add `normalizeIngredientText`, `findEntryByText`, `extractAndSeed`. Replace Phase 1's trivial `aliasKey` with a thin shim that calls `normalizeIngredientText` (so `aliasConflict` automatically uses the full normalization). Add a unit-list constant. Add an `escapeRegex` helper (do not import from `categorize.js` — see import-direction rule in STATE.md).
- `test/library.test.js` — Extend with: messy-input normalization corpus (~20 strings), `findEntryByText` regex/longest-wins/curated-tiebreak tests, `extractAndSeed` ordering tests (library-first vs in-progress collapse, auto-append on existing match, no-double-save when nothing changes), upgraded `aliasConflict` tests now that `aliasKey` ≡ `normalizeIngredientText`.

### Phase 1 carryover (informational, not action items)
- `.planning/phases/01-foundation/01-REVIEW.md` WR-03 — `newLibraryEntry` doesn't dedupe within-entry aliases. D-21's auto-append goes through `aliasConflict` (cross-entry only); within-entry dedup is the planner's call (likely a Set-based dedup before write).
- `.planning/phases/01-foundation/01-REVIEW.md` WR-04 — `newLibraryEntry` doesn't validate categories against `RECIPE_CATEGORIES` / `GROCERY_CATEGORIES`. Phase 2 should add the validation since `extractAndSeed` is the first auto-caller.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/categorize.js#buildIndex` (lines 53-67)** — Direct analog for `findEntryByText`'s regex index. Same `\b{kw}\b` pattern, same length-DESC sort. Phase 1 patched the bilateral word boundary; Phase 2 mirrors the structure but does NOT import from `categorize.js`.
- **`lib/categorize.js#escapeRegex` (search the file)** — Pattern for escaping regex metacharacters. Inline a copy in `lib/library.js`; per STATE.md import direction, library never imports categorize.
- **`lib/categorize.js#recipeCategoryOf` / `groceryCategoryOf`** — `extractAndSeed` calls these at seed time to guess defaults for new entries. Phase 2 calls the *single-arg* heuristic (the optional `library` param lands in Phase 3). Imports flow `library.js → categorize.js` — see STATE.md key decision.
- **`lib/library.js#aliasConflict` (Phase 1)** — Stays exported. The internal `aliasKey` shim swaps from `trim+lowercase` to `normalizeIngredientText`; the function signature and contract are unchanged.
- **`lib/library.js#newLibraryEntry` (Phase 1)** — Reused by `extractAndSeed` to construct seeded entries. WR-04 says we should add category validation here in Phase 2.
- **`lib/grocery.js`** — Provides the `{ ok, ... }` result-object pattern that `extractAndSeed` should follow.

### Established Patterns
- **Pure helpers in `lib/`, no fs/http** — Phase 2 strictly follows. `lib/library.js` does NOT require `node:fs`, `node:http`, `express`, or `./storage`.
- **`module.exports = { ... }` named exports only** — Phase 2 grows the export list to: `newLibraryId, newLibraryEntry, normalizeIngredientText, findEntryByText, extractAndSeed, aliasConflict`. No default export, no barrel re-exports.
- **Test isolation** — `test/library.test.js` continues to pass plain state objects; no `setupDataDir`, no module-level state, no `_resetForTest`.

### Integration Points
- `lib/library.js` → `lib/categorize.js`: imports `recipeCategoryOf`, `groceryCategoryOf`, `RECIPE_CATEGORIES`, `GROCERY_CATEGORIES` (the constants for WR-04 validation). Direction enforced by STATE.md key-decision table.
- Future Phase 3 callers: `lib/calc.js#decorateIngredients` and `buildGroceryView` will call `findEntryByText(state.library, ingredient.text)` — function signature already locked here.
- Future Phase 4 callers: `routes/recipes.js` POST handler calls `extractAndSeed(state, recipe.ingredients)` after the existing `storage.save()`; checks `added.length || aliasesAppended.length` to decide on a second save.

</code_context>

<specifics>
## Specific Ideas

- The bag-of-words + comparison-only stemming combo (D-17/D-18/D-19) was specifically chosen over either strict-equality (would violate SC#2 unless we added stemming to stored output, which D-16 forbids) or stronger collapsing (any-token-overlap would fold `'garlic powder'` and `'garlic salt'` together — wrong). Subset rule + final-'s' strip on the comparison key is the smallest correct rule.
- `findEntryByText`'s curated-wins tiebreaker (D-24) is the explicit hook for the "convergence toward accuracy as the user curates" thesis in PROJECT.md — when an auto-seeded entry and a curated entry share an alias of equal length, the curated one always wins.
- The library-first ordering inside `extractAndSeed` (D-20 step 2) is the structural mechanism that prevents the user from ever losing curation when an old recipe is re-saved or the backfill (Phase 4) re-runs against new state.

</specifics>

<deferred>
## Deferred Ideas

- **Other-category fallback policy** — what `extractAndSeed` does when both `recipeCategoryOf` and `groceryCategoryOf` return `'Other'` for an ingredient. User skipped this gray area; default behavior (still seed, with `'Other'`/`'Other'` categories, `curated: false`) is acceptable for v1 and is the implicit choice unless overridden in planning. The user can manage these via the `'Unused' / 'Uncurated'` filter on the Library tab (Phase 5).
- **Performance budget for very large libraries** — no explicit budget in success criteria. If `findEntryByText` becomes hot-path-slow at multi-thousand entries, revisit D-23 (per-call build) and add a module-level cache keyed by `state.library` reference.
- **Phase 3 prep** — the WR-01/WR-02 categorize regressions saved to project memory (bare `'pepper'`/`'peppers'` in `RECIPE_KEYWORDS.Veg`, missing `'peppers'` in `GROCERY_KEYWORDS`) are NOT fixed in Phase 2. They surface in Phase 3 when categorize gets the library param.

</deferred>

---

*Phase: 2-Library Helpers*
*Context gathered: 2026-05-06*
