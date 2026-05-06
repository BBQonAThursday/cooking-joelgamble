# Phase 3: Categorization Layering - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 wires `state.library` into the existing render-time categorization path so library aliases win over the keyword-table heuristic, the heuristic still falls back when no library entry matches, and grocery items carry the matched entry's `id` for the upcoming Fix shortcut. Three requirements: MATCH-01 (categorize accepts a `library` arg), MATCH-02 (`decorateIngredients` and `buildGroceryView` thread the library through, render-time only), MATCH-03 (`findEntryByText` returns the entry id — already shipped in Phase 2).

In scope: extend `recipeCategoryOf` / `groceryCategoryOf` with an optional library-index argument; build the per-render library index once at the top of `buildGroceryView` / `decorateIngredients`; expose `libraryEntryId` on both grocery items AND recipe ingredient items (forward-prep for Phase 6 FIX-02); two new pure helpers in `lib/library.js` (`buildLibraryIndex`, `findEntryInIndex`) that the existing `findEntryByText` is re-implemented on top of; update `views/recipe.njk` ingredient loop to read `ing.text`; close two carryovers (categorize-keyword pepper regression + 02-REVIEW WR-01 raw-alias divergence in `findEntryByText`).

Out of scope (later phases): `extractAndSeed` POST hook (Phase 4), startup backfill (Phase 4), Library tab routes/templates (Phase 5), Fix affordance markup and routes (Phase 6), 02-REVIEW WR-02/WR-03/WR-04 (deferred — see `<deferred>`).

</domain>

<decisions>
## Implementation Decisions

### Library-aware matching API (MATCH-01) — categorize.js side

- **D-26:** `recipeCategoryOf` and `groceryCategoryOf` gain an optional second argument `libraryIndex` (NOT a raw `library` array). Signature: `recipeCategoryOf(text, libraryIndex?)` and `groceryCategoryOf(text, libraryIndex?)`. When `libraryIndex` is provided and the index returns a match, return `match.recipeCategory` / `match.groceryCategory`. When omitted (or empty/no match), fall through to the existing `RECIPE_INDEX` / `GROCERY_INDEX` keyword tables. Backwards compat is total: every existing caller passing only `text` gets identical behavior to today.
  - Why an *index* not a raw library array: SC#1 wording (`recipeCategoryOf('peanut butter', state.library)`) is the *external* contract for ad-hoc/test calls — a thin overload accepts the array form too and builds the index inline. The hot path (called once per item inside `buildGroceryView` / `decorateIngredients`) takes the pre-built index.
  - The actual signature is `recipeCategoryOf(text, libraryOrIndex?)`: if arg is array → build index inline; if arg is the index shape (objects with `.regex`) → use directly. SC#1's exact wording stays valid with no API gymnastics.

- **D-27:** Library hit returns `entry.recipeCategory` for `recipeCategoryOf` and `entry.groceryCategory` for `groceryCategoryOf`. Categories ARE the source of truth on the library entry — no further validation, no second lookup. Phase 2 WR-04 already validates categories at `newLibraryEntry` time, so the entry's stored categories are already in `RECIPE_CATEGORIES` / `GROCERY_CATEGORIES`.

- **D-28:** When the library matches but the entry's category is `'Other'`, return `'Other'` directly — do NOT fall through to the heuristic. A user who curated an entry to `'Other'` made a choice; the heuristic must not override it. This preserves the "library = source of truth" thesis from PROJECT.md.

### Library-side helpers (`lib/library.js`)

- **D-29:** Add two new pure exports to `lib/library.js`:
  - `buildLibraryIndex(library)` — returns the sorted regex array `[{ entryId, alias, regex, length, curated, arrayIndex, recipeCategory, groceryCategory }]`. Mirrors Phase 2's internal sort tuple from D-22/D-23/D-24 (length DESC, curated DESC, arrayIndex ASC). The shape includes `recipeCategory` and `groceryCategory` so `findEntryInIndex` callers can categorize without a second entry lookup.
  - `findEntryInIndex(index, text)` — performs the per-item match: lowercases input, tests regexes in sort order, returns the matched entry-shaped object (with at minimum `id`, `recipeCategory`, `groceryCategory`) on first hit, `undefined` on no match. Mirrors Phase 2 D-25's contract.
  - Phase 2's `findEntryByText(state, text)` is rewritten as a one-line wrapper: `return findEntryInIndex(buildLibraryIndex(state.library), text)`. The Phase 2 contract (signature, return shape, behavior) is unchanged — all 12 Phase 2 `findEntryByText` tests must continue to pass without modification (verifies SC#5 for `categorize.test.js` carries forward to `library.test.js`).

