# Phase 1: Foundation - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the foundation for the Ingredient Library: extends `state` with `library[]` and `libraryMigratedAt`, creates the `lib/library.js` skeleton with the entry-shape factory + `aliasConflict`, and patches the `\bpea` heuristic false-positive in `lib/categorize.js`. **Ships atomically as a single commit** so the heuristic fix lands before any data is seeded, and the alias-conflict guard exists before any alias is written.

Out of scope (later phases): full `normalizeIngredientText`, `findEntryByText`, `extractAndSeed`, `POST /recipes` auto-extract hook, server-startup backfill, categorization layering, Library tab, Fix shortcuts.

</domain>

<decisions>
## Implementation Decisions

### Pea-bug fix mechanism (FND-04)
- **D-01:** Switch keyword regexes from `\b{kw}` (prefix-match) to full `\b{kw}\b` (word-boundary on both sides) in `lib/categorize.js#buildIndex`. This eliminates the entire class of prefix-mis-fires (`pea` → `peanut`, would-be `lime` → `limelight`, etc.) rather than patching just the one symptom.
- **D-02:** Audit every keyword in `RECIPE_KEYWORDS` and `GROCERY_KEYWORDS` for plurality. Where the prefix-match was load-bearing (e.g., the existing `categorize.test.js:52-55` test asserts `tomato` matches `tomatoes` and `onion` matches `onions`), add explicit plural keywords to the table. Mushroom, carrot, potato, etc. need the same treatment. The diff is bigger but the matching becomes deterministic.
- **D-03:** Update `test/categorize.test.js` plural-prefix-match test (lines 52–55) to reflect that pluralization is now via explicit keyword entries, not regex prefix-match. The test name should change from "handles plurals via prefix match" to something like "handles plurals via explicit keywords".

### `aliasConflict` matching strictness (FND-03)
- **D-04:** Phase 1's `aliasConflict(state, alias, excludingId?)` uses simple `alias.trim().toLowerCase()` comparison only. The full `normalizeIngredientText` (which strips quantities, parens, etc.) ships in Phase 2 and replaces this trivial normalization at the same time `aliasConflict` gains its first messy-input test cases.
- **D-05:** Phase 1 unit tests for `aliasConflict` use already-clean alias strings (`'garlic'`, `'olive oil'`, `'red onion'`). Tests for messy inputs (`'2 cloves garlic, minced'`) are explicitly Phase 2's responsibility.

### Entry shape: factory function (FND-03)
- **D-06:** `lib/library.js` exports a `newLibraryEntry({ name, recipeCategory, groceryCategory, aliases, curated })` factory. The factory returns the full entry: `{ id: newLibraryId(), name, aliases: aliases || [], recipeCategory, groceryCategory, curated: !!curated, createdAt: new Date().toISOString() }`. Single source of truth for entry construction; Phase 2's `extractAndSeed` and Phase 5's manual-add route both call it.
- **D-07:** No runtime-exported shape constant or frozen template. The factory IS the shape contract; tests assert factory output directly. JSDoc `@typedef LibraryEntry` documents the shape for editor tooling.
- **D-08:** No `nutrition: {}` placeholder in v1 — already locked in STATE.md. Future fields ship via `migrate()` when actually implemented, not as empty placeholders now.

### Migration robustness (FND-01)
- **D-09:** `lib/storage.js#migrate()` mirrors the existing pattern for `library`: `if (!Array.isArray(merged.library)) merged.library = []`. No per-entry validation, no dropping of malformed entries. Consistent with how `recipes`, `weeks`, and `grocery` are handled today (`storage.js:11-13`). Bad entry contents surface as caller-side bugs, not silent migration drops.
- **D-10:** `state.libraryMigratedAt` is added to `defaultState()` returning `null`. `migrate()` preserves any existing value (string ISO timestamp) and defaults missing/non-string to `null`. The flag is the backfill idempotency guard (Phase 4) — `library.length === 0` is **not** an acceptable substitute, since user cleanup of the library must not re-trigger backfill.

### `newLibraryId()` (FND-03)
- **D-11:** `newLibraryId()` mirrors `newGroceryId()` from `lib/grocery.js:1-5` — `'lb_' + Math.random().toString(36).slice(2, 10)`. Non-cryptographic, single-user app, collision risk negligible.

### Atomicity (FND-01..04)
- **D-12:** Phase 1 ships as ONE commit. The pea-bug fix MUST land before any seeded data is written. Migration, library skeleton (entry factory + `newLibraryId` + `aliasConflict`), and categorize fix are co-dependent and inseparable. Any split would either bake wrong categories into Phase 4 backfill or land the alias guard after the first alias is already written.

### Claude's Discretion
- Test file structure: `test/storage.test.js` gains the new `library`/`libraryMigratedAt` migration cases inline; new `test/library.test.js` is created for `newLibraryId`, `aliasConflict`, and `newLibraryEntry`. No separate Phase 1 test file beyond these two.
- JSDoc style: brief `@typedef` block at the top of `lib/library.js`. No multi-paragraph docstrings.
- Exact regex change inside `buildIndex`: `new RegExp('\\b' + escapeRegex(kw.toLowerCase()) + '\\b', 'i')`. No new escape edge cases since `escapeRegex` already handles them.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & decisions
- `.planning/PROJECT.md` — Core value, constraints, key decisions table (entry shape, library-first matching, render-time categorization, no-nutrition-in-v1).
- `.planning/REQUIREMENTS.md` §FND — Numbered requirements FND-01..04 with traceability.
- `.planning/STATE.md` — "Key Decisions Locked In" and "Architecture Conventions" sections; ID format (`lb_` + 8-char base36), import direction, atomicity rule.
- `.planning/ROADMAP.md` §"Phase 1: Foundation" — 5 success criteria for Phase 1; build-order notes #1 (atomic unit) and #5 (import direction).

