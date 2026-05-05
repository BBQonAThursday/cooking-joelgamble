# Requirements — Ingredient Library v1

**Status:** v1 scope, draft 2026-05-05
**Source:** Synthesized from `.planning/PROJECT.md` + `.planning/research/SUMMARY.md` + 4 design-decision answers captured during questioning.

---

## v1 Requirements

### Foundation (FND)

- [ ] **FND-01**: `state.library[]` collection added to state shape and `lib/storage.js#migrate()`. Each entry: `{ id, name, aliases[], recipeCategory, groceryCategory, curated, createdAt }`. Same atomic temp-file rename pattern as existing collections.
- [ ] **FND-02**: `state.libraryMigratedAt` timestamp sentinel added to state shape (default `null`). Used by backfill as its idempotency guard — never re-runs once set.
- [ ] **FND-03**: `lib/library.js` module created with pure helpers: `newLibraryId()`, `normalizeIngredientText(s)`, `findEntryByText(state, text)`, `extractAndSeed(state, ingredients)`, `aliasConflict(state, alias, excludingId?)`. Pure functions, no fs/http, fully unit-testable.
- [ ] **FND-04**: `lib/categorize.js` keyword-table heuristic patched to fix the `\bpea` → "peanut/peanut butter" false positive (ships in the same commit as FND-01 so the bug is not baked into seeded library entries).

### Matching & Categorization (MATCH)

- [ ] **MATCH-01**: `recipeCategoryOf` and `groceryCategoryOf` accept an optional `library` parameter. When provided, library aliases are checked first (longest-alias-wins, word-boundary regex, same shape as existing keyword index). On no library hit, fall back to existing keyword tables. On no match anywhere, return `'Other'`.
- [ ] **MATCH-02**: `decorateIngredients(ingredients, library)` and `buildGroceryView(state)` thread the library through to the matcher. Categorization is computed fresh on every render (no precomputed category storage on grocery items or recipe ingredients).
- [ ] **MATCH-03**: `lib/library.js#findEntryByText` returns the matched entry id (not just a category) so the inline Fix shortcut knows which entry to open.

### Auto-Extract (EXTR)

- [ ] **EXTR-01**: `POST /recipes` handler calls `extractAndSeed(state, recipe.ingredients)` synchronously after the existing `storage.save()`. Triggers a second `storage.save()` only when new entries are appended.
- [ ] **EXTR-02**: `extractAndSeed` normalizes each ingredient string (trim, lowercase, strip leading quantity/unit prefixes, drop trailing parentheticals) before checking for an existing alias match. New entries: `name = original_text`, `aliases = [normalized_text]`, categories = heuristic guess from the keyword tables, `curated: false`.
- [ ] **EXTR-03**: Backfill runs on server startup (`server.js`) when `state.libraryMigratedAt` is `null`. Walks all existing recipes, calls `extractAndSeed` per recipe, sets `state.libraryMigratedAt = new Date().toISOString()`, persists once.
- [ ] **EXTR-04**: `aliasConflict(state, alias, excludingId?)` returns truthy when a normalized alias already exists in another entry. Auto-extract uses this to skip creating duplicates; route handlers use it to reject conflicting alias edits.

### Library Tab (LIB)

- [ ] **LIB-01**: New top-level tab "Library" in `views/layout.njk` — sits as the 5th tab alongside Recipes / This Week / Grocery / History. Sets `activeTab='library'` on the page.
- [ ] **LIB-02**: `GET /library` renders the page: full entry list (default filter "all"), search box (substring match across name + aliases), filter buttons "All" / "Uncurated" / "Unused", per-entry "edit" affordance (opens inline edit row).
- [ ] **LIB-03**: Each entry row shows canonical name, aliases (comma-joined), recipe category, grocery category, curated indicator, "unused" badge if no recipe currently references any of its aliases. Unused state computed at render time.
- [ ] **LIB-04**: `POST /library` (or button on the Library tab) creates a new entry manually. Form fields: canonical name (required), aliases (optional comma-separated), recipe category, grocery category. `curated: true` on manual creation.
- [ ] **LIB-05**: `PATCH /library/:id` (or `POST /library/:id` accepting `_method=PATCH`) updates an existing entry. Validates aliases against `aliasConflict`. Sets `curated: true` when an uncurated entry is edited. OOB-swap re-renders the affected row.
- [ ] **LIB-06**: `DELETE /library/:id` removes an entry. Does not mutate any `state.recipes[].ingredients[]`. Categorization gracefully falls back to heuristic for previously-matched strings. OOB-swap removes the row.

