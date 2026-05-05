<!-- refreshed: 2026-05-05 -->
# Architecture

**Analysis Date:** 2026-05-05

## System Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│                      View Layer (Nunjucks)                          │
│  index.njk / this-week.njk / grocery.njk / history.njk / recipe.njk │
│  + partials/ (recipe-card, grocery-item, week-banner, etc)         │
└────────────────────────────────┬───────────────────────────────────┘
                                 │
                    Layout Template (layout.njk)
         - 4-tab nav (Recipes / This Week / Grocery / History)
         - Status toast (via X-Status-Toast header)
         - HTMX JS + glue script
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Route Layer (Express Routers)                     │
│  routes/recipes.js │ routes/weeks.js │ routes/grocery.js            │
│     routes/history.js                                               │
│  - POST/DELETE handlers mutate state, call storage.save()          │
│  - Respond with OOB-swap fragments + X-Status-Toast header         │
└────────────────┬──────────────────────────────┬──────────────────┬──┘
                 │                              │                  │
    ┌────────────▼────────────┐   ┌────────────▼──────┐  ┌────────▼──────┐
    │  View Model Layer       │   │ Render Layer      │  │ State         │
    │  lib/calc.js            │   │ lib/render.js     │  │ lib/storage.js│
    │ - buildView()           │   │                   │  │               │
    │ - buildWeeklyView()     │   │ - renderSync()    │  │ - get()       │
    │ - buildGroceryView()    │   │ - respondWithUpdates() │ - save()      │
    │ - buildHistoryView()    │   │ - injectOob()     │  │ - replace()   │
    │ - decorateIngredients() │   │                   │  │ - reset()     │
    │                         │   │                   │  │               │
    │ Depends on:            │   │ Uses:             │  │ Reads/writes: │
    │ - lib/week.js          │   │ - storage.get()   │  │ data/state.json
    │ - lib/categorize.js    │   │ - buildView()     │  │               │
    │ - lib/scrape.js        │   │ - nunjucks env    │  │ Atomic rename:|
    └────────────────────────┘   └───────────────────┘  │ .tmp → .json  │
                                                         └───────────────┘
                                 │
                ┌────────────────┴──────────────┬──────────────────┐
                │                               │                  │
    ┌───────────▼───────────┐    ┌──────────────▼──────┐  ┌────────▼──────┐
    │ Helper Modules        │    │ Categorization      │  │ ID Generation │
    │ lib/week.js           │    │ lib/categorize.js   │  │ lib/id.js      │
    │ lib/grocery.js        │    │                     │  │                │
    │ lib/scrape.js         │    │ - recipeCategoryOf()│  │ - idForUrl()   │
    │                       │    │ - groceryCategoryOf()  │   (sha256 →    │
    │ - mondayOf()          │    │ - RECIPE_CATEGORIES │  │    base36)     │
    │ - tagRecipe()         │    │ - GROCERY_CATEGORIES│  │                │
    │ - confirmWeek()       │    │                     │  │ Used for:      │
    │ - unconfirmWeek()     │    │ Heuristic keywords  │  │ - Recipe IDs   │
    │ - addItem()           │    │ indexed by length   │  │ - Grocery IDs  │
    │ - toggleChecked()     │    │ (longest win)       │  │   (per-session)│
    │ - removeItem()        │    │                     │  │                │
    │ - clearChecked()      │    │                     │  │                │
    │                       │    │                     │  │                │
    │ - newGroceryId()      │    │                     │  │                │
    │   (random base36)     │    │                     │  │                │
    └───────────────────────┘    └─────────────────────┘  └────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Layout** | Global page structure: nav, tabs, toast | `views/layout.njk` |
| **View Routes** | Render full pages with initial state | `routes/recipes.js`, `routes/weeks.js`, `routes/grocery.js`, `routes/history.js` |
| **Mutation Routes** | Handle POST/DELETE, mutate state, return OOB fragments | `routes/recipes.js`, `routes/weeks.js`, `routes/grocery.js` |
| **View Models** | Transform state → template context (sorting, tagging, categorization) | `lib/calc.js` |
| **Render** | Assemble fragments, inject OOB markers, return HTML | `lib/render.js` |
| **Storage** | Load/save `data/state.json` atomically via temp-file rename | `lib/storage.js` |
| **Week Logic** | Monday calculation, week creation, recipe tagging, confirmation | `lib/week.js` |
| **Grocery Logic** | Add/remove/toggle items, bulk clear | `lib/grocery.js` |
| **Categorization** | Keyword-based heuristic for recipe & grocery categories | `lib/categorize.js` |
| **Scraping** | Extract JSON-LD recipe from URL; parse ISO 8601 durations | `lib/scrape.js` |
| **ID Generation** | SHA256 hash of URL → 10-char base36 (stable, collision-resistant) | `lib/id.js` |

