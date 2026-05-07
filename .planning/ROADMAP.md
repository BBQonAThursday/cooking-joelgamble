# Roadmap — Ingredient Library

**Milestone:** Ingredient Library
**Created:** 2026-05-05
**Granularity:** Fine (6-9 phases)
**Requirements:** 21 v1 requirements (FND-01..04, MATCH-01..03, EXTR-01..04, LIB-01..06, FIX-01..04)

---

## Phases

- [ ] **Phase 1: Foundation** — Atomic state migration: `state.library[]`, `libraryMigratedAt` sentinel, `lib/library.js` skeleton with `aliasConflict` + `newLibraryId`, and heuristic pea-bug patch. Ships as one commit.
- [ ] **Phase 2: Library Helpers** — Pure normalization and extraction helpers in `lib/library.js`: `normalizeIngredientText`, `findEntryByText`, `extractAndSeed`, `aliasConflict` fully implemented. Fully unit-tested with no HTTP.
- [x] **Phase 3: Categorization Layering** — `lib/categorize.js` gains optional `library` param; `lib/calc.js` threads library through `decorateIngredients` and `buildGroceryView`; `findEntryByText` returns matched entry id for Fix shortcut.
- [x] **Phase 4: Auto-Extract & Backfill** — `POST /recipes` calls `extractAndSeed` after save; server-startup backfill runs once when `libraryMigratedAt` is null; idempotency verified.
- [ ] **Phase 5: Library Tab** — `GET/POST/PATCH/DELETE /library` routes, `buildLibraryView`, and all Library tab templates: browse, filter, search, inline edit, delete, manual add.
- [ ] **Phase 6: Inline Fix** — Fix affordance on grocery items and recipe ingredient lines: inline category editor, OOB-swap on save, "Edit full entry" link, original ingredient text always preserved.

---

## Phase Details

### Phase 1: Foundation
**Goal**: The state schema, idempotency guard, core library module skeleton, and heuristic bug fix all exist and are tested before any data is written to `state.library`.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04
**Success Criteria** (what must be TRUE):
  1. `storage.migrate()` adds `state.library = []` and `state.libraryMigratedAt = null` to any existing state file without destroying existing `recipes`, `weeks`, or `grocery` data.
  2. `lib/library.js` exports `newLibraryId()`, `aliasConflict(state, alias, excludingId?)`, and a module-level entry shape constant — all pass their unit tests with plain objects (no fs/http).
  3. `aliasConflict` returns a truthy conflicting entry when two entries share a normalized alias, and returns falsy when the only match is the `excludingId` itself.
  4. `categorize.js` test for "peanut butter" returns `groceryCategory: 'Aisle'` (not `'Produce'`) — the `\bpea\b` word-boundary bug is patched.
  5. Server starts cleanly against a state file that was created before this migration; no crashes, no data loss.
**Plans:** 1 plan
Plans:
- [x] 01-01-PLAN.md — Atomic Foundation: storage migration (library + libraryMigratedAt) + categorize pea-bug fix (\b\b regex + plural keyword audit) + lib/library.js skeleton (newLibraryId, newLibraryEntry, aliasConflict). One commit per D-12.

### Phase 2: Library Helpers
**Goal**: All pure business-logic functions for ingredient normalization, alias matching, and entry extraction exist in `lib/library.js`, fully tested and ready to be called by routes and the categorization layer.
**Depends on**: Phase 1
**Requirements**: FND-03 (extended), EXTR-02, EXTR-04
**Success Criteria** (what must be TRUE):
  1. `normalizeIngredientText('2 cups of Garlic Cloves (minced)')` returns a root string that matches the `normalizeIngredientText('garlic cloves')` alias — quantity tokens, parentheticals, and case are stripped.
  2. `extractAndSeed(state, ingredients)` creates at most one new entry per normalized root per call — "garlic cloves", "garlic clove", and "minced garlic" in the same recipe do not produce three separate library entries.
  3. `findEntryByText(state, text)` returns the matching library entry (including its `id`) using longest-alias-wins, case-insensitive, word-boundary matching — not just a category string.
  4. `aliasConflict` is called inside `extractAndSeed` and prevents duplicate aliases from being written to `state.library` even when called repeatedly with the same ingredients.
  5. All helpers are pure functions verified by `test/library.test.js` using plain state objects; zero imports of `fs`, `http`, or Express.
