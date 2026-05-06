---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to execute
last_updated: "2026-05-06T22:09:24.000Z"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 7
  completed_plans: 6
  percent: 86
---

# Project State — Ingredient Library

**Last updated:** 2026-05-05
**Milestone:** Ingredient Library

---

## Project Reference

**Core value:** Ingredient categorization on the grocery list and recipe detail pages converges toward accuracy as the user curates their library, replacing the brittle keyword-table heuristic with a personal source of truth.

**Current focus:** Phase 2 — library-helpers

---

## Current Position

Phase: 3 COMPLETE
Plan: Phase 4 next
| Field | Value |
|-------|-------|
| **Phase** | 3 — Categorization Layering — COMPLETE |
| **Plan** | 03-03-PLAN.md COMPLETE (commits 93b6bc8, 820d08a, 8789055, 18d79b4). Phase 3 closes MATCH-01, MATCH-02, MATCH-03; D-35, D-36, 02-REVIEW WR-01 closed; WR-04 partially closed. |
| **Status** | All 3 Phase 3 plans done — buildGroceryView and decorateIngredients are library-aware; routes/recipes.js + views/recipe.njk wired; 11 new tests + 6 authorized SC#5/D-31 line edits; 284/284 passing |
| **Blocking** | Nothing |

**Progress:**

```
Phase 1 [          ] 0%
Phase 2 [          ] 0%
Phase 3 [##########] 100%
Phase 4 [          ] 0%
Phase 5 [          ] 0%
Phase 6 [          ] 0%

Milestone [          ] 0%
```

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 6 |
| Phases complete | 0 |
| Requirements mapped | 21 / 21 |
| Plans written | 7 |
| Plans complete | 6 |
| Plan 03-02 duration | ~12 min |
| Plan 03-02 tasks | 2 |
| Plan 03-02 files modified | 2 |
| Plan 03-02 tests added | 15 |
| Plan 03-03 duration | ~4 min |
| Plan 03-03 tasks | 4 |
| Plan 03-03 files modified | 4 |
| Plan 03-03 tests added | 11 |
| Plan 03-03 tests modified | 6 (authorized SC#5/D-31 line edits) |

---

## Accumulated Context

### Key Decisions Locked In

- **Plan 03-03 closures (2026-05-06):** D-31, D-32, D-33, D-34 implemented in lib/calc.js. buildGroceryView and decorateIngredients build the library index ONCE per render (D-33) with the D-34 defensive guard for missing/empty/non-array library; both view-builders attach libraryEntryId per item (null on no match) per D-31/D-32. routes/recipes.js threads state.library; views/recipe.njk reads ing.text. The 6 SC#5/D-31 authorized line edits at test/calc.test.js:237-241 + 257 evolve bare-string item assertions to { text, libraryEntryId: null } shape — the only allowed test-shape evolution per the user's 2026-05-06 authorization. Phase 3 closes MATCH-01, MATCH-02, MATCH-03; D-35, D-36, 02-REVIEW WR-01 closed; 02-REVIEW WR-04 partially closed.
- **Plan 03-02 closures (2026-05-06):** D-26/D-27/D-28 implemented as a single guard (`match && typeof match.recipeCategory === 'string'`). Library 'Other' wins over heuristic. D-35 keyword fixes applied (RECIPE Veg trim + GROCERY Produce additions + GROCERY Aisle stale token removal per W-2). D-36 BLOCKER closed: `matchRawLibrary` calls module-local `normalizeIngredientText` so raw-library and pre-built-index paths are byte-equivalent. One Rule 1 deviation: added `'red pepper flakes'` (plural) to RECIPE Seasoning since the singular `'red pepper flake'` doesn't word-boundary-match the plural form.
- **Phase 1 is atomic.** FND-01 + FND-02 + FND-03 + FND-04 ship in one commit. The pea heuristic bug fix, `aliasConflict` validator, and `libraryMigratedAt` flag are co-dependent. Any split requires a data-repair migration.
- **`libraryMigratedAt` (not `library.length === 0`) is the backfill guard.** Empty library after user cleanup must not trigger re-backfill.
- **Backfill runs at server startup, synchronously, before accepting requests.** Not on first GET /library — avoids serving partial-library state.
- **Import direction enforced:** `lib/library.js` requires `lib/categorize.js`; `lib/categorize.js` does NOT require `lib/library.js`. Library passed as argument to avoid circular dependency.
- **No pre-computed categories on stored items.** Categories computed fresh at render time in `decorateIngredients` and `buildGroceryView`. Library is source of truth; storage is just the store.
- **`findEntryByText` returns the full matched entry (including `id`), not just a category.** The Fix shortcut needs the entry id to know which entry to open.
- **Toast strings must remain ASCII.** Any ingredient text passed through an `X-Status-Toast` header must strip non-ASCII characters (em-dash bug from CONCERNS.md applies to canonical names too).
- **Templates always display `ingredient.text`.** `entry.name` appears only inside the Fix editor, labelled as "Library entry:" metadata. Never substitute canonical name for original scraped text.
- **No `nutrition: {}` placeholder in v1.** Entry shape is exactly `{ id, name, aliases[], recipeCategory, groceryCategory, curated, createdAt }`. Future fields added via `migrate()` when implementing them.

### Pitfall Guards Active

- Alias collision: `aliasConflict()` runs in route handlers AND inside `extractAndSeed` (not UI-only).
- Auto-extract noise: normalization pre-pass (EXTR-02) must be in `extractAndSeed` before Phase 4 hook lands.
- Backfill duplicates: `libraryMigratedAt` idempotency guard in Phase 1 migration.
- Heuristic inheritance: pea-bug fix in Phase 1 before any seeding.
- Orphan accumulation: Library tab footer shows unused-entry count; no auto-delete.

### Architecture Conventions (Ingredient Library)

- Library helper module: `lib/library.js` — pure functions, no fs/http, fully unit-testable.
- Library routes: `routes/library.js` — thin orchestrators, all logic in `lib/library.js`.
- Library view model: `buildLibraryView(state, filter?)` in `lib/calc.js`.
- Library entry IDs: `lb_` + 8-char base36 (same pattern as `g_` grocery IDs).
- Library tab template: `views/library.njk` + `views/partials/library-panel.njk`.
- Fix fragment template: `views/partials/library-entry-edit.njk`.
- Nav tab added LAST (Phase 6 / after Library tab complete) so a broken tab is never visible.

---

## Todos

- [ ] Start Phase 1: write `test/storage.test.js` additions, then extend `lib/storage.js#migrate()` + `defaultState()`.
- [ ] Verify pea-bug fix with existing `test/categorize.test.js` before any seeding runs.
- [ ] Confirm backfill placement: server.js startup hook (synchronous, before `app.listen`).

---

## Blockers

None.

---

## Session Continuity

**To resume:** Read `ROADMAP.md` for phase goals and success criteria. Read `REQUIREMENTS.md` traceability table for current phase assignments. Read `.planning/phases/01-foundation/01-CONTEXT.md` for locked Phase 1 implementation decisions. Check which phase's `Plans` section has been updated from `TBD` to know where planning left off.

**Last session:** 2026-05-06 — completed plan 03-03 (4 commits: 93b6bc8 feat lib/calc.js, 820d08a feat routes/views, 8789055 test +11, 18d79b4 test 6 SC#5/D-31 line edits). Phase 3 fully complete. Stopped at: end of plan 03-03 SUMMARY.

**Next action:** Begin Phase 4 — Auto-Extract & Backfill (`POST /recipes` calls `extractAndSeed` after save; server-startup backfill runs once when `libraryMigratedAt` is null; idempotency verified).
