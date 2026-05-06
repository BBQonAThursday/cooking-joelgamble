# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 1-Foundation
**Areas discussed:** Pea-bug fix mechanism, aliasConflict matching strictness, Entry shape (constant vs factory), Migration robustness

---

## Pea-bug fix mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Per-keyword word-boundary flag | Tag individual keywords (e.g. `pea`) as exact-only via a per-entry flag, leaving prefix-match for everything else. Minimal diff; no new keywords needed. | |
| Add 'peanut'/'peanut butter' explicitly | Add longer keywords so length-sort wins over `pea`. Inoculates known cases but leaves the underlying prefix-match issue (e.g. `lime`/`limelight`) unfixed. | |
| Switch to full `\b...\b` + explicit plurals | Every keyword regex becomes word-boundary on both sides; explicit plural keywords added where needed. Bigger diff, breaks existing plural-prefix test, but matching becomes deterministic. | ✓ |

**User's choice:** Switch to full `\b...\b` + explicit plurals.
**Notes:** Cleanest long-term — eliminates the class of prefix-mis-fire bugs in one pass. Cost (keyword audit + plural entries + test rewrite) accepted explicitly.

---

## aliasConflict matching strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Simple lowercase + trim | Phase 1 `aliasConflict` does `alias.trim().toLowerCase()` only. Phase 2 swaps in full `normalizeIngredientText`. Phase 1 tests use clean strings. | ✓ |
| Stub `normalize()` in Phase 1 | Export a stub `normalizeIngredientText` doing only lowercase+trim; `aliasConflict` calls it. Phase 2 fleshes the stub out. Slightly tighter coupling. | |
| Defer `aliasConflict` to Phase 2 | Phase 1 ships only `newLibraryId` + entry shape. `aliasConflict` moves to Phase 2. Removes a Phase 1 success criterion; re-shapes phase boundary. | |

**User's choice:** Simple lowercase + trim.
**Notes:** Cleanest separation of concerns — Phase 2 owns the messy-input handling along with the normalizer it requires.

---

## Entry shape: constant vs factory

| Option | Description | Selected |
|--------|-------------|----------|
| Factory: `newLibraryEntry({...})` | Export factory that returns full entry with `id` + `createdAt` populated. Single source of truth; auto-extract and manual-add both call it. | ✓ |
| Frozen template object + manual construction | Export `LIBRARY_ENTRY_KEYS` for shape verification; callers construct entries themselves. More boilerplate downstream. | |
| JSDoc only, no runtime export | Document shape in `@typedef` only. Lightest touch; least scaffolding. | |

**User's choice:** Factory `newLibraryEntry({...})`.
**Notes:** Phase 2's `extractAndSeed` and Phase 5's manual-add route share one construction path; avoids drift between auto-seeded and user-created entries.

---

## Migration robustness

| Option | Description | Selected |
|--------|-------------|----------|
| Match existing pattern: coerce array, trust contents | Mirror what `migrate` does for `recipes`/`weeks`/`grocery`: coerce non-array to `[]`, no per-entry validation. Consistent with rest of `storage.js`. | ✓ |
| Coerce array + drop entries missing required fields | Filter out entries lacking `id`/`name`/categories with a logged warning. Defensive but introduces a new pattern. | |
| Coerce + drop + reset `libraryMigratedAt` if any dropped | Same as B but also resets backfill flag to self-heal. Most aggressive; could mask real corruption. | |

**User's choice:** Match existing pattern.
**Notes:** Consistent with how the other three collections are handled today. Bad entry contents surface as caller-side bugs, not silent migration drops.

---

## Claude's Discretion

- Test file structure: new cases inline in `test/storage.test.js`; new `test/library.test.js` for library helpers. No additional Phase 1 test files.
- JSDoc style: brief `@typedef` block at top of `lib/library.js`; no multi-paragraph docstrings.
- Exact `buildIndex` regex change: `new RegExp('\\b' + escapeRegex(kw.toLowerCase()) + '\\b', 'i')`.

## Deferred Ideas

None — discussion stayed within phase scope.
