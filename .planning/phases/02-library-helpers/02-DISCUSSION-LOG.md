# Phase 2: Library Helpers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 02-library-helpers
**Areas discussed:** Normalization scope, Within-recipe collapse, findEntryByText match
**Areas skipped:** Other-category fallback (offered, not selected)

---

## Normalization scope

### Quantity/unit prefix strip

| Option | Description | Selected |
|--------|-------------|----------|
| Strip number + unit + 'of' (Recommended) | Match leading `<number> <unit>?` plus optional `of`. Handles `'2 cups of garlic'`, `'1/2 lb chicken'`, `'a pinch of salt'`. Unit list as constant in `lib/library.js`. | ✓ |
| Strip leading numbers only | Just numeric tokens / fractions. `'2 cups garlic'` → `'cups garlic'`. Aliases would carry unit cruft. | |
| Strip leading non-letter run | Strip everything before first alphabetic word. Aggressive; risks over-stripping odd phrasings. | |

**User's choice:** Strip number + unit + 'of' (Recommended) → D-13

---

### Parenthetical handling

| Option | Description | Selected |
|--------|-------------|----------|
| Strip ALL parenthetical groups (Recommended) | Drop everything between `(` and `)` regardless of position. | ✓ |
| Strip only trailing parentheticals | Only drop a parenthetical at the end. Safer for `'pasta (e.g. penne or rigatoni)'`. | |
| Keep parentheticals; rely on stripping later | Don't touch parens. Wouldn't satisfy SC#1. | |

**User's choice:** Strip ALL parenthetical groups (Recommended) → D-14

---

### Trailing prep-modifier / comma handling

| Option | Description | Selected |
|--------|-------------|----------|
| Strip trailing comma + everything after (Recommended) | `'garlic, minced'` → `'garlic'`. Comma is the conservative signal. No curated word-list. | ✓ |
| Strip trailing comma + curated prep-words list | More aggressive; risks losing real ingredient text (e.g. `'cream cheese'` if `'cream'` were on the list). | |
| Don't strip prep modifiers | Aliases handle variation; alias count explodes. | |

**User's choice:** Strip trailing comma + everything after (Recommended) → D-15

---

### Singular/plural collapse on stored output

| Option | Description | Selected |
|--------|-------------|----------|
| No — keep them distinct (Recommended) | `'clove'` and `'cloves'` stay separate in normalized output. Both become aliases of one entry over time. | ✓ |
| Yes — strip trailing 's' / 'es' for tokens ≥ 4 chars | Collapses tomato/tomatoes automatically. Mangles lentils/molasses/asparagus. | |
| Yes — small irregular-noun map only | Hand-coded plural map. Maintenance burden grows. | |

**User's choice:** No — keep them distinct (Recommended) → D-16

---

## Within-recipe collapse

### Same-recipe duplicate detection

| Option | Description | Selected |
|--------|-------------|----------|
| Bag-of-words (Recommended) | Token sets compared. `'garlic clove'`/`'minced garlic'` share `garlic` → collapse. | ✓ |
| Strict equality only | Byte-equal compare. Doesn't satisfy SC#2 with current normalization choices. | |
| Last word match | Last word equality. English-syntax-coupled. | |

**User's choice:** Bag-of-words (Recommended) → D-17

---

### Bag-of-words threshold

| Option | Description | Selected |
|--------|-------------|----------|
| Subset rule (Recommended) | Collapse only when one token set is ⊆ the other. Conservative. | ✓ |
| Shared head token | Collapse on first significant token. Misses prep-modifier-led cases. | |
| Any-token overlap | Aggressively wrong; folds all `garlic*` together. | |

**User's choice:** Subset rule (Recommended) → D-18

---

### Comparison-only stemming for bag-of-words key

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — final-'s' strip on tokens ≥ 4 chars (Recommended) | Internal-only stemming for the comparison key. Stored normalized text unaffected. Lets `clove`/`cloves` collapse via subset. | ✓ |
| No — strict raw tokens | `'garlic clove'` and `'garlic cloves'` seed as separate entries on first encounter. | |
| Yes — irregular-noun map only | Hand-coded map. Misses common -s case. | |