## Pattern Overview

**Overall:** Server-side template rendering with HTMX-driven incremental updates. No client-side state — all mutations happen on the server, which responds with HTML fragments that HTMX swaps in-place. Toast notifications delivered via response headers.

**Key Characteristics:**
- **Stateless requests:** Every handler calls `storage.get()` to reload state; no session/memory retention
- **Atomic persistence:** Temp file renamed to final path to avoid corruption on crash
- **Fragment-driven UI:** Mutations respond with only the changed partials (via `respondWithUpdates`)
- **Header-driven notifications:** Toast message passed as `X-Status-Toast` header; client-side JS reads it
- **Lazy week creation:** `ensureCurrentWeek()` creates the active week on first state-touching request after rollover
- **Category heuristics:** Keywords indexed by length; longest match wins (e.g., "black bean" beats "bean")

## Layers

**View Layer:**
- Purpose: Render HTML to client; define UI structure and form/button bindings
- Location: `views/*.njk`, `views/partials/*.njk`
- Contains: Nunjucks templates with conditionals, loops, form attributes (hx-post, hx-delete, hx-swap)
- Depends on: Template context from view models (buildView, buildWeeklyView, etc)
- Used by: Routes via `res.render()`

**Route Layer:**
- Purpose: Accept HTTP requests, call business logic, respond with either full pages or OOB fragments
- Location: `routes/recipes.js`, `routes/weeks.js`, `routes/grocery.js`, `routes/history.js`
- Contains: Express Router definitions; GET for initial page render, POST/DELETE for mutations
- Depends on: Storage, helper modules (week, grocery, calc), render module
- Used by: Express app (server.js); orchestrates the request-response cycle

**View Model / Decoration Layer:**
- Purpose: Transform raw state into template-ready objects (sorting, filtering, categorization, counting)
- Location: `lib/calc.js`
- Contains: Pure functions that accept state + date, return object keyed by view name
- Depends on: week (mondayOf), categorize, state shape
- Used by: Route handlers (GET routes + respondWithUpdates in mutations)

**Render Layer:**
- Purpose: Assemble Nunjucks fragments into HTML; inject OOB markers; handle response headers
- Location: `lib/render.js`
- Contains: Sync template rendering, OOB HTML injection, fragment batching
- Depends on: buildView (for context), storage (to reload state), nunjucks env
- Used by: Mutation route handlers via `respondWithUpdates()`

**State Persistence Layer:**
- Purpose: Load/save JSON state file with atomic writes
- Location: `lib/storage.js`
- Contains: Singleton in-memory cache; file I/O with temp-rename pattern
- Depends on: fs module; defaults if file missing or corrupt
- Used by: Every route handler

**Helper Modules:**
- **week.js:** Week/day math, recipe tagging, confirmation logic, ingredient→grocery transfer
- **grocery.js:** Item CRUD, check toggle, bulk clear
- **scrape.js:** JSON-LD extraction from HTML, ISO 8601 duration parsing
- **id.js:** URL → stable 10-char ID via SHA256
- **categorize.js:** Keyword tables (RECIPE_CATEGORIES, GROCERY_CATEGORIES) and matching logic

## Data Flow

### Primary Request Path (Initial Page Load)

1. **Browser requests** `GET /` or `GET /this-week` etc. (`server.js:29-31`, `routes/*.js:14-16`)
2. **Route handler calls** `storage.get()` to load state (`lib/storage.js:53`)
3. **Handler calls** view model (e.g., `buildView()`) to decorate state (`lib/calc.js:23-43`)
4. **Handler calls** `res.render()` with Nunjucks template + decorated context
5. **Response:** Full HTML page with 4-tab nav, active tab highlighted, content rendered

Example (Recipes page):
```
GET / → storage.get() → buildView(state, today) → res.render('index.njk', { recipes: [...], activeTab: 'recipes' })
```

### Mutation Flow (POST/DELETE with HTMX)

1. **HTMX form submits** `hx-post="/recipes"` or `hx-delete="/recipes/:id"` (from `views/*.njk`)
2. **Route handler** receives form data or route params (`routes/recipes.js:16-49`, etc)
3. **Handler mutates state:**
   - `const state = storage.get()`
   - Call helper (e.g., `tagRecipe(state, id, today)`) or direct mutation (e.g., `state.recipes.push(entry)`)
   - `storage.save()` writes to disk atomically
