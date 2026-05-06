# Phase 4: Auto-Extract & Backfill - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 wires the already-shipped `extractAndSeed` (Phase 2) into the live recipe-save path AND runs a one-time startup backfill against pre-existing recipes. After this phase, `state.library` populates itself: every `POST /recipes` seeds unmatched ingredients as `curated: false` entries, and the first server start after deploy walks `state.recipes` exactly once (gated by `state.libraryMigratedAt === null`). Two requirements: EXTR-01 (POST hook) and EXTR-03 (startup backfill).

In scope: new `lib/backfill.js` exporting a pure `runBackfill(state)`; server.js bootstrap wiring (inside the `require.main === module` block, before `app.listen()`); `routes/recipes.js` POST hook after the existing `storage.save()`; defensive non-array-ingredients guard inside `runBackfill`; best-effort try/catch on the POST hook so library failures never demote a successful recipe save; `test/backfill.test.js` (pure, no HTTP) covering the four success criteria around backfill; extension to `test/recipes.test.js` for the auto-extract POST hook.

Out of scope (later phases): Library tab routes/templates (Phase 5), Fix shortcut markup and routes (Phase 6), `lib/calc.js` WR-01 off-list-category robustness fix (deferred from 03-REVIEW), `routes/recipes.js` WR-02 malformed-week-record fix (deferred from 03-REVIEW). No changes to `lib/library.js`, `lib/categorize.js`, or `lib/calc.js` — Phase 4 is a wiring phase, not a behavior-change phase.

</domain>

<decisions>
## Implementation Decisions

### Backfill module shape (EXTR-03 / SC#2 / SC#3 / SC#5)

- **D-37:** **New `lib/backfill.js`** exporting a pure `runBackfill(state) → { alreadyRan: boolean, added: LibraryEntry[], aliasesAppended: { entryId, alias }[] }`. Mirrors the `lib/library.js` purity rule — no `fs`, no `http`, no `require('./storage')`. State is passed in by the caller; the function only mutates `state.library` and `state.libraryMigratedAt` on the same `state` object. Tests use plain state objects (no `setupDataDir`, no HTTP).

- **D-38:** **Idempotency guard:** `runBackfill` returns immediately with `{ alreadyRan: true, added: [], aliasesAppended: [] }` when `state.libraryMigratedAt` is a non-null string (any truthy value). Mirrors `state.libraryMigratedAt` as the canonical guard from Phase 1 D-10 — `library.length === 0` is NOT an acceptable substitute (user library cleanup must not retrigger backfill, see STATE.md "Pitfall Guards Active").

- **D-39:** **Walk shape:** `for (const recipe of state.recipes) extractAndSeed(state, recipe.ingredients)` — once per recipe in `state.recipes` insertion order. Matches the live `POST /recipes` semantics exactly: cross-recipe duplicates collapse only via the library-first check (Phase 2 D-20 step 2), not via aggressive in-progress collapse. Backfill state is byte-equivalent to "every recipe was POSTed in turn". Rejected: flat aggregate (`recipes.flatMap(r => r.ingredients)`) — would produce fewer entries than the steady-state path, diverging backfill from steady-state semantics.

- **D-40:** **Defensive guard before extractAndSeed:** `if (!Array.isArray(recipe.ingredients)) { console.warn('[backfill] skipping recipe', recipe.id, '- no ingredients array'); continue; }`. Surfaces the malformed-recipe case as an explicit warning. Without it, `extractAndSeed`'s tolerant return (line 294-296 of `lib/library.js`) silently succeeds on `{ added: [], aliasesAppended: [] }` — the user would never know a recipe got skipped. Distinct from generic exception handling (D-41).

