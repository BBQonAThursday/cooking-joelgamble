---
phase: 05-library-tab
plan: 03
subsystem: library-routes
tags: [route, template, manual-add, fragment-render, inline-edit]
requirements: [LIB-04]

dependency_graph:
  requires: [05-02]
  provides: [GET /library/:id, GET /library/:id/edit, POST /library, library-row-edit.njk]
  affects: [routes/library.js, test/library-routes.test.js]

tech_stack:
  added: []
  patterns:
    - renderSync + res.type('html').send() for single-row fragment responses (no respondWithUpdates)
    - respondWithUpdates with library-panel.njk for full panel re-render on manual-add
    - entryViewById helper reusing buildLibraryView for consistent entry decoration

key_files:
  created:
    - views/partials/library-row-edit.njk
  modified:
    - routes/library.js
    - test/library-routes.test.js

decisions:
  - "Fragment-only GET routes use renderSync + res.type('html').send() directly -- NOT respondWithUpdates (which would corrupt HTMX outerHTML primary swap target per RESEARCH.md Pitfall)"
  - "Toast on POST /library success is exactly 'Added entry' (verb-only, no name interpolation -- ASCII-safe per CLAUDE.md)"
  - "POST /library uses full panel re-render via respondWithUpdates (D-67 Discretion) so new entry lands at alphabetical position without client-side positioning"
  - "curated:true set on manual-add entries per LIB-04"
  - "aliasConflict checked per-alias (not on the joined string) matching Phase 2 contract"

metrics:
  duration: ~15 min
  completed: "2026-05-07"
  tasks_completed: 4
  files_modified: 3
  tests_added: 11
---

# Phase 05 Plan 03: Manual-Add and Inline-Edit GET Routes Summary

**One-liner:** GET /library/:id and GET /library/:id/edit fragment routes + POST /library manual-add with curated:true, alias-conflict validation, and ASCII-safe toast.

## What Was Built

### Three new routes registered in routes/library.js

**GET /library/:id** (read-only row fragment, Cancel target):
- Returns ONLY the `library-row.njk` fragment via `renderSync` + `res.type('html').send()`
- HTMX `hx-target="#library-row-:id"` with `hx-swap="outerHTML"` on the Cancel button replaces the edit form with the read-only row
- 404 with plain text `'Not found'` on unknown id

**GET /library/:id/edit** (edit form fragment, Edit button target):
- Returns ONLY the `library-row-edit.njk` fragment via `renderSync` + `res.type('html').send()`
- Same outer id `library-row-{{ entry.id }}` as the read-only row enables bidirectional HTMX outerHTML toggle
- 404 with plain text `'Not found'` on unknown id

**POST /library** (manual-add, closes LIB-04):
- Validates `name` (required, trimmed), `recipeCategory` and `groceryCategory` (enum check against RECIPE_CATEGORIES / GROCERY_CATEGORIES)
- Parses `aliases` field: split on comma, trim each, drop empties, dedupe via Set
- Runs `aliasConflict(state, alias)` per alias before creating entry; returns 400 with body `"Alias 'x' is already used by 'y'"` on collision
- Creates entry with `curated: true` via `newLibraryEntry`
- Toast: exactly `'Added entry'` (verb-only, no name interpolation, ASCII-safe)
- On success: full panel re-render via `respondWithUpdates(panels: ['partials/library-panel.njk'], extra: buildLibraryView(state))`

### New template: views/partials/library-row-edit.njk

- Outer element: `<li id="library-row-{{ entry.id }}" class="library-row library-row-edit">` -- SAME outer id as `library-row.njk`; this is what enables bidirectional HTMX outerHTML toggle
- Form `hx-post="/library/{{ entry.id }}"` targets Plan 04's edit-save endpoint
- Cancel button `type="button"` with `hx-get="/library/{{ entry.id }}"` targets this plan's read-only fragment endpoint
- `entry.aliasError` conditional left in place (harmlessly falsy in Plan 03; activated by Plan 04's alias-conflict path)
- Pre-selects current `recipeCategory` and `groceryCategory` in the `<select>` elements

### Helper: entryViewById(state, id)

Module-local helper that calls `buildLibraryView(state)` and finds the decorated entry by id. Reusing `buildLibraryView` guarantees consistent `recipeCount`, `deleteConfirm`, `unused`, and `aliasesDisplay` values between the panel and the single-row fragment responses.

## D-67 / CLAUDE.md Choices Confirmed

- **Full panel re-render on manual-add:** `respondWithUpdates` with `library-panel.njk` re-renders the full sorted list; new entry lands at its alphabetical position with no client-side positioning logic.
- **Generic toast:** `'Added entry'` -- ingredient names can contain non-ASCII characters (e.g., `crème fraîche`) which would break the `X-Status-Toast` HTTP header. Generic verb-only toast is the safe choice per CLAUDE.md.

## LIB-04 Closure

- Manual-add form creates entries with `curated: true`
- Alias-conflict and category enum violations rejected with 400
- Alias parse-trim-dedupe pipeline: `[...new Set(aliasesRaw.split(',').map(a => a.trim()).filter(Boolean))]`

## Test Count Delta

- Plan 02 carry-forward: 11 tests
- Plan 03 additions: 11 tests
- Total in `test/library-routes.test.js`: 22 tests
- Full suite: 333/333 passing (pre-Plan-04 baseline)

**Pre-Plan-04 readiness:** `GET /library/:id` is live (Cancel works), `GET /library/:id/edit` is live (Edit button works), `POST /library` is live (manual-add works). The only remaining edit path is `POST /library/:id` (save inline edit) which Plan 04 wires.

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Surface Scan

No new security surface beyond what the plan's `<threat_model>` covers. All mitigations in the threat register are implemented:
- T-05-03-01 (name validation): non-empty trimmed string enforced before `newLibraryEntry`
- T-05-03-02 (category enum): `RECIPE_CATEGORIES.includes(...)` and `GROCERY_CATEGORIES.includes(...)` checked server-side
- T-05-03-03 (aliases bounds): split/trim/dedupe pipeline
- T-05-03-04 (alias conflict): `aliasConflict` per alias using canonical normalizer
- T-05-03-06 (XSS): Nunjucks autoescape handles name and aliasesDisplay in HTML attribute and text contexts
- T-05-03-08 (header injection): toast is literal `'Added entry'`, no user-data interpolation

## Self-Check: PASSED

- `views/partials/library-row-edit.njk` exists: FOUND
- `routes/library.js` has GET /library/:id: FOUND (commit debf7e6)
- `routes/library.js` has GET /library/:id/edit: FOUND (commit debf7e6)
- `routes/library.js` has POST /library: FOUND (commit a089dbd)
- `test/library-routes.test.js` has 22 tests passing: CONFIRMED (commit f9c52d4)
- Full suite 333/333: CONFIRMED