4. **Handler builds response** via `respondWithUpdates(req, res, { panels: [...], extra: {...} })`
   - `respondWithUpdates` calls view models to get fresh context
   - Renders only changed partials from `views/partials/`
   - Injects `hx-swap-oob="true"` marker on each fragment
   - Sets `X-Status-Toast` header with toast message
   - Responds with HTML (multiple OOB fragments)
5. **HTMX client** receives HTML response:
   - Swaps OOB fragments in-place (by ID match)
   - Reads `X-Status-Toast` header via `htmx:afterRequest` event
   - Shows toast notification for 1.2s (or 3.5s if error)

Example (Add recipe):
```
POST /recipes → scrape(url) → idForUrl() → state.recipes.unshift(entry) → storage.save()
→ respondWithUpdates([{ template: 'partials/recipes-panel.njk', ... }])
→ res.set('X-Status-Toast', 'Saved: Title')
→ Rendered HTML with hx-swap-oob="true" on <section id="recipes-panel">
```

### Secondary Flow: Tag Recipe (Two-Pane Update)

When user clicks tag toggle from either Recipes or This Week tab:

1. **HTMX sends** `POST /this-week/recipes/:id` with `hx-current-url` header
2. **Handler** calls `tagRecipe(state, id, today)` → returns `{ ok: true, isTagged: ... }`
3. **Handler responds with TWO panels** (`respondWithUpdates`):
   - `partials/recipe-card.njk` (the recipe card UI updates)
   - `partials/tag-toggle.njk` (the toggle button UI updates)
4. **HTMX** swaps both fragments by ID; context variable `context` tells template which one to render

### Secondary Flow: Confirm Week → Add Ingredients to Grocery

1. **User clicks** "Confirm week" on This Week tab
2. **POST /this-week/confirm** → `confirmWeek(state, today)`
3. **confirmWeek** fetches all recipes in `week.recipeIds`, extracts ingredients, adds to `state.grocery`
4. **Handler responds** with `partials/week-banner.njk` (OOB) showing confirmation status
5. **Toast:** "Added N items to grocery list"

**State Management:**
- **In-memory:** `lib/storage.js` caches state after first load; all handlers see same object
- **Disk:** `data/state.json` updated atomically (write to .tmp, rename to .json)
- **No session/auth:** State is global; this is a single-user personal app
- **No transactions:** If save fails, caller does not retry; error bubbles to global handler

## Key Abstractions

**Week Object:**
- Purpose: Represents a calendar week and the recipes planned for it
- Examples: `{ weekStart: '2026-05-04', recipeIds: ['abc123'], confirmed: true, modifiedAfterConfirm: false }`
- Pattern: Value object; state mutates in-place via helpers (tagRecipe, confirmWeek)

**Recipe Object:**
- Purpose: Scraped recipe metadata + ingredients
- Examples: `{ id: 'abc123', title: '...', sourceUrl: '...', ingredients: [...], instructions: [...], imageUrl: '...', totalMinutes: 45, servings: '4', addedAt: '2026-05-05T...' }`
- Pattern: Stored in state.recipes; decorated by buildView with sourceDomain, totalTimeLabel, isTagged, ingredientGroups

**Grocery Item Object:**
- Purpose: Shopping list item
- Examples: `{ id: 'g_abc123xyz', text: 'eggs', checked: false }`
- Pattern: Stored in state.grocery; categorized in buildGroceryView by recipeCategoryOf() heuristic

**Categorized Ingredient Group:**
- Purpose: Render ingredients by category (Protein, Veg, Seasoning, Flavor, Other)
- Examples: `{ category: 'Protein', items: ['2 eggs', 'chicken breast'] }`
- Pattern: Built by decorateIngredients() via keyword lookup; used in recipe.njk and pending-count calc

**Categorized Grocery Group:**
- Purpose: Render grocery items by aisle (Produce, Meat, Dairy, Aisle, Frozen, Other)
- Examples: `{ category: 'Produce', items: [{ id: '...', text: 'tomato', checked: false }, ...] }`
- Pattern: Built by buildGroceryView; separates unchecked/checked items

## Entry Points

**Server Entry Point:**
- Location: `server.js`
- Triggers: `node server.js` or `npm start`
- Responsibilities: Create Express app, configure Nunjucks, mount routes, listen on port (3003 default)