- **D-41:** **Per-recipe try/catch for unexpected throws:** wrap each `extractAndSeed(state, recipe.ingredients)` call in `try/catch`. On error: `console.error('[backfill] failed for recipe', recipe.id, err.message)` and continue to the next recipe. After the loop completes (success or partial), `state.libraryMigratedAt = new Date().toISOString()` is set unconditionally — partial backfill is committed. Backfill never re-runs on the next start. Rationale: matches the "storage corruption uses defaults, doesn't crash" pattern in `lib/storage.js#load`. Trades "one bad recipe blocks server start forever" for "user fixes the gap via Phase 5's Library tab later". Rejected: leave timestamp null on partial failure (re-runs every restart, same logs forever); hard-fail (one malformed recipe wedges launch).

- **D-42:** **Success/empty signaling:** `runBackfill` returns `alreadyRan: false` on the FIRST run (regardless of whether anything was added — an empty `state.recipes` still flips the timestamp). Caller decides whether to log. Empty-recipe edge case is part of the SC#3 idempotency contract: a second start sees `libraryMigratedAt !== null` and short-circuits.

### Server bootstrap wiring (EXTR-03 / SC#5 / test isolation)

- **D-43:** **Boot site:** `runBackfill` runs **inside the `if (require.main === module)` block** in `server.js`, after `createApp()` and before `app.listen(...)`. `createApp()` itself stays pure — it does NOT call backfill. This preserves test isolation: `test/_helpers.js#startTestServer` calls `createApp()` for every test; with backfill inside `createApp` it would fire on every test boot and force every existing route test to assert about (or set up) `state.library`. By keeping backfill in the launch site, only the production startup path runs it.

  ```js
  // server.js (require.main block)
  if (require.main === module) {
    const app = createApp();
    const storage = require('./lib/storage');
    const { runBackfill } = require('./lib/backfill');
    const result = runBackfill(storage.get());
    if (!result.alreadyRan) {
      storage.save();
      console.log(`Backfilled ${result.added.length} library entries from ${storage.get().recipes.length} recipes`);
    }
    app.listen(PORT, HOST, () => { ... });
  }
  ```

- **D-44:** **SC#5 satisfied by call ordering:** `runBackfill` returns synchronously before `app.listen()` is invoked — no listener is bound during the backfill window, so no request can be served against partial library state. SC#5 is enforced structurally by the call ordering, not by an explicit mutex.

- **D-45:** **`storage.save()` after backfill:** called once at the bootstrap site (NOT inside `runBackfill`) when `result.alreadyRan === false`. Persists the new `state.library` entries AND the new `libraryMigratedAt` timestamp atomically via the existing temp-rename pattern (`lib/storage.js#persist`). Rationale: keeps `lib/backfill.js` pure (no `fs`, no `require('./storage')`) and matches the import-direction rule from STATE.md.

### POST /recipes auto-extract hook (EXTR-01 / SC#1)

- **D-46:** **Hook site:** in `routes/recipes.js`, AFTER the existing `storage.save()` at line 42 and BEFORE `setToast(...)` at line 44. Inside the existing `try` block but wrapped in a NESTED `try/catch` so library-extract failures never bubble to the outer `next(err)` (which would 500 the recipe-save response).

  ```js
  // routes/recipes.js (after line 42's storage.save())
  try {
    const result = extractAndSeed(state, entry.ingredients);
    if (result.added.length || result.aliasesAppended.length) {
      storage.save();
    }
  } catch (err) {
    console.error('[extract] failed for recipe', entry.id, err.message);
  }
  // existing setToast + respondWithUpdates follow
  ```

