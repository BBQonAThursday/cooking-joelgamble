# Phase 3: Categorization Layering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 3-categorization-layering
**Areas discussed:** Match API shape, libraryEntryId scope, per-render index strategy, Phase 1/2 carryover fixes, library-side helper exports, view shape migration

---

## Match API: how categorize.js calls into the library

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap with shaped state | categorize.js calls `findEntryByText({ library }, text)` — wraps the array in a state-shaped object. Zero changes to lib/library.js. Cleanest for Phase 2 commits already shipped. | ✓ |
| Add findEntryByTextInLibrary(library, text) | Add a second helper to lib/library.js that takes the array directly. Phase 2's findEntryByText delegates to it. Cleaner long-term but expands lib/library.js exports beyond what was locked in Phase 2 CONTEXT. | |
| Overload findEntryByText to accept either | findEntryByText sniffs whether arg1 is an array or an object. Avoids new export but introduces a runtime type-check; minor footgun if state.library is ever something exotic. | |
| Refactor findEntryByText to take library directly | Change Phase 2's signature to findEntryByText(library, text). Requires touching the test suite that just landed. Cleanest API but the most invasive option. | |

**User's choice:** Wrap with shaped state (Recommended)
**Notes:** Q1+Q3 combined forced a follow-up — see "Library-side helper exports" below. The wrap-with-shaped-state answer applies to ad-hoc/test callers; the per-render hot path uses a separate index-based helper added per Q5 below.

---

## libraryEntryId scope on the recipe ingredient view

| Option | Description | Selected |
|--------|-------------|----------|
| Both surfaces now | decorateIngredients items become `{ text, libraryEntryId }`. Phase 6 FIX-02 already needs it — building it once is simpler than patching the view shape later. Templates need a small update. | ✓ |
| Grocery only, defer recipe-side | Strictly meet SC#3 — only attach libraryEntryId on grocery items. Phase 6 adds the recipe-side then. | |
| Both surfaces but as a separate per-render lookup | Don't change view shapes at all in Phase 3. Templates keep getting plain text. Phase 6 adds an inline lookup. | |

**User's choice:** Both surfaces now (Recommended)
**Notes:** Costs one template-line change in `views/recipe.njk` (`{{ ing }}` → `{{ ing.text }}`). Avoids re-touching the recipes route + recipe.njk + calc tests in Phase 6.

---

## Per-render index strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Build once per render, thread index param | Top of buildGroceryView/decorateIngredients builds the library index once, then passes it down. O(library_size) per render instead of O(library_size × items). | ✓ |
| Per-call rebuild inside categorize | Each categorize call rebuilds the library index internally. Simpler. Worry only at ~1000+ entries with 30+ ingredient lists. | |
| Module-level cache keyed by state.library identity | Cache by reference — rebuild only when state.library object changes. Fastest, but adds invalidation surface area. | |

**User's choice:** Build once per render, thread index param (Recommended)
**Notes:** Mirrors `lib/categorize.js#buildIndex`'s once-per-load pattern, just at render scope. Same complexity profile as the existing heuristic-only path.

---

## Phase 1/2 carryover fixes (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Categorize keyword regressions | Bare 'pepper'/'peppers' in RECIPE_KEYWORDS.Veg + missing 'peppers' in GROCERY_KEYWORDS.Produce. Saved to project memory after Phase 1. Last chance before Phase 4 backfill bakes wrong category into auto-seeded entries. | ✓ |
| WR-01: findEntryByText raw-alias divergence | findEntryByText regex uses raw stored alias while aliasConflict normalizes both sides. Latent for Phase 5 user-typed routes. Phase 3 wires findEntryByText into the render path — fix-now is cheap. | ✓ |
| WR-04: alias length sort uses raw not trimmed length | Padded short alias can outrank a clean longer alias on length sort. Same root cluster as WR-01. Cheap fix here. | (deferred) |
| Defer all to a dedicated Phase 2.1 fix pass | Open a 02.1 gap-closure phase for the four 02-REVIEW WARNs + the categorize regressions. Cleanest scope, extra phase. | |

