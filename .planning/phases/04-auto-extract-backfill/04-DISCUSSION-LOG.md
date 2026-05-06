# Phase 4: Auto-Extract & Backfill - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 4-auto-extract-backfill
**Areas discussed:** Backfill module shape, Backfill failure recovery, Auto-extract failure on POST, Backfill walk shape, Boot site, Defensive guard

---

## Backfill module shape

| Option | Description | Selected |
|--------|-------------|----------|
| New `lib/backfill.js` (Recommended) | Pure `runBackfill(state)` returns `{ added, aliasesAppended, alreadyRan }`. server.js imports it, calls `storage.save()` and sets `libraryMigratedAt`. Mirrors lib/library.js purity rule — unit-testable with plain state objects, no HTTP needed for SC#3 idempotency. | ✓ |
| Inline in `server.js` | ~15 lines in createApp() (or in the require.main block) before app.listen(). Smaller diff, no new module. Testing SC#3 requires HTTP-level fixtures — spin up server twice against the same data dir. | |

**User's choice:** New `lib/backfill.js` (Recommended) — preview locked the shape `runBackfill(state) → { alreadyRan, added, aliasesAppended }`, with server.js doing only the side-effect orchestration (`storage.save()` and the timestamp persist).
**Notes:** Aligns with the established Phase 1+2+3 purity pattern in `lib/`. Captured as D-37, D-38, D-42, D-45.

---

## Backfill failure recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Skip + log, commit timestamp (Recommended) | Per-recipe try/catch: log the recipe id + error, continue to next. After loop, set `libraryMigratedAt` regardless (partial backfill is committed). User curates gaps later via Phase 5's Library tab. Avoids wedging server start on bad data. | ✓ |
| Skip + log, leave timestamp null | Same try/catch but DO NOT set timestamp on partial failure. Backfill retries every restart until ALL recipes succeed. Risk: bad recipe re-fires every boot; logs forever. | |
| Hard-fail server start | Throw out of runBackfill, server.js exits. Loud but guarantees no partial library state. Cost: a single malformed legacy recipe blocks app launch. | |
| Skip recipes with non-array ingredients only | Defensive guard before extractAndSeed: skip silently, real exceptions still bubble. Cleaner middle ground for the 'truly corrupt' case vs 'arbitrary error' case. | |

**User's choice:** Skip + log, commit timestamp (Recommended).
**Notes:** Recovery path is well-defined (Phase 5 Library tab handles seeding gaps). The fourth option's "non-array guard" idea was folded back in via the separate "Defensive guard" question below — it's now an EXPLICIT additional safeguard (D-40), not a substitute for D-41's exception handling. Captured as D-40, D-41.

---

## Auto-extract failure on POST

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort: catch, log, success toast (Recommended) | Wrap extractAndSeed in try/catch. On error, console.error + setToast(`Saved: ${title}`) — recipe is saved cleanly, library lagged silently. Library catches up next time the recipe is re-saved. | ✓ |
| Bubble to 500 | Let it throw, hits global error handler. Recipe is in state.json (saved successfully) but user sees 'Server error: ...'. Inconsistent: state mutation happened but UI says fail. | |
| Best-effort + degraded toast | Catch, log, but setToast(`Saved: ${title} (library skipped)`). User sees partial-success outcome explicitly. ASCII-safe. Slight noise on the happy path. | |

**User's choice:** Best-effort: catch, log, success toast (Recommended).
**Notes:** "Recipe save is the user's intent; library is housekeeping." Captured as D-46, D-48. Degraded-toast variant left as a deferred fallback if extract-throws are observed in practice.

---

## Backfill walk shape

| Option | Description | Selected |
|--------|-------------|----------|
| Once per recipe in state.recipes order (Recommended) | for (recipe of state.recipes) extractAndSeed(state, recipe.ingredients). Matches the live POST /recipes path exactly — same collapse semantics, same alias-append behavior. Cross-recipe duplicates collapse only via library-first check. | ✓ |
| Flat aggregate — single extractAndSeed call | extractAndSeed(state, recipes.flatMap(r => r.ingredients)). Maximally aggressive in-progress collapse: 'garlic' from Recipe A and 'minced garlic' from Recipe B fold into ONE entry. Fewer entries seeded, but bypasses recipe-scoped semantics the live POST uses. | |
| Per-recipe, but order by addedAt ASC | Sort state.recipes by addedAt ascending before walking. Deterministic 'oldest recipe seeds canonical entry' semantics. | |

