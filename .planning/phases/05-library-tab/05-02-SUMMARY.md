---
phase: 05-library-tab
plan: "02"
subsystem: library-tab
tags: [view-builder, route, template, css, tdd]
dependency_graph:
  requires:
    - lib/library.js#buildLibraryIndex + findEntryInIndex (Phase 1)
    - lib/render.js#renderSync (Plan 05-01)
    - views/partials/library-footer.njk (Plan 05-01)
    - views/layout.njk htmx-config 400-swap (Plan 05-01)
  provides:
    - lib/calc.js#buildLibraryView (Plans 03/04/05 view rendering)
    - routes/library.js GET /library (browser-navigable page)
    - views/library.njk + partials/library-panel.njk + partials/library-row.njk (Plan 03+ template targets)
    - id="library-panel" OOB swap target (Plans 03/04/05)
    - id="library-row-{{ entry.id }}" row swap contract (Plans 03/04/05 inline-edit)
  affects:
    - server.js (one new mount line)
    - public/styles.css (library-* CSS block appended)
tech_stack:
  added: []
  patterns:
    - buildLibraryView per-render recipe walk (D-66): buildLibraryIndex + findEntryInIndex + seen Set
    - alphabetical localeCompare sort (D-55)
    - AND-combination filter + search (D-56)
    - HTMX debounced search hx-trigger=keyup changed delay:300ms (D-57)
    - hx-push-url=true on filter buttons and search input (D-58)
    - Two empty-state branches: no-match vs. truly-empty (D-59)
key_files:
  created:
    - routes/library.js
    - views/library.njk
    - views/partials/library-panel.njk
    - views/partials/library-row.njk
  modified:
    - lib/calc.js (buildLibraryView added)
    - server.js (library route mounted)
    - public/styles.css (library-* CSS block)
    - test/calc.test.js (13 new buildLibraryView tests)
    - test/library-routes.test.js (10 new GET /library HTTP tests)
decisions:
  - "buildLibraryView placed after buildGroceryView in lib/calc.js; mirrors same defensive-guard pattern"
  - "unusedCount computed over full library array (not filtered visible slice) so footer badge always reflects total unused count regardless of active filter"
  - "routes/library.js imports aliasConflict, newLibraryEntry, respondWithUpdates, renderSync, injectOob, RECIPE_CATEGORIES, GROCERY_CATEGORIES up-front — avoids re-edit in Plans 03/04"
  - "Stub routes for POST/PATCH/DELETE not registered (intentional 404s); comments document which Plan will fill each one"
  - "library-panel.njk hidden <input type=hidden name=filter> preserves filter state across debounced search keystrokes (RESEARCH Pitfall 6)"
  - "No nav tab <a href=/library> in layout.njk — atomic-tab-launch invariant preserved until Plan 06"
metrics:
  duration: "~15 min"
  completed: "2026-05-07"
  tasks: 4
  files_created: 4
  files_modified: 5
---

# Phase 05 Plan 02: Read Surface of Library Tab

buildLibraryView view-builder with per-render recipe walk, GET /library route, four-template hierarchy, CSS scaffolding, and 23 new tests (13 unit + 10 HTTP). LIB-02 and LIB-03 functionally closed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing buildLibraryView tests | 3a1ac01 | test/calc.test.js |
| 1 (GREEN) | Implement buildLibraryView in lib/calc.js | 3d35dc9 | lib/calc.js |
| 2 | Create routes/library.js; mount in server.js | a92db06 | routes/library.js, server.js |
| 3 | Create templates + CSS | 5e5428c | views/library.njk, views/partials/library-panel.njk, views/partials/library-row.njk, public/styles.css |
| 4 | HTTP tests for GET /library | b9bcedc | test/library-routes.test.js |

## What Was Built

### buildLibraryView (lib/calc.js)

Per-render recipe walk (D-66): builds library index once via `buildLibraryIndex`, then walks each recipe's ingredients through `findEntryInIndex` with a per-recipe `seen` Set to prevent double-counting a single entry from multiple matching ingredients in the same recipe. recipeCountMap accumulates counts keyed by entry ID.

Sort: `library.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))` — locale-aware alphabetical (D-55).

Filter: `Uncurated` (`!e.curated`), `Unused` (`recipeCount === 0`), default `All` (no-op). Combines with search via AND (D-56).

Search: case-insensitive substring on `e.name` OR any element of `e.aliases`. Applied after filter.

