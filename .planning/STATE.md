---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-05-06T00:29:37.139Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 1
  completed_plans: 0
  percent: 0
---

# Project State — Ingredient Library

**Last updated:** 2026-05-05
**Milestone:** Ingredient Library

---

## Project Reference

**Core value:** Ingredient categorization on the grocery list and recipe detail pages converges toward accuracy as the user curates their library, replacing the brittle keyword-table heuristic with a personal source of truth.

**Current focus:** Phase 01 — foundation

---

## Current Position

Phase: 01 (foundation) — EXECUTING
Plan: 1 of 1
| Field | Value |
|-------|-------|
| **Phase** | 1 — Foundation |
| **Plan** | 01-01-PLAN.md (1 plan, wave 1) |
| **Status** | Plan written and verified; ready to execute |
| **Blocking** | Nothing |

**Progress:**

```
Phase 1 [          ] 0%
Phase 2 [          ] 0%
Phase 3 [          ] 0%
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
| Plans written | 1 |
| Plans complete | 0 |

---

## Accumulated Context

### Key Decisions Locked In

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

**Next action:** `/gsd-execute-phase 1` — execute `01-01-PLAN.md` (3 tasks, single wave, single atomic commit per D-12).