- **D-47:** **Second-save trigger:** EXACTLY `result.added.length || result.aliasesAppended.length` (per Phase 2 D-20 step 5 / SC#1). When neither is non-empty, no second `storage.save()` is called — the recipe save from line 42 is the only persist. This is the structural mechanism that delivers SC#1's "no second save when all ingredients were already matched."

- **D-48:** **POST failure policy: best-effort with success toast.** If `extractAndSeed` throws, the recipe is still saved and the user sees `Saved: ${title}` (existing toast at line 44 — unchanged). The error is logged via `console.error` only. Rationale: "recipe save is the user's intent; library is housekeeping" — failing the user's primary action because of a secondary bookkeeping failure is the wrong tradeoff. Library catches up the next time the recipe is saved or via Phase 5's manual curation. Rejected: bubble to 500 (state mutation already happened — UI says fail when it actually succeeded; worst of both worlds), degraded-toast `Saved: ${title} (library skipped)` (premature noise on the happy path; revisit if extractAndSeed throws are observed in practice).

- **D-49:** **Update-path symmetry:** the auto-extract hook fires on BOTH the create branch (`existingIdx < 0`) and the update branch (`existingIdx >= 0`) — `extractAndSeed` is library-first (Phase 2 D-20 step 2), so re-saving an existing recipe with the same ingredients is a no-op (`added.length === 0 && aliasesAppended.length === 0`) and the second `storage.save()` is correctly skipped. No special-casing needed.

### Test strategy

- **D-50:** **Test coverage split:**
  - `test/backfill.test.js` (NEW) — covers SC#2 (timestamp set + library populated), SC#3 (idempotency: call `runBackfill` twice on the same state, assert `state.library.length` unchanged), SC#4 (peanut butter → groceryCategory: 'Aisle' after backfill), and the failure-policy decisions: D-40 non-array-ingredients skip, D-41 per-recipe-throw recovery, partial-backfill timestamp commit. Plain state objects, NO `setupDataDir`, NO HTTP.
  - `test/recipes.test.js` (EXTEND) — covers SC#1 (POST hook): new recipe save grows `state.library`; re-saving same URL with same ingredients does NOT trigger a second `storage.save()` (verified by checking `state.library.length` is stable). Best-effort failure: monkey-patch `extractAndSeed` to throw, assert recipe still saves and toast still says `Saved: ...`.
  - NO new HTTP-level test for SC#5 — call ordering in `server.js` is the proof; `test/backfill.test.js` covering SC#3 idempotency on the pure path is sufficient.

- **D-51:** **No modification of existing tests.** Phase 3 SC#5 ("All existing tests pass without modification") carries forward. Existing `test/recipes.test.js` tests don't currently observe `state.library`, so the new POST hook is invisible to them — their assertions still pass. Verified by mentally walking the "POST same URL twice updates rather than duplicates" test: first POST seeds 'salt'; second POST is library-first match → no new entry → no second save → no observable change to existing assertions.

### Claude's Discretion

- **Log line format:** `[backfill] ...` and `[extract] ...` prefixes for log lines. Matches the existing `console.warn('Could not load state, using defaults:', err.message)` style from `lib/storage.js:49`. No structured logger — `console.warn`/`console.error` only.
- **Backfill summary log:** `console.log` after `storage.save()` reports `Backfilled N library entries from M recipes`. Single-line, ASCII-only (no em-dashes, no Unicode), informational only — does NOT block startup if it fails.
- **`runBackfill` return-shape inclusion of `aliasesAppended`:** included even though `extractAndSeed` cannot append aliases during a from-empty backfill (no existing entries to append to). Future-proofs against a scenario where a partial backfill is interrupted and resumes — the loop accumulates aliases into already-seeded entries from earlier in the same call. Cheap to track; tests don't need to assert on it but the surface is uniform with `extractAndSeed`'s contract.
- **Test fixture:** `test/backfill.test.js` constructs state objects inline (mirrors `test/library.test.js` style). Recipe shape: `{ id, title, ingredients: [...] }` — only `ingredients` is exercised by `runBackfill`. No need for full recipe fields (sourceUrl, totalMinutes, etc.).
- **Empty-recipes edge case:** `state.recipes = []` with `libraryMigratedAt: null` → `runBackfill` runs the empty for-loop, sets `libraryMigratedAt`, returns `alreadyRan: false, added: [], aliasesAppended: []`. Caller's `if (!result.alreadyRan) storage.save()` correctly persists the timestamp flip. Tested explicitly.
- **`createApp()` test for non-regression:** existing `test/recipes.test.js` already exercises `createApp()` heavily through `_helpers.startTestServer`. No new test required to verify "createApp doesn't run backfill" — if it did, every existing route test would start observing seeded library state and fail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & locked decisions
- `.planning/PROJECT.md` — Core value (convergence toward accuracy via curation), out-of-scope list (no recipe-string mutation, no nutrition, no exports), key decisions table (auto-extract on save, library-first matching).
- `.planning/REQUIREMENTS.md` §EXTR — EXTR-01 (POST /recipes synchronous extractAndSeed after storage.save; second save only on changes), EXTR-03 (server-startup backfill walks state.recipes when libraryMigratedAt is null, sets timestamp, persists once). EXTR-02 and EXTR-04 already shipped in Phase 2.
- `.planning/STATE.md` — "Key Decisions Locked In" — `libraryMigratedAt` (not `library.length === 0`) is the backfill guard; backfill runs at server startup, synchronously, before accepting requests; pre-existing todos for Phase 4 (lines 119-121).
- `.planning/ROADMAP.md` §"Phase 4: Auto-Extract & Backfill" — 5 success criteria, dependencies on Phase 2 + Phase 3.

### Prior phase context (locked decisions to honor)
- `.planning/phases/02-library-helpers/02-CONTEXT.md` D-20 — extractAndSeed per-ingredient ordering (normalize → library-first → in-progress collapse → seed). Phase 4 calls into this exact contract per recipe.
- `.planning/phases/02-library-helpers/02-CONTEXT.md` D-21 — alias auto-append gated by aliasConflict; never blocks the second save decision.
- `.planning/phases/02-library-helpers/02-CONTEXT.md` "Claude's Discretion → extractAndSeed return shape" — `{ ok: true, added, aliasesAppended }`. The `added.length || aliasesAppended.length` second-save trigger (D-47) is locked here, called out in EXTR-01.
- `.planning/phases/01-foundation/01-CONTEXT.md` D-09, D-10 — `state.library = []` and `state.libraryMigratedAt = null` migration in `lib/storage.js`. Phase 4 reads `libraryMigratedAt` as the backfill idempotency guard.
- `.planning/phases/01-foundation/01-CONTEXT.md` D-01 — pea-bug fix (bilateral `\b{kw}\b` regex). Phase 4 SC#4 ("peanut butter → Aisle after backfill") rides on Phase 1's heuristic fix being already live.

### Existing code & conventions
- `.planning/codebase/CONVENTIONS.md` — CommonJS, 2-space indent, single quotes, `*.test.js` colocated under `test/`, named exports only.
- `.planning/codebase/ARCHITECTURE.md` — Pure helpers in `lib/`, side effects in `routes/` and `server.js`. Atomic temp-file rename in `lib/storage.js#persist`.
- `.planning/codebase/TESTING.md` — `node:test`; pure-helper tests use plain state objects (no `setupDataDir`); HTTP tests use `helpers.setupDataDir + startTestServer`.
- `.planning/codebase/CONCERNS.md` — HTTP header ASCII-only constraint (relevant if backfill toast is ever surfaced — currently console-only). Storage atomic-rename caveat (acceptable for Pi/Linux deployment).
- `./CLAUDE.md` — Render-time categorization rule (no precomputed categories on stored items); HTTP header ASCII safety; library entries take priority over heuristic.

### Files to create or modify in Phase 4
- `lib/backfill.js` — **NEW.** Exports `runBackfill(state)`. Pure helper, no `fs`/`http`/`storage` imports. Imports `extractAndSeed` from `./library`.
- `server.js` — Add `runBackfill` invocation inside the `if (require.main === module)` block (line 41-48 today), after `createApp()` and before `app.listen(...)`. Adds a single `console.log` summary line on first-run completion. `createApp()` itself is unchanged.
- `routes/recipes.js` — Add nested try/catch hook after the existing `storage.save()` at line 42; calls `extractAndSeed(state, entry.ingredients)` and triggers a second `storage.save()` only when `result.added.length || result.aliasesAppended.length`. Imports `extractAndSeed` from `../lib/library`.
- `test/backfill.test.js` — **NEW.** Pure tests for `runBackfill`: idempotency (SC#3), peanut butter category (SC#4), non-array-ingredients skip (D-40), per-recipe-throw recovery (D-41), partial-backfill timestamp commit, empty-recipes edge case.
- `test/recipes.test.js` — **EXTEND.** New tests for POST /recipes auto-extract: new save grows library; same-URL re-save is library-first no-op; extractAndSeed throw → recipe still saves and toast unchanged.

### Phase 3 carryovers explicitly NOT addressed in Phase 4 (deferred — see `<deferred>`)
- 03-REVIEW WR-01: render-layer crash on off-list categories. Out of scope — Phase 4 doesn't touch `lib/calc.js`. Tracked in STATE.md todos line 122.
- 03-REVIEW WR-02: `routes/recipes.js` GET /recipes/:id malformed-week-record crash. Out of scope — Phase 4 only touches the POST handler.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/library.js#extractAndSeed` (lines 291-387)** — The Phase 2 helper Phase 4 calls. Returns `{ ok: true, added, aliasesAppended }`. Phase 4 makes NO changes to this function — it's the contract Phase 4 builds against.
- **`lib/storage.js#persist`/`save` (lines 27-33, 56)** — Existing atomic temp-rename. Phase 4's backfill commit and POST-hook second save both use the unmodified `storage.save()`.
- **`routes/recipes.js` POST handler (lines 16-49)** — Existing structure: scrape → ID derivation → `state.recipes` mutate → `storage.save()` → toast → `respondWithUpdates`. Phase 4 inserts a nested try/catch between `storage.save()` and `setToast`.
- **`server.js` `if (require.main === module)` block (lines 41-48)** — Existing bootstrap site for production launch. Phase 4 adds three lines (storage.get, runBackfill, conditional save+log) before `app.listen`. `createApp()` itself is untouched.
- **`test/_helpers.js#startTestServer` (lines 25-40)** — Calls `createApp()` per test. Phase 4 keeps `createApp()` backfill-free so existing route tests stay isolated from `state.library` state (no per-test backfill noise).

### Established Patterns
- **Pure helpers in `lib/`** — `lib/backfill.js` strictly follows. No `require('node:fs')`, no `require('./storage')`. Mirrors `lib/library.js` and `lib/calc.js`'s testability profile.
- **Tolerant inputs in helpers** — Phase 2's `extractAndSeed` already handles non-array `ingredients` and non-object state (lines 294-298). `runBackfill` adds an EXTRA per-recipe guard (D-40) for surfacing the malformed-data case as a warning, distinct from extractAndSeed's silent tolerance.
- **`{ ok, ... }` result shape** — `runBackfill` returns `{ alreadyRan, added, aliasesAppended }`. The `alreadyRan` field replaces the usual `ok` flag because the function genuinely cannot fail at the orchestration level (per-recipe failures are absorbed by D-41).
- **Console-based logging** — matches the existing `console.warn('Could not load state, using defaults:', err.message)` (storage.js:49) and `console.error(err)` (server.js:34) patterns. No structured logger introduced.
- **`require.main === module` boot guard** — server.js already separates "module export for tests" (`createApp`) from "production launch" (the bootstrap block). Phase 4 lands the backfill on the production-launch side of this seam.

### Integration Points
- `lib/backfill.js` → `lib/library.js`: NEW import — `extractAndSeed`. Backfill is a thin orchestrator over the existing helper.
- `server.js` → `lib/backfill.js`: NEW import inside the bootstrap block only.
- `server.js` → `lib/storage.js`: existing import (line 27 today, used by `app.get('/')`); reused in the bootstrap block for `storage.get()` and `storage.save()`.
- `routes/recipes.js` → `lib/library.js`: NEW import — `extractAndSeed`. Routes already import from `../lib/calc`, `../lib/scrape`, `../lib/id`, `../lib/render`, `../lib/storage`; library import is consistent with established route-imports-many-libs pattern.
- `lib/library.js` → `lib/categorize.js`: UNCHANGED. Phase 4 does not extend the library/categorize import edge.
- Future Phase 5 (Library tab routes) — will read `state.library` populated by Phase 4. No coupling beyond the state shape.
- Future Phase 6 (Fix shortcut) — relies on auto-seeded uncurated entries from Phase 4 to surface `Categorize` affordances; Phase 4's `curated: false` default (already locked in Phase 2 D-20 step 4) is the seam.

</code_context>

<specifics>
## Specific Ideas

- The pure `lib/backfill.js` + bootstrap-only invocation (D-37, D-43) is the structural mechanism that lets `test/backfill.test.js` cover SC#3 idempotency without HTTP fixtures: state is plain JS, two consecutive `runBackfill(state)` calls assert library count is stable, takes ~1ms vs spinning up an Express app twice.
- D-39's per-recipe walk (vs flat aggregate) is the "boring is correct" choice: backfill should produce identical state to "every recipe was POSTed in turn." Any other walk shape introduces a divergence the user has to reason about later.
- D-41's "skip + log + commit timestamp" failure policy is the explicit answer to "what if a single bad recipe wedges server start forever?" — chosen because the recovery path is well-defined (Phase 5 Library tab lets the user manually seed the gap) and the alternative (hard-fail or retry-forever) is operationally hostile on a single-user Pi deployment with no remote access.
- D-43's bootstrap-block placement (vs inside `createApp()`) is the load-bearing choice for test isolation: `createApp()` is called per-test by `_helpers.startTestServer`, and shoving backfill into it would force every existing route test to either set `libraryMigratedAt: '...'` upfront or assert on a now-seeded library. The bootstrap-only placement keeps the test surface unchanged while still satisfying SC#5 (synchronous-before-listen) via call ordering.
- D-46's nested try/catch on the POST hook is the "don't lose the user's primary action" rule applied concretely: the recipe save at line 42 already succeeded; an exception in the secondary library-extract step would otherwise hit the outer `next(err)` and produce a 500 response that contradicts the on-disk state. The inner catch ensures the response always reflects the authoritative recipe-save outcome.

</specifics>

<deferred>
## Deferred Ideas

- **03-REVIEW WR-01:** `lib/calc.js` render-layer crash on off-list library categories. Out of scope for Phase 4 (no calc.js changes). Already an active todo in STATE.md (line 122). Recommended fix is `buckets.get(category) || buckets.get('Other')` in two places — small enough to land via `/gsd-code-review 3 --fix` separately.
- **03-REVIEW WR-02:** `routes/recipes.js` GET /recipes/:id malformed-week-record crash. Out of scope — Phase 4 only touches the POST handler.
- **Backfill progress reporting for very large recipe collections.** No current need (single-user Pi with ~13 recipes). If `state.recipes.length` ever climbs to thousands, consider streaming a progress log every N recipes during `runBackfill`. Defer until observed.
- **Concurrent boot race.** If two `server.js` processes started simultaneously against the same data dir, both would observe `libraryMigratedAt === null`, both would run backfill, last write wins. Acceptable: deployment is single-process via systemd; concurrent boots aren't part of the trust model. Documented in `.planning/codebase/CONCERNS.md` "Race Conditions & Concurrency".
- **Surfacing extract failures to the user.** D-48 chose silent `console.error` for POST hook failures. If extract failures become observed in practice, revisit with the degraded-toast variant (`Saved: ${title} (library skipped)`) — toast is already ASCII-safe (parens are 0x28/0x29). Defer until a real failure mode surfaces.
- **Backfill progress on Phase 5 Library tab.** Phase 5's "Uncurated" filter will surface the Phase 4 backfill output. Note for Phase 5 planner: the `curated: false` default from Phase 2 D-20 step 4 is the seam — backfilled entries are uncurated by definition.
- **Aliases-appended counter reporting.** D-37's `runBackfill` returns `aliasesAppended` even though it's empty for from-empty backfills. If a future "rescan recipes against newly-curated entries" feature lands (hypothetical), the same `runBackfill` shape would carry that counter. Not Phase 4 work.

</deferred>

---

*Phase: 4-Auto-Extract & Backfill*
*Context gathered: 2026-05-06*
