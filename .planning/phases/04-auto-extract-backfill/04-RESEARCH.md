# Phase 4: Auto-Extract & Backfill - Research

**Researched:** 2026-05-06
**Domain:** Wiring/integration — pure orchestration helper + bootstrap call ordering + nested route hook
**Confidence:** HIGH

## Summary

Phase 4 is a wiring phase, not a behavior-change phase. Three integration sites: (1) a new pure helper `lib/backfill.js` exporting `runBackfill(state)`, (2) a four-line bootstrap insertion inside the `if (require.main === module)` block in `server.js`, and (3) a nested try/catch hook in `routes/recipes.js` between the existing `storage.save()` (line 42) and `setToast` (line 44). The Phase 2 contract `extractAndSeed(state, ingredients) -> { ok, added, aliasesAppended }` is the contract Phase 4 calls; no changes to `lib/library.js`. The five success criteria fall out structurally — SC#1 from the second-save trigger expression `result.added.length || result.aliasesAppended.length`, SC#2/SC#3 from the `state.libraryMigratedAt` truthy short-circuit, SC#4 from Phase 1 D-01's already-shipped `\b{kw}\b` pea-bug regex flowing through `extractAndSeed -> recipeCategoryOf/groceryCategoryOf` to seeded entries, SC#5 from synchronous call ordering before `app.listen()` (no listener bound during the backfill window).

