---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 4 complete — ready for Phase 5
last_updated: "2026-05-07T13:29:37.254Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# Project State — Ingredient Library

**Last updated:** 2026-05-07
**Milestone:** Ingredient Library

---

## Project Reference

**Core value:** Ingredient categorization on the grocery list and recipe detail pages converges toward accuracy as the user curates their library, replacing the brittle keyword-table heuristic with a personal source of truth.

**Current focus:** Phase 5 — Library Tab (browse / filter / search / inline edit / delete / manual add)

---

## Current Position

Phase: 4 COMPLETE — proceed to Phase 5
| Field | Value |
|-------|-------|
| **Phase** | 4 — Auto-Extract & Backfill — complete (3/3 plans, 5/5 SC verified) |
| **Plan** | Phase 5 not yet planned. Next action: `/gsd-discuss-phase 5` then `/gsd-plan-phase 5`. |
| **Status** | All 6 phases mapped. Phases 1-4 complete (10/10 plans). 297/297 tests passing. EXTR-01 + EXTR-03 closed. |
| **Blocking** | Nothing |

**Progress:**

```
Phase 1 [##########] 100%
Phase 2 [##########] 100%
Phase 3 [##########] 100%
Phase 4 [##########] 100%
Phase 5 [          ] 0%
Phase 6 [          ] 0%

Milestone [#######   ] 67%
```

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 6 |
| Phases complete | 4 |
| Requirements mapped | 21 / 21 |
| Requirements validated | 13 / 21 (FND-01..04, EXTR-01, EXTR-02, EXTR-03, EXTR-04, MATCH-01, MATCH-02, MATCH-03) |
| Plans written | 10 |
| Plans complete | 10 |
| Phase 4 tests added | 13 (10 backfill + 3 SC#1 in recipes.test.js) |
| Phase 4 commits | 9 (3 RED + 3 GREEN + 3 SUMMARY) |
| Test suite | 297/297 passing |
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

- **Phase 4 closures (2026-05-07):** Plan 04-01 lands `lib/backfill.js` with module-reference import (`const libraryMod = require('./library')`) — minor deviation from PATTERNS.md destructured snippet to make the D-41 monkey-patch test fire (mirrors the existing `scrapeMod` idiom). Plan 04-02 inserts 12 new lines in the `if (require.main === module)` block; `createApp()` byte-identical so test/_helpers.js's startTestServer continues seeing a backfill-free createApp (D-43/D-51). Plan 04-03 mirrors the same module-reference deviation in `routes/recipes.js`. End-to-end smoke confirmed SC#3 idempotency on the production code path: first boot logged "Backfilled 2 library entries from 1 recipes" and persisted ISO timestamp; second boot returned `alreadyRan: true`, library length + timestamp unchanged. EXTR-01 and EXTR-03 closed. 297/297 tests passing (284 prior + 13 new). Planning defect noted: 04-02 acceptance criterion `grep -c "runBackfill" server.js` should equal 1, but the snippet itself has 2 occurrences — followed the snippet.
- **Phase 4 context (2026-05-06):** D-37..D-51 lock the auto-extract & backfill shape. Pure `lib/backfill.js` exporting `runBackfill(state) → { alreadyRan, added, aliasesAppended }` (D-37). Idempotency guard is `state.libraryMigratedAt` truthy (D-38). Per-recipe walk in `state.recipes` insertion order — matches live POST semantics, no flat-aggregate cross-recipe collapse (D-39). Defensive `Array.isArray(recipe.ingredients)` skip + console.warn (D-40); per-recipe try/catch + console.error + continue (D-41); `libraryMigratedAt` set unconditionally after the loop (partial backfill is committed). Bootstrap site is the `if (require.main === module)` block in `server.js` — `createApp()` stays backfill-free so `_helpers.startTestServer` keeps existing route tests isolated (D-43, D-44). POST /recipes adds a nested try/catch after the existing `storage.save()` at line 42; second save only on `result.added.length || result.aliasesAppended.length` (D-46, D-47); best-effort failure with unchanged success toast (D-48). New `test/backfill.test.js` is pure (no HTTP); SC#3 idempotency tested in pure path; SC#5 enforced structurally by call ordering (D-50, D-51). 03-REVIEW WR-01 and WR-02 explicitly deferred — not Phase 4 scope.
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

- [x] Phase 4: hook `extractAndSeed(state, recipe.ingredients)` into `POST /recipes` after the existing `storage.save()`; second `storage.save()` only on `added > 0`. *(Plan 04-03, commit 2fac444.)*
- [x] Phase 4: server.js startup backfill — synchronous, runs once when `state.libraryMigratedAt === null`, persists timestamp on completion. *(Plan 04-02, commit 69fbfbf.)*
- [x] Phase 4: verify backfill idempotency — restart twice, library entry count must be identical. *(End-to-end smoke 2026-05-07 + SC#3 unit test in test/backfill.test.js.)*
- [ ] Optional Phase 3 follow-up: address WR-01 (`lib/calc.js` off-list category crash) and WR-02 (`routes/recipes.js` malformed week record) from `03-REVIEW.md` — `/gsd-code-review 3 --fix` available.

---

## Blockers

None.

---

## Session Continuity

**To resume:** Read `ROADMAP.md` for phase goals. Phase 4 is COMPLETE — `.planning/phases/04-auto-extract-backfill/04-VERIFICATION.md` documents 5/5 SC verified. Library now self-populates on POST /recipes (EXTR-01 / Plan 04-03) and backfills pre-existing recipes once on startup (EXTR-03 / Plans 04-01 + 04-02).

**Last session:** 2026-05-07T13:29:37.249Z

**Next action:** `/gsd-discuss-phase 5` then `/gsd-plan-phase 5` — Library tab UI (LIB-01..LIB-06: browse/filter/search/inline edit/delete/manual add).
