# Architecture Research: Ingredient Library Bolt-On

**Domain:** Canonical ingredient library with alias-based categorization, layered on an existing heuristic
**Researched:** 2026-05-05
**Confidence:** HIGH (pattern questions) / MEDIUM (real-world attribution)

---

## Standard Architecture

### System Overview — New Components and Their Relationships

```
                          [ EXISTING SYSTEM ]

Browser (HTMX)
    |
    | POST /recipes (save recipe)
    v
routes/recipes.js  ──────── storage.get() / storage.save()
    |                               |
    | calls after save              | state.library[] (NEW collection)
    v                               |
lib/library.js (NEW)  <────────────┘
    |
    |  extractAndSeed(state, ingredients[])
    |   1. normalize each ingredient string
    |   2. matchLibraryEntry(library, text)  ← longest-alias-wins scan
    |   3. if matched: skip
    |   4. if unmatched: createEntry(text, heuristic categories, curated:false)
    |   5. push to state.library
    |
    v
    lib/categorize.js (UNCHANGED — heuristic fallback stays)


                         [ RENDER TIME — CHANGED ]

lib/calc.js (decorateIngredients / buildGroceryView)
    |
    | libraryMatch(library, text) → entry.recipeCategory | entry.groceryCategory
    | falls through to recipeCategoryOf(text) / groceryCategoryOf(text) if no match
    v
Nunjucks templates (unchanged output shape — same { category, items[] } groups)


                         [ NEW TAB ]

GET /library
    |
routes/library.js (NEW)
    |──── buildLibraryView(state)  ← in lib/calc.js (new function)
    v
views/library.njk  +  views/partials/library-panel.njk (NEW)
    |
    | Row click → inline edit (outerHTML swap)
    | PUT /library/:id
    | DELETE /library/:id
    | POST /library (manual add)


                         [ INLINE SHORTCUTS (existing pages) ]

views/partials/recipe.njk / grocery-item.njk
    |  "Fix" button → hx-get="/library/:id/edit-inline"
    v
routes/library.js
    |  returns a small edit form fragment
    | PUT /library/:id/categories  (category fields only)
    v
respondWithUpdates([library-panel, grocery-list or ingredient-groups])
```

---

## Component Boundaries

| Component | File | Responsibility | Depends On | Called By |
|-----------|------|---------------|------------|-----------|
| Library CRUD helper | `lib/library.js` | Entry create/update/delete, alias normalization, `extractAndSeed`, `matchLibraryEntry` | `lib/categorize.js` (for seed categories), `lib/id.js` (for entry IDs) | `routes/library.js`, `routes/recipes.js` (post-save hook) |
| Layered categorization | `lib/categorize.js` (extended) | `recipeCategoryOf(text, library?)` and `groceryCategoryOf(text, library?)` — library lookup first, then existing keyword fallback | `state.library` passed as arg | `lib/calc.js` |
| View model extension | `lib/calc.js` (extended) | `buildLibraryView(state)`, extended `decorateIngredients(ingredients, library)`, extended `buildGroceryView(state)` | `lib/library.js`, `lib/categorize.js` | All route handlers |
| Library routes | `routes/library.js` | GET /library, POST /library, PUT /library/:id, DELETE /library/:id, GET /library/:id/edit-inline, PUT /library/:id/categories | `lib/storage`, `lib/library`, `lib/calc`, `lib/render` | `server.js` |
| Storage migration | `lib/storage.js` (extended) | `migrate()` gains `state.library = []` default; no per-entry migration needed | (unchanged) | All startup paths |
| Library tab template | `views/library.njk` + `views/partials/library-panel.njk` | Full library page and OOB-swap target; inline edit row swap | (template context from buildLibraryView) | GET /library, PUT /library/:id |
| Inline Fix fragment | `views/partials/library-entry-edit.njk` | Small category+name editor returned by GET /library/:id/edit-inline | — | HTMX hx-get from grocery / recipe pages |

**Boundary rule:** `lib/library.js` must not `require` routes or `lib/render.js`. It is a pure helper (same rule as `lib/grocery.js`, `lib/week.js`). Route handlers orchestrate; helpers encapsulate logic.

---

## Data Flow: Auto-Extract on Save

