# Phase 5: Library Tab - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 ships the Library tab — a dedicated 5th nav tab (Recipes / This Week / Grocery / History / **Library**) that lets the user browse, search, filter, edit, delete, and manually add `state.library` entries without leaving the app. After this phase, every entry the auto-extract / backfill pipelines (Phase 4) seeded as `curated: false` is reachable for triage; users can also manually create curated entries ahead of any recipe save.

In scope: `routes/library.js` exporting `GET /library`, `GET /library/:id`, `GET /library/:id/edit`, `POST /library`, `POST /library/:id` (edit), `POST /library/:id/delete`; `lib/calc.js#buildLibraryView(state, { q, filter })`; templates `views/library.njk`, `views/partials/library-panel.njk`, `views/partials/library-row.njk`, `views/partials/library-row-edit.njk`; `views/layout.njk` adds the 5th nav tab in the FINAL commit of the phase; CSS additions to `public/styles.css`; `test/library-routes.test.js` (HTTP-level coverage of all six routes) plus `test/calc.test.js` extension for `buildLibraryView`.

Out of scope (Phase 6 / later): Inline Fix affordance on grocery items and recipe ingredient lines (Phase 6 / FIX-01..FIX-04 — Phase 5 only ships the inline-edit pattern that Phase 6 reuses); recipe-string mutation; library imports/exports (CSV / OpenFoodFacts / USDA FDC); bulk operations (multi-select, batch edit/delete); drag-and-drop reorder; nutrition / allergen fields; per-entry change log; AI / LLM fuzzy matching; the 03-REVIEW WR-01 (`lib/calc.js` off-list category crash) and WR-02 (`routes/recipes.js` malformed week-record crash) carryovers from Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Row layout & indicators (LIB-02 / LIB-03)

- **D-52:** **Compact list rows.** One row per entry, single-line on wide screens, wraps on narrow viewports. Closer to the existing `grocery-list` pattern than the recipe-card grid; densest scannable layout for what may grow to ~200 entries. Phase 6 will hang the inline Fix affordance off the same row pattern (re-rendered via OOB on grocery / recipe pages, not the Library tab itself).

- **D-53:** **Aliases rendered comma-joined inline (plain text)** — `garlic clove, garlic cloves, minced garlic`. Matches LIB-03's literal "comma-joined" wording; degrades cleanly when an entry has 0–10 aliases (long lists wrap). NO pill / chip rendering in v1. NO truncation — full alias list is always visible (auto-extracted entries typically have 1 alias; curated entries grow over time but stay short).

- **D-54:** **Curated/uncurated/unused indicators are explicit text badges**, both states surfaced (NOT implicit-by-absence). Every row carries either `[curated]` or `[uncurated]`, plus `[unused]` when the entry has zero recipe references. Symmetric, screen-reader-friendly (badge text is real text), and surfaces both attention-cases (uncurated AND unused) without forcing the user to remember which absence means what. CSS may distinguish `[uncurated]` and `[unused]` visually (color/background), but the text is the load-bearing affordance.

- **D-55:** **Sort order: alphabetical by canonical `name`, locale-aware A→Z**, stable. Search and filter narrow the visible list but do NOT change sort. Most predictable for finding a known entry; pairs naturally with the live-debounce search (D-57). Rejected: "uncurated first" (the `Uncurated` filter button already surfaces them); "newest first" (recipes-tab pattern, but the user's mental model on the Library tab is "find an ingredient", not "see what just got auto-extracted").

### Filter & search interaction (LIB-02)

- **D-56:** **Search and filter combine (AND).** Typing `garlic` while filter=Uncurated narrows to uncurated entries whose name OR aliases contain `garlic`. Both query state pieces (`q` and `filter`) flow through together. The active filter button stays highlighted while the user types. Implementation: `buildLibraryView(state, { q, filter })` applies both predicates on the sorted list before returning.

- **D-57:** **Search box uses live debounce — `hx-trigger="keyup changed delay:300ms"`.** 300ms after the last keystroke, HTMX fires `hx-get="/library"` with `q=...`. Fast, modern feel; library on a Pi LAN at <200 entries handles per-keystroke server reads trivially. Same pattern reused by Phase 6's Categorize affordance (lookup-by-text). Rejected: submit-on-Enter (slower; adds the existing recipe-paste / grocery-add pattern's friction to a discovery surface where instant feedback matters); explicit submit button (no benefit over Enter).