### Existing code & conventions
- `.planning/codebase/CONVENTIONS.md` — CommonJS, 2-space indent, single quotes, `*.test.js` colocated under `test/`, `_resetForTest()` exposure pattern.
- `.planning/codebase/ARCHITECTURE.md` — Atomic temp-file rename, view-model pattern, render-time categorization rule.
- `.planning/codebase/TESTING.md` — `node:test` patterns, test isolation via `_resetForTest()` and `helpers.setupDataDir()`.
- `.planning/codebase/CONCERNS.md` — Toast ASCII-only constraint (relevant for downstream phases, noted for awareness).

### Files to modify in Phase 1
- `lib/storage.js` — Add `library: []` and `libraryMigratedAt: null` to `defaultState()`; extend `migrate()` to coerce non-array `library` to `[]` and non-string `libraryMigratedAt` to `null`.
- `lib/categorize.js` — Change `buildIndex` regex from `'\\b' + escapeRegex(kw.toLowerCase())` to `'\\b' + escapeRegex(kw.toLowerCase()) + '\\b'`. Audit `RECIPE_KEYWORDS` and `GROCERY_KEYWORDS` and add explicit plural entries (tomatoes, onions, mushrooms, carrots, potatoes, peppers, etc.).
- `lib/library.js` — **New file.** Exports `newLibraryId`, `newLibraryEntry`, `aliasConflict`. Pure functions, no fs/http. May `require('./categorize')` for default-category lookups in later phases (not needed in Phase 1).
- `test/storage.test.js` — New cases for `library` and `libraryMigratedAt` migration (default, preserve, coerce).
- `test/categorize.test.js` — Update plural-prefix-match test name and add explicit `peanut butter` → not Veg, `peanuts` → Protein, etc. assertions.
- `test/library.test.js` — **New file.** Cases for `newLibraryId` (format, uniqueness), `newLibraryEntry` (shape, defaults), `aliasConflict` (positive, negative, `excludingId`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`newGroceryId` (`lib/grocery.js:1-5`)** — Pattern for `newLibraryId`. Same `prefix + Math.random().toString(36).slice(2, 10)` recipe, just `'lb_'` instead of `'g_'`.
- **`buildIndex` / `escapeRegex` (`lib/categorize.js:49-67`)** — Already produces the regex objects the pea-fix touches. The fix is a single-line concat change inside `buildIndex`.
- **`migrate` / `defaultState` (`lib/storage.js:4-15`)** — Direct extension target. Pattern is plain object spread + per-key array coercion.
- **`_resetForTest` (`lib/storage.js:57`)** — Exposed for the test isolation pattern. New `lib/library.js` does not need a `_resetForTest` since it has no module-level state.

### Established Patterns
- **Pure helpers in `lib/`, side effects in `routes/`** — `lib/library.js` follows this strictly (Phase 1 has no route work).
- **Result objects `{ ok: true, ... }` / `{ ok: false, reason: '...' }`** — applies to mutating helpers in later phases. `aliasConflict` is a query, not a mutation, so it returns the conflicting entry directly (truthy) or `null`/`undefined` (falsy) per Phase 1 success criterion #3.
- **`module.exports = { ... }` named exports only** — no default exports.
- **Test isolation via `helpers.setupDataDir()` + `_resetForTest()`** — already used in `test/storage.test.js`. New `test/library.test.js` does NOT need data-dir setup (no fs).

### Integration Points
- `lib/storage.js#migrate` is the only Phase 1 entry point that touches state shape. All future state-shape extensions (Phase 4 backfill, Phase 5 routes) read state through `storage.get()` and trust the shape `migrate` produced.
- `lib/categorize.js` exports stay the same (`recipeCategoryOf`, `groceryCategoryOf`, `RECIPE_CATEGORIES`, `GROCERY_CATEGORIES`). Phase 1 does not add the optional `library` parameter — that's Phase 3.
- `lib/library.js` does **not** import `lib/storage.js`. All state is passed in by callers. This keeps the helpers pure and unit-testable without `setupDataDir`.

</code_context>

<specifics>
## Specific Ideas

- Pea-bug fix is the cleanest-long-term option specifically because the user wants matching to be deterministic. The cost (audit + plural keywords + test rewrite) was accepted explicitly to remove the entire class of prefix-mis-fire bugs in one go.
- The factory pattern (`newLibraryEntry`) was chosen so Phase 2's `extractAndSeed` and Phase 5's manual-add route share one construction path — avoids drift between auto-seeded and user-created entries.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The full `normalizeIngredientText` and `findEntryByText` (originally listed under FND-03 in the loose project notes) are scoped to Phase 2 by ROADMAP.md and were not pulled forward.

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-05-05*