The critical question is where extraction runs. The right answer is: **in the route handler, after `storage.save()`, as a synchronous call to a pure helper.** Not middleware (no Express middleware in this codebase), not a hook inside `storage.save()` (that couples storage to business logic), not async (Node is single-threaded; a synchronous scan of <200 ingredients is negligible).

```
POST /recipes
  |
  | 1. scrape(url) → result.recipe
  | 2. state.recipes.unshift(entry)       existing behavior
  | 3. storage.save()                     existing behavior
  |
  | 4. extractAndSeed(state, entry.ingredients)   NEW — pure call
  |      for each ingredient string:
  |        normalized = normalizeText(text)
  |        match = matchLibraryEntry(state.library, normalized)
  |        if (!match) {
  |          state.library.push(createEntry(normalized, heuristicCategories(normalized)))
  |        }
  | 5. storage.save()                     NEW — second save if any entries added
  |
  | 6. setToast / respondWithUpdates      existing behavior
  v
```

`extractAndSeed` returns the number of new entries created. The second `storage.save()` is only called if that count is > 0, avoiding a redundant write.

**Why the route handler, not a storage hook?** The existing codebase has zero middleware or lifecycle hooks; adding one to `storage.save()` would break the pattern and couple storage to domain logic. The route handler already orchestrates save + respond; adding one more synchronous call before the response is the established pattern (see how `confirmWeek` calls multiple state operations before `respondWithUpdates`).

**Why synchronous?** Scraping is already `async`; the library extraction is pure in-memory array work (<1ms for typical recipes). No I/O happens inside `extractAndSeed`. Keeping it sync means no `await`, no error surface, no callback, trivially testable by calling it with a plain state object.

---

## Match-Precedence Architecture

Mealie's `_base.py` (`ABCIngredientParser.find_ingredient_match`) and Tandoor's `ingredient_parser.py` both implement the same three-tier funnel: **exact alias → fuzzy alias → create-new**. For recipe-box, fuzzy matching is explicitly out of scope (no LLM, no RapidFuzz). The correct precedence for this codebase is:

```
matchIngredient(library, text):
  1. Normalize input (lowercase, collapse whitespace, trim)
  2. Scan library entries:
       for each entry:
         for each alias in entry.aliases:
           if normalize(alias) === normalized(text) → MATCH (exact)
           if text includes alias as word-boundary substring and alias.length > bestLen
             → CANDIDATE (longest-substring wins, same strategy as categorize.js)
  3. Return best CANDIDATE if score > 0, else null
  4. Caller: if null → heuristic categorize → create new entry with curated:false
```

**Where the matching logic lives: `lib/library.js`, not `lib/calc.js` and not `lib/categorize.js`.**

- `lib/categorize.js` keeps the keyword tables. It gets an optional `library` param added to `recipeCategoryOf` and `groceryCategoryOf`:
  ```javascript
  // lib/categorize.js — new signature (backward compatible)
  function recipeCategoryOf(text, library) {
    if (library) {
      const entry = matchLibraryEntry(library, text);
      if (entry) return entry.recipeCategory;
    }
    return matchCategory(RECIPE_INDEX, text); // existing fallback
  }
  ```
- `lib/library.js` owns `matchLibraryEntry` and `extractAndSeed`. It does not require `categorize.js` for matching — it only calls `categorize.js` when seeding a new entry's default categories.
- This avoids a circular dependency (library needs categorize for seeding; categorize needs library for lookups — resolved by passing `library` as argument, not requiring it at module level).

**Confidence:** HIGH — this is the same pattern Mealie uses (alias dict → exact match first, then broader scan), adapted to CommonJS pure-function style.

---

## State Shape

The `state.library` entry shape is:

```javascript
{
  id: 'lb_xxxxxxxxxx',   // 'lb_' + 8-char base36 (same style as grocery IDs)
  name: 'peanut butter', // canonical display name (user-editable)
  aliases: [             // strings that resolve to this entry (includes name itself)
    'peanut butter',
    'natural peanut butter',
    'creamy peanut butter'
  ],
  recipeCategory: 'Flavor',   // one of RECIPE_CATEGORIES
  groceryCategory: 'Aisle',   // one of GROCERY_CATEGORIES
  curated: false,             // true once user has touched this entry
  createdAt: '2026-05-05T...' // ISO string
  // Future fields attach here without touching existing entries:
  // nutrition: { calories: 94, ... }
  // allergens: ['peanuts']
}
```

