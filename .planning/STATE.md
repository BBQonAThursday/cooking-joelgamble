---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Executing Phase 05
last_updated: "2026-05-07T15:30:00.000Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 16
  completed_plans: 16
  percent: 94
---

# Project State — Ingredient Library

**Last updated:** 2026-05-07
**Milestone:** Ingredient Library

---

## Project Reference

**Core value:** Ingredient categorization on the grocery list and recipe detail pages converges toward accuracy as the user curates their library, replacing the brittle keyword-table heuristic with a personal source of truth.

**Current focus:** Phase 06 — Inline Fix

---

## Current Position

Phase: 05 (library-tab) — EXECUTING
Plan: 4 of 6
| Field | Value |
|-------|-------|
| **Phase** | 5 — Library Tab — COMPLETE (6/6 plans complete) |
| **Plan** | 05-06 complete (Library nav tab live, LIB-01 closed). Phase 5 DONE. Next: Phase 6 (Inline Fix / FIX-01..FIX-04). |
| **Status** | All 6 phases mapped. Phases 1-5 complete (16/16 plans). 349/349 tests passing. All 6 LIB requirements closed (LIB-01..LIB-06). |
| **Blocking** | Nothing |

**Progress:**

```
Phase 1 [##########] 100%
Phase 2 [##########] 100%
Phase 3 [##########] 100%
Phase 4 [##########] 100%
Phase 5 [##########] 100%
Phase 6 [          ] 0%

Milestone [##########] 94%
```

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 6 |
| Phases complete | 4 |
| Requirements mapped | 21 / 21 |
| Requirements validated | 13 / 21 (FND-01..04, EXTR-01, EXTR-02, EXTR-03, EXTR-04, MATCH-01, MATCH-02, MATCH-03) |
| Plans written | 16 |
| Plans complete | 13 |
| Phase 4 tests added | 13 (10 backfill + 3 SC#1 in recipes.test.js) |
| Phase 4 commits | 9 (3 RED + 3 GREEN + 3 SUMMARY) |
| Test suite | 333/333 passing |
| Plan 05-04 duration | ~20 min |
| Plan 05-04 tasks | 2 |
| Plan 05-04 files modified | 2 |
| Plan 05-04 tests added | 9 |
| Plan 05-03 duration | ~15 min |
| Plan 05-03 tasks | 4 |
| Plan 05-03 files modified | 3 |
| Plan 05-03 tests added | 11 |
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

- **Plan 05-06 closures (2026-05-07):** Library nav tab landed in views/layout.njk (1 line insert after History tab). Tab order: Recipes | This Week | Grocery | History | Library (5th position per LIB-01 / REQUIREMENTS.md). Active class fires when activeTab=='library' (already plumbed by buildLibraryView in Plan 02). Atomic-tab-launch invariant fully respected -- nav link added ONLY in this final wave. Regression test (no-nav-tab doesNotMatch) inverted to assert presence + active class. 2 new LIB-01 tests: cross-page inactive state (/grocery) + placement after History. 349/349 tests passing (+2 new tests). Phase 5 COMPLETE. LIB-01..LIB-06 all closed.
- **Plan 05-05 closures (2026-05-07):** DELETE /library/:id removes entry, OOB-swaps footer, verb-only toast 'Removed entry'. state.recipes untouched (LIB-06 regression invariant). Compound response: injectOob(footer) only -- empty primary body removes row via HTMX outerHTML. 5 new tests. 347/347 passing. LIB-06 closed.
- **Plan 05-04 closures (2026-05-07):** POST /library/:id save endpoint closed LIB-05. 200 path: compound row+OOB-footer via renderSync+injectOob (NOT respondWithUpdates -- avoids hx-swap-oob on row). 400 path: edit-form fragment with user-typed values preserved + inline aliasError; no toast (D-61). 404 path: plain text. aliasConflict called with excludingId so self-alias re-submit does not false-positive. curated:true forced via ELS spread on every save. setToast('Saved entry') only on 200 (D-67). 9 new HTTP tests; total 342/342 passing. Deviation: test regex patterns use (&#39;|') alternation because Nunjucks autoescape converts single quotes to &#39; in rendered HTML.
- **Plan 05-03 closures (2026-05-07):** GET /library/:id + GET /library/:id/edit return ONLY row fragments via renderSync (not respondWithUpdates -- avoids OOB corruption of HTMX outerHTML primary swap target). POST /library creates entries with curated:true; alias-conflict checked per-alias via aliasConflict(); aliases parsed: split on comma, trim, dedupe via Set. Toast 'Added entry' (verb-only, ASCII-safe). Full panel re-render on success via respondWithUpdates (D-67 Discretion). entryViewById helper reuses buildLibraryView for consistent decoration. views/partials/library-row-edit.njk shares outer id="library-row-{{ entry.id }}" with library-row.njk for bidirectional HTMX outerHTML toggle. Cancel button type=button with hx-get="/library/:id". LIB-04 closed. 333/333 tests passing (+11 new HTTP tests).
- **Plan 05-02 closures (2026-05-07):** buildLibraryView added to lib/calc.js — per-render recipe walk (D-66): buildLibraryIndex + findEntryInIndex + seen Set per recipe (prevents double-count). Alphabetical sort via localeCompare (D-55). Filter + search AND-combined (D-56). Entry decoration: aliasesDisplay, recipeCount, unused, deleteConfirm (singular/plural). unusedCount over full library (not filtered slice). routes/library.js created with GET /library; mounts in server.js after history route. Template hierarchy: library.njk -> library-panel.njk (#library-panel OOB target) -> library-row.njk (id=library-row-{{ entry.id }}). Debounced search hx-trigger=keyup changed delay:300ms; hx-include=[name='filter'] preserves filter state; hx-push-url=true (D-57/D-58). Two empty-state branches (D-59). CSS block library-* appended to styles.css. 322/322 tests passing (+13 unit buildLibraryView + +10 GET /library HTTP). LIB-02 + LIB-03 closed. No nav tab added (atomic-tab-launch invariant preserved).
- **Plan 05-01 closures (2026-05-07):** Wave 0 prerequisites complete. renderSync added to lib/render.js module.exports (was already defined at line 14-17, just not exported). views/partials/library-footer.njk created with stable id="library-footer", unusedCount 0/1/plural branches, no hx-swap-oob (added at runtime by injectOob). views/layout.njk gains htmx-config meta tag: responseHandling with code:400 swap:true rule placed BEFORE [45].. catch-all (first-match wins); 400 omits error:true per D-61 silent-toast-on-conflict; no nav tab added (Wave 5 atomic-tab-launch invariant). test/library-routes.test.js scaffold created with beforeEach/afterEach, addLibraryEntry helper, and Wave 0 healthz smoke (1 pass). test/calc.test.js extended with buildLibraryView destructure and Phase 5 smoke test that skips when undefined (pending Plan 02). 298/299 tests passing (1 intentional skip).
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

**To resume:** Read `ROADMAP.md` for phase goals. Phase 5 is COMPLETE — all 6 plans done (05-01..05-06). 349/349 tests passing. All LIB-01..LIB-06 requirements closed. Next: Phase 6 (Inline Fix / FIX-01..FIX-04).

**Last session:** 2026-05-07

**Stopped at:** Completed 05-06-PLAN.md (Phase 5 COMPLETE)

**Next action:** Execute Phase 6 — Inline Fix affordance on grocery items and recipe ingredient lines.