- **D-30:** `buildLibraryIndex(library)` accepts the raw `state.library` array. It does NOT take state. `library.js` callers (categorize.js) pass `state.library` directly — keeps the import-direction rule (categorize never imports library; library never imports state) symmetric on both sides.

### `libraryEntryId` exposure (MATCH-03 + Phase 6 forward-prep)

- **D-31:** `decorateIngredients(ingredients, library?)` items become `{ text, libraryEntryId }` objects (was: bare strings). When `library` is omitted or no match, `libraryEntryId` is `null` (NOT `undefined` — matches SC#3's grocery contract for symmetry; templates can do `{% if ing.libraryEntryId %}` reliably). Items in `group.items` are now objects, the group shape is unchanged.
  - Template change: `views/recipe.njk:24` from `{{ ing }}` to `{{ ing.text }}`. Single-line edit. No template logic change.

- **D-32:** `buildGroceryView(state)` attaches `libraryEntryId` to each item view object — both unchecked-categorized and checked items. `null` on no match per SC#3. Existing fields on the item view (`id`, `text`, `checked`) are preserved; the new field is additive.

- **D-33:** Both view builders construct the library index ONCE at the top of the function via `buildLibraryIndex(state.library)`, then pass that index into every per-item categorize call. Per-render cost is `O(library_size)` for the build + `O(items × library_size)` for matching, identical to today's heuristic-only path complexity profile (just a slightly larger constant). Mirrors `lib/categorize.js#buildIndex`'s module-load-once pattern, just at render scope instead of module scope (state.library mutates; the keyword tables don't).

- **D-34:** When `state.library` is absent, empty, or `undefined`, both view builders skip the index-build and call categorize with no library arg — identical to today's behavior. Defensive guard: `Array.isArray(state.library) && state.library.length > 0`.

### Carryover fixes shipping in Phase 3

- **D-35:** **Categorize keyword regressions (Phase 1 follow-up).** Edit `lib/categorize.js`:
  - Remove bare `'pepper'` and `'peppers'` from `RECIPE_KEYWORDS.Veg` (line 27). The intent was bell pepper / jalapeno (already covered by `'bell pepper'`, `'bell peppers'`, `'jalapeno'`, `'habanero'`, etc.). The bare token false-matches "black pepper" → Veg when it should be Seasoning. Reasoning preserved: bell varieties stay covered, seasonings (`'black pepper'`, `'white pepper'`, `'peppercorn'`) keep winning via longest-match.
  - Add `'peppers'` (plural) to `GROCERY_KEYWORDS.Produce` so plural form maps to Produce alongside `'pepper'` (currently absent). Confirm `'pepper'` singular is also present (it isn't in GROCERY_KEYWORDS.Produce currently — add both).
  - **Why now:** Phase 4 backfill seeds new library entries with categories computed via these heuristics. Wrong category at backfill time gets baked into the library — user has to fix manually entry-by-entry. Fixing in Phase 3 keeps the backfill clean.
  - Test additions: `test/categorize.test.js` gets explicit cases for `'black pepper'` → Seasoning (recipe), `'red pepper flakes'` → Seasoning, `'red bell peppers'` → Veg/Produce, `'peppers'` (bare plural) → Produce.

- **D-36:** **02-REVIEW WR-01 (raw-alias divergence in `findEntryByText`).** Fix at the index-build side: in `buildLibraryIndex`, normalize the alias before regex compile — `new RegExp('\\b' + escapeRegex(normalizeIngredientText(alias)) + '\\b', 'i')`. This means whitespace-noisy or case-noisy stored aliases produce clean regexes. The match input `text.toLowerCase()` stays as-is (per Phase 2 D-22 — testing against raw text preserves longest-alias-wins for substrings inside larger ingredient strings).
  - Why this approach over alternatives: (a) does not touch stored data → no migration; (b) makes stored-alias whitespace/case noise no longer a behavior divergence with `aliasConflict` (which already normalizes via `aliasKey` shim → `normalizeIngredientText`); (c) one-spot fix at the regex compile site, which now lives in the new `buildLibraryIndex` helper.
  - Update Phase 2's `findEntryByText` test that asserts the raw-alias regex behavior: re-confirm tests still pass given the normalized regex source. If a Phase 2 test specifically asserts raw-alias matching on padded input, document the change in Phase 3's SUMMARY.

### Claude's Discretion

- **Sort comparator factoring.** `findEntryInIndex` reuses Phase 2's locked `(length DESC, curated DESC, arrayIndex ASC)` comparator from D-22..D-24. Extract it as a named local function in `lib/library.js` if both `buildLibraryIndex` and the legacy `findEntryByText` wrapper need to call it; otherwise inline once.
- **Index `length` field after D-36 normalization.** Sort by the normalized alias's length (already trimmed by `normalizeIngredientText`). This incidentally addresses 02-REVIEW WR-04 (untrimmed length sort) for the deduplication-relevant cases — explicitly note in SUMMARY.md that WR-04 is **partially** addressed; remaining edge cases (single-letter unit fragility, untested step-5 fallback) stay deferred.
- **Test file split.** Library-aware behavior tests for categorize live in `test/categorize.test.js` (extends existing file); index-build/find-in-index unit tests live in `test/library.test.js`; integration tests for `buildGroceryView`/`decorateIngredients` with library threading live in `test/calc.test.js`. Maintains the one-module-one-test-file convention.
- **`null` vs `undefined` for `libraryEntryId`.** Decided as `null` (D-31, D-32) for symmetry with SC#3. Documented for the planner — do NOT use `undefined` even though Phase 2 D-25 returns `undefined` from `findEntryByText`. The view builder normalizes the field before render: `match ? match.id : null`.
- **`recipeCategoryOf` / `groceryCategoryOf` overload sniffing.** Distinguish array-shaped `library` from index-shaped argument by checking `Array.isArray(arg) && arg.length > 0 && !arg[0].regex`. Both are arrays at runtime — the discriminator is whether elements have a `.regex` property. Document in a comment near the function.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & locked decisions
- `.planning/PROJECT.md` — Core value (convergence toward accuracy via curation), key decisions table (library-first matching, render-time categorization, categorize never imports library, no precomputed categories on stored items).
- `.planning/REQUIREMENTS.md` §MATCH — MATCH-01 (categorize accepts library param, longest-alias-wins, falls back to keyword tables, returns 'Other' on no match anywhere), MATCH-02 (decorateIngredients/buildGroceryView thread library, render-time, no precomputed storage), MATCH-03 (findEntryByText returns entry id).
- `.planning/STATE.md` — "Key Decisions Locked In" — import direction (library → categorize, never reverse), no pre-computed categories, render-time categorization.
- `.planning/ROADMAP.md` §"Phase 3: Categorization Layering" — 5 success criteria, dependency on Phase 2.

### Prior phase context (locked decisions to honor)
- `.planning/phases/02-library-helpers/02-CONTEXT.md` D-22..D-25 — `findEntryByText` algorithm, sort comparator, return-undefined-on-no-match contract. Phase 3's `buildLibraryIndex` + `findEntryInIndex` MUST preserve all four.
- `.planning/phases/02-library-helpers/02-CONTEXT.md` D-13..D-16 — `normalizeIngredientText` order of operations. D-36 calls this on aliases at index-build time.
- `.planning/phases/02-library-helpers/02-REVIEW.md` WR-01 — raw-alias divergence in findEntryByText. Phase 3 closes via D-36.
- `.planning/phases/02-library-helpers/02-VERIFICATION.md` — confirms 5/5 SCs verified, 246/246 tests passing as Phase 3 baseline.

### Existing code & conventions
- `.planning/codebase/CONVENTIONS.md` — CommonJS, 2-space indent, single quotes, `*.test.js` colocated under `test/`, named exports only.
- `.planning/codebase/ARCHITECTURE.md` — Pure helpers in `lib/`, side effects in `routes/`, view models in `lib/calc.js`, render-time categorization (no precomputed category storage).
- `.planning/codebase/TESTING.md` — `node:test` patterns; `lib/library.js` and `lib/categorize.js` tests use plain state objects, no `setupDataDir` (no fs touched).
- `./CLAUDE.md` — Project instructions; library entries take priority over heuristic tables; keyword tables stay as fallback.

### Files to modify in Phase 3
- `lib/library.js` — Add `buildLibraryIndex(library)` and `findEntryInIndex(index, text)` exports. Re-implement `findEntryByText(state, text)` as a one-line wrapper. Apply D-36 normalization to alias regex source.
- `lib/categorize.js` — Extend `recipeCategoryOf`/`groceryCategoryOf` signatures to accept optional library/index. Implement library-first then heuristic-fallback per D-26..D-28. Apply D-35 keyword fixes (remove bare 'pepper'/'peppers' from Veg; add 'pepper'/'peppers' to Produce).
- `lib/calc.js` — `buildGroceryView` builds the library index once, attaches `libraryEntryId` to each item view (D-32, D-33). `decorateIngredients` accepts a `library` param, builds the index once, returns `{ text, libraryEntryId }` items (D-31, D-33).
- `routes/recipes.js` — `decorateIngredients(recipe.ingredients, state.library)` call site (currently `decorateIngredients(recipe.ingredients)` — must thread `state.library`).
- `views/recipe.njk` — Line 24: `{{ ing }}` → `{{ ing.text }}`. No other template changes.
- `test/library.test.js` — Add tests for `buildLibraryIndex` and `findEntryInIndex`. Verify the wrapper-rewrite of `findEntryByText` keeps all 12 Phase 2 tests passing without modification (D-29).
- `test/categorize.test.js` — Add library-priority tests, library-with-Other-category override, heuristic fallback when library is empty/undefined, D-35 pepper-keyword fix tests. **Do NOT modify existing tests** (SC#5).
- `test/calc.test.js` — Add tests for `buildGroceryView` with library matching → `libraryEntryId` set; `decorateIngredients(ingredients, library)` returns `{ text, libraryEntryId }` shape; both with empty/undefined library → existing behavior preserved. **Do NOT modify existing tests** (SC#5).

### Phase 2 carryovers explicitly addressed (not action items elsewhere)
- 02-REVIEW WR-01: closed via D-36.
- 02-REVIEW WR-04: partially closed via D-36 (alias length sort uses post-normalize length). Single-letter unit fragility and untested step-5 fallback remain deferred.
- Project memory: "Phase 1 categorize regressions to fix in Phase 3" (`memory/project_phase1_categorize_regressions.md`) — closed via D-35.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/categorize.js#buildIndex` (lines 57-71)** — Direct analog for Phase 3's `buildLibraryIndex`. Same `\b{kw}\b` word-boundary regex, same length-DESC sort. Phase 3's helper extends with curated/arrayIndex tiebreakers per Phase 2 D-22..D-24. Do NOT modify `buildIndex` itself; library and keyword indexes stay separate.
- **`lib/categorize.js#matchCategory` (lines 124-130)** — Pattern for the index-test loop. `findEntryInIndex` uses the same first-match-wins shape. Difference: returns the matched index entry (with id), not just a category.
- **`lib/library.js#findEntryByText` (Phase 2)** — Becomes a thin wrapper over `buildLibraryIndex` + `findEntryInIndex` per D-29. Public API contract unchanged; existing 12 tests must pass.
- **`lib/library.js#normalizeIngredientText` (Phase 2)** — Called inside `buildLibraryIndex` per D-36 to normalize the alias before regex compile.

### Established Patterns
- **Pure helpers in `lib/`, no fs/http** — Phase 3 strictly follows. New helpers are pure.
- **Named exports only** — `lib/library.js` exports list grows by 2: `buildLibraryIndex`, `findEntryInIndex`. `lib/categorize.js` and `lib/calc.js` exports are unchanged (just signature extensions).
- **Render-time categorization** — Phase 3's most load-bearing constraint. The view builders construct the index per render and never persist it.
- **Backwards-compatible signature extension** — both `recipeCategoryOf(text)` and `recipeCategoryOf(text, library)` work; `decorateIngredients(ingredients)` and `decorateIngredients(ingredients, library)` both work. Required for SC#5 (existing tests must pass without modification).

### Integration Points
- `lib/calc.js` → `lib/library.js`: NEW import — `buildLibraryIndex`. First time calc.js touches library.js; check that calc.js → library.js → categorize.js does not introduce a cycle (it doesn't: calc imports library; library imports categorize; categorize imports nothing).
- `lib/calc.js` → `lib/categorize.js`: existing import grows to pass `libraryIndex` param to `recipeCategoryOf`/`groceryCategoryOf`.
- `routes/recipes.js` → `lib/calc.js`: existing `decorateIngredients(recipe.ingredients)` call site updated to `decorateIngredients(recipe.ingredients, state.library)`. Storage import already in place.
- `routes/grocery.js` → `lib/calc.js`: NO changes — `buildGroceryView(state)` signature is unchanged; library access happens internally via `state.library`.
- `views/recipe.njk` → ingredient view shape: line 24 template update. The only template change in Phase 3.
- Future Phase 6 (FIX-02): markup that renders the Fix affordance on recipe ingredient lines reads `ing.libraryEntryId` — already present per D-31.
- Future Phase 4 (`POST /recipes` extractAndSeed hook): unaffected by Phase 3 changes; `extractAndSeed` already calls the single-arg `recipeCategoryOf`/`groceryCategoryOf` for seeding (which now passes through library-aware code path with no library arg → falls through to heuristic, same as today).

</code_context>

<specifics>
## Specific Ideas

- The library-then-heuristic fallback (D-26) is the structural mechanism that delivers PROJECT.md's "convergence toward accuracy as the user curates" promise: every render, the library wins where the user has spoken, and the heuristic still provides a sensible default everywhere else.
- D-28 (library-Other does NOT fall through to heuristic) is the small but load-bearing rule that makes the user's curation "stick." Without it, a user who deliberately moved an entry to 'Other' would still see the heuristic re-categorize it on the next render — exactly the brittleness the library is meant to replace.
- The choice to thread an *index* (not a raw library array) into the per-item categorize call (D-26, D-33) is the performance shape that makes the library viable at scale. Building the regex array once per render instead of once per item turns the hot-path cost from `O(items × library_size)` build + match to `O(library_size)` build + `O(items × library_size)` match — the same complexity as the existing heuristic path.
- D-31 emitting `{ text, libraryEntryId }` from `decorateIngredients` is forward-prep for Phase 6 FIX-02 (recipe-side Fix affordance). Doing it now costs one template line; doing it in Phase 6 means re-touching `views/recipe.njk`, the recipes route, and the calc tests in two phases instead of one. The user explicitly chose this trade.

</specifics>

<deferred>
## Deferred Ideas

- **02-REVIEW WR-02:** Single-letter unit tokens (`'g'`, `'l'`) survive normalization only via lucky `\s+` regex backtracking. Latent bug, no current trigger. Revisit if a future regex change exposes it. Not Phase 3 scope.
- **02-REVIEW WR-03:** `extractAndSeed` step-5 belt-and-suspenders fallback has zero test coverage. Add explicit test in a future tidy pass; behavior is correct today.
- **02-REVIEW WR-04 (full):** Partially addressed by D-36's normalize-then-sort-by-length. The remaining edge cases (length sort against raw input strings outside the index path) are not exercised by Phase 3's render path.
- **Module-level cache for the library index** keyed by `state.library` reference identity. Considered and rejected for Phase 3 (D-33 builds per render, which is `O(library_size)` and well within budget for the user's expected library scale of low-thousands). Revisit if Library tab pagination (Phase 5) creates render-storms or if the user scales past ~5k entries.
- **Library-aware `lib/grocery.js` helpers** (e.g., `addItem` could check `aliasConflict` against the library when the user types an ingredient that's *almost* a known alias). Out of scope — Phase 3 is read-side only. Add to backlog for post-v1 polish if it surfaces.
- **Phase 5 prep:** `LIB-03` "unused" badge requires walking `state.recipes[].ingredients` and testing each against the library index. Phase 5 will reuse `buildLibraryIndex` for that walk — no new helper needed. Note for Phase 5 planner.
- **`recipeCategoryOf` / `groceryCategoryOf` overload-sniffing complexity** could be split into separate exports (`recipeCategoryOfWithIndex`, `recipeCategoryOfWithLibrary`) if the runtime sniffing creates confusion. Defer — single overloaded signature is more ergonomic for ad-hoc/test calls and SC#1 specifies the array form explicitly.

</deferred>

---

*Phase: 3-Categorization Layering*
*Context gathered: 2026-05-06*
