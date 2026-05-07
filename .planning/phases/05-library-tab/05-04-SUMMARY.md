---
phase: 05-library-tab
plan: 04
subsystem: routes/library
tags: [route, edit-save, alias-conflict, oob-footer, htmx-4xx, lib-05]
dependency_graph:
  requires: [05-01, 05-02, 05-03]
  provides: [POST /library/:id, LIB-05]
  affects: [routes/library.js, test/library-routes.test.js]
tech_stack:
  added: []
  patterns:
    - Compound response: renderSync(row) + injectOob(renderSync(footer)) -- NOT respondWithUpdates
    - 400 inline-error path: renderEditFormError() returns edit-form fragment with aliasError attached
    - aliasConflict(state, alias, excludingId) -- three-arg call prevents self-conflict on edit
    - curated:true forced on every save (spread-override pattern)
key_files:
  created: []
  modified:
    - routes/library.js
    - test/library-routes.test.js
decisions:
  - "POST /library/:id 200 path uses renderSync + injectOob directly instead of respondWithUpdates to avoid hx-swap-oob corruption on the primary row swap target (RESEARCH.md Pitfall 2)"
  - "400 path returns full edit-form fragment (library-row-edit.njk) with user-typed values preserved -- form never closes on error (D-61)"
  - "No setToast on 400 paths -- inline error is the user feedback (D-61)"
  - "setToast('Saved entry') on 200 path -- verb-only, ASCII-safe (D-67)"
  - "curated:true forced via ELS spread + override on every save regardless of prior value (LIB-05)"
  - "aliasConflict called with id as excludingId -- self-alias re-submit is not flagged as conflict (T-05-04-04)"
  - "Nunjucks autoescape wraps single quotes as &#39; in inline error strings -- test regexes use alternation (&#39;|') to cover both representations"
metrics:
  duration: ~20min
  completed: "2026-05-07"
  tasks_completed: 2
  files_modified: 2
  tests_added: 9
  tests_total: 342
---

# Phase 05 Plan 04: POST /library/:id Edit-Save Handler Summary

Edit-save endpoint with 200/400/404 paths, compound row+OOB-footer response, and full alias-conflict + category validation inline-error flows. LIB-05 closed.

## What Was Built

### Task 1: POST /library/:id route handler

Added to `routes/library.js` (before `module.exports`):

- **404 path**: Entry not found in `state.library` → `res.status(404).type('text').send('Not found')`.
- **400 paths (via `renderEditFormError`)**: Missing name / invalid recipeCategory / invalid groceryCategory / alias conflict all return `res.status(400).type('html').send(html)` where `html` is `library-row-edit.njk` rendered with `entry.aliasError` set and the user's typed values preserved. No `setToast` call (D-61).
- **200 path**: Updates `library[idx]` via ELS spread + `curated: true` override, calls `storage.save()`, sets toast `'Saved entry'`, then returns `rowHtml + '\n' + injectOob(footerHtml)` — the read-only row as the primary HTMX swap target plus the OOB-swapped footer.

### Task 2: 9 HTTP tests for POST /library/:id

Appended to `test/library-routes.test.js`:

| # | Test | Assertion |
|---|------|-----------|
| 1 | Updates entry + OOB-swaps footer | status 200; read-only `<li>` (no `<form`); `id="library-footer"`; `hx-swap-oob="true"`; toast `Saved entry`; aliases visible in GET |
| 2 | Sets curated:true on uncurated entry (LIB-05) | `[curated]` badge in row; `state.library[i].curated === true` |
| 3 | No-op self-alias save succeeds (excludingId) | status 200 (not 400) |
| 4 | 400 on missing name | `<form`; `library-alias-error`; `Name is required`; no toast header |
| 5 | 400 on alias conflict with preserved values | error text; `value="cattle"`; `value="apples"`; `<option value="Protein" selected`; stored state unchanged |
| 6 | 400 on invalid recipeCategory | `Invalid recipe category ... Hax` |
| 7 | 400 on invalid groceryCategory | `Invalid grocery category ... Sky` |
| 8 | 404 for unknown id | status 404; body `Not found` |
| 9 | Alias deduplication via Set | status 200; body shows `a, b` not `a, a, b, b` |

## Compound Response Shape (D-63)

```
200 response body:
  <li id="library-row-{id}" class="library-row">   ← primary HTMX outerHTML swap target
    ...                                               (no hx-swap-oob)
  </li>
  <div id="library-footer" ... hx-swap-oob="true">  ← OOB footer update
    ...
  </div>
```

CRITICAL: `respondWithUpdates` was NOT used because it wraps every fragment in `injectOob`, which would add `hx-swap-oob="true"` to the `<li>` row and break the primary outerHTML swap (RESEARCH.md Pitfall 2 / 05-PATTERNS.md "CRITICAL").

## D-61 Confirmation: 400 Inline Error Path

On any validation failure:
1. Form stays open (HTMX swaps the edit-form fragment into `#library-row-{id}` via the `code:400 swap:true` htmx-config rule from Plan 01).
2. User-typed values (`name`, `aliases`, `recipeCategory`, `groceryCategory`) are reconstructed from `req.body`, NOT from the stored entry — so the form shows what the user typed, not stale saved state.
3. `entry.aliasError` is set to the inline error message.
4. NO `setToast` call — the inline `<div class="library-alias-error">` is the user feedback.

## LIB-05 Closure

- `aliasConflict(state, alias, id)` — three-arg call with `id` as `excludingId` prevents self-alias edits from being flagged as conflicts.
- `curated: true` is hard-set in the ELS spread on every save — user cannot un-curate via this route (T-05-04-05).
- `{ ...existing, name, aliases, recipeCategory, groceryCategory, curated: true }` — ELS spread preserves `createdAt` and any future fields per CLAUDE.md extensibility constraint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nunjucks autoescape wraps single quotes as &#39; in error strings**
- **Found during:** Task 2 test run (test 6 and 7 failed)
- **Issue:** Test regex `/Invalid recipe category 'Hax'\./` did not match because Nunjucks `{{ entry.aliasError }}` autoescape converts `'` → `&#39;` in the rendered HTML
- **Fix:** Updated regex patterns in tests 5, 6, 7 to use alternation `(&#39;|')` so tests pass regardless of escaping context. The server-side error string construction is correct — it's pure JavaScript string interpolation (no Nunjucks involved at that point), but the rendered output HTML-encodes the single quotes.
- **Files modified:** `test/library-routes.test.js`
- **Commit:** included in Task 2 commit (a99ac44)

## Phase 5 Progress

| Plan | Requirement | Status |
|------|-------------|--------|
| 05-01 | Wave 0 prerequisites | Complete |
| 05-02 | LIB-02 + LIB-03 (GET /library, buildLibraryView) | Complete |
| 05-03 | LIB-04 (POST /library, GET /:id, GET /:id/edit) | Complete |
| 05-04 | LIB-05 (POST /library/:id save) | **Complete** |
| 05-05 | LIB-06 (DELETE /library/:id) | Pending |
| 05-06 | Nav tab (atomic-tab-launch) | Pending |

## Self-Check

### Commits Exist

- cb770db — feat(05-04): add POST /library/:id save handler (LIB-05)
- a99ac44 — test(05-04): add 9 HTTP tests for POST /library/:id

### Files Exist

- routes/library.js (modified — POST /library/:id handler added)
- test/library-routes.test.js (modified — 9 new tests appended)

## Self-Check: PASSED
