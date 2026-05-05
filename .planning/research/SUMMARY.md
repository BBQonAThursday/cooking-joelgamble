# Project Research Summary

**Project:** recipe-box - ingredient-library milestone
**Domain:** Canonical ingredient library with alias-based categorization, layered on an existing heuristic, for a personal recipe app
**Researched:** 2026-05-05
**Confidence:** HIGH

---

## Top-Line Recommendation

Build the library as a pure in-memory extension of the existing categorize.js sorted-regex pattern - zero new production dependencies, no schema changes beyond adding state.library[] and two sentinel flags, and a strict 8-step build order that keeps every phase independently testable. Fix the pea heuristic bug and ship the alias-uniqueness validator and libraryMigratedAt guard in the same first phase as the storage migration; retrofitting any of these three costs a data-repair migration.

---

## Stack - Final Decisions, No Debate

All four research files agree: **no new production dependencies for v1.**

| Technology | Role | Decision |
|------------|------|----------|
| Node.js 24 / Express 4 / Nunjucks 3 / HTMX 2 | All existing | Unchanged - zero new installs |
| lib/categorize.js sorted-regex pattern | Alias matching | Extend in-place; longest-match-wins, word-boundary-anchored, case-insensitive |
| state.json (single file, atomic rename) | Persistence | Add state.library[] to existing file; do not split into a second file |
| lib/storage.js migrate() defensive-spread | Schema validation | Extend for state.library; no AJV/Zod/Joi |
| node:test | Testing | All new modules get co-located test files |

**Conditionally deferred (not in v1):**
- Fuse.js 7.3.0 - only if the Library tab search box needs typo-tolerance; String.includes() is sufficient at personal-app scale.
- USDA FoodData Central / OpenFoodFacts - only when nutrition fields are implemented; entry shape reserves fdcId / offBarcode but neither field is written in v1.

---

## Feature Scope

### Table Stakes - IN (must ship for library to feel non-broken)

| Feature | Note |
|---------|------|
| state.library schema + storage.js migrate | Root dependency for everything else |
| lib/library.js helpers (matchOrCreate, matchEntry, extractAndSeed, backfillLibrary) | Business logic layer; routes must not inline this |
| One-time backfill of existing recipe ingredients | Without this, existing users see an empty library |
| Auto-extract on recipe save (unmatched strings -> curated: false entries) | Library grows organically; user never faces a blank state |
| Layered categorization at render time (library aliases first, heuristic fallback) | This is the whole point; must ship with backfill in the same phase |
| Library tab: browse all, filter curated/uncurated, partial-text search | Trust anchor; users need to see and triage what the system knows |
| Library tab: inline edit (name, aliases, both categories), delete, manually add | Primary curation surface |
| Inline Fix shortcut on grocery items and recipe ingredient lines | Context-driven fixes have higher completion rates than dedicated maintenance sessions |

### Differentiators - IN

- Dual recipeCategory + groceryCategory per entry (unique vs. Mealie/Tandoor single-category model)
- curated: false flag enabling uncurated-first triage UX (no equivalent in any reference app)
- In-context Fix shortcut requiring no page navigation (Mealie and Tandoor both require navigating away)

### Anti-Features - Explicitly OUT