- **D-58:** **Filter & search travel as URL query params.** Both filter button clicks and the live-debounced search submission use `hx-get="/library"` with `q=` and `filter=`, target `#library-panel`, and use `hx-push-url="true"` so refresh and back-button restore the user's current view. Server-side filtering (read `req.query.q` and `req.query.filter` in `GET /library`) — NOT client-side CSS hide. Reasoning: the `[unused]` badge depends on a server-side recipe walk anyway, so server-side is the seam where all state already lives.

- **D-59:** **Empty-result panel reflects the active query.** When `q` is non-empty AND/OR `filter !== 'All'` AND no entries match, render `'No entries match "{q}" with filter {filter}.'` plus a `Clear search` link/button that submits `q=` + `filter=All` (resets both). When the library itself is empty (length 0, no `q`/`filter` active), render the simpler `'Library is empty. Add an entry above or save a recipe to seed automatically.'` Two distinct empty states.

### Inline edit mechanics (LIB-05 / SC#3)

- **D-60:** **Edit form contains all four fields** — `name` (text input, required, maxlength 200), `aliases` (text input, comma-separated, optional, maxlength 1000), `recipeCategory` (`<select>` populated from `RECIPE_CATEGORIES`), `groceryCategory` (`<select>` populated from `GROCERY_CATEGORIES`). Save + Cancel buttons. Aliases parsed on submit: split on `,`, trim each, drop empties, deduplicate via `Set`. Phase 6's Fix editor (FIX-03) is locked to *categories only*, so Phase 5's edit form is the broader version — the two are intentionally distinct surfaces, not a shared component.

- **D-61:** **Alias-conflict error renders inline below the aliases input.** On 400 from `aliasConflict()`, the server returns the SAME edit-row fragment (HTTP 400, body = edit form HTML) with an error `<div>` slotted under the aliases input: `Alias '{conflicting alias}' is already used by '{owning entry name}'.` HTMX swaps the row outerHTML; user sees their typed values preserved + the inline error; fixes the conflict and re-submits. The form NEVER closes on error. Toast remains silent (the inline error is more persistent and contextual than a 1.2s toast).

- **D-62:** **Cancel returns the read-only row via `GET /library/:id`** — a server-rendered fragment (the same partial that `GET /library` includes per row). HTMX outerHTML-swaps the edit form back to the read-only row. Always reflects current server state. Symmetric with Edit (which is `GET /library/:id/edit` returning the edit-form fragment). Adds two GET routes returning HTML fragments, both consumed by HTMX outerHTML on the row element.

- **D-63:** **Save success swaps just the edited row outerHTML + OOB-swaps the unused-count footer.** The server returns the read-only row fragment for the saved entry (same shape as `GET /library/:id`) plus an `hx-swap-oob` footer fragment for the `[N unused]` count (it can change if the entry's curated state flipped). The row stays at its OLD alphabetical position even if `name` changed — accepted trade-off. The position re-syncs on the next refresh / filter / search submission. Rejected: full panel re-render (heavier, visual jump on rename), conditional re-sort (two response paths to test for marginal gain).

### Delete confirmation UX (LIB-06)

- **D-64:** **Delete uses `hx-confirm` with the recipe-count baked into the string at panel render time.** No new modal pattern, no two-step inline state. Browser native `confirm()` fires before the request leaves; standard accessibility. Implementation: `buildLibraryView` attaches `recipeCount` to each entry view; the row template sets `hx-confirm` to a per-entry literal string. Per-row delete uses `POST /library/:id/delete` (NOT `DELETE` HTTP verb — staying consistent with the existing route convention; `routes/grocery.js` uses `DELETE` but `routes/recipes.js` uses `DELETE` too, so this is a deviation; see D-67 below).

- **D-65:** **Confirmation copy varies by N.** When `recipeCount === 0`: `Delete "garlic"? This entry is unused.` (reassures it's safe.) When `recipeCount > 0`: `Delete "garlic"? Used in 4 recipes. Categorization will fall back to the heuristic.` (explicit about the consequence — recipe text and recipes themselves are NOT mutated per LIB-06, only the library row is removed; future renders of those recipes' ingredients will fall back to the keyword tables). The "fall back to the heuristic" phrasing is grounded in CLAUDE.md's "the keyword tables in `lib/categorize.js` stay in place as the fallback".

- **D-66:** **Recipe-count comes from a per-render walk inside `buildLibraryView`.** The view-builder constructs the library index once (already done in `lib/calc.js#buildGroceryView` / `decorateIngredients`), walks `state.recipes` once, and accumulates a `Map<libraryEntryId, count>` by matching each `recipe.ingredients[]` string with `findEntryInIndex`. Then it attaches `recipeCount` to each entry view. Cost: O(recipes × ingredients-per-recipe) per render — at the project's scale (~13 recipes × ~10 ingredients × ~50 library entries) this is well under 1ms. NOT a per-button-click round-trip; NOT precomputed on stored entries (CLAUDE.md's render-time-categorization rule applies).