**User's choice:** Categorize keyword regressions + WR-01 raw-alias divergence
**Notes:** WR-04 partially addressed for free by D-36's normalize-then-sort-by-length on the index path (the only path that matters for render-time matching). Documented in CONTEXT § Claude's Discretion. WR-02/WR-03 stay deferred per Phase 2 review.

---

## Library-side helper exports (follow-up to Q1+Q3 combination)

| Option | Description | Selected |
|--------|-------------|----------|
| Add buildLibraryIndex + findEntryInIndex | Two new exports from lib/library.js. Phase 2's findEntryByText becomes a one-line wrapper; behavior unchanged. | ✓ |
| Inline the index build in categorize.js | categorize.js privately mirrors library.js's regex-build + sort logic. No new library.js exports. Cost: duplicated code that must stay in sync. | |
| Memoize inside findEntryByText by reference equality | findEntryByText caches the index using state.library identity. categorize.js keeps calling findEntryByText({library}, text) per item. Cost: cache state in a previously pure module. | |

**User's choice:** Add buildLibraryIndex + findEntryInIndex (Recommended)
**Notes:** Two new pure exports. Phase 2's `findEntryByText(state, text)` is rewritten as `findEntryInIndex(buildLibraryIndex(state.library), text)` — all 12 Phase 2 tests must pass without modification.

---

## View shape migration (follow-up to Q2 "both surfaces now")

| Option | Description | Selected |
|--------|-------------|----------|
| Emit {text, libraryEntryId}, update template | decorateIngredients items become objects. recipe.njk:24 changes from {{ ing }} to {{ ing.text }}. Cleanest forward shape. | ✓ |
| Emit {text, libraryEntryId} but keep ing as string in template via toString | Make the item object stringify to its text so {{ ing }} still renders. Avoids touching the template now, at the cost of an oddly-shaped object that lies about its type. | |
| Emit two parallel arrays per group | group.items stays as text strings; group.libraryEntryIds is a parallel array by index. Footgun if items reorder. | |

**User's choice:** Emit {text, libraryEntryId}, update template (Recommended)
**Notes:** Single-line template edit. No template logic change.

---

## Claude's Discretion

- Sort comparator factoring inside `lib/library.js` — extract or inline based on read-clarity.
- Test file split — library tests for new helpers in `test/library.test.js`; categorize-with-library tests in `test/categorize.test.js`; calc integration tests in `test/calc.test.js`. One module, one test file.
- `null` vs `undefined` for `libraryEntryId` — picked `null` for symmetry with SC#3's wording, even though Phase 2 D-25 returns `undefined` from `findEntryByText`. View builder normalizes via `match ? match.id : null`.
- Overload-sniffing for the public `recipeCategoryOf(text, libraryOrIndex?)` — distinguish array form from index form by checking element shape. Documented in a comment near the function.
- WR-04 partial closure — recipe in CONTEXT § Claude's Discretion that the index path picks up trimmed-length sort for free; remaining edge cases stay deferred.

## Deferred Ideas

- 02-REVIEW WR-02 (single-letter unit token fragility) — latent, no current trigger.
- 02-REVIEW WR-03 (untested `extractAndSeed` step-5 fallback) — behavior is correct, add coverage in a future tidy pass.
- 02-REVIEW WR-04 (full) — partially addressed via D-36; remaining edge cases stay deferred.
- Module-level cache for the library index — revisit at ~5k entries or if Library tab pagination causes render storms.
- Library-aware `lib/grocery.js` helpers (alias-conflict suggest on user-typed grocery items) — out of scope; backlog.
- Phase 5 prep note: `LIB-03` "unused" badge will reuse `buildLibraryIndex` to walk recipes — flagged for the Phase 5 planner.
- Splitting `recipeCategoryOf` overload into separate exports if the runtime sniff creates confusion — defer until it actually does.