### Inline Fix (FIX)

- [ ] **FIX-01**: Each grocery item row has a "Fix" affordance. Clicking opens a small inline editor for the matched library entry's two categories (recipe + grocery dropdowns). Saving updates the entry, sets `curated: true`, and OOB-swaps the affected grocery list to reflect the new categorization. Items not currently matching a library entry get a "Categorize" affordance that creates a new entry seeded with the item's text.
- [ ] **FIX-02**: Each recipe-page ingredient line has the same "Fix" affordance with the same behavior. OOB-swaps the affected recipe-detail page sections.
- [ ] **FIX-03**: The Fix editor edits **categories only** — canonical name and aliases require navigating to the Library tab. A "Edit full entry" link in the Fix editor navigates to the entry on the Library tab.
- [ ] **FIX-04**: The Fix affordance never displays the canonical name in place of the original recipe ingredient text. Recipe pages always show `ingredient.text` (PITFALLS.md guidance — confined canonical name to the Fix editor header).

---

## Out of Scope (v1) — Explicit Exclusions

These are anti-features captured during research and decision-making. Reasoning is preserved so they don't get re-added.

- **Recipe ingredient inline-edit (mutating `state.recipes[].ingredients[]`)** — separate project, deferred. Library handles categorization without touching recipe strings.
- **Nutrition info / allergens / serving sizes / unit conversion** — entry shape is extensible (no migration needed when added later); v1 ships only the categorization layer.
- **CSV / OpenFoodFacts / USDA FDC import** — auto-extract from user's own recipes is preferred; bulk-seeded data forces curation backlog (Mealie's known failure mode).
- **Library export** — defer until library has enough curated data to know what export shape would be useful.
- **Cross-recipe ingredient string normalization** — recipe pages always show original text; canonical name is matching metadata only.
- **AI / LLM-based fuzzy matching** — non-deterministic, surprises erode trust; aliases + heuristic fallback is sufficient.
- **Bulk operations (batch edit, batch delete)** — Mealie's bulk page is described as "great hidden tool nobody finds"; per-entry edit + search is sufficient at single-user scale.
- **Recently-used / favorites within library** — library is for categorization, not inventory or discovery.
- **Library entry change log / audit trail** — unnecessary persistence overhead for a single-user app.
- **Multi-select / drag-and-drop in the Library tab** — inconsistent with existing HTMX no-build-step constraint.
- **Multi-user / sharing** — single-user Pi deployment trust model unchanged.

---

## v2 (Deferred — Likely Worth Building Later)

- Library entry export / backup format
- Nutrition info attachment (USDA FoodData Central is the chosen source per STACK.md)
- Recipe ingredient inline-edit (separate project after library settles)
- Fuse.js fuzzy search in the Library tab if linear `includes` proves too coarse at scale

---

## Traceability

| REQ-ID | Phase | Notes |
|--------|-------|-------|
| FND-01 | Phase 1 | Atomic with FND-02, FND-03, FND-04 |
| FND-02 | Phase 1 | Atomic with FND-01, FND-03, FND-04 |
| FND-03 | Phase 1 + 2 | Skeleton in Phase 1; full helpers in Phase 2 |
| FND-04 | Phase 1 | Ships in same commit as storage migration |
| MATCH-01 | Phase 3 | |
| MATCH-02 | Phase 3 | |
| MATCH-03 | Phase 3 | `findEntryByText` returns entry id |
| EXTR-01 | Phase 4 | Requires Phase 2 normalization |
| EXTR-02 | Phase 2 | Must precede EXTR-01 and EXTR-03 |
| EXTR-03 | Phase 4 | Requires Phase 2 normalization |
| EXTR-04 | Phase 2 | Ships with normalization helpers |
| LIB-01 | Phase 5 | Nav tab added last in library phase |
| LIB-02 | Phase 5 | |
| LIB-03 | Phase 5 | |
| LIB-04 | Phase 5 | |
| LIB-05 | Phase 5 | |
| LIB-06 | Phase 5 | |
| FIX-01 | Phase 6 | Requires Phase 5 routes |
| FIX-02 | Phase 6 | |
| FIX-03 | Phase 6 | |
| FIX-04 | Phase 6 | |