- **D-67:** **Delete-success toast is GENERIC `Removed entry`** — does NOT echo the entry's `name` field. Reason: entry names can legitimately contain non-ASCII (e.g., `crème fraîche`, `jalapeño`); `setToast(res, ...)` puts the string into the `X-Status-Toast` HTTP header where non-ASCII bytes break Node's HTTP layer (CLAUDE.md / STATE.md "HTTP header safety"). Stripping non-ASCII from the name produces a mangled toast (`Removed: crme frache`); always-generic loses the satisfying "which entry" feedback but never breaks. Same conservative rule applies to all Library-tab toasts (`Saved entry`, `Added entry`, `Removed entry` — verb-only, no name interpolation).

### Claude's Discretion

- **HTTP verb for delete:** `POST /library/:id/delete` (not `DELETE /library/:id`). Reasoning: HTML `<form>` only natively supports GET and POST; HTMX `hx-delete` works but the existing routes (`routes/grocery.js`, `routes/recipes.js`) DO use `hx-delete` for parity with `DELETE` verbs, so either choice is internally consistent. Going with `POST /library/:id/delete` keeps the form-action alignment simpler and avoids the routes/library.js needing to handle a separate verb. **Open to flip to `DELETE /library/:id` if the user / planner prefers the existing convention.** REQUIREMENTS.md LIB-06 wording (`DELETE /library/:id`) leans toward the verb form — planner should treat this as the default unless the form-vs-button affordance dictates otherwise.

- **Edit verb:** `POST /library/:id` (not `PATCH`). REQUIREMENTS.md LIB-05 says "PATCH /library/:id (or POST /library/:id accepting _method=PATCH)" — explicitly authorizing the POST form. Choosing POST avoids any `_method` middleware. Planner can flip to PATCH if preferred.

- **Tab-added-LAST mechanism:** the `views/layout.njk` `<a href="/library">Library</a>` line is added in the FINAL commit/wave of Phase 5, after all routes / templates / tests are green. Implementation suggestion: structure the phase plan so the layout-edit lands in its own atomic plan after the rest of the phase verifies. STATE.md "Architecture Conventions" enforces this — "broken tab is never visible".