**Plans:** 3 plans
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Normalization pipeline + WR-04 category validation: UNIT_TOKENS, inlined escapeRegex, normalizeIngredientText (5-step locked order D-13..D-16), repointed aliasKey shim, validated newLibraryEntry (closes WR-03/WR-04/IN-01/IN-02).

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — findEntryByText: per-call regex index over state.library aliases with bilateral  word-boundary, sorted (length DESC, curated DESC, arrayIndex ASC) per D-22/D-23/D-24; returns owning entry or undefined per D-25.

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — extractAndSeed: locked D-20 ordering (normalize -> library-first match -> in-progress bag-of-words subset collapse -> seed via newLibraryEntry); D-21 alias auto-append gated by aliasConflict; { ok, added, aliasesAppended } result for Phase 4 second-save gate.

### Phase 3: Categorization Layering
**Goal**: Every render of a recipe ingredient list or grocery item uses library aliases first, falls back to the heuristic keyword tables, and attaches the matched library entry id to grocery items so the Fix shortcut knows which entry to open.
**Depends on**: Phase 2
**Requirements**: MATCH-01, MATCH-02, MATCH-03
**Success Criteria** (what must be TRUE):
  1. `recipeCategoryOf('peanut butter', state.library)` returns the library entry's `recipeCategory` when the library has a curated "peanut butter" entry — not the heuristic result.
  2. `recipeCategoryOf('peanut butter')` (no library arg) still returns the heuristic result — existing callers are unaffected.
  3. `buildGroceryView(state)` attaches `libraryEntryId` (a non-null id string) to each grocery item that matches a library entry, and `null` for items with no library match.
  4. `decorateIngredients(ingredients, state.library)` returns ingredients grouped by the library-first category — a recipe re-render after editing a library entry immediately reflects the updated category.
  5. All existing `test/categorize.test.js` and `test/calc.test.js` tests pass without modification.
**Plans:** 3 plans
Plans:

**Wave 1**
- [x] 03-01-PLAN.md — lib/library.js extensions (buildLibraryIndex, findEntryInIndex per D-29) + D-36 normalize-before-regex; findEntryByText becomes a wrapper. Adds 12 unit tests.
- [x] 03-02-PLAN.md — lib/categorize.js library-aware signatures (recipeCategoryOf/groceryCategoryOf accept libraryOrIndex per D-26..D-28) + D-35 keyword fixes (remove bare pepper/peppers from RECIPE Veg; add to GROCERY Produce; remove stale 'pepper' from GROCERY Aisle per 03-REVISION-1 W-2) + D-36 BLOCKER closure (matchRawLibrary uses canonical normalizeIngredientText). Added 15 tests. NO require(./library).

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03-03-PLAN.md — lib/calc.js library threading (buildGroceryView + decorateIngredients build index once per render, attach libraryEntryId per D-31..D-34); routes/recipes.js call-site update; views/recipe.njk line 24 -> ing.text; test/calc.test.js +11 tests + the 6 USER-AUTHORIZED line edits per SC#5/D-31 resolution.

### Phase 4: Auto-Extract & Backfill
**Goal**: The library populates itself: new recipe saves automatically seed unmatched ingredients as `curated: false` entries, and all pre-existing recipes are backfilled exactly once on first startup after deploy.
**Depends on**: Phase 2, Phase 3
**Requirements**: EXTR-01, EXTR-03
**Success Criteria** (what must be TRUE):
  1. Saving a new recipe via `POST /recipes` results in `state.library` gaining entries for any ingredient strings not already matched by an existing alias — and no second `storage.save()` is called if all ingredients were already matched.
  2. On first startup after deploy (when `state.libraryMigratedAt` is `null`), the backfill walks all existing recipes and seeds library entries; `state.libraryMigratedAt` is set to an ISO timestamp and persisted.
  3. Restarting the server a second time does not re-run the backfill — `state.library` entry count is identical before and after the second restart.
  4. After backfill, "peanut butter" entries in `state.library` have `groceryCategory: 'Aisle'` (not `'Produce'`) — the heuristic fix from Phase 1 is reflected in all seeded entries.
  5. Backfill completes synchronously before the server begins accepting requests — no partial-library state is served on the first request.
