---
phase: 05-library-tab
plan: "01"
subsystem: library-tab
tags: [scaffolding, htmx, test-infrastructure, render, wave-0]
dependency_graph:
  requires: []
  provides:
    - lib/render.js#renderSync (Plans 03/04/05 direct fragment rendering)
    - views/partials/library-footer.njk (Wave 3 + Wave 4 OOB compound responses)
    - views/layout.njk htmx-config 400-swap (Wave 3 alias-conflict inline error path)
    - test/library-routes.test.js scaffold (Plans 02-06 test targets)
    - test/calc.test.js buildLibraryView import (Plan 02 auto-passes smoke on implementation)
  affects: []
tech_stack:
  added: []
  patterns:
    - htmx-config responseHandling meta tag override (HTMX 2.x 4xx swap enablement)
    - renderSync export pattern (direct fragment rendering without OOB injection)
key_files:
  created:
    - views/partials/library-footer.njk
    - test/library-routes.test.js
  modified:
    - lib/render.js
    - views/layout.njk
    - test/calc.test.js
decisions:
  - "renderSync was already defined in lib/render.js (line 14-17); only the module.exports line changed"
  - "library-footer uses <div> not <footer> per RESEARCH.md Open Question 3 recommendation"
  - "htmx-config 400 rule omits error:true per D-61 silent-toast-on-conflict design"
  - "No nav tab <a href='/library'> added — atomic-tab-launch invariant (Wave 5 / Plan 06 only)"
  - "calc.test.js smoke uses skip option so it auto-passes when Plan 02 lands buildLibraryView"
metrics:
  duration: "~2 min"
  completed: "2026-05-07"
  tasks: 5
  files_created: 2
  files_modified: 3
---

# Phase 05 Plan 01: Wave 0 Prerequisites Summary

Wave 0 infrastructure landed: `renderSync` exported, OOB footer partial created, HTMX 4xx-swap meta-tag active, and test scaffolds wired. All 5 tasks complete; no nav tab added; 298/299 tests passing (1 skipped — buildLibraryView pending Plan 02).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Export renderSync from lib/render.js | 7624121 | lib/render.js |
| 2 | Create views/partials/library-footer.njk | 135292e | views/partials/library-footer.njk |
| 3 | Add HTMX 4xx-swap meta-tag to views/layout.njk | d8ea4fd | views/layout.njk |
| 4 | Create test/library-routes.test.js scaffold | 2b1ec85 | test/library-routes.test.js |
| 5 | Extend test/calc.test.js with buildLibraryView import + smoke | 1adafde | test/calc.test.js |

## What Was Built

### lib/render.js — renderSync export
`renderSync` was already defined at lines 14-17 but not exported. Added `, renderSync` to `module.exports`. Plans 03/04/05 need direct fragment rendering without the OOB injection `respondWithUpdates` applies — this is the prerequisite for all those routes.

### views/partials/library-footer.njk — OOB footer partial
Outer element is `<div id="library-footer" class="library-footer">`. Handles 0/1/plural `unusedCount` cases. No `hx-swap-oob` attribute (added at runtime by `injectOob`). This is the stable OOB swap target Wave 3 + Wave 4 compound responses will target.

### views/layout.njk — HTMX 4xx-swap meta-tag
Inserted after `<meta name="viewport">`, before `<title>`. The `responseHandling` array places `{"code":"400","swap":true}` BEFORE `{"code":"[45]..","swap":false,"error":true}` so HTMX swaps 400 responses into the DOM (first-match wins). The 400 rule omits `"error":true` per D-61 — prevents HTMX from also firing `htmx:responseError`, which would double-trigger the existing error toast. No `<a href="/library">` nav tab added (Wave 5 atomic-tab-launch invariant preserved).

### test/library-routes.test.js — HTTP test scaffold
Mirrors grocery-routes.test.js scaffold pattern: `beforeEach`/`afterEach` with `setupDataDir`/`startTestServer`/`stopTestServer`. Defines `addLibraryEntry(port, fields)` helper for Plans 03-05 to reuse (extracts `lb_` ID from rendered row HTML). Wave 0 smoke: `GET /healthz` returns 200 `ok` — proves server boots without depending on any /library route.

### test/calc.test.js — buildLibraryView import + smoke
Updated top-level destructure to include `buildLibraryView` (resolves to `undefined` until Plan 02). Appended Phase 5 smoke test at bottom with `{ skip: typeof buildLibraryView !== 'function' && 'pending Plan 02' }` — skips cleanly in Wave 0, auto-passes when Plan 02 exports the function.

## Test Counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Full suite (npm test) | 297 pass | 298 pass + 1 skipped | +1 pass (library smoke), +1 skip (calc smoke) |
| test/library-routes.test.js | (new) | 1 pass | +1 |
| test/calc.test.js | 35 pass | 35 pass + 1 skipped | +1 skip |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Wave 0 is infrastructure only — no UI data flows wired yet.

## Threat Flags

None. The `htmx-config` meta tag content is a static JSON literal with no template interpolation (T-05-01-01 mitigated). No new network endpoints or auth paths introduced.

## Self-Check: PASSED

- lib/render.js renderSync export: FOUND (node -e verify passed)
- views/partials/library-footer.njk: FOUND, id="library-footer" present, unusedCount referenced
- views/layout.njk htmx-config: FOUND, code:400 before [45].. confirmed, no nav tab leak
- test/library-routes.test.js: FOUND, 1 pass 0 fail confirmed
- test/calc.test.js: FOUND, 35 pass 1 skipped confirmed
- Commits 7624121, 135292e, d8ea4fd, 2b1ec85, 1adafde: all present in git log
- npm test: 298/299 pass (1 intentional skip), 0 fail