**User's choice:** Once per recipe in state.recipes order (Recommended).
**Notes:** "Backfill state is byte-equivalent to 'every recipe was POSTed in turn.'" Captured as D-39. addedAt-ordering rejected — insertion order is fine for current ~13-recipe corpus and matches the live save path's natural order.

---

## Boot site

| Option | Description | Selected |
|--------|-------------|----------|
| Inside the require.main block (Recommended) | runBackfill + storage.save() inside `if (require.main === module)` after createApp() and before app.listen(). createApp() stays pure — tests are unaffected. test/backfill.test.js exercises runBackfill(state) directly without HTTP. | ✓ |
| Inside createApp() | Backfill runs every time createApp() is called — including every existing recipes/grocery/weeks-routes test. Risk: existing tests start observing seeded library state. SC#5 is more literal but at the cost of test isolation. | |
| Exported helper called by both | createApp() does NOT call backfill. Export a separate maybeBackfill() function. require.main block calls it; tests can opt-in. Most flexible but adds an extra surface. | |

**User's choice:** Inside the require.main block (Recommended).
**Notes:** Test isolation is load-bearing. createApp() is called per-test by `test/_helpers.js#startTestServer`; running backfill inside it would force every existing route test to either set up `libraryMigratedAt` or assert on seeded library state. SC#5 is satisfied by call ordering (runBackfill returns synchronously before app.listen). Captured as D-43, D-44, D-45.

---

## Defensive guard

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — explicit skip + log (Recommended) | Before extractAndSeed: `if (!Array.isArray(recipe.ingredients)) { console.warn('[backfill] skipping recipe', recipe.id, '- no ingredients array'); continue; }`. Surfaces malformed-recipe case as warning, distinct from extractAndSeed's silent tolerance. | ✓ |
| No — trust extractAndSeed's tolerance | extractAndSeed already returns `{ ok: true, added: [], aliasesAppended: [] }` on non-array ingredients. Calling it is a no-op cost. Simpler call site; no warning noise. | |
| Yes, but silent skip (no log) | Add the guard for clarity but no warning. Minimal noise, slightly more readable orchestrator. | |

**User's choice:** Yes — explicit skip + log (Recommended).
**Notes:** Surfaces the "data sneaks in malformed" case so the user notices via console output. Distinct from D-41's generic exception handling. Captured as D-40.

---

## Claude's Discretion

- Log line prefixes: `[backfill] ...` and `[extract] ...` matching existing `console.warn/error` style in lib/storage.js:49 and server.js:34.
- Backfill summary `console.log` after first-run completion: `Backfilled N library entries from M recipes` — single-line, ASCII-only, informational.
- `runBackfill` includes `aliasesAppended` in its return shape even though it's always empty for from-empty backfills — uniform with extractAndSeed's contract.
- Test fixture style: plain state objects in `test/backfill.test.js` mirroring `test/library.test.js` style. Recipe shape minimal — only `id`, `title`, `ingredients` exercised.
- Empty-recipes edge case: `state.recipes = []` with `libraryMigratedAt: null` — runs the empty for-loop, flips timestamp, returns `alreadyRan: false, added: [], aliasesAppended: []`. Caller's conditional save persists the timestamp flip.

## Deferred Ideas

- 03-REVIEW WR-01 (calc.js off-list-category crash) — out of scope, tracked in STATE.md todos.
- 03-REVIEW WR-02 (routes/recipes.js malformed-week crash) — out of scope, GET handler not touched in Phase 4.
- Backfill progress reporting for large recipe collections — defer until corpus exceeds thousands.
- Concurrent boot race — out of trust model (single-process systemd deployment).
- Degraded-toast variant for POST extract failures — revisit if failure modes surface.
- Phase 5 surfacing of curated:false backfill entries — note for Phase 5 planner.
- Aliases-appended counter for hypothetical "rescan recipes against newly-curated entries" — not Phase 4.
