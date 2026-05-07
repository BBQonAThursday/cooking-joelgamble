---
plan: 04-02
phase: 04-auto-extract-backfill
status: complete
completed: 2026-05-07
requirements: [EXTR-03]
tasks_completed: 1
files_changed:
  - server.js (modified — bootstrap block extended)
tests_added: 0
tests_total_after: 294
self_check: PASSED
---

# Plan 04-02 Summary — server.js bootstrap wiring

## Objective

Wire `runBackfill(storage.get())` into the production bootstrap path —
inside the existing `if (require.main === module)` block in `server.js`,
between `createApp()` and `app.listen(...)` (D-43). On `alreadyRan === false`,
persist via `storage.save()` and log a single ASCII summary line (D-45).
`createApp()` itself stays unchanged so test isolation (D-51) is preserved.

## Diff applied

12 lines inserted between line 44 (`const PORT = ...`) and the existing
`app.listen(PORT, HOST, ...)` block. The new section:

```javascript
  // [PHASE 4 EXTR-03] Auto-extract & backfill: synchronous, before app.listen.
  // SC#5 satisfied structurally: no listener bound until backfill completes (D-44).
  const storage = require('./lib/storage');
  const { runBackfill } = require('./lib/backfill');
  const state = storage.get();
  const result = runBackfill(state);
  if (!result.alreadyRan) {
    storage.save();
    console.log(`Backfilled ${result.added.length} library entries from ${state.recipes.length} recipes`);
  }
```

## Acceptance criteria — verification

| Check | Result |
|-------|--------|
| `require\('\./lib/backfill'\)` in server.js | 1 match ✓ |
| `runBackfill\(state\)` (call site) | 1 match ✓ |
| `!result\.alreadyRan` | 1 match ✓ |
| `Backfilled .* library entries from` | 1 match ✓ |
| `const storage = require\('\./lib/storage'\)` inside require.main block | yes (line 48) ✓ |
| `runBackfill` does NOT appear inside `function createApp() { ... }` body (lines 5-39) | confirmed ✓ |
| `module.exports = \{ createApp \}` still present | line 62 ✓ |
| `npm test` exit code | 0 (294/294) ✓ |
| createApp() body byte-identical to pre-change | confirmed ✓ |

## Deviation

The plan's acceptance criterion `grep -c "runBackfill" server.js` returns 1
contradicts the plan's own code snippet, which has two references (one
require destructure, one call). Followed the snippet — both references are
necessary. Recommend correcting the criterion to count just call sites
(`grep -c "runBackfill(state)"` → 1) or splitting the criterion into "import
exactly once" + "call exactly once" if a future plan re-uses the pattern.

## SC#5 structural proof

`runBackfill`, `storage.save()`, and the `console.log` are synchronous calls
on the same tick. `app.listen(PORT, HOST, ...)` is the FIRST async-binding
call after the new block. There is no `await`, no `Promise`, no `setTimeout`.
Reading the diff is sufficient to confirm SC#5; no test required (D-50).

## Test isolation (D-51 carryover)

`test/_helpers.js#startTestServer` calls `createApp()` directly — never the
`if (require.main === module)` block. Backfill never runs during a test
boot, so the seeded library state from production startup cannot leak into
any of the 284 existing tests. All 13 tests in `test/recipes.test.js` and
the 271 other tests still pass without modification.

## Self-Check

- [x] Bootstrap block calls `runBackfill(storage.get())` between
  `createApp()` and `app.listen()`
- [x] Conditional `storage.save()` + `console.log` only fire on
  `alreadyRan === false`
- [x] `createApp()` body byte-identical
- [x] `module.exports = { createApp };` unchanged
- [x] Full test suite green (294/294 — 284 prior + 10 new from 04-01)
- [x] No new test file (Wave 2 / Plan 02 is server-only)

**Self-Check: PASSED**