**Why this shape is migration-proof:** The `migrate()` function in `lib/storage.js` only adds the `state.library` array as a default. Individual entries are plain objects — when future fields like `nutrition` are absent, render code checks `entry.nutrition?.calories ?? '--'`. The existing `migrate()` pattern already handles this (see how it guards `merged.recipes`, `merged.weeks`, `merged.grocery`). No entry-level migration is ever needed: absent fields are undefined, not null errors.

**Precedent from Mealie:** Mealie's `IngredientFoodModel` uses `name_normalized` and `plural_name_normalized` as computed shadow fields. Recipe-box does not need a shadow field because normalization is done at match-time (cheaper than maintaining a derived field in a JSON store). Mealie's `aliases` relationship maps to a separate `IngredientFoodAliasModel` — in recipe-box, `aliases[]` is a string array on the entry itself, which is sufficient for a single-user JSON store with <1000 entries.

**ID strategy:** `'lb_' + 8-char base36` follows the existing `g_` grocery ID pattern. Library entries are user-created and not URL-derived, so a random ID (not SHA256) is correct. The `lb_` prefix avoids collision with any future collection that might also use random IDs.

---

## Library Tab UI Pattern

**Recommended pattern: list with inline row edit (outerHTML swap), no detail page, no modal.**

This is the native HTMX edit-row pattern documented at https://htmx.org/examples/edit-row/. The pattern replaces the `<li>` or `<tr>` element's outerHTML with an editable form version; save/cancel returns to the read-only row.

**Why not modal:** The HTMX patterns guide (Hypermedia Systems, Chapter "More HTMX Patterns") explicitly recommends inline editing over modals for list curation workflows. Modals add a focus-management burden and interrupt the user's scanning flow. For a library where the user is triaging 50 uncurated entries, staying in the list is faster.

**Why not a detail page:** Each library entry has 4 editable fields (name, aliases, recipeCategory, groceryCategory). A detail page would be a full round-trip for what is effectively a 4-field form. Inline edit keeps context.

**Filter bar:** A "Show: All / Uncurated / Curated" filter rendered as a query param (`GET /library?filter=uncurated`) lets users focus triage without a separate view. The `buildLibraryView(state, filter)` function partitions entries and passes `{ entries, filter, totalCount, uncuratedCount }`.

**Manual add:** A static "Add entry" form at the top of the panel (not inline in the list) — `POST /library` — is simpler to implement and avoids the complexity of an "insert row" animation.

**Inline Fix shortcut (existing pages):** On grocery items and recipe ingredient lines, a "Fix" button issues `hx-get="/library/:id/edit-inline"` which returns a small fragment containing only the two category selects and a Save button. On save (`PUT /library/:id/categories`), the response includes two OOB panels: the refreshed library panel and the refreshed grocery list or ingredient groups. This follows the existing two-pane OOB update pattern (same as tag toggle updating both recipe-card and tag-toggle panels).

**Finding the right library entry for a grocery item:** The Fix button needs the library entry ID. This is resolved at render time in `buildGroceryView`: for each grocery item, call `matchLibraryEntry(state.library, item.text)` and attach `{ ..item, libraryEntryId: entry?.id || null }` to the item. The template emits the Fix button only when `libraryEntryId` is non-null.

---

## Backfill Flow for Existing Data

**Pattern: one-time, eager, on first load after deploy.** Detected via the `migrate()` function.

```javascript
// lib/storage.js — migrate()
function migrate(raw) {
  const base = defaultState();
  const merged = { ...base, ...(raw || {}) };
  // ... existing guards ...
  if (!Array.isArray(merged.library)) {
    merged.library = [];
    merged._librarySeeded = false;   // sentinel flag
  }
  return merged;
}
```

The sentinel `_librarySeeded` is set to `false` only when the `library` array is first created (i.e., not present in the raw JSON). After `migrate()` runs in `load()`, the backfill runs in a one-time code path in `server.js` startup or on the first request that touches state:

```javascript
// routes/recipes.js (or server.js) — after storage.get()
const state = storage.get();
if (state._librarySeeded === false) {
  const { backfillLibrary } = require('../lib/library');
  backfillLibrary(state);   // walks all recipes, calls extractAndSeed per recipe
  state._librarySeeded = true;
  storage.save();
}
```

`backfillLibrary(state)` is a pure function that calls `extractAndSeed` for each `state.recipes[].ingredients` array in sequence. This is synchronous and runs once at startup. For a typical personal library (<500 total ingredient strings across all recipes), this takes <50ms.

**Why eager, not lazy?** Lazy per-request seeding would require checking the flag on every request until all recipes are processed, complicating the route logic. Running it once at first-request time (or in a startup hook) is simpler and keeps route handlers clean. Since Node is single-threaded and this is a personal app, there is no concurrency concern.

**Why a sentinel flag instead of checking `library.length === 0`?** An empty library after backfill is a valid state (user has no recipes). Using `_librarySeeded` as an explicit boolean avoids re-running the backfill unnecessarily.

**Tandoor comparison:** Tandoor's backfill is handled by its `import/export` subsystem, which applies automation rules post-import. Recipe-box's approach is simpler and correct for a JSON store with no SQL migration system.

---

## Build Order

This ordering minimizes blocked work and ensures each phase is testable in isolation.

1. **State shape + migration** (`lib/storage.js` + `test/storage.test.js`)
   - Add `state.library = []` and `_librarySeeded = false` sentinel to `migrate()`
   - Add `defaultState()` update
   - Nothing else depends on this until step 2

2. **Library helper** (`lib/library.js` + `test/library.test.js`)
   - `createEntry(name, recipeCategory, groceryCategory)` — pure constructor
   - `normalizeText(text)` — pure string normalization
   - `matchLibraryEntry(library, text)` — longest-alias-wins scan, pure
   - `extractAndSeed(state, ingredients)` — calls match + createEntry, mutates state.library
   - `backfillLibrary(state)` — walks state.recipes, calls extractAndSeed
   - All pure functions; fully testable with plain objects; zero HTTP

3. **Categorize layer extension** (`lib/categorize.js` + `test/categorize.test.js`)
   - Add `library` optional parameter to `recipeCategoryOf(text, library?)` and `groceryCategoryOf(text, library?)`
   - Library match has priority; heuristic fallback unchanged
   - Existing tests must all still pass (no behavior change when library is absent)

4. **View model extension** (`lib/calc.js` + `test/calc.test.js`)
   - `buildLibraryView(state, filter?)` — new function
   - Update `decorateIngredients(ingredients, library)` — pass library through to categorize
   - Update `buildGroceryView(state)` — attach `libraryEntryId` to each item
   - All existing tests must pass (existing callers pass no library arg, get heuristic behavior)

5. **Auto-extract hook in recipes route** (`routes/recipes.js` + `test/recipes.test.js`)
   - After `storage.save()` on POST /recipes, call `extractAndSeed(state, entry.ingredients)`
   - Call `storage.save()` only if new entries were added
   - Add backfill sentinel check here or in server.js

6. **Library routes** (`routes/library.js` + `test/library-routes.test.js`)
   - GET /library, POST /library, PUT /library/:id, DELETE /library/:id
   - GET /library/:id/edit-inline, PUT /library/:id/categories

7. **Templates** (`views/library.njk`, `views/partials/library-panel.njk`, `views/partials/library-entry-edit.njk`)
   - Library tab with filter bar, entry list, inline edit rows
   - Fix button on grocery-item.njk and recipe.njk (small template change)

8. **Nav tab** (`views/layout.njk`)
   - Add "Library" tab — last step so it is only visible when the feature is complete

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Pre-computing categories on stored items

**What people do:** Store `recipeCategory` and `groceryCategory` directly on grocery items or recipe ingredient objects in `state.json`, updating them when the library changes.

**Why it is wrong:** The library evolves. If the user renames a category for an entry, every stored item referencing that ingredient now has a stale category. This requires a state migration (expensive, fragile) or a re-scan (effectively equivalent to render-time computation, but with extra complexity). Recipe-box already established the correct pattern: categories are computed at render time in `decorateIngredients()` and `buildGroceryView()`.

**Do this instead:** Compute categories at render time. Pass `state.library` into `recipeCategoryOf` and `groceryCategoryOf`. The library is the source of truth; storage is the store.