**HTTP Entry Points (Routes):**
- `GET /` — Render recipes list
- `POST /recipes` — Scrape & save recipe from URL
- `DELETE /recipes/:id` — Remove recipe
- `GET /recipes/:id` — Render single recipe detail page
- `GET /this-week` — Render weekly plan
- `POST /this-week/recipes/:id` — Toggle recipe in active week
- `POST /this-week/confirm` — Confirm week (lock in ingredients → grocery)
- `POST /this-week/unconfirm` — Clear confirmation
- `GET /grocery` — Render grocery list
- `POST /grocery` — Add item
- `POST /grocery/:id/check` — Toggle item checked status
- `DELETE /grocery/:id` — Remove item
- `POST /grocery/clear-checked` — Bulk delete checked items
- `GET /history` — Render past weeks & recipes

## Architectural Constraints

- **Single-threaded:** Node.js event loop; no worker threads. State is global; request handlers are serialized by the event loop (no race conditions in practice).
- **Global state:** In-memory state cache in `lib/storage.js` (module-level `let state`). All handlers reference the same object. Mutations are synchronous.
- **No circular imports detected:** Routes require storage, calc, week/grocery, etc. Helpers do not require routes.
- **Temp-file atomicity:** OS guarantees rename is atomic; but if process crashes mid-write, .tmp file remains (manually recoverable).
- **Weekly Monday rollover:** `mondayOf()` is deterministic; week auto-creates on first mutation after Monday 00:00 UTC.
- **Keyword index ordering:** `categorize.js` sorts entries by keyword length descending; ensures longest match (e.g., "black bean" before "bean").

## Anti-Patterns

### Lazy Week Creation on Mutation

**What happens:** `ensureCurrentWeek()` is called by `tagRecipe()` and `confirmWeek()`, creating a new week entry if it doesn't exist. Happens automatically on first request after Monday 00:00.

**Why it's a problem (if any):** No explicit "create week" action in UI; behavior is implicit. Users may not realize a week was created until they navigate to "This Week" tab. Can cause confusion if not documented.

**Do this instead:** Document in README that weeks are auto-created. Consider adding a visual indicator when a new week is created (toast message "Week of 2026-05-05" when first tag is added).

### Direct State Mutation in Routes

**What happens:** Route handlers mutate state in-place (e.g., `state.recipes.unshift(entry)`, `state.grocery.push(item)`), then call `storage.save()`.

**Why it's a problem (if any):** No validation layer between HTTP input and state change. If scraped recipe is malformed, it still gets saved. If grocery item is too long (>500 chars), trimmed silently.

**Do this instead:** Helpers already validate (e.g., `addItem()` trims and checks length). Ensure all mutations go through helpers; minimize direct state access in routes. Consider adding a validation schema if scraper output becomes more complex.

### Missing Ingredient Count Logic

**What happens:** "Pending ingredients" count in buildWeeklyView is calculated by iterating over tagged recipes and checking against existing grocery items. This is O(recipes × ingredients × grocery items).

**Why it's a problem (if any):** On large datasets (1000+ recipes), performance may degrade. But for personal use (<100 recipes), negligible.

**Do this instead:** Cache the pending count in state if performance becomes an issue. For now, acceptable trade-off for simplicity.

## Error Handling

**Strategy:** Synchronous errors bubble to Express global error handler (`server.js:33-36`). Async errors (in scraping) are caught in try-catch; failed scrapes return `{ ok: false, reason: '...' }` and re-render UI with toast error message.

**Patterns:**
- **Validation errors:** Return `{ ok: false, reason: '...' }` from helpers; routes respond with 400 + toast
- **Not found:** Routes return 404 if recipe/item doesn't exist
- **Scrape failures:** `scrape()` returns `{ ok: false, reason: 'timeout' | 'invalid' | 'no recipe found' }`; routes render recipes-panel with toast explaining failure
- **Storage corruption:** If `state.json` is unreadable, `storage.load()` logs warning and uses defaults (does not crash)

## Cross-Cutting Concerns

**Logging:** Console.log only; no structured logging. Errors logged to stderr. For debugging, rely on console output + state inspection.

**Validation:**
- **Input length:** Grocery item text capped at 500 chars (client + server)
- **URL input:** Validation on client (HTML5 type=url); server accepts any string to `scrape()`
- **ID format:** Only letters/numbers in params checked by Express routing; invalid IDs simply don't match any recipe/item

**Authentication & Authorization:** None. Single-user personal app. No session management.

**Caching:** HTTP response headers do not set Cache-Control; all responses are fresh. Nunjucks template caching disabled in dev mode (autoescape: true, noCache: !prod).

---

*Architecture analysis: 2026-05-05*