| Feature | Why Out |
|---------|---------|
| CSV / OpenFoodFacts import | Seeding 200+ generic entries creates a cleanup burden users solve with scripts, not the app (Mealie #3551) |
| Library export | No curated data exists yet to know what format is useful; defer until after real use |
| Cross-recipe ingredient merging (mutating state.recipes[].ingredients[]) | Separate project; out of scope per PROJECT.md |
| Nutrition info / allergens in v1 | Entry shape is extensible; implement only when categorization flow is validated |
| AI/LLM fuzzy matching | Non-deterministic; erodes trust; adds network/latency/key overhead |
| Bulk operations (batch edit, batch delete) | Mealie bulk page is a great hidden tool nobody finds; per-entry edit is sufficient at personal-app scale |
| Drag-and-drop category assignment | Mobile-unfriendly; inconsistent with HTMX no-JS-build constraint |
| History / audit log | Adds persistence complexity with no reference app precedent for personal tools |
| nutrition: {} placeholder in entry shape | Premature extensibility; inconsistent schema; causes undefined reads when sub-fields are accessed |

---

## Architecture - The 8-Step Build Order

Each step is independently testable. Strictly follow this order; no step can be safely started before its predecessor is green.

### Step 1: State shape + migration (lib/storage.js + test/storage.test.js)

Add state.library = [], state._librarySeeded = false, and state.libraryMigratedAt (initially absent) to migrate() and defaultState(). This is the root dependency for every other step.

**Co-ship in this step (PITFALLS mandate it here):**
- aliasConflict(library, alias, excludeId) validator in lib/library.js - must exist before any alias is ever written; retrofitting requires a data-repair migration.
- The libraryMigratedAt flag (not library.length === 0) as the backfill guard.
- Fix the word-boundary pea heuristic bug in lib/categorize.js before any seeding runs - backfilled entries inherit heuristic categories, and fixing the heuristic after backfill requires a reseed script.

### Step 2: Library helper (lib/library.js + test/library.test.js)

Pure functions only; zero HTTP; fully testable with plain objects:
- normalizeText(text) - lowercase, collapse whitespace, trim
- matchLibraryEntry(library, text) - longest-alias-wins scan; normalize both sides
- createEntry(name, recipeCategory, groceryCategory) - pure constructor; ID format lb_ + 8-char base36
- extractAndSeed(state, ingredients[]) - calls normalizeText + matchLibraryEntry + createEntry; returns new-entry count; includes normalization pre-pass to strip quantity tokens and preparation notes before matching
- backfillLibrary(state) - walks state.recipes, calls extractAndSeed per recipe

**Normalization pre-pass is required here (not optional):** Without it, auto-extract noise (Pitfall 2) makes the library unmanageable after 10 recipes.

### Step 3: Categorize layer extension (lib/categorize.js + test/categorize.test.js)

Add optional library parameter to recipeCategoryOf(text, library?) and groceryCategoryOf(text, library?). Library match has priority; heuristic fallback is unchanged. All existing tests must continue to pass when library is omitted.

**Import direction is strict:** lib/library.js may require lib/categorize.js (for seeding default categories). lib/categorize.js must NOT require lib/library.js (circular dependency). Pass library as an argument, never import at module level.

### Step 4: View model extension (lib/calc.js + test/calc.test.js)

- buildLibraryView(state, filter?) - new function; returns { entries, filter, totalCount, uncuratedCount }
- Update decorateIngredients(ingredients, library) - passes library through to recipeCategoryOf
- Update buildGroceryView(state) - attaches libraryEntryId: entry?.id || null to each item (needed by Fix shortcut; null means Fix button is hidden)

All existing tests must pass. Existing callers pass no library arg and get unmodified heuristic behavior.

### Step 5: Auto-extract hook in recipes route (routes/recipes.js + test/recipes.test.js)

After storage.save() on POST /recipes, call extractAndSeed(state, entry.ingredients). Call storage.save() a second time only if the returned count is > 0 (avoid redundant write). Add the backfill sentinel check here or in server.js startup - runs once, then sets libraryMigratedAt.

### Step 6: Library routes (routes/library.js + test/library-routes.test.js)

- GET /library (with optional ?filter=uncurated|curated)
- POST /library (manual add)
- PUT /library/:id (full entry edit)
- DELETE /library/:id
- GET /library/:id/edit-inline (returns small fragment for Fix shortcut)
- PUT /library/:id/categories (Fix shortcut save; OOB-swaps library panel + triggering page panel)

Route handlers are thin orchestrators; all logic lives in lib/library.js. respondWithUpdates + OOB-swap follows the established two-pane pattern.

**Co-ship in this step:** Warn before delete. Do not auto-delete orphaned entries; surface orphan count in Library tab footer.

### Step 7: Templates

Files: views/library.njk, views/partials/library-panel.njk, views/partials/library-entry-edit.njk, small additions to grocery-item.njk and recipe.njk.

- Library tab: filter bar (All / Uncurated / Curated), entry list, inline edit rows (outerHTML swap; no modal, no detail page)
- Static Add entry form at top of panel (POST /library)
- Fix button on grocery items and recipe ingredient lines (only rendered when libraryEntryId is non-null)
- **Templates always display ingredient.text** (the original scraped string). The canonical entry.name appears only inside the Fix editor as clearly-labelled metadata. Never substitute entry.name for ingredient.text in any recipe or grocery template.

### Step 8: Nav tab (views/layout.njk)

Add the Library tab last - only visible when the feature is complete. This is intentional: do not surface a broken or half-implemented tab.

---

## Critical Pitfalls with Phase Mapping

### Pitfall 1 - Alias collision (two entries claiming the same alias string)

**Prevention:** aliasConflict() validator runs in the route handler and in extractAndSeed, not just in the UI form. Case-insensitive, whitespace-normalized comparison.

    function aliasConflict(library, alias, excludeId) {
      const norm = alias.trim().toLowerCase();
      return library.find(e =>
        e.id !== excludeId &&
        [e.name, ...e.aliases].some(a => a.trim().toLowerCase() === norm)
      );
    }

**Phase:** Step 1 (storage) - ship with the initial migration, never retrofit.

### Pitfall 2 - Auto-extract noise (every quantity variant becomes its own entry)

**Prevention:** Normalization pre-pass in extractAndSeed strips quantity tokens and preparation notes before matching. Cap: one uncurated entry per normalized root per save operation.
**Phase:** Step 2 (library helper) - normalization must be in extractAndSeed before the first recipe is saved with library active.

### Pitfall 3 - Backfill duplicates on server restart

**Prevention:** Use state.libraryMigratedAt (ISO timestamp) as the idempotency guard, not state.library.length === 0. The backfill sets this flag; future restarts skip it.
**Phase:** Step 1 (storage migration) - the flag must be part of the initial migration commit.

### Pitfall 4 + 8 (combined) - Heuristic bugs baked into backfilled entries

**Prevention:** Fix the word-boundary pea collision (peanut butter miscategorized as Veg/Produce) in lib/categorize.js before any backfill runs. All backfilled entries are marked curated: false with a visible heuristic-guessed indicator in the Library tab.
**Phase:** Step 1 (same commit as heuristic fix) + Step 3 (categorize extension). These are co-dependent; do not split across phases.

### Pitfall 5 - Canonical name shown on recipe ingredient lines

**Prevention:** Hard rule: templates display ingredient.text always. entry.name is metadata visible only in the Fix editor, explicitly labelled Library entry.
**Phase:** Step 7 (templates) - enforce as a template contract from the first template commit.

---

## Open Questions for the Roadmapper

1. **Backfill placement:** Architecture research recommends running backfill in server.js startup (synchronous, before accepting requests) rather than on first-request time. Confirm: startup hook or first GET /library request?

2. **Orphan display:** Surfacing a footer count of entries unused by any recipe requires scanning all recipes on every Library tab render. Clarify: compute on every render, or compute once after a recipe delete and store as a view-model field?

3. **Uncurated-first as default filter:** Features research recommends defaulting the Library tab to ?filter=uncurated on first visit. Decide: always uncurated, always all, or persisted per-session?

4. **Fix shortcut scope:** Should the inline Fix shortcut allow editing name/aliases (full entry), or categories only? Categories-only reduces fragment size and alias-collision risk from an inline editor.

5. **Phase 1 bundling (non-negotiable):** The word-boundary pea fix, alias-uniqueness validator, and libraryMigratedAt guard are a single atomic unit in Step 1. The roadmapper must not split these across separate tasks or phases.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations extend existing codebase patterns; no new technology required |
| Features | MEDIUM-HIGH | Grounded in Mealie/Tandoor/Grocy issue-tracker analysis; personal-app scope reduces reference pool |
| Architecture | HIGH | Component boundaries derived from existing codebase conventions; build order verified against dependency graph |
| Pitfalls | HIGH | Critical pitfalls verified against Mealie/Tandoor issue trackers with specific issue numbers; heuristic bugs verified against lib/categorize.js directly |

**Overall confidence: HIGH**

**Gaps:**
- The normalization pre-pass regex (stripping quantity tokens and preparation notes) is specified as a requirement but not yet prototyped. Write and test this function first in Step 2 before committing to any entry-count estimates.
- Orphan-count display performance (scan all recipes on every Library tab render) is acceptable at personal-app scale but is unverified. If recipe count exceeds ~500, consider caching.

---

## Sources

**HIGH confidence (read directly or verified via official docs):**
- lib/categorize.js - existing sorted-regex pattern; word-boundary pea collision confirmed
- lib/storage.js - migrate() defensive-spread pattern confirmed as validation idiom
- .planning/codebase/CONCERNS.md - toast non-ASCII bug, dangling week IDs, pea collision
- mealie-recipes/mealie #2229, #3225, #3551, #3624, #4936, #6209, #2650 - alias/food bugs and migration failures
- HTMX edit-row pattern - https://htmx.org/examples/edit-row/
- USDA FoodData Central API Guide - https://fdc.nal.usda.gov/api-guide/
- npm registry fuse.js 7.3.0 - CJS entry point confirmed

**MEDIUM confidence:**
- Tandoor ingredient parser / supermarket category UX - docs + selfhosting reviews
- bheisler.github.io Recipe Manager Part 5 - render-time categorization rationale
- OpenFoodFacts API - no-auth confirmed; @openfoodfacts/openfoodfacts-nodejs alpha status confirmed

---

*Research completed: 2026-05-05*
*Ready for roadmap: yes*