### Anti-Pattern 2: Storing the matched entry ID on ingredients

**What people do:** When saving a recipe, attach `libraryId: 'lb_...'` to each ingredient string in `state.recipes[].ingredients`.

**Why it is wrong:** Recipe ingredient strings are the user's raw scraped text. Attaching IDs to them conflates the scraping output with the library match result, creates stale IDs when library entries are deleted, and couples the recipe model to the library model. Recipe ingredients are explicitly strings-only by convention (see `state.recipes` shape in ARCHITECTURE.md).

**Do this instead:** Match at render time. `matchLibraryEntry(state.library, ingredientText)` is O(entries × aliases) per ingredient string. For a personal app with <500 library entries and <50 ingredients per recipe, this is negligible. This is exactly what Mealie does: the food match is computed when building a shopping list, not stored on the recipe.

### Anti-Pattern 3: Putting matching logic in the route handler

**What people do:** Write the alias-scan loop directly in `routes/recipes.js` inline after save.

**Why it is wrong:** Untestable without HTTP. Violates the existing pattern where all business logic lives in helpers and routes are thin orchestrators. The existing `addItem`, `tagRecipe`, `confirmWeek` pattern proves the correct boundary.

**Do this instead:** `lib/library.js` owns matching. Route calls `extractAndSeed(state, ingredients)`. The route handler is never more than 5 lines of orchestration.

### Anti-Pattern 4: Alias normalization at write time only

**What people do:** Normalize aliases when they are saved, store the normalized form, and compare normalized-to-normalized at lookup.

**Why it is wrong:** Normalization rules change (e.g., you later decide to strip articles or strip units). Stored normalized aliases become stale. In a JSON store with no index, you are doing a linear scan anyway, so normalizing at match time costs nothing extra.

**Do this instead:** Store aliases in their original user-entered form. Normalize both the stored alias and the input text at match time inside `matchLibraryEntry`. This is cheap and keeps stored data human-readable.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `routes/recipes.js` → `lib/library.js` | Direct `require` + sync call | `extractAndSeed(state, ingredients)` called after existing save path |
| `lib/calc.js` → `lib/categorize.js` | Passes `state.library` as optional arg | Backward-compatible; existing callers unaffected |
| `lib/calc.js` → `lib/library.js` | `matchLibraryEntry` for attaching `libraryEntryId` to grocery items | Render-time only; no state mutation |
| `routes/library.js` → `lib/render.js` | `respondWithUpdates` with `library-panel.njk` and optional second panel | Same OOB-swap pattern as existing mutation routes |
| `lib/library.js` → `lib/categorize.js` | `recipeCategoryOf(text)` and `groceryCategoryOf(text)` (no library arg — seeding uses heuristic, not the library being built) | Import direction: library.js requires categorize.js; categorize.js does NOT require library.js |

### No New External Services

The library feature adds no external dependencies. Matching is deterministic. No npm packages are needed.

---

## Sources

- Mealie `IngredientFoodModel` + `IngredientFoodAliasModel`: https://github.com/mealie-recipes/mealie (mealie-next branch, `mealie/db/models/recipe/ingredient.py`)
- Mealie `ABCIngredientParser.find_ingredient_match` precedence (exact alias → fuzzy → combined string): https://github.com/mealie-recipes/mealie (mealie-next branch, `mealie/services/parser_services/_base.py`)
- Tandoor ingredient parser (exact name/plural_name match → auto-create): https://github.com/TandoorRecipes/recipes (`cookbook/helper/ingredient_parser.py`)
- HTMX edit-row pattern (outerHTML swap, `hx-target="closest tr"`, `hx-include`): https://htmx.org/examples/edit-row/
- HTMX patterns preference for inline edit over modals: https://hypermedia.systems/ (Chapter "More HTMX Patterns")
- Three-tier ingredient resolution funnel (exact cache → identity store → agent): https://rob-blinsinger-blog.pages.dev/posts/2026-02-22-parsing-recipe-ingredients

---

*Architecture research: 2026-05-05*
*Confidence: HIGH for component boundaries and data flow (derived from existing codebase patterns); MEDIUM for real-world app attribution (GitHub fetches partial; confirmed key claims via multiple sources)*