Entry decoration: `aliasesDisplay` (comma-joined), `recipeCount`, `unused` flag, `deleteConfirm` string (singular "1 recipe" / plural "N recipes" / "unused" branch).

`unusedCount` computed over the full library (not the visible filtered slice) so the footer always shows the total.

Returns: `{ entries, hasEntries, unusedCount, totalCount, q, filter, activeTab: 'library', RECIPE_CATEGORIES, GROCERY_CATEGORIES }`.

### routes/library.js

Express router with one registered route: `GET /library`. Reads `q` and `filter` from query params with defensive `typeof === 'string'` coercion (T-05-02-01). Up-front imports for Plans 03/04 helpers (`aliasConflict`, `newLibraryEntry`, `respondWithUpdates`, `renderSync`, `injectOob`). Stub route comments document which plans will fill each remaining handler.

What is wired: `GET /library`
What is deferred (intentional 404 until Plans 03/04/05):
- `POST /library` — Plan 03 (manual-add)
- `GET /library/:id` — Plan 03
- `GET /library/:id/edit` — Plan 03
- `POST /library/:id` — Plan 04
- `DELETE /library/:id` — Plan 05

### Template Hierarchy

```
views/library.njk             — full page (extends layout.njk)
  └─ views/partials/library-panel.njk  — #library-panel OOB target
       ├─ views/partials/library-row.njk  (per entry; id=library-row-{{ entry.id }})
       └─ views/partials/library-footer.njk  (created Plan 01)
```

Key template contracts established for Plans 03+:
- `id="library-panel"` — stable OOB swap target for all panel refreshes
- `id="library-row-{{ entry.id }}"` — stable row swap target for inline-edit (Plan 03) and delete (Plan 05)
- `hx-trigger="keyup changed delay:300ms"` + `hx-include="[name='filter']"` — debounced search preserving filter state
- `hx-push-url="true"` on search and filter buttons (D-58)
- Two empty-state branches: query-active (`No entries match "..."`) vs. truly-empty (`Library is empty...`)

### CSS Additions (public/styles.css)

Appended `/* Library */` block: `.library-add`, `.library-controls`, `.library-search`, `.library-filters`, `.library-filter-btn` (+ `.active`), `.library-panel`, `.library-list`, `.library-row`, `.library-name`, `.library-aliases`, `.library-category-recipe`, `.library-category-grocery`, `.library-badge` (+ `-curated`, `-uncurated`, `-unused`), `.library-empty`, `.library-clear-search`, `.library-footer`.

## Test Counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Full suite (npm test) | 298 pass + 1 skip | 322 pass | +24 net (+13 calc + 10 HTTP + 1 skip resolved) |
| test/calc.test.js | 35 pass + 1 skip | 49 pass | +14 (13 new + 1 skip resolved) |
| test/library-routes.test.js | 1 pass | 11 pass | +10 |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The manual-add form in `views/library.njk` POSTs to `/library` which returns 404 until Plan 03 registers `router.post('/library', ...)`. This is intentional and documented. The Edit and Delete buttons in `views/partials/library-row.njk` similarly 404 until Plans 03 and 05 respectively.

## Threat Flags

None. All T-05-02-01 through T-05-02-06 threats addressed as designed:
- T-05-02-01: query param coercion (`typeof === 'string'`) in routes/library.js
- T-05-02-02/03: Nunjucks autoescape:true covers entry name and deleteConfirm attribute
- T-05-02-04/05/06: accepted/deferred as documented in threat model

## Self-Check: PASSED

- lib/calc.js buildLibraryView: FOUND (`typeof require('./lib/calc').buildLibraryView === 'function'`)
- routes/library.js: FOUND, router exports OK, GET /library registered
- server.js: FOUND, one `require('./routes/library')` mount
- views/library.njk: FOUND, non-empty, extends layout.njk
- views/partials/library-panel.njk: FOUND, id="library-panel" present
- views/partials/library-row.njk: FOUND, id="library-row-{{ entry.id }}" present
- views/layout.njk: no `href="/library"` nav link (atomic-tab-launch invariant)
- public/styles.css: .library-row, .library-panel, .library-badge, .library-filter-btn, .library-empty, .library-clear-search present
- npm test: 322/322 pass, 0 fail, 0 skip
- Commits 3a1ac01, 3d35dc9, a92db06, 5e5428c, b9bcedc: all present