**User's choice:** Yes — final-'s' strip on tokens ≥ 4 chars (Recommended) → D-19

---

### extractAndSeed processing order

| Option | Description | Selected |
|--------|-------------|----------|
| Library check first, then same-call collapse (Recommended) | findEntryByText runs first for each ingredient. User curation always wins. | ✓ |
| Same-call collapse first, then library check | Slightly faster; weird responsibility split. | |

**User's choice:** Library check first, then same-call collapse (Recommended) → D-20

---

### Match against existing entry but new alias not yet in entry

| Option | Description | Selected |
|--------|-------------|----------|
| Append the new alias automatically (Recommended) | Library learns from each recipe. Triggers second `storage.save()` if any alias appended. Gated on `aliasConflict` against rest of state. | ✓ |
| Append only when curated:false | Treat curation as an alias-lock. More conservative. | |
| Don't append — entry is matched, move on | State.library completely user-controlled after seeding. | |

**User's choice:** Append the new alias automatically (Recommended) → D-21

---

## findEntryByText match

### Match input strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Regex on raw input, like categorize.js (Recommended) | Longest-alias-first regex index; `\b{alias}\b`; mirrors `categorize.js#buildIndex`. | ✓ |
| Normalize input, then string-equality compare | Loses longest-alias-wins at substring level. | |
| Hybrid: normalize + word-boundary regex on aliases | Normalize cost paid every render. | |

**User's choice:** Regex on raw input, like categorize.js (Recommended) → D-22

---

### Index build scope

| Option | Description | Selected |
|--------|-------------|----------|
| Build per call (Recommended) | Mirrors `categorize.js#buildIndex` analog (constants build at module load; runtime data builds per call). No cache invalidation bugs. | ✓ |
| Module-level cache keyed by state.library reference | Faster repeated calls; needs invalidation logic. | |
| Caller-built index, passed in | Pushes complexity to callers; signature drift. | |

**User's choice:** Build per call (Recommended) → D-23

---

### Equal-length tiebreaker

| Option | Description | Selected |
|--------|-------------|----------|
| Curated entry wins (Recommended) | curated:true beats curated:false at equal alias length. Honors curation-as-source-of-truth. | ✓ |
| First match wins (no tiebreak) | Matches `categorize.js#buildIndex` exactly. Risk: uncurated wins on tie. | |
| Older entry wins (createdAt asc) | Stable but counterintuitive when user creates curated override. | |

**User's choice:** Curated entry wins (Recommended) → D-24

---

### No-match return value

| Option | Description | Selected |
|--------|-------------|----------|
| undefined (Recommended) | Mirrors `aliasConflict` contract. Truthy check. | ✓ |
| null | JSON-friendly but inconsistent with `aliasConflict`. | |
| `{ ok: false, reason: 'no match' }` | Result-object style; GC pressure on render hot path. | |

**User's choice:** undefined (Recommended) → D-25

---

## Claude's Discretion

- Stop-token list inside the bag-of-words collapse step (likely empty after D-13's quantity strip).
- Final unit-list contents in D-13 — initial list provided in CONTEXT.md; planner extends from user's recipe corpus.
- Test corpus for messy inputs (~20 representative strings spanning all D-13/D-14/D-15 cases).
- `extractAndSeed` return shape — `{ ok: true, added: [...], aliasesAppended: [{ entryId, alias }, ...] }`.
- Empty/whitespace input handling for `normalizeIngredientText` and `findEntryByText`.

## Deferred Ideas

- **Other-category fallback policy** — gray area was offered, user did not select. Default behavior (still seed with `'Other'`/`'Other'`, `curated: false`) is acceptable for v1 and treated as the implicit choice. User can manage via the Library tab's Uncurated/Unused filters in Phase 5.
- **Performance budget for very large libraries** — no explicit budget set. Revisit D-23 if `findEntryByText` becomes hot-path-slow at multi-thousand entries.
- **WR-01/WR-02 categorize regressions from Phase 1 review** — bare `'pepper'`/`'peppers'` in `RECIPE_KEYWORDS.Veg` and missing `'peppers'` in `GROCERY_KEYWORDS` — explicitly NOT fixed in Phase 2. Surface in Phase 3 (Categorization Layering).
