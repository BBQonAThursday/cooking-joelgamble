---
phase: 05-library-tab
plan: 05
subsystem: routes/library
tags: [route, delete, oob-footer, recipes-untouched, lib-06]
dependency_graph:
  requires: [05-01, 05-02, 05-03, 05-04]
  provides: [DELETE /library/:id, LIB-06]
  affects: [routes/library.js, test/library-routes.test.js]
tech_stack:
  added: []
  patterns:
    - Compound response: empty primary body + injectOob(footer) — row removed by HTMX outerHTML on empty target
    - state.library splice; state.recipes untouched (LIB-06 invariant)
    - setToast verb-only ('Removed entry') — D-67 ASCII safety
    - 404 plain text 'Not found' for unknown ids
key_files:
  created: []
  modified:
    - routes/library.js
    - test/library-routes.test.js
decisions:
  - "DELETE /library/:id verb chosen for parity with routes/grocery.js and routes/recipes.js (CONTEXT D-67 Discretion: HTMX hx-delete supports DELETE verb)"
  - "Success response is OOB-footer only — no primary row fragment. HTMX outerHTML on #library-row-:id with an empty/non-OOB primary body removes the row from the DOM (compound-response pattern continued from Plan 04)"
  - "renderSync + injectOob used directly — NOT respondWithUpdates — to keep the row swap target clean (RESEARCH.md Pitfall 2)"
  - "state.recipes is NEVER touched by delete (LIB-06 invariant) — categorization for orphaned ingredient strings falls back to heuristic on next render via existing decorateIngredients/buildGroceryView path"
  - "Toast is generic 'Removed entry' verb-only string — entry.name not interpolated (D-67 / CLAUDE.md HTTP header ASCII rule)"
  - "404 returned for unknown id — plain text 'Not found' matches grocery/recipes convention"
  - "Idempotency confirmed by test: second DELETE on same id returns 404 cleanly (no crash, no partial state)"
metrics:
  duration: ~15min
  completed: "2026-05-07"
  tasks_completed: 2
  files_modified: 2
  tests_added: 5
  tests_total: 347
---

# Phase 05 Plan 05: DELETE /library/:id Summary

## Goal Achieved

LIB-06 closed: `DELETE /library/:id` removes a library entry, returns the updated unused-count footer via OOB swap so HTMX can update the panel footer in place, and provides a verb-only toast. The critical regression invariant (state.recipes is never mutated by delete) is enforced and tested.

## Implementation

`routes/library.js` extended with `router.delete('/library/:id', ...)`. Three response paths:

1. **404** — Unknown id → `res.status(404).type('text').send('Not found')`
2. **200** — Splice from `state.library`, `storage.save()`, `setToast(res, 'Removed entry')`, render footer fragment with `injectOob`, send compound response. HTMX consumes the OOB footer (target `#library-footer`) and the empty primary body removes the row.

The deletion uses `library.splice(idx, 1)` on the array obtained from `storage.get()` — same in-place mutation pattern as the existing grocery routes. `state.recipes` is read but never written; the regression test verifies this with deep-equality before/after.

## Tests

5 new HTTP tests in `test/library-routes.test.js`:

1. **DELETE /library/:id removes entry, returns 200 with OOB footer, correct toast** — happy path
2. **LIB-06 regression — state.recipes deep-equal before/after delete** — critical invariant
3. **DELETE /library/:id 404 for unknown id** — error path
4. **Footer unusedCount pluralization (2 plural, 1 singular)** — verifies the OOB footer reflects updated count
5. **Idempotency — second DELETE on same id returns 404** — no double-delete crash

Full suite: **347/347 passing** (was 342 after Plan 04, +5 new tests).

## Commits

- `f546f26` feat(05-05): add DELETE /library/:id handler (LIB-06)
- `53a8009` test(05-05): add 5 HTTP tests for DELETE /library/:id

## Self-Check: PASSED

- All 2 plan tasks complete and committed individually
- `npm test` → 347/347 passing
- Regression invariant verified by test (state.recipes untouched)
- Toast is verb-only ASCII-safe ('Removed entry')
- Compound-response pattern matches Plan 04 (renderSync + injectOob, not respondWithUpdates)
- 404 path uses plain-text response (matches grocery/recipes convention)
- No nav link `<a href="/library">` added — atomic-tab-launch invariant preserved (Plan 06 owns that edit)
