---
phase: 05-library-tab
plan: 06
subsystem: views/layout
tags: [nav-tab, atomic-tab-launch, lib-01, final-wave, phase-5-complete]
dependency_graph:
  requires: [05-01, 05-02, 05-03, 05-04, 05-05]
  provides: [LIB-01, Phase 5 complete]
  affects: [views/layout.njk, test/library-routes.test.js]
tech_stack:
  added: []
  patterns:
    - Atomic-tab-launch: nav link added in the FINAL plan so tab is never visible before routes/templates/tests are green
    - Active-class pattern: {% if activeTab == 'library' %} active{% endif %} matching all 4 prior tabs
key_files:
  created: []
  modified:
    - views/layout.njk
    - test/library-routes.test.js
decisions:
  - "Library tab placed AFTER History (5th position) per REQUIREMENTS.md LIB-01 '5th tab alongside Recipes/This Week/Grocery/History' and CONTEXT.md/wave_plan_guidance -- no disruption to existing muscle memory"
  - "Atomic-tab-launch invariant respected: this is the FINAL plan of Phase 5 and the ONLY place the nav link appears"
  - "Regression test inverted: doesNotMatch -> assert.match with updated test name to reflect post-launch state"
  - "Two additional LIB-01 cross-page and placement tests added to lock the invariant going forward"
metrics:
  duration: ~10min
  completed: "2026-05-07"
  tasks_completed: 2
  files_modified: 2
  tests_added: 2
  tests_modified: 1
  tests_total: 349
---

# Phase 05 Plan 06: Atomic-Tab-Launch (LIB-01 Closure) Summary

## Goal Achieved

LIB-01 closed: the Library tab is now live in the nav. One line added to `views/layout.njk`, the atomic-tab-launch regression test inverted, and two new LIB-01 assertions lock the invariant. Phase 5 is complete -- all six LIB requirements (LIB-01..LIB-06) are functionally green end-to-end.

## Implementation

Single edit to `views/layout.njk`: inserted one `<a>` line after the existing History tab line:

```nunjucks
    <a href="/library" class="tab{% if activeTab == 'library' %} active{% endif %}">Library</a>
```

Tab order is now: Recipes | This Week | Grocery | History | Library. All four pre-existing tab links are byte-identical. The htmx-config meta tag from Plan 01 is unchanged.

`activeTab: 'library'` was already plumbed by `buildLibraryView` in Plan 02 -- the route already returns this value so the active class fires correctly on `GET /library` without any route changes.

## Test Changes

Three edits to `test/library-routes.test.js`:

1. **Inverted regression** (Plan 02 atomic-tab-launch guard): renamed test and changed `assert.doesNotMatch` to `assert.match` -- the Library tab must now be present WITH the active class on `GET /library`.

2. **New test: cross-page inactive state** -- `GET /grocery` renders the Library nav link but without the `active` class (correctly inactive on non-library pages).

3. **New test: placement after History** -- asserts that `href="/library"` appears later in the HTML than `href="/history"` (5th-tab placement locked).

## Commits

- `d296c1d` feat(05-06): add Library nav tab to views/layout.njk (LIB-01)
- `883acbc` test(05-06): invert no-nav-tab regression + add LIB-01 final assertions

## Phase 5 Milestone

All six Phase 5 plans complete. LIB requirements closed:

| Req | Plan | Description |
|-----|------|-------------|
| LIB-01 | 05-06 | Library tab in nav (this plan) |
| LIB-02 | 05-02 | Browse, filter, search |
| LIB-03 | 05-02 | Row content: name, aliases, categories, badges |
| LIB-04 | 05-03 | Manual add form |
| LIB-05 | 05-04 | Inline edit with alias-conflict |
| LIB-06 | 05-05 | Delete with recipes-untouched invariant |

Phase 5 test count: 50+ new tests across `test/calc.test.js` and `test/library-routes.test.js`. Full suite: **349/349 passing**.

## Deviations from Plan

None. Plan executed exactly as written. The two tasks (layout edit + test inversion) each committed individually.

## Known Stubs

None. All library functionality is wired end-to-end.

## Threat Flags

None. The nav link uses static template literals; `activeTab` is a known enum string set by view-builders -- no user input is interpolated.

## Recommendation for Next Steps

Run `/gsd-verify-work 5` to confirm the full Phase 5 goal-backward checklist. Then:

- Update STATE.md / retrospective to reflect Phase 5 completion.
- Phase 6 (Inline Fix / FIX-01..FIX-04) is the next milestone target.
- The inline-edit row-toggle pattern (`library-row.njk` <-> `library-row-edit.njk` via shared outer DOM id) established in Plan 03 is the reusable pattern for the Fix affordance on grocery items and recipe ingredient lines.

## Self-Check: PASSED

- `d296c1d` exists: `git log --oneline | grep d296c1d`
- `883acbc` exists: `git log --oneline | grep 883acbc`
- `views/layout.njk` contains `href="/library"` (1 occurrence)
- `views/layout.njk` contains `activeTab == 'library'` (1 occurrence)
- Library tab positioned after History tab (verified by node assertion)
- `npm test` -> 349/349 passing
- No files missing; no unexpected deletions