**Plans:** 3 plans
Plans:

**Wave 1**
- [x] 04-01-PLAN.md — lib/backfill.js pure orchestrator (runBackfill) + test/backfill.test.js (10 pure tests covering SC#2/SC#3/SC#4 + D-40/D-41/edge cases).

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 04-02-PLAN.md — server.js bootstrap wiring inside require.main block (D-43/D-44/D-45 — call ordering proves SC#5; createApp stays backfill-free).
- [x] 04-03-PLAN.md — routes/recipes.js POST hook with nested try/catch (D-46/D-47/D-48/D-49) + test/recipes.test.js extension (3 SC#1 tests; D-51 carryover preserved).

### Phase 5: Library Tab
**Goal**: Users can browse, search, filter, edit, delete, and manually add library entries from a dedicated Library tab without leaving the app.
**Depends on**: Phase 3, Phase 4
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06
**Success Criteria** (what must be TRUE):
  1. A "Library" tab appears in the nav alongside Recipes / This Week / Grocery / History and renders the full entry list with name, aliases, both categories, and a curated/uncurated indicator per row.
  2. Filtering by "Uncurated" shows only `curated: false` entries; filtering by "All" restores the full list; a substring search across name and aliases narrows the visible rows without a page reload.
  3. Clicking "Edit" on an entry row replaces that row inline with an editable form (outerHTML swap); saving updates the entry, sets `curated: true`, and OOB-swaps the row back to read-only — alias conflict is rejected with an inline error, not a crash.
  4. "Delete" removes an entry and OOB-swaps it out of the list; a warning is shown before deletion noting how many recipes reference that entry's aliases; `state.recipes` is not mutated.
  5. The "Add entry" form at the top of the panel creates a new entry with `curated: true`; the new row appears at the top of the list; the unused-entry footer count updates.
  6. Rows marked as unused (no current recipe references any alias) display an "Unused" badge; a footer shows the total count of unused entries.
**Plans:** 6 plans
Plans:

**Wave 0**
- [ ] 05-01-PLAN.md — Wave 0 prerequisites: export renderSync from lib/render.js; create views/partials/library-footer.njk; add HTMX 4xx-swap meta-tag to layout.njk (NO nav tab yet); scaffold test/library-routes.test.js + test/calc.test.js buildLibraryView smoke

**Wave 1** *(blocked on Wave 0)*
- [ ] 05-02-PLAN.md — buildLibraryView in lib/calc.js (D-55/D-56/D-66); routes/library.js with GET /library mounted in server.js; views/library.njk + library-panel.njk + library-row.njk + library-* CSS; tests close LIB-02 + LIB-03

**Wave 2** *(blocked on Wave 1)*
- [ ] 05-03-PLAN.md — GET /library/:id (read-only row fragment for Cancel) + GET /library/:id/edit (edit-form fragment) + POST /library (manual-add); views/partials/library-row-edit.njk; closes LIB-04

**Wave 3** *(blocked on Wave 2)*
- [ ] 05-04-PLAN.md — POST /library/:id (edit save); compound row + OOB-footer response on 200; edit-form fragment with inline aliasError on 400 (D-61); curated:true forced on save; closes LIB-05

**Wave 4** *(blocked on Wave 3)*
- [ ] 05-05-PLAN.md — DELETE /library/:id; row-removal + OOB-footer compound response; explicit recipes-untouched regression test (LIB-06 invariant); closes LIB-06

**Wave 5** *(blocked on Wave 4 — FINAL atomic-tab-launch)*
- [ ] 05-06-PLAN.md — views/layout.njk: add <a href="/library">Library</a> nav link after History; invert the no-nav-tab regression test from Plan 02; closes LIB-01

### Phase 6: Inline Fix
**Goal**: Users can fix a mis-categorized ingredient's library entry in-context from the grocery list or recipe page without navigating to the Library tab.
**Depends on**: Phase 5
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04
**Success Criteria** (what must be TRUE):
  1. Each grocery item that matches a library entry shows a "Fix" affordance; clicking it opens a small inline editor with two category dropdowns (recipe + grocery); saving updates the library entry, sets `curated: true`, and OOB-swaps the grocery list so the item immediately appears in its new category group.
  2. Each recipe ingredient line that matches a library entry shows the same "Fix" affordance with the same behavior; saving OOB-swaps the recipe ingredient groups to reflect the updated category.
  3. Grocery items and recipe ingredient lines that do not match any library entry show a "Categorize" affordance instead; clicking it creates a new library entry seeded from the item text.
  4. The Fix editor contains only category dropdowns and a Save button — canonical name and aliases are not editable inline; an "Edit full entry" link navigates to the Library tab entry.
  5. Recipe pages always display the original scraped ingredient text (`ingredient.text`); renaming a library entry's canonical name does not change any text on any recipe page.
**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/1 | Planned | - |
| 2. Library Helpers | 0/3 | Planned | - |
| 3. Categorization Layering | 3/3 | Complete | 2026-05-06 |
| 4. Auto-Extract & Backfill | 3/3 | Complete | 2026-05-07 |
| 5. Library Tab | 0/6 | Planned | - |
| 6. Inline Fix | 0/? | Not started | - |

---

## Coverage

| REQ-ID | Phase |
|--------|-------|
| FND-01 | 1 |
| FND-02 | 1 |
| FND-03 | 1, 2 |
| FND-04 | 1 |
| MATCH-01 | 3 |
| MATCH-02 | 3 |
| MATCH-03 | 3 |
| EXTR-01 | 4 |
| EXTR-02 | 2 |
| EXTR-03 | 4 |
| EXTR-04 | 2 |
| LIB-01 | 5 |
| LIB-02 | 5 |
| LIB-03 | 5 |
| LIB-04 | 5 |
| LIB-05 | 5 |
| LIB-06 | 5 |
| FIX-01 | 6 |
| FIX-02 | 6 |
| FIX-03 | 6 |
| FIX-04 | 6 |

**Total: 21/21 v1 requirements mapped. No orphans.**

---

## Key Build-Order Notes

1. **Phase 1 is an atomic unit.** FND-01 + FND-02 + FND-03 + FND-04 ship in a single commit. The heuristic pea-bug fix must precede any data seeding; the `aliasConflict` validator must exist before any alias is written; the `libraryMigratedAt` flag must be part of the initial migration. Splitting these would bake wrong categories into backfilled entries and require a data-repair migration.

2. **Normalization before extraction.** EXTR-02 (normalization pre-pass) is in Phase 2, before EXTR-01/EXTR-03 (auto-extract hook and backfill) in Phase 4. The normalization function must exist and be tested before the first recipe is saved with the library active.

3. **Matching layer before Library tab and Fix.** Phase 3 (`findEntryByText` returning entry id, `buildGroceryView` attaching `libraryEntryId`) must be complete before Phase 5 (Library tab) and Phase 6 (Fix shortcuts) — both depend on knowing which entry id corresponds to a rendered ingredient.

4. **LIB and FIX phases can be developed in parallel** after Phase 3 is green, but Phase 6 depends on Phase 5's routes (Fix shortcut calls `GET /library/:id/edit-inline` and `PATCH /library/:id`), so Phase 5 ships first in this sequential plan.

5. **Import direction is strict throughout.** `lib/library.js` may require `lib/categorize.js` (for seeding default categories). `lib/categorize.js` must NOT require `lib/library.js`. Library is passed as an argument — never imported at module level by categorize — to avoid a circular dependency.