- **Manual-add form placement:** top of the Library panel, mirroring the recipe paste-form / grocery-add-form pattern. Form posts `name` + `aliases` + `recipeCategory` + `groceryCategory`; on success, OOB-swap the new row INTO the alphabetically-correct position OR re-render the panel (planner's call — both are defensible; full re-render is simpler given the alphabetical sort).

- **CSS:** new classes prefixed `library-` (`library-panel`, `library-row`, `library-row-edit`, `library-badge-curated`, `library-badge-uncurated`, `library-badge-unused`, `library-empty`, `library-add-form`). Match existing `.recipe-card`, `.grocery-item` etc. naming. Mobile-first per `public/styles.css`'s established approach.

- **Test fixture for unused / used badge:** `test/calc.test.js` extension constructs a state with 2 recipes referencing 1 of 3 library entries; asserts `buildLibraryView(...).entries[i].recipeCount` is `2`, `0`, `0`; asserts the third entry's view has `unused: true`.

- **Concurrent-edit prevention:** out of scope for v1 (single-user trust model). If the user opens two browsers and edits the same entry, last-write-wins on the underlying state. No optimistic concurrency token, no version field. Documented as accepted limitation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & locked decisions
- `.planning/PROJECT.md` — Core value (categorization converges via curation), out-of-scope list (no recipe-string mutation, no nutrition, no exports, no bulk ops, no AI fuzzy match), key decisions table.
- `.planning/REQUIREMENTS.md` §LIB — LIB-01 (5th nav tab "Library"), LIB-02 (GET /library page with all/uncurated/unused filters + substring search across name+aliases), LIB-03 (row content: name, aliases comma-joined, both categories, curated indicator, unused badge — render-time computation), LIB-04 (POST /library manual create with `curated: true`), LIB-05 (PATCH /library/:id or POST + _method, aliasConflict validation, sets `curated: true` on edit, OOB-swap the row), LIB-06 (DELETE /library/:id, no `state.recipes` mutation, warning with recipe-reference count, OOB-swap row removal).
- `.planning/STATE.md` "Architecture Conventions (Ingredient Library)" — `routes/library.js` thin orchestrator, `buildLibraryView` in `lib/calc.js`, IDs `lb_` + 8-char base36, templates `views/library.njk` + `views/partials/library-panel.njk`, Fix fragment `views/partials/library-entry-edit.njk` reserved for Phase 6, **nav tab added LAST so a broken tab is never visible**.
- `.planning/STATE.md` "Pitfall Guards Active" — alias collision via `aliasConflict()` (already shipped Phase 1+2); orphan accumulation surfaced via unused-entry footer count (LIB-03 SC#6); no auto-delete of unused entries.
- `.planning/ROADMAP.md` §"Phase 5: Library Tab" — 6 success criteria.
- `./CLAUDE.md` — Render-time categorization (no precomputation on stored items); HTTP header ASCII safety (drives D-67 generic toast); library entries take priority over heuristic; no auth (single-user LAN).

### Prior phase context (locked decisions to honor)
- `.planning/phases/01-foundation/01-CONTEXT.md` — `state.library = []` migration, entry shape `{ id, name, aliases[], recipeCategory, groceryCategory, curated, createdAt }`, `aliasConflict()` validator. Phase 5 reads this shape directly.
- `.planning/phases/02-library-helpers/02-CONTEXT.md` D-20, D-21, D-25 — `extractAndSeed`, `findEntryByText`, `aliasConflict` contracts. Phase 5 routes call into `aliasConflict` for edit/manual-create validation; `buildLibraryView` calls `buildLibraryIndex` + `findEntryInIndex` for the per-render recipe walk (D-66).
- `.planning/phases/03-categorization-layering/03-CONTEXT.md` D-26..D-36 — library-aware categorize signatures, `libraryEntryId` on item views, normalize-before-regex. Phase 5 does NOT change these; the Library tab is read-mostly against the library data the Phase 3 wiring already exposes.
- `.planning/phases/04-auto-extract-backfill/04-CONTEXT.md` D-37..D-51 — auto-extract POST hook + startup backfill. Phase 5 surfaces the `curated: false` entries those flows seed (the entire reason "Uncurated" filter exists at LIB-02).

### Existing code & conventions
- `.planning/codebase/CONVENTIONS.md` — CommonJS, 2-space indent, single quotes, `*.test.js` colocated under `test/`, named exports only, `{ ok, ... }` result-object shape, view-builder pattern (`buildXxxView`), OOB-swap fragments via `respondWithUpdates`.
- `.planning/codebase/STRUCTURE.md` — Where to add new code: `routes/library.js`, `lib/calc.js#buildLibraryView`, `views/library.njk` + `views/partials/library-*.njk`, `test/library-routes.test.js` + `test/calc.test.js` extension.
- `.planning/codebase/STACK.md` — Express 4, Nunjucks 3, HTMX 1.9 (vendored, no build step), node:test runner.
- `routes/grocery.js` — Reference for `respondWithUpdates({ panels, extra })` + `setToast` + `buildXxxView(state)` route pattern; Phase 5's routes mirror this exactly.
- `views/grocery.njk` + `views/partials/grocery-list.njk` + `views/partials/grocery-item.njk` — Reference for full-page + panel-fragment + item-fragment template hierarchy. Phase 5 mirrors with `library.njk` + `library-panel.njk` + `library-row.njk` + `library-row-edit.njk`.
- `views/layout.njk` (lines 11-16) — The nav `<a class="tab">` block where the 5th `Library` tab will land in the FINAL phase commit.
- `lib/categorize.js` (lines 1, 172) — `RECIPE_CATEGORIES` and `GROCERY_CATEGORIES` constants. Phase 5's `<select>` options are populated from these arrays (already exported).
- `lib/library.js` (line 389) — Exports: `newLibraryId`, `newLibraryEntry`, `normalizeIngredientText`, `findEntryByText`, `buildLibraryIndex`, `findEntryInIndex`, `extractAndSeed`, `aliasConflict`. Phase 5 routes/`buildLibraryView` consume these as-is — NO changes to `lib/library.js`.

### Files to create or modify in Phase 5
- `routes/library.js` — **NEW.** Six routes: `GET /library` (full page; reads `req.query.q` and `req.query.filter`), `GET /library/:id` (read-only row fragment for HTMX outerHTML), `GET /library/:id/edit` (edit-form row fragment), `POST /library` (manual create), `POST /library/:id` (edit; aliasConflict-validated), `POST /library/:id/delete` (or `DELETE /library/:id` per planner's call). Mounted in `server.js` alongside the existing `routes/recipes`, `routes/weeks`, `routes/grocery`, `routes/history`.
- `lib/calc.js` — **EXTEND.** Add `buildLibraryView(state, { q, filter } = {})` returning `{ entries, hasEntries, unusedCount, totalCount, q, filter, activeTab: 'library' }`. Each entry view: `{ id, name, aliases, recipeCategory, groceryCategory, curated, recipeCount, unused }`. Walks `state.recipes` once for `recipeCount` (D-66).
- `views/library.njk` — **NEW.** Extends `layout.njk`; includes `library-panel.njk`; manual-add form at top.
- `views/partials/library-panel.njk` — **NEW.** Filter buttons + search input + entry list + unused-count footer. Target of `hx-get="/library"` swaps.
- `views/partials/library-row.njk` — **NEW.** Single row, read-only. Target of inline-edit outerHTML swaps. Renders the four data fields, badges, edit/delete buttons.
- `views/partials/library-row-edit.njk` — **NEW.** Single row, edit form. Same outer DOM id as `library-row.njk` so HTMX outerHTML toggles between them.
- `views/layout.njk` — **EXTEND** (final commit only). Add `<a href="/library" class="tab{% if activeTab == 'library' %} active{% endif %}">Library</a>` between the existing Grocery and History tabs (or after History — placement is a planner call; PROJECT.md / REQUIREMENTS.md say "5th tab alongside Recipes / This Week / Grocery / History" without ordering).
- `public/styles.css` — **EXTEND.** New classes prefixed `library-*`. Mobile-first.
- `server.js` — **EXTEND.** One new line: `app.use('/', require('./routes/library'));` alongside the existing route mounts.
- `test/library-routes.test.js` — **NEW.** HTTP-level tests for all six routes via `helpers.setupDataDir + startTestServer`. Covers SC#1..SC#6 end-to-end.
- `test/calc.test.js` — **EXTEND.** New `buildLibraryView` block: empty state, sorted alphabetically, `q` substring match, filter combinations, `recipeCount` walk, `unused` flag.

### Phase 3 carryovers explicitly NOT addressed in Phase 5 (deferred)
- 03-REVIEW WR-01: `lib/calc.js` render-layer crash on off-list categories. Out of scope; tracked in STATE.md todos.
- 03-REVIEW WR-02: `routes/recipes.js` GET /recipes/:id malformed-week-record crash. Out of scope.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/library.js` exports (line 389)** — `newLibraryId`, `newLibraryEntry`, `aliasConflict`, `buildLibraryIndex`, `findEntryInIndex` are all consumed unchanged by Phase 5 routes / `buildLibraryView`. NO library.js changes in this phase.
- **`lib/categorize.js#RECIPE_CATEGORIES` / `GROCERY_CATEGORIES` (lines 1, 172)** — Already exported. Edit-form `<select>` options + manual-add `<select>` options pull from these constants directly. NO categorize.js changes.
- **`routes/grocery.js` (whole file)** — The reference implementation for the route shape Phase 5 mirrors: `setToast(res, msg)` helper, `respondWithUpdates(req, res, { panels, extra })` pattern, `buildXxxView(state)` view-model call, status-code conventions (200 ok / 400 bad-input / 404 not-found).
- **`views/grocery.njk` + `views/partials/grocery-list.njk` + `views/partials/grocery-item.njk`** — The three-template structure (full page → panel partial → item partial) Phase 5 mirrors as `library.njk` + `library-panel.njk` + `library-row.njk` + `library-row-edit.njk` (one extra partial because of the inline-edit toggle).
- **`lib/render.js#respondWithUpdates`** — Existing OOB-injection helper. Phase 5 routes use it for save / delete / manual-add responses (panel-or-row-or-row+OOB-footer). NO changes to render.js.
- **`lib/storage.js#save()`** — Atomic temp-rename pattern. Phase 5 mutations call `storage.save()` after each successful state mutation; no new persistence code.
- **`test/_helpers.js#setupDataDir + startTestServer`** — Existing test scaffolding. Phase 5's HTTP tests use it identically to `test/grocery-routes.test.js`.

### Established Patterns
- **HTMX OOB-swap via `hx-swap-oob="true"` injected by `lib/render.js#injectOob`** — Phase 5 uses this for the unused-count footer when an edit / delete changes the count (D-63).
- **`X-Status-Toast` ASCII-only** — Drives D-67 (generic verb-only toasts on Library actions).
- **Render-time categorization, no precomputation on stored items** (CLAUDE.md) — Drives D-66 (per-render recipe walk for `recipeCount` instead of denormalizing on `state.library` entries).
- **View-model + Nunjucks separation** — `buildXxxView` decorates state for templates; templates have NO business logic. Phase 5's `buildLibraryView` is the seam for the recipe walk + filter/search/sort.
- **Atomic-tab-launch convention** (STATE.md) — Add the nav `<a>` in the final commit so a broken tab is never visible to the user mid-deploy. Plans should sequence accordingly.
- **Tolerant inputs in helpers** — `Array.isArray(state.library) ? state.library : []` defensive guards. Phase 5 view-model and routes apply the same idiom.

### Integration Points
- `server.js` → `routes/library.js`: NEW import + `app.use('/', require('./routes/library'))` mount.
- `routes/library.js` → `lib/storage`: existing pattern (`storage.get()` / `storage.save()`).
- `routes/library.js` → `lib/calc#buildLibraryView`: NEW export consumed.
- `routes/library.js` → `lib/library`: consumes existing exports (`aliasConflict`, `newLibraryEntry`, `newLibraryId`).
- `routes/library.js` → `lib/render#respondWithUpdates` + `setToast`: existing pattern.
- `views/layout.njk` → `views/library.njk`: NEW nav tab link added in final commit only.
- `lib/calc.js#buildLibraryView` → `lib/library#buildLibraryIndex` + `findEntryInIndex`: existing helpers consumed for the per-render recipe walk.
- Future Phase 6 (Fix shortcut) — will reuse the inline-edit row toggle pattern (`GET /library/:id/edit` → outerHTML edit-form, `POST /library/:id` → outerHTML read-only row + OOB updates). Phase 6's editor is categories-only (FIX-03); Phase 5 establishes the broader four-field pattern.

</code_context>

<specifics>
## Specific Ideas

- D-52..D-55 form a coherent visual contract: compact list rows + plain-text aliases + explicit text badges + alphabetical sort. The user reads this surface like a dictionary — find the entry, scan its categories, edit. Cards / tables / pills would all bias toward different mental models (gallery / spreadsheet / tagging).
- D-57's `hx-trigger="keyup changed delay:300ms"` is the modern-feel choice; the user has expressed appetite for this pattern earlier in the project (HTMX-style live updates). Pi LAN bandwidth makes per-keystroke server roundtrips cost-free at this library size.
- D-58's `hx-push-url="true"` is the small affordance that turns the Library tab into a bookmarkable surface. The user can `<F5>` after typing a search and not lose state — same mental model as a search engine result page. NOT optional given live-debounce: without push-url, refreshing during a search resets the view jarringly.
- D-61's "inline error, form stays open" is the user-respecting choice: `aliasConflict` is recoverable in-place (rename one alias, retry); a toast that disappears in 1.2s is the wrong affordance for a problem that requires the user to TYPE A FIX. Persistence beats brevity here.
- D-63's "row in place even on rename" + alphabetical sort is an acknowledged trade: the row is briefly out-of-order until the next page interaction. Accepted because: (a) renames are rare, (b) the user just edited that entry so they know where it is, (c) full panel re-render on every save would feel jumpy. This trade-off matches the project's "boring is correct" ethos applied to view-state.
- D-66's per-render recipe walk locks render-time categorization as the single source of truth (CLAUDE.md). NO `state.library[].usedByRecipeIds` denormalization — that would be a parallel cache to keep in sync, and the Phase 4 backfill / POST-hook flows would have to update it. Walking the recipes per render is O(small × small) and mirrors how `buildGroceryView` already builds its per-render alias index (D-33 from Phase 3).
- D-67's generic toast is a direct consequence of CLAUDE.md's HTTP-header ASCII rule applied to a domain (ingredient names) where non-ASCII is plausible. This is a Phase-5-specific manifestation of a project-wide rule — toast text should never interpolate user-controlled non-ASCII.

</specifics>

<deferred>
## Deferred Ideas

- **Concurrent-edit prevention.** v1 accepts last-write-wins; single-user trust model documented in `.planning/codebase/CONCERNS.md`. If two-tab editing becomes a real failure mode, add an `updatedAt` field + If-Match-style optimistic check.
- **Manual-add form with category presets.** The manual-add form in Phase 5 has the user pick recipeCategory and groceryCategory from `<select>`s. A future quality-of-life improvement: pre-fill them by running the typed name through `recipeCategoryOf` / `groceryCategoryOf` (heuristic) on blur. Skipped in v1 for simplicity; revisit if users find category-picking tedious.
- **Bulk operations (multi-select edit / delete).** Out of scope per REQUIREMENTS.md "Out of Scope (v1) — Mealie's bulk page is described as 'great hidden tool nobody finds'; per-entry edit + search is sufficient at single-user scale."
- **Drag-and-drop reorder.** Out of scope per REQUIREMENTS.md (HTMX no-build-step constraint).
- **Library entry change log / audit trail.** Out of scope per REQUIREMENTS.md.
- **Pill / chip rendering for aliases.** D-53 chose plain comma-joined text. Pills are deferred — could become a v2 nicety if alias lists grow longer.
- **"Uncurated first" sort.** D-55 chose pure alphabetical. The Uncurated filter button serves the triage use case; if users find the filter friction-y, revisit a "uncurated first within alphabetical" mode.
- **Manual-add form expansion / collapse.** D-67's Claude's-Discretion notes the form sits at top of the panel (recipes paste-form pattern). A collapse-by-default expander could surface added affordance for power users; deferred.
- **PATCH HTTP verb.** REQUIREMENTS.md explicitly authorizes `POST + _method=PATCH` as an alternative; D-67's Claude's-Discretion picks plain POST for simplicity. Revisit if a future refactor introduces a `_method` middleware.
- **Server-rendered modal pattern.** D-64 chose native browser `confirm()` over a modal overlay. If a future phase needs a richer dialog (e.g., a delete-warning that lists which recipes reference the entry), introducing a `<dialog>` pattern would be net-new work.
- **Search highlighting.** Substring matches in name/aliases are not visually highlighted in v1. A future enhancement could wrap matches in `<mark>` server-side.
- **`updatedAt` field on library entries.** Not in the locked entry shape (Phase 1 D-09). If introduced later, requires a `migrate()` step.

</deferred>

---

*Phase: 5-Library Tab*
*Context gathered: 2026-05-07*