Test isolation hinges on keeping backfill OUT of `createApp()` — `test/_helpers.js#startTestServer` calls `createApp()` per test, so any backfill there would force every existing route test to either preset `libraryMigratedAt` or assert about a now-seeded library. By landing backfill exclusively in the bootstrap block, the existing 284-test suite stays unmodified (SC#5 carryover from Phase 3 D-51).

**Primary recommendation:** Two new tasks (lib/backfill.js + tests/backfill.test.js) form Wave 1, two integration tasks (server.js bootstrap + routes/recipes.js hook + tests/recipes.test.js extension) form Wave 2 (depends on Wave 1's runBackfill being exported). All commits are additive — no existing code is rewritten, only inserted into.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Backfill module shape (EXTR-03 / SC#2 / SC#3 / SC#5)**

- **D-37:** New `lib/backfill.js` exporting a pure `runBackfill(state) → { alreadyRan: boolean, added: LibraryEntry[], aliasesAppended: { entryId, alias }[] }`. Mirrors the `lib/library.js` purity rule — no `fs`, no `http`, no `require('./storage')`. State is passed in by the caller; the function only mutates `state.library` and `state.libraryMigratedAt` on the same `state` object. Tests use plain state objects (no `setupDataDir`, no HTTP).
- **D-38:** Idempotency guard — `runBackfill` returns immediately with `{ alreadyRan: true, added: [], aliasesAppended: [] }` when `state.libraryMigratedAt` is a non-null string (any truthy value). `library.length === 0` is NOT an acceptable substitute (user library cleanup must not retrigger backfill).
- **D-39:** Walk shape — `for (const recipe of state.recipes) extractAndSeed(state, recipe.ingredients)` — once per recipe in `state.recipes` insertion order. Matches the live `POST /recipes` semantics exactly. Rejected: flat aggregate `recipes.flatMap(r => r.ingredients)`.
- **D-40:** Defensive guard before extractAndSeed — `if (!Array.isArray(recipe.ingredients)) { console.warn('[backfill] skipping recipe', recipe.id, '- no ingredients array'); continue; }`. Surfaces malformed-recipe case as an explicit warning. Distinct from generic exception handling (D-41).
- **D-41:** Per-recipe try/catch for unexpected throws — wrap each `extractAndSeed(state, recipe.ingredients)` call. On error: `console.error('[backfill] failed for recipe', recipe.id, err.message)` and continue. After the loop, `state.libraryMigratedAt = new Date().toISOString()` is set unconditionally — partial backfill is committed. Backfill never re-runs on the next start.
- **D-42:** `runBackfill` returns `alreadyRan: false` on the FIRST run regardless of whether anything was added — empty `state.recipes` still flips the timestamp.

**Server bootstrap wiring (EXTR-03 / SC#5 / test isolation)**

- **D-43:** Boot site — `runBackfill` runs **inside the `if (require.main === module)` block** in `server.js`, after `createApp()` and before `app.listen(...)`. `createApp()` itself stays pure.
- **D-44:** SC#5 satisfied by call ordering — `runBackfill` returns synchronously before `app.listen()` is invoked. No mutex.
- **D-45:** `storage.save()` after backfill — called once at the bootstrap site (NOT inside `runBackfill`) when `result.alreadyRan === false`.

**POST /recipes auto-extract hook (EXTR-01 / SC#1)**

- **D-46:** Hook site — in `routes/recipes.js`, AFTER the existing `storage.save()` at line 42 and BEFORE `setToast(...)` at line 44. Inside the existing `try` block but wrapped in a NESTED `try/catch`.
- **D-47:** Second-save trigger — EXACTLY `result.added.length || result.aliasesAppended.length`. When neither is non-empty, no second `storage.save()` is called.
- **D-48:** POST failure policy — best-effort with success toast. If `extractAndSeed` throws, recipe is still saved; user sees `Saved: ${title}`. Error logged via `console.error` only.
- **D-49:** Update-path symmetry — hook fires on BOTH create branch and update branch; `extractAndSeed` is library-first (Phase 2 D-20 step 2), so re-save is a no-op.

**Test strategy**

- **D-50:** Test coverage split — `test/backfill.test.js` (NEW, pure; SC#2/SC#3/SC#4 + D-40/D-41 edge cases). `test/recipes.test.js` (EXTEND for SC#1 only). NO new HTTP test for SC#5 — call ordering in `server.js` is the proof.
- **D-51:** No modification of existing tests. Phase 3 SC#5 carryover.

### Claude's Discretion

- Log line format: `[backfill] ...` and `[extract] ...` prefixes; matches existing `console.warn('Could not load state, using defaults:', err.message)` style.
- Backfill summary log: `console.log` after `storage.save()` reports `Backfilled N library entries from M recipes`. Single-line, ASCII-only.
- `runBackfill` return-shape inclusion of `aliasesAppended` — included even though it's empty for from-empty backfills. Future-proofs partial-backfill resume.
- Test fixture: `test/backfill.test.js` constructs state objects inline (mirrors `test/library.test.js` style). Recipe shape: `{ id, title, ingredients: [...] }`.
- Empty-recipes edge case: tested explicitly.
- No new test required to verify "createApp doesn't run backfill" — existing suite breaking would prove a regression.

### Deferred Ideas (OUT OF SCOPE)

- 03-REVIEW WR-01 (`lib/calc.js` render-layer crash on off-list categories) — Phase 4 doesn't touch `lib/calc.js`. Tracked in STATE.md todo line 122.
- 03-REVIEW WR-02 (`routes/recipes.js` GET /recipes/:id malformed-week-record crash) — Phase 4 only touches the POST handler.
- Backfill progress reporting for very large recipe sets — defer until observed need.
- Concurrent boot race — acceptable; deployment is single-process via systemd.
- Surfacing extract failures via toast — defer until a real failure mode surfaces.
- Aliases-appended counter reporting — not Phase 4 work.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **EXTR-01** | `POST /recipes` calls `extractAndSeed(state, recipe.ingredients)` synchronously after the existing `storage.save()`. Triggers a second `storage.save()` only when new entries are appended. | "Hook Site Anatomy" + "Second-Save Trigger Semantics" sections below; the nested try/catch insertion between `routes/recipes.js:42` and `routes/recipes.js:44` is the integration site. |
| **EXTR-03** | Backfill runs on server startup (`server.js`) when `state.libraryMigratedAt` is `null`. Walks all existing recipes, calls `extractAndSeed` per recipe, sets `state.libraryMigratedAt = new Date().toISOString()`, persists once. | "Bootstrap Sequence" + "runBackfill Algorithm" + "Idempotency Proof Pattern" sections below; the four-line insertion inside `server.js:41-48` block is the integration site. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Walk recipes, call extractAndSeed per recipe | `lib/backfill.js` (pure helper) | — | D-37: pure orchestrator with no fs/http/storage imports; tested with plain state objects. Mirrors `lib/library.js` purity rule. |
| Idempotency guard (libraryMigratedAt truthy short-circuit) | `lib/backfill.js` (pure helper) | — | D-38: guard lives at the top of `runBackfill`; caller does not need to check. |
| Defensive non-Array.isArray + per-recipe try/catch | `lib/backfill.js` (pure helper) | — | D-40, D-41: tolerant input handling + console.warn/error are inline in the loop. |
| storage.save() persistence after backfill | `server.js` bootstrap block | — | D-45: keeps `lib/backfill.js` pure; matches import direction (helpers don't reach for storage). |
| POST hook: call extractAndSeed, conditionally save | `routes/recipes.js` (POST handler) | `lib/library.js#extractAndSeed` | D-46: routes are the side-effect tier; nested try/catch absorbs library-extract failures so the recipe save (the user's primary action) is never demoted. |
| Bootstrap call ordering (synchronous, before app.listen) | `server.js` `if (require.main === module)` block | — | D-43, D-44: SC#5 is enforced structurally by call ordering — no listener bound during the backfill window. createApp() stays backfill-free for test isolation. |
| Test coverage of orchestration | `test/backfill.test.js` (pure, NEW) | `test/recipes.test.js` (HTTP, EXTEND) | D-50: pure path covers SC#2/SC#3/SC#4 + edge cases (D-40/D-41); HTTP path covers SC#1 (POST hook second-save trigger). |

## Standard Stack

This phase is a wiring phase against the already-shipped Phase 2 helper. No new npm dependencies. Versions verified via `package.json`:

### Core (already in tree)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express` | ^4.21.1 (verified `package.json:17`) | HTTP routing in `routes/recipes.js`. | Already mounted; no new use. |
| `nunjucks` | ^3.2.4 (verified `package.json:18`) | Template rendering. | Not exercised by Phase 4. |
| `node:test` | builtin (Node 24.12.0 verified) | Test runner. | Already used by all 284 existing tests; Phase 4 adds plain `test()` calls plus `beforeEach/afterEach` per `test/recipes.test.js:1` style. |
| `node:assert` | builtin | Assertions. | Same. |

### New imports landing in Phase 4

| Import | Direction | Site |
|--------|-----------|------|
| `require('./lib/backfill').runBackfill` | server.js → lib/backfill.js | `server.js` bootstrap block (D-43). |
| `require('./library').extractAndSeed` | lib/backfill.js → lib/library.js | NEW import; backfill is a thin orchestrator over the existing helper. |
| `require('../lib/library').extractAndSeed` | routes/recipes.js → lib/library.js | NEW import in routes; consistent with the existing pattern of routes importing many lib/* helpers (line 2-6 of routes/recipes.js). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure `runBackfill(state)` (D-37) | `runBackfill()` with internal `storage.get()`/`save()` calls | Couples backfill to storage singleton; breaks the `lib/` purity rule from `.planning/codebase/ARCHITECTURE.md`; pure tests become impossible. **Rejected.** |
| Bootstrap inside `if (require.main === module)` (D-43) | Inside `createApp()` | Forces every existing route test to set `libraryMigratedAt: '...'` upfront or assert about seeded library state. Breaks D-51 (Phase 3 SC#5 carryover). **Rejected.** |
| Idempotency via `state.libraryMigratedAt` truthy (D-38) | `state.library.length === 0` | User library cleanup would retrigger backfill — STATE.md "Pitfall Guards Active" flags this exact pitfall. **Rejected.** |
| Per-recipe walk (D-39) | Flat aggregate `recipes.flatMap(r => r.ingredients)` | Diverges backfill from steady-state semantics — fewer entries due to cross-recipe in-progress collapse. **Rejected.** |
| Best-effort POST hook (D-48) | Bubble extract failures to `next(err)` | State mutation already happened (recipe saved); UI would say fail when it actually succeeded. **Rejected.** |
| Best-effort POST hook (D-48) | Degraded toast `Saved: X (library skipped)` | Premature noise on the happy path; revisit if extract failures are observed. **Rejected pending evidence.** |
| Hard-fail backfill on first throw | `try/catch` around the whole loop with re-throw | One malformed recipe wedges launch forever on a single-user Pi with no remote access. **Rejected.** |

**Installation:** None — no new dependencies.

## Architecture Patterns

### System Architecture Diagram (Phase 4 deltas only)

```text
                                    Bootstrap (production launch)
                                    ┌──────────────────────────────┐
node server.js                      │  if (require.main === module)│
       │                            │    const app = createApp();  │
       └────────►───────────────────│    [NEW] storage = require   │
                                    │    [NEW] runBackfill(state)  │──┐
                                    │    [NEW] if !alreadyRan:     │  │
                                    │        storage.save();       │  │
                                    │        console.log(...)      │  │
                                    │    app.listen(PORT, HOST)    │  │
                                    └──────────────────────────────┘  │
                                                                      │
HTTP POST /recipes                                                    │
   │                                                                  ▼
   ▼                                                       ┌────────────────────┐
┌──────────────────────────────────┐                      │  lib/backfill.js   │
│  routes/recipes.js POST handler  │                      │  (NEW, pure)       │
│   1. scrape(url)                 │                      │                    │
│   2. derive id, build entry      │                      │ runBackfill(state) │
│   3. mutate state.recipes        │                      │  ┌──────────────┐  │
│   4. storage.save()  [LINE 42]   │◄────same save fn────►│  │ for r of     │  │
│   5. [NEW] try {                 │                      │  │   recipes:   │  │
│        extractAndSeed(state,...) │──────────calls───────│  │   try {      │  │
│        if added||aliasesAppended │                      │  │   extractAnd │  │
│          storage.save()          │                      │  │   Seed       │  │
│      } catch (err) console.error │                      │  │   } catch    │  │
│   6. setToast() [LINE 44]        │                      │  │   console.err│  │
│   7. respondWithUpdates          │                      │  └──────────────┘  │
└──────────────────────────────────┘                      │ return {alreadyRan,│
                                                           │   added, aliases…} │
                                                           └────────────────────┘
                                                                      │
                                                                      ▼
                                                           ┌────────────────────┐
                                                           │  lib/library.js    │
                                                           │  (UNCHANGED)       │
                                                           │  extractAndSeed    │
                                                           └────────────────────┘
```

### Recommended Project Structure (no changes to top-level layout)

```
lib/
├── backfill.js     # NEW — runBackfill(state) pure orchestrator
├── library.js      # UNCHANGED — extractAndSeed contract source
├── storage.js      # UNCHANGED — atomic temp-rename save
├── ...
routes/
├── recipes.js      # MODIFIED — nested try/catch hook between line 42 and line 44
server.js           # MODIFIED — 4 lines added inside require.main block
test/
├── backfill.test.js   # NEW — pure tests, no setupDataDir, no startTestServer
├── recipes.test.js    # EXTENDED — adds 3 SC#1 tests, no existing tests modified
```

### Pattern 1: Pure helper with state-mutation contract (lib/backfill.js)

**What:** A single exported function that receives `state` by reference, mutates `state.library` and `state.libraryMigratedAt`, and returns a result envelope. No fs/http/storage imports.

**When to use:** Phase 4's `runBackfill`. Same pattern as `lib/library.js#extractAndSeed`, `lib/grocery.js#addItem`, `lib/week.js#tagRecipe`.

**Source for the contract pattern:** `lib/library.js:291-387` (the `extractAndSeed` body Phase 4 calls into).

**Skeleton (production code — see `runBackfill Algorithm` section below for full body):**

```javascript
// lib/backfill.js
const { extractAndSeed } = require('./library');

function runBackfill(state) {
  if (state && typeof state.libraryMigratedAt === 'string' && state.libraryMigratedAt) {
    return { alreadyRan: true, added: [], aliasesAppended: [] };
  }
  // ... walk state.recipes, accumulate added/aliasesAppended ...
  // Set state.libraryMigratedAt = new Date().toISOString() unconditionally at end.
  return { alreadyRan: false, added, aliasesAppended };
}

module.exports = { runBackfill };
```

### Pattern 2: Bootstrap-only side effects (server.js require.main block)

**What:** Production-only side effects (listen, log, backfill) live inside `if (require.main === module)`. `createApp()` itself stays pure for test isolation.

**When to use:** Any side effect that must happen exactly once on production launch but never during a test boot. Phase 4's `runBackfill` invocation.

**Source:** `server.js:41-48` — existing pattern; Phase 4 inserts four lines.

**Anatomy of the existing block (`server.js:41-48`):**

```javascript
if (require.main === module) {
  const app = createApp();
  const HOST = process.env.HOST || '127.0.0.1';
  const PORT = parseInt(process.env.PORT, 10) || 3003;
  app.listen(PORT, HOST, () => {
    console.log(`Recipe box running at http://${HOST}:${PORT}`);
  });
}
```

**Phase 4 insertion shape (verified against `server.js:41-48`):**

```javascript
if (require.main === module) {
  const app = createApp();
  const HOST = process.env.HOST || '127.0.0.1';
  const PORT = parseInt(process.env.PORT, 10) || 3003;

  // [NEW PHASE 4] Auto-extract & backfill — synchronous, before app.listen.
  const storage = require('./lib/storage');
  const { runBackfill } = require('./lib/backfill');
  const state = storage.get();
  const result = runBackfill(state);
  if (!result.alreadyRan) {
    storage.save();
    console.log(`Backfilled ${result.added.length} library entries from ${state.recipes.length} recipes`);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Recipe box running at http://${HOST}:${PORT}`);
  });
}
```

Notes on the snippet:
- `const storage = require('./lib/storage')` is a NEW require **scoped to the bootstrap block**. The existing `const storage = require('./lib/storage')` at `server.js:27` is INSIDE `createApp()` — it's a separate lexical binding. Bringing it into the bootstrap block does not shadow or conflict with the inner one.
- Calling `storage.get()` BEFORE `runBackfill(state)` is REQUIRED — `runBackfill` does not call `storage.get()` itself (D-37 purity rule). The caller must hand state in.
- The `state.recipes.length` reference in `console.log` reads from the post-backfill state object, but `runBackfill` does not modify `state.recipes` (only `state.library` and `state.libraryMigratedAt`), so the count is identical to the pre-backfill count.
- Log message is ASCII-only (no em-dashes, no Unicode); satisfies the HTTP-header-style ASCII discipline even though `console.log` doesn't go through HTTP headers — consistent style across the codebase.

### Pattern 3: Nested try/catch on the secondary action (POST hook)

**What:** When a route does TWO mutations (recipe save + library extract), wrap the secondary mutation in an INNER try/catch so failures don't bubble to the outer `next(err)` and 500 the response.

**When to use:** Phase 4's POST /recipes hook (D-46, D-48).

**Source for the pattern:** Existing outer try/catch at `routes/recipes.js:17` calling `next(err)` on line 47. The inner catch is novel — the existing handler has only the outer one.

**Hook Site Anatomy (verified against `routes/recipes.js:16-49`):**

The existing handler shape (after Phase 3, current HEAD):

```javascript
// routes/recipes.js:16-49 — current production code
router.post('/recipes', async (req, res, next) => {
  try {                                                    // <-- outer try (line 17)
    const url = req.body && typeof req.body.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      return res.status(400).type('text').send('Missing url');
    }
    const result = await scrapeMod.scrape(url, { fetch: globalThis.fetch, now: new Date() });
    if (!result.ok) {
      setToast(res, result.reason);
      return respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
    }
    const id = idForUrl(url);
    const now = new Date().toISOString();
    const state = storage.get();
    const existingIdx = state.recipes.findIndex(r => r.id === id);
    const entry = { id, addedAt: now, ...result.recipe };
    let toastVerb;
    if (existingIdx >= 0) {
      state.recipes[existingIdx] = entry;
      toastVerb = 'Updated';
    } else {
      state.recipes.unshift(entry);
      toastVerb = 'Saved';
    }
    storage.save();                                        // <-- LINE 42 (recipe persisted)

    // [PHASE 4 INSERTION POINT — between line 42 and line 44]

    setToast(res, `${toastVerb}: ${entry.title}`);         // <-- LINE 44
    respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
  } catch (err) {                                          // <-- outer catch (line 46)
    next(err);
  }
});
```

The Phase 4 insertion at lines 43–44 (D-46):

```javascript
    storage.save();                                        // line 42 (existing)

    // [NEW PHASE 4] Auto-extract: synchronous, best-effort.
    try {
      const extractResult = extractAndSeed(state, entry.ingredients);
      if (extractResult.added.length || extractResult.aliasesAppended.length) {
        storage.save();
      }
    } catch (err) {
      console.error('[extract] failed for recipe', entry.id, err.message);
    }

    setToast(res, `${toastVerb}: ${entry.title}`);         // line 44 (existing)
    respondWithUpdates(req, res, { panels: ['partials/recipes-panel.njk'] });
```

Plus the new import at the top of the file (consistent with `routes/recipes.js:2-6`):

```javascript
const { extractAndSeed } = require('../lib/library');
```

**Why nested (D-48 reasoning):**
- The outer catch at line 46 calls `next(err)` → Express global error handler at `server.js:33-36` returns HTTP 500.
- A 500 response after `state.recipes` was successfully mutated and persisted at line 42 produces a UI/state divergence — the user sees a server error, but the recipe is now saved.
- The inner catch absorbs `extractAndSeed` failures so the response always reflects the authoritative recipe-save outcome.
- `console.error` only — no toast modification (D-48). The toast at line 44 still says `Saved: ${entry.title}` or `Updated: ${entry.title}`.

**Variable naming note:** the local `result` at line 23 (scrape result) shadows what the obvious-but-bad name "result" would refer to. Use `extractResult` (or `libraryResult`) for the new local at the insertion site to avoid shadowing.

### Pattern 4: Synchronous-before-listen call ordering (SC#5 proof)

**What:** Sync work on the call stack before `app.listen()` is bound. No requests can be served against partial state because no listener exists.

**When to use:** Phase 4's `runBackfill` invocation (D-44).

**Source:** `server.js:45-47` — `app.listen(PORT, HOST, callback)` registers the listener and the callback fires once. Until that line executes, the Node event loop has no socket bound.

**Why no mutex needed:** `runBackfill(state)` is a synchronous function (no await, no promises, no setTimeout). The `storage.save()` after it is also synchronous (`fs.writeFileSync` + `fs.renameSync` per `lib/storage.js:31-32`). The entire backfill→save→log sequence completes on the same tick before `app.listen()` is reached.

### Anti-Patterns to Avoid

- **Awaiting in runBackfill or its caller.** `extractAndSeed` is sync; making `runBackfill` async would create a window where `app.listen()` could fire before the resolution. Stay synchronous.
- **Calling `storage.save()` inside `runBackfill`.** Violates D-37 (no `require('./storage')`); breaks pure tests.
- **Putting backfill inside `createApp()`.** Breaks test isolation (D-43, D-51).
- **Outer-catch-only POST hook.** A library-extract throw becomes a 500 (D-48 violation).
- **Using `library.length === 0` as the idempotency guard.** User cleanup re-triggers backfill (D-38, STATE.md "Pitfall Guards Active").
- **Naming the new local variable `result` in the hook.** Shadows the existing scrape `result` from line 23. Use `extractResult` or `libraryResult`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-ingredient normalization, library-first match, in-progress collapse, alias auto-append | A second copy of `extractAndSeed` logic in `runBackfill` | Call `extractAndSeed(state, recipe.ingredients)` per recipe (D-39) | Phase 2's helper IS the canonical implementation; backfill must produce byte-identical state to "every recipe was POSTed in turn." Any divergence is a regression. |
| Atomic file persistence | A custom write path in `runBackfill` | `storage.save()` at the bootstrap site (D-45) | `lib/storage.js#persist` (lines 27-33) already does temp-write + atomic rename. Don't fork. |
| ID generation for new library entries | A new id helper in `lib/backfill.js` | `extractAndSeed` already calls `newLibraryEntry` which calls `newLibraryId` | Single source of truth for `lb_xxxxxxxx` IDs. |
| HTTP error formatting | Custom 500 fallback for extract failures | Best-effort `console.error`; do not `next(err)` (D-48) | The "primary action succeeded" path must produce a 200 with the success toast. |

**Key insight:** Phase 4 is structurally simple precisely because Phase 2 already shipped the hard logic (`extractAndSeed`). The risk in this phase is plumbing — wrong call ordering, wrong place to land the hook, wrong test isolation. Resist the urge to add helpers; the integration sites are tiny and the existing helpers do the work.

## Common Pitfalls

### Pitfall 1: Forgetting to call `storage.get()` before `runBackfill(state)`

**What goes wrong:** `runBackfill` is pure — it mutates the state argument but does not call `storage.get()`. If the bootstrap calls `runBackfill(undefined)` or skips the get, the function returns `{ alreadyRan: false, added: [], aliasesAppended: [] }` (no-op) and `storage.save()` then persists whatever the singleton last had.

**Why it happens:** Subtle interaction between purity rule (D-37) and singleton state (`lib/storage.js:19`).

**How to avoid:** Always: `const state = storage.get(); const result = runBackfill(state);`. Both lines required, in order.

**Warning signs:** SC#3 (idempotency) test passes but actual state file has no library entries even on a populated state.json. Inspect by: after first start with recipes in state, `cat data/state.json | grep -c '"id": "lb_'` should equal new entry count.

### Pitfall 2: Variable shadowing of `result`

**What goes wrong:** `routes/recipes.js:23` already declares `const result = await scrapeMod.scrape(...)`. If the new hook code also names its local `result`, it shadows the outer one — but the outer one is no longer needed by the time line 42 runs, so this is a stylistic concern, not a runtime bug. However, future edits or merges become confusing.

**Why it happens:** Obvious naming ("the result of extractAndSeed").

**How to avoid:** Use `extractResult` or `libraryResult` for the new local.

**Warning signs:** Code reviewers point at "which result is which" — refactor immediately.

### Pitfall 3: Forgetting the outer catch passes through

**What goes wrong:** The inner try/catch at the hook site only catches throws from `extractAndSeed` and the inner `storage.save()`. `storage.save()` at line 42 (the recipe save) and `setToast`/`respondWithUpdates` after the hook are still inside the outer try at line 17. A throw from any of them still hits `next(err)` and returns 500.

**Why it happens:** The phrase "wrapped in a NESTED try/catch" can be misread as "we now have full POST-handler error suppression."

**How to avoid:** Keep the inner try narrow. Only `extractAndSeed(...)` and the `if (added.length || aliasesAppended.length) storage.save()` lines belong inside the inner try.

**Warning signs:** Code review where someone wraps `setToast` or `respondWithUpdates` in the inner catch — that breaks existing 500-on-render-failure semantics from `routes/recipes.js:46`.

### Pitfall 4: `state.libraryMigratedAt` truthy check accepts the empty string

**What goes wrong:** `if (state.libraryMigratedAt)` is falsy for `''` (empty string). If somewhere in the codebase the timestamp is set to `''` instead of an ISO string, backfill re-runs forever.

**Why it happens:** Migration code at `lib/storage.js:15` does `if (typeof merged.libraryMigratedAt !== 'string') merged.libraryMigratedAt = null;` — preserves any existing string value, including `''`.

**How to avoid:** Use the explicit guard: `if (state && typeof state.libraryMigratedAt === 'string' && state.libraryMigratedAt) { return { alreadyRan: true, added: [], aliasesAppended: [] }; }`. Both `typeof === 'string'` AND truthy.

**Warning signs:** Tests for D-38 should include the `''` case (empty string) — `runBackfill` should treat it as "not yet run" or as "already ran" — pick one and document. Recommended: treat `''` as "not yet run" (matches D-38's "non-null string" wording — empty string is not what was meant by D-10's `state.libraryMigratedAt = null` initial state). The simplest safe form is `if (state.libraryMigratedAt) { ... }` — falsy on `''`, `null`, `undefined`, `0`. This is the recommended check.

### Pitfall 5: D-41 partial-failure timestamp commit edge case

**What goes wrong:** D-41 says `state.libraryMigratedAt = new Date().toISOString()` is set "unconditionally after the loop." But if the loop itself throws (e.g., `state.recipes` is somehow non-iterable), the assignment never runs and backfill re-runs next start.

**Why it happens:** Defensive guards at the recipe level (D-40 `Array.isArray(recipe.ingredients)`) don't protect against `state.recipes` being non-iterable.

**How to avoid:** At the top of `runBackfill`, validate `Array.isArray(state.recipes)`. If not, set `state.recipes = []` defensively (mirrors `lib/storage.js:11-13` migrate pattern) — empty loop, timestamp set, returns `alreadyRan: false`. Document this as defensive consistent with the existing migration pattern.

**Warning signs:** Test with `state.recipes = null` and `state.recipes = undefined` — both should set `libraryMigratedAt` and return `alreadyRan: false`.

## Code Examples

Verified patterns from already-shipped sources. Phase 4 produces analogues.

### Example 1: Pure helper with state mutation (the model `runBackfill` follows)

```javascript
// Source: lib/library.js:291-298 (extractAndSeed entry guards — pattern to mirror)
function extractAndSeed(state, ingredients) {
  const added = [];
  const aliasesAppended = [];
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return { ok: true, added, aliasesAppended };
  }
  if (!state || typeof state !== 'object') return { ok: true, added, aliasesAppended };
  if (!Array.isArray(state.library)) state.library = [];
  // ... loop ...
  return { ok: true, added, aliasesAppended };
}
```

### Example 2: Atomic save (used unchanged by Phase 4)

```javascript
// Source: lib/storage.js:27-33
function persist() {
  if (!state) return;
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getTmpFile(), JSON.stringify(state, null, 2));
  fs.renameSync(getTmpFile(), getStateFile());
}
```

Phase 4's bootstrap calls `storage.save()` (which calls `persist()`) once after `runBackfill` returns `{ alreadyRan: false }`. Atomicity guaranteed by the OS rename.

### Example 3: Existing bootstrap (the insertion site)

```javascript
// Source: server.js:41-48
if (require.main === module) {
  const app = createApp();
  const HOST = process.env.HOST || '127.0.0.1';
  const PORT = parseInt(process.env.PORT, 10) || 3003;
  app.listen(PORT, HOST, () => {
    console.log(`Recipe box running at http://${HOST}:${PORT}`);
  });
}
```

### Example 4: Pure-state test fixture style (the model `test/backfill.test.js` follows)

```javascript
// Source: test/library.test.js:77-87 (aliasConflict test — pattern to mirror)
test('aliasConflict returns the conflicting entry when two entries share a normalized alias', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'olive oil', aliases: ['olive oil'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const conflict = aliasConflict(state, 'garlic');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_aaaaaaaa');
});
```

### Example 5: HTTP route test with monkey-patched scrape (the model the `test/recipes.test.js` extension follows)

```javascript
// Source: test/recipes.test.js:10-27
const scrapeMod = require('../lib/scrape');
scrapeMod.scrape = async (url) => {
  if (url.includes('fail-network')) return { ok: false, reason: "Couldn't reach example.com" };
  if (url.includes('fail-no-recipe')) return { ok: false, reason: 'No recipe data found on this page' };
  return {
    ok: true,
    recipe: {
      sourceUrl: url, title: 'Stub Recipe ' + url.split('/').pop(),
      description: '', imageUrl: null, servings: '4 servings', totalMinutes: 30,
      ingredients: ['salt'], instructions: ['Cook.']
    }
  };
};
```

For the "extractAndSeed throws" SC#1 best-effort test, monkey-patch `library.js`:

```javascript
// New pattern for SC#1 best-effort failure test (drop into test/recipes.test.js)
const libraryMod = require('../lib/library');
const originalExtractAndSeed = libraryMod.extractAndSeed;

test('POST /recipes still saves and toasts Saved when extractAndSeed throws (D-48)', async () => {
  libraryMod.extractAndSeed = () => { throw new Error('forced failure for test'); };
  try {
    const res = await helpers.request(ctx.port, {
      method: 'POST', path: '/recipes',
      body: { url: 'https://example.com/throw-test' }
    });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers['x-status-toast'] || '', /Saved: Stub Recipe throw-test/);
    // Recipe must be in state (the recipe save at line 42 wins).
    const list = await helpers.request(ctx.port, { path: '/' });
    assert.match(list.body, /Stub Recipe throw-test/);
  } finally {
    libraryMod.extractAndSeed = originalExtractAndSeed;
  }
});
```

## runBackfill Algorithm

The complete `runBackfill(state)` body, mapping each line to its locked decision:

```javascript
// lib/backfill.js
const { extractAndSeed } = require('./library');

/**
 * One-time startup backfill: walks state.recipes, calls extractAndSeed per recipe
 * to seed unmatched ingredient strings as curated:false library entries, sets
 * state.libraryMigratedAt to an ISO timestamp on completion.
 *
 * Idempotency: short-circuits when state.libraryMigratedAt is truthy.
 * Failure policy: per-recipe try/catch swallows throws, partial backfill
 * commits the timestamp (one bad recipe never wedges server start).
 *
 * Pure: no fs, no http, no require('./storage'). Caller persists via storage.save().
 *
 * @param {{ recipes?: Array, library?: Array, libraryMigratedAt?: string|null }} state
 * @returns {{ alreadyRan: boolean, added: Array, aliasesAppended: Array }}
 */
function runBackfill(state) {
  // D-38: idempotency guard. Truthy check (covers null, undefined, '').
  // Defensive: also handle null/undefined state at the very top.
  if (!state || typeof state !== 'object') {
    return { alreadyRan: true, added: [], aliasesAppended: [] };
  }
  if (state.libraryMigratedAt) {
    return { alreadyRan: true, added: [], aliasesAppended: [] };
  }

  // Defensive shape (Pitfall 5 — non-iterable state.recipes).
  if (!Array.isArray(state.recipes)) state.recipes = [];
  if (!Array.isArray(state.library)) state.library = [];

  const added = [];
  const aliasesAppended = [];

  // D-39: per-recipe walk, insertion order. Matches POST /recipes semantics.
  for (const recipe of state.recipes) {
    // D-40: defensive non-Array.isArray guard with explicit warning.
    if (!Array.isArray(recipe && recipe.ingredients)) {
      console.warn('[backfill] skipping recipe', recipe && recipe.id, '- no ingredients array');
      continue;
    }
    // D-41: per-recipe try/catch. One bad recipe never wedges launch.
    try {
      const result = extractAndSeed(state, recipe.ingredients);
      // Accumulate for reporting; extractAndSeed already mutated state.library.
      for (const e of result.added) added.push(e);
      for (const a of result.aliasesAppended) aliasesAppended.push(a);
    } catch (err) {
      console.error('[backfill] failed for recipe', recipe && recipe.id, err.message);
      // Continue. Partial backfill commits timestamp (D-41).
    }
  }

  // D-41: timestamp set unconditionally after the loop. Belt-and-suspenders:
  // even if state.recipes was [] (empty-recipes edge case from Discretion log),
  // the timestamp flips, runBackfill returns alreadyRan:false, caller persists.
  state.libraryMigratedAt = new Date().toISOString();

  // D-42: alreadyRan:false on FIRST run regardless of whether anything was added.
  return { alreadyRan: false, added, aliasesAppended };
}

module.exports = { runBackfill };
```

**Decisions mapped to lines:**

| Line(s) | Decision | Notes |
|---------|----------|-------|
| 17-22 | D-38 (idempotency) | Truthy check covers `null`, `undefined`, `''`. Defensive null-state at line 18 protects against bad callers. |
| 24-25 | Pitfall 5 (non-iterable state.recipes) | Mirrors `lib/storage.js:11-14` migrate pattern. |
| 30-43 | D-39 (walk shape), D-40 (non-array guard), D-41 (try/catch) | Loop body. |
| 47 | D-41 (unconditional timestamp commit) | Survives partial backfill. |
| 50 | D-42 (alreadyRan:false on first run) | Even with `added: []`. |

## Idempotency Proof Pattern (SC#3)

Since `runBackfill` is pure, SC#3 ("Restarting the server a second time does not re-run the backfill") reduces to: calling `runBackfill(state)` twice on the same state object must leave `state.library.length` unchanged on the second call. No HTTP boot needed; the proof is a 5-line node:test.

```javascript
// test/backfill.test.js — the SC#3 idempotency test
test('runBackfill is idempotent on libraryMigratedAt truthy (SC#3)', () => {
  const state = {
    recipes: [{ id: 'r1', title: 'Soup', ingredients: ['salt', 'pepper'] }],
    library: [],
    libraryMigratedAt: null
  };

  // First run: should seed.
  const first = runBackfill(state);
  assert.strictEqual(first.alreadyRan, false);
  assert.ok(state.library.length >= 1, 'first run should seed at least one entry');
  assert.match(state.libraryMigratedAt, /^\d{4}-\d{2}-\d{2}T/);
  const lengthAfterFirst = state.library.length;
  const timestampAfterFirst = state.libraryMigratedAt;

  // Second run: short-circuits on libraryMigratedAt truthy.
  const second = runBackfill(state);
  assert.strictEqual(second.alreadyRan, true);
  assert.deepStrictEqual(second.added, []);
  assert.deepStrictEqual(second.aliasesAppended, []);
  assert.strictEqual(state.library.length, lengthAfterFirst, 'library count must be stable');
  assert.strictEqual(state.libraryMigratedAt, timestampAfterFirst, 'timestamp must NOT be re-set');
});
```

The "second restart" in production is exactly equivalent: the storage singleton reloads the persisted state (which now has `libraryMigratedAt: '2026-05-06T...'`), `runBackfill(state)` short-circuits at line 20-22 of the algorithm, and `if (!result.alreadyRan)` at the bootstrap site (D-45) is false → no second `storage.save()`, no log line.

## Test Isolation Verification

`test/_helpers.js#startTestServer` (lines 25-40) calls `createApp()` per test. Phase 4 keeps backfill OUT of `createApp()` (D-43). Verification path:

1. `createApp()` body (`server.js:5-39`) is unchanged by Phase 4. Only the `if (require.main === module)` block (lines 41-48) gets the new four lines.
2. Tests calling `startTestServer` exercise `createApp()` only — they never enter the `require.main` branch (the test file is the main module, not server.js).
3. Therefore: `runBackfill` never runs during any existing test. `state.library` stays `[]` and `state.libraryMigratedAt` stays `null` for all 284 existing tests.
4. **Concrete check:** every existing test that does `helpers.request(ctx.port, ...)` continues to see a fresh, empty state (per `helpers.setupDataDir()` creating a brand-new temp dir). The library-related additions in Phase 1 storage migration (`state.library = []`, `state.libraryMigratedAt = null`) are already present in `defaultState()` (`lib/storage.js:5`) and have not broken any existing tests.

D-51 is therefore satisfied structurally — no existing test needs modification because no existing test path observes Phase 4's mutations.

## Failure-Policy Depth (D-41)

Concrete walkthrough: state has 4 recipes A, B, C, D; recipe C's ingredients-array contains a value that causes `extractAndSeed` to throw.

**Execution trace:**

| Step | Recipe | Action | State after step |
|------|--------|--------|------------------|
| 1 | A | `extractAndSeed(state, A.ingredients)` succeeds; seeds `lb_a1`, `lb_a2`. | `state.library: [a1, a2]`, no timestamp. |
| 2 | B | `extractAndSeed(state, B.ingredients)` succeeds; seeds `lb_b1`. | `state.library: [a1, a2, b1]`, no timestamp. |
| 3 | C | `extractAndSeed(state, C.ingredients)` THROWS. Caught by D-41 try/catch. `console.error('[backfill] failed for recipe', 'C', err.message)`. Loop continues. | `state.library: [a1, a2, b1]` (whatever was already seeded by extractAndSeed before it threw — possibly partial; the helper's internal step 5 may not have run for the throwing call). |
| 4 | D | `extractAndSeed(state, D.ingredients)` succeeds; seeds `lb_d1`. | `state.library: [a1, a2, b1, d1]`. |
| 5 | (after loop) | `state.libraryMigratedAt = new Date().toISOString()`. | `state.library: [a1, a2, b1, d1]`, timestamp SET. |
| 6 | (return) | Returns `{ alreadyRan: false, added: [a1, a2, b1, d1], aliasesAppended: [...] }` | — |
| 7 | (caller) | `if (!result.alreadyRan) storage.save()` — persists `[a1, a2, b1, d1]` and the timestamp. | On-disk: 4 entries, timestamp set. |
| 8 | (next start) | `state.libraryMigratedAt` is truthy → short-circuit. Returns `alreadyRan: true`. | No re-attempt; recipe C's gap stays until the user fixes it via Phase 5's Library tab or re-saves the recipe. |

**Properties this guarantees:**
- **Forward progress:** recipes 1..N-1 (A, B) and N+1..M (D) are seeded.
- **Permanent commit:** the timestamp is set even after a partial failure. Subsequent restarts won't re-run.
- **Observability:** `console.error` line gives the user a stderr trail (`[backfill] failed for recipe C ...`) — they know which recipe to investigate via Phase 5.
- **No retry:** the trade-off (per D-41 rationale) is "user fixes via Phase 5 manual curation" rather than "server stuck retrying forever."
- **Bounded blast radius:** even if every recipe throws, the loop runs to completion, the timestamp is set, the server starts, and the user has a fully empty library — recoverable via Phase 5.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node 24.12.0) |
| Config file | none — `package.json` script `"test": "node --test \"test/**/*.test.js\""` |
| Quick run command | `npm test -- test/backfill.test.js` (single file) or `npm test -- test/recipes.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID / SC | Behavior | Test Type | Automated Command | File Exists? |
|-------------|----------|-----------|-------------------|--------------|
| EXTR-01 / SC#1a | New recipe save grows `state.library` (extractAndSeed runs after save). | HTTP integration | `npm test -- test/recipes.test.js` | ❌ Wave 1 — extends existing file. |
| EXTR-01 / SC#1b | No second `storage.save()` when all ingredients matched (re-save same URL). | HTTP integration | `npm test -- test/recipes.test.js` | ❌ Wave 1. |
| EXTR-01 / SC#1c | extractAndSeed throws → recipe still saves, toast unchanged (D-48). | HTTP integration with monkey-patch | `npm test -- test/recipes.test.js` | ❌ Wave 1. |
| EXTR-03 / SC#2a | First run on populated state seeds entries. | unit (pure) | `npm test -- test/backfill.test.js` | ❌ Wave 0/1 — new file. |
| EXTR-03 / SC#2b | First run sets `libraryMigratedAt` to ISO timestamp. | unit (pure) | `npm test -- test/backfill.test.js` | ❌ Wave 0/1. |
| EXTR-03 / SC#2c | First run on empty `state.recipes` still flips timestamp; returns `alreadyRan:false, added:[]`. | unit (pure) | `npm test -- test/backfill.test.js` | ❌ Wave 0/1. |
| EXTR-03 / SC#3 | Second `runBackfill(state)` call short-circuits; library count + timestamp unchanged. | unit (pure) | `npm test -- test/backfill.test.js` | ❌ Wave 0/1. |
| EXTR-03 / SC#4 | After backfill, `peanut butter` entries have `groceryCategory: 'Aisle'`. Inherited from Phase 1 D-01. | unit (pure) | `npm test -- test/backfill.test.js` | ❌ Wave 0/1. |
| EXTR-03 / SC#5 | Bootstrap call ordering: `runBackfill` runs before `app.listen()`. Structural via call ordering (no test). | code review | n/a — verified by reading `server.js` diff and the SC#3 idempotency proof. | n/a per D-50. |
| D-40 edge | Non-array `recipe.ingredients` → `console.warn`, loop continues. | unit (pure) | `npm test -- test/backfill.test.js` | ❌ Wave 0/1. |
| D-41 edge | Per-recipe throw is caught; subsequent recipes still seed; timestamp committed. | unit (pure with monkey-patched `extractAndSeed`) | `npm test -- test/backfill.test.js` | ❌ Wave 0/1. |
| D-51 carryover | All 284 existing tests still pass without modification. | full-suite regression | `npm test` | ✅ Existing tests in tree. |

### Sampling Rate

- **Per task commit:** `npm test -- test/backfill.test.js` (Wave 1 task) or `npm test -- test/recipes.test.js` (Wave 2 task) — narrow scope, fast.
- **Per wave merge:** `npm test` — full 284-test suite plus new ~10 tests = ~294-296 expected.
- **Phase gate:** `npm test` green; no test output regressions; `state.json` after a manual `node server.js` start contains a populated `state.library` and a non-null `state.libraryMigratedAt`.

### Wave 0 Gaps

- [ ] `test/backfill.test.js` — NEW file, covers SC#2/SC#3/SC#4 + D-40/D-41 + empty-recipes edge case. Estimated 8-10 tests.
- [ ] No new fixtures needed — `test/library.test.js` style of inline plain-state fixtures applies directly.
- [ ] No conftest equivalent in node:test — `beforeEach`/`afterEach` not required for pure tests.
- [ ] No framework install needed — `node:test` is built in.

*(`test/recipes.test.js` already exists; Wave 2 extends it with 3 new tests, no setup changes.)*

## Security Domain

`security_enforcement` is not explicitly set in `.planning/config.json` (absent → enabled). Phase 4 introduces no new security surface:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Single-user LAN-only app per CONCERNS.md "Security Considerations". No auth surface introduced. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No multi-user model. |
| V5 Input Validation | no | Phase 4 does not accept new user input — the POST /recipes URL is already validated by Phase 1-3 (line 18-21 of routes/recipes.js). The library extract operates only on already-validated, already-saved recipe ingredient strings. |
| V6 Cryptography | no | No new crypto. ID generation reuses `lb_` + `Math.random().toString(36).slice(2, 10)` from Phase 1 (non-crypto, single-user, collision risk negligible per `lib/library.js:78-80`). |
| V7 Error Handling | yes | `console.error` only, no error message leakage in HTTP responses (D-48 preserves existing 200/500 split — extract failures are silent on the wire). |
| V8 Data Protection | no | No new persisted data classes; the library entry shape was locked in Phase 1 FND-03. |

### Known Threat Patterns for Node/Express + JSON-state-file stack

| Pattern | STRIDE | Standard Mitigation | Phase 4 status |
|---------|--------|---------------------|----------------|
| Race condition on concurrent boot (two server.js processes against same data dir) | Tampering | Single-process deployment (systemd) per CONCERNS.md "Race Conditions & Concurrency" | Acceptable; documented; out of scope per CONTEXT.md `<deferred>`. |
| Partial-write on crash mid-backfill | Tampering | Atomic temp-rename in `lib/storage.js#persist` | Inherited; Phase 4 calls existing `storage.save()`. |
| Toast header injection via recipe title | Tampering / Information disclosure | ASCII-only sanitization in `setToast` (`routes/recipes.js:10-14`) | Inherited; Phase 4 does not modify toast strings. |
| Console log injection via malicious recipe ID | Information disclosure | `recipe && recipe.id` in `console.warn`/`console.error` is plain string interpolation; no shell, no log injection vector beyond visual confusion. | Acceptable for stderr-only logs on a single-user Pi. |

No new threat patterns introduced.

## State of the Art

This is brownfield wiring against an established codebase. No "old vs current" framework migrations are relevant. The relevant architectural standard for this phase is the project's own established pattern, which Phase 4 adheres to:

| Old Approach (rejected) | Current Approach | When Established | Impact |
|-------------------------|------------------|------------------|--------|
| Backfill inside `createApp()` | Bootstrap-only invocation in `if (require.main === module)` | Phase 4 D-43 (this phase) | Test isolation preserved; existing 284-test suite needs zero changes. |
| `library.length === 0` idempotency | `state.libraryMigratedAt` truthy short-circuit | Phase 1 D-10, reaffirmed by Phase 4 D-38 | User library cleanup never re-triggers backfill. |
| Hard-fail on first malformed recipe | Per-recipe try/catch, partial-backfill timestamp commit | Phase 4 D-41 | Single-user Pi resilience. |
| Bubble extract failures to `next(err)` (500 response) | Best-effort with success toast preserved | Phase 4 D-48 | Recipe save is the user's primary action; library is housekeeping. |

**Deprecated/outdated:** None applicable to this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| (none) | All claims in this research are either VERIFIED against in-tree files (with explicit line refs) or CITED from `04-CONTEXT.md` decisions (D-37..D-51) which are themselves locked. | — | — |

**This table is empty:** Every factual claim in this research either reads from in-tree code (verified by `Read` tool against `lib/library.js`, `lib/storage.js`, `routes/recipes.js`, `server.js`, `test/_helpers.js`, `test/recipes.test.js`, `test/library.test.js`, `package.json`, `.planning/config.json`) or quotes a locked decision from `04-CONTEXT.md`. No user confirmation needed.

## Open Questions (RESOLVED)

1. **Should the `console.log` Backfilled-N-from-M line be omitted when `result.added.length === 0` and `result.aliasesAppended.length === 0`?**
   - What we know: Discretion log says the log line happens "after `storage.save()` reports `Backfilled N library entries from M recipes`." The save is conditional on `!result.alreadyRan`.
   - What's unclear: A first-run on an empty state (0 recipes, 0 added) WILL log "Backfilled 0 library entries from 0 recipes" — slightly noisy on a fresh deploy.
   - Recommendation: Keep the log line as Discretion specified — it doubles as a "backfill completed successfully" signal. Refining for zero-empty noise is a YAGNI optimization. Plan can adopt as-is.

2. **Should the new local in `routes/recipes.js` be `extractResult` or `libraryResult`?**
   - What we know: The existing line 23 declares `const result = await scrapeMod.scrape(...)`.
   - What's unclear: Naming preference. Both work; both avoid shadowing.
   - Recommendation: `extractResult` — matches the operation name `extractAndSeed`, parallels the existing `result` (scrape result) without confusion.

3. **Should `runBackfill` validate `state.recipes` is iterable, or trust the migration?**
   - What we know: `lib/storage.js:11-13` guarantees `state.recipes`, `state.weeks`, `state.grocery`, `state.library` are arrays after migrate (which load() always calls).
   - What's unclear: Defense-in-depth vs trust the contract.
   - Recommendation: Defensive guard included in the algorithm above (Pitfall 5) — three lines, mirrors the migrate pattern, makes the test for a malformed `state.recipes` expressible. Cheap insurance.

## Environment Availability

Phase 4 depends only on Node 24.12.0 + npm 8+ + in-tree code. No external services, no new npm packages.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All code + tests | ✓ | v24.12.0 | — |
| `express` | routes/recipes.js, server.js | ✓ | ^4.21.1 | — |
| `nunjucks` | server.js (test boot) | ✓ | ^3.2.4 | — |
| `node:test` | All test files | ✓ | builtin | — |
| `node:assert` | All test files | ✓ | builtin | — |
| `lib/library.js#extractAndSeed` | runBackfill, POST hook | ✓ | exported (line 396 of library.js) | — |
| `lib/storage.js#get`, `#save` | server.js bootstrap | ✓ | exported (line 62) | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Sources

### Primary (HIGH confidence — verified in-tree files)

- `lib/library.js:291-387` — `extractAndSeed` body (the contract Phase 4 calls into).
- `lib/library.js:389-398` — module.exports listing (confirms `extractAndSeed` is exported and callable).
- `lib/storage.js:1-65` — full file. `defaultState`, `migrate`, `persist`, `get`, `save`, `_resetForTest`. Confirms atomic temp-rename at lines 27-33.
- `routes/recipes.js:1-79` — full file. POST handler at lines 16-49. `storage.save()` at line 42. `setToast` at line 44. Outer try at line 17, outer catch at line 46.
- `server.js:1-50` — full file. `createApp()` at lines 5-39. `if (require.main === module)` block at lines 41-48.
- `test/_helpers.js:1-75` — full file. `startTestServer` at lines 25-40. Confirms `createApp()` is called per test, NOT the bootstrap block.
- `test/recipes.test.js:1-180` — full file. Existing 12+ tests; SC#1 extension is purely additive.
- `test/library.test.js:1-120` — pure-state fixture style; the model `test/backfill.test.js` follows.
- `package.json:1-20` — confirmed `express ^4.21.1`, `nunjucks ^3.2.4`, `"test": "node --test \"test/**/*.test.js\""`. No new deps needed.
- `.planning/config.json` — `nyquist_validation: true`, no `security_enforcement` key (defaults to enabled).
- `.planning/codebase/CONVENTIONS.md` — CommonJS, 2-space, single quotes, semicolons, `*.test.js`, named exports, `module.exports = { ... }`.
- `.planning/codebase/ARCHITECTURE.md` — pure helpers in `lib/`, side effects in `routes/` + `server.js`. Storage atomicity at lines 200-205.
- `.planning/codebase/TESTING.md` — `node:test` patterns, helper conventions (`setupDataDir`, `startTestServer`), pure-state fixtures.
- `.planning/codebase/CONCERNS.md` — Toast ASCII discipline (lines 41-49), storage atomicity (lines 64-74), race-condition acceptance (lines 53-62).

### Primary (HIGH confidence — locked decisions)

- `.planning/phases/04-auto-extract-backfill/04-CONTEXT.md` — D-37..D-51 (15 decisions). Treated as locked; not re-litigated.
- `.planning/phases/02-library-helpers/02-CONTEXT.md` — Phase 2 D-20 step 5 (the `result.added.length || result.aliasesAppended.length` second-save trigger that Phase 4 D-47 references).
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 D-09, D-10 (state.library = [], state.libraryMigratedAt = null) and D-01 (pea-bug `\b...\b` regex shipped — feeds SC#4).
- `.planning/STATE.md` — "Pitfall Guards Active" (libraryMigratedAt-not-length, pea-bug-fix-before-seeding); "Key Decisions Locked In" entries 84-96.
- `.planning/ROADMAP.md:78-88` — Phase 4 success criteria 1-5 verbatim.
- `.planning/REQUIREMENTS.md:25,27` — EXTR-01 and EXTR-03 verbatim.
- `./CLAUDE.md` (project rules) — render-time categorization, ASCII safety, library-first priority. Phase 4 introduces no rendering or new toast strings; constraints inherited.

### Secondary (MEDIUM confidence) — none

### Tertiary (LOW confidence) — none

## Project Constraints (from CLAUDE.md)

- **Tech stack:** Node 18+ (verified at v24.12.0), Express 4 (verified at ^4.21.1), Nunjucks 3 (verified at ^3.2.4), HTMX 2, no build step. CommonJS, `node:test`. **Phase 4 compliance:** all new code is CommonJS named-export; new test file uses `node:test` patterns; no new build artifacts.
- **Persistence:** JSON state file with atomic rename. `state.library` already added in Phase 1; Phase 4 mutates `state.library` (via extractAndSeed) and `state.libraryMigratedAt`, then persists via existing `storage.save()`. **Phase 4 compliance:** uses unmodified `lib/storage.js#save` — no fork.
- **Categorization layering:** library entries take priority over heuristic; keyword tables stay in place as fallback. **Phase 4 compliance:** Phase 4 does not touch `lib/categorize.js`. SC#4 (peanut butter → Aisle) flows from Phase 1 D-01's already-shipped `\b...\b` fix.
- **HTTP header safety:** toast strings must remain ASCII. **Phase 4 compliance:** Phase 4 does not modify `setToast` calls or add new toast strings. Existing `Saved: ${entry.title}` / `Updated: ${entry.title}` is unchanged. New `console.error`/`console.warn` lines do not go through HTTP headers; they're stderr-only and ASCII by composition.
- **No auth:** trust model unchanged. **Phase 4 compliance:** no new endpoints, no new auth surface.
- **Render-time categorization:** do not pre-compute and store categories on grocery items or recipe ingredients. **Phase 4 compliance:** Phase 4 mutates `state.library` (which IS storage of categories — but on library entries, not on grocery/recipe ingredient items). The constraint targets per-item precomputation; library entries are the source of truth, which is the intended pattern. No conflict.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency verified in `package.json` against in-tree code; no new deps added.
- Architecture: HIGH — three integration sites identified by line number against verified file contents; all decisions are locked in CONTEXT.md.
- Pitfalls: HIGH — every pitfall has a code-level verification path or a concrete test pattern; Pitfall 4's `''` edge case is a deliberate flag for the test plan.
- Test plan: HIGH — D-50 specifies the test file split and content; node:test API is stable in Node 24.

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (30 days; stable codebase, no fast-moving deps).
