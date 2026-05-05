<!-- GSD:project-start source:PROJECT.md -->
## Project

**Ingredient Library**

A curated library of ingredient entries layered on top of recipe-box's existing heuristic categorization. Each entry has a canonical name, a list of matching aliases, recipe-side category (Protein/Veg/Seasoning/Flavor/Other), and grocery-side category (Produce/Meat/Dairy/Aisle/Frozen/Other). The library is auto-seeded as recipes are saved — any unmatched ingredient string becomes a new candidate entry with heuristic-guessed categories. The entry shape is intentionally extensible so future fields (nutrition info, allergens, etc.) can be added without schema migration.

**Core Value:** Ingredient categorization on the grocery list and recipe detail pages converges toward accuracy as the user curates their library, replacing the brittle keyword-table heuristic with a personal source of truth.

### Constraints

- **Tech stack**: Node 18+, Express 4, Nunjucks 3, HTMX 2, no build step. CommonJS, `node:test`. Match the existing recipe-box patterns documented in `.planning/codebase/CONVENTIONS.md`.
- **Persistence**: JSON state file with atomic rename. New collection `state.library` joins existing `state.recipes`, `state.weeks`, `state.grocery`. Migration via `lib/storage.js#migrate`.
- **Categorization layering**: library entries take priority over the existing heuristic tables. The keyword tables in `lib/categorize.js` stay in place as the fallback — do not delete them.
- **HTTP header safety**: toast strings must remain ASCII (em-dashes break Node's HTTP layer — discovered earlier in this session).
- **No auth**: trust model is "single user, LAN-only". No new auth concerns introduced by the library.
- **Render-time categorization**: do not pre-compute and store categories on grocery items or recipe ingredients. Compute fresh on every render so the library is always the source of truth.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (Node.js) - Server-side application logic, utilities, route handlers
- Nunjucks templating - HTML views rendered server-side
- CSS - Static stylesheets (`public/styles.css`)
- HTML - Base markup in Nunjucks templates
## Runtime
- Node.js v24.12.0 (or later compatible version)
- No build step; runs directly with Node
- npm 8.19.2+
- Lockfile: `package-lock.json` (present)
## Frameworks
- Express.js 4.21.1 - HTTP web framework, routing, middleware
- Nunjucks 3.2.4 - Server-side template engine
- HTMX 1.9.x (vendor library in `public/vendor/htmx.min.js`) - Enables dynamic DOM updates via AJAX
- node:test (built-in Node.js test module) - Test runner
## Key Dependencies
- express 4.21.1 - Core HTTP server and routing
- nunjucks 3.2.4 - Template rendering engine
## Configuration
- `HOST` env var - Server bind address (default: 127.0.0.1, use 0.0.0.0 for LAN access)
- `PORT` env var - Server port (default: 3003)
- `RECIPE_BOX_DATA_DIR` env var - Directory for JSON state file (default: `./data`)
- `NODE_ENV` env var - Controls template cache behavior (checked in `server.js:11`)
- None. No build configuration files present.
## Platform Requirements
- Node.js v24.12.0 or compatible
- npm 8.x+
- Access to `data/state.json` for reading/writing recipe state
- Node.js runtime (v24 or later recommended)
- systemd or process manager to keep the service running
- Writable filesystem for `data/state.json` and temp file rename atomicity
- Network access for URL scraping (fetch requests to recipe websites)
## Storage
- JSON file-based: `data/state.json`
- Format: `{ recipes: [], weeks: [], grocery: [] }`
- Atomic writes via temp-file rename pattern (`state.json.tmp` → `state.json`)
- Location configurable via `RECIPE_BOX_DATA_DIR`
- `public/styles.css` - CSS stylesheet
- `public/vendor/htmx.min.js` - HTMX library (52KB minified)
## Scripts
- `npm start` - Start server on port 3003
- `npm run dev` - Start with auto-restart on file changes (node --watch)
- `npm run dev:lan` - Start bound to 0.0.0.0 for LAN access
- `npm test` - Run all test suites with node:test
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Language & Module System
- All code uses CommonJS: `const X = require('./path')` and `module.exports = {}`
- No ES modules (no `import`/`export`)
- Pure Node APIs: `require('node:fs')`, `require('node:path')`, `require('node:crypto')`, `require('node:http')`, `require('node:test')`
## Code Style
- 2-space indentation (consistent throughout all `.js` files)
- Single quotes for strings: `'string'` not `"string"`
- Semicolons required at end of statements
- No linter configured (no `.eslintrc`, `.prettierrc`, or `biome.json`)
## Naming Patterns
- Lowercase, no dashes, no spaces: `storage.js`, `calc.js`, `scrape.js`
- Test files: `*.test.js` (e.g., `storage.test.js`, `recipes.test.js`)
- Route files: `recipes.js`, `weeks.js`, `grocery.js`, `history.js` in `routes/`
- Library modules: `*.js` in `lib/` directory
- camelCase: `defaultState`, `getDataDir`, `getStateFile`, `buildView`, `formatTotalTime`, `sourceDomain`
- Private/internal functions: no prefix convention (no underscore prefix for privacy, but `_resetForTest()` is exposed as testing utility)
- Exported functions: explicitly listed in `module.exports = { ... }`
- camelCase for locals and module-level: `state`, `recipes`, `toastVerb`, `existingIdx`
- UPPERCASE for constants: `RECIPE_CATEGORIES`, `GROCERY_CATEGORIES`, `RECIPE_KEYWORDS`, `GROCERY_KEYWORDS`, `SCRIPT_RE`
- Boolean variables: `isTagged`, `confirmed`, `hasRecipes`, `hasCategorized`, `hasClosed`
- No TypeScript; plain objects with implicit shape
- ID formats:
## Function Design
- Most functions are short (<30 lines); some view builders are longer
- Helper functions stay focused on a single task
- Minimal parameters; functions often take a `state` object and return new/modified data
- Options objects used when multiple optional parameters needed
- Result objects: `{ ok: true, ... }` or `{ ok: false, reason: 'error message' }`
- View objects: `{ activeTab, recipes, hasRecipes, ... }` shaped for template rendering
- Void-returning functions: `load()`, `save()`, `persist()` mutate module state
## Module Design
- All exports explicit in `module.exports = { func1, func2, ... }`
- No barrel exports (no `index.js` re-exports)
- No default exports; always named exports
- `lib/storage.js` is the state owner; returns module-level `state` variable via `get()` and `save()`
- `lib/storage.js#migrate(raw)` handles schema evolution when state shape changes
- Testing utility: `_resetForTest()` clears singleton for per-test isolation
## Architecture Patterns
- `lib/calc.js` produces view-model objects (`buildView`, `buildGroceryView`, etc.)
- Views live in `views/*.njk` (Nunjucks templates)
- Routes call `buildXxxView(storage.get(), context)` and pass result to template or `respondWithUpdates()`
- Routes return HTML fragments via `respondWithUpdates(req, res, { panels, extra })`
- Fragments automatically get `hx-swap-oob="true"` via `injectOob(html)` in `lib/render.js`
- Toast messages set via `setToast(res, msg)` → `X-Status-Toast` HTTP header
- Toast constraint: **no em-dashes or non-ASCII characters** (HTTP header encoding limitation)
## Error Handling
## Comments
- Function headers: none (signatures are self-documenting)
- Complex algorithms: explain the approach
- Regex patterns: explain what's matched
- Non-obvious logic or constraints
## Import Organization
## Validation & Type Checking
## Storage & Persistence
- Write to temporary file `state.json.tmp`
- Rename to `state.json` (atomic on most filesystems)
- No lingering temp files in production
## HTTP & Web Conventions
- Content types: `res.type('html')`, `res.type('text')`
- Status codes: 200 (ok), 400 (bad input), 404 (not found), 500 (server error)
- Headers: `X-Status-Toast` for client-side toast messages
- ASCII-only, no line breaks (replaced with space), max 200 chars
- **Critical:** Must not contain em-dashes or non-ASCII characters (HTTP header encoding issue)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- **Stateless requests:** Every handler calls `storage.get()` to reload state; no session/memory retention
- **Atomic persistence:** Temp file renamed to final path to avoid corruption on crash
- **Fragment-driven UI:** Mutations respond with only the changed partials (via `respondWithUpdates`)
- **Header-driven notifications:** Toast message passed as `X-Status-Toast` header; client-side JS reads it
- **Lazy week creation:** `ensureCurrentWeek()` creates the active week on first state-touching request after rollover
- **Category heuristics:** Keywords indexed by length; longest match wins (e.g., "black bean" beats "bean")
## Layers
- Purpose: Render HTML to client; define UI structure and form/button bindings
- Location: `views/*.njk`, `views/partials/*.njk`
- Contains: Nunjucks templates with conditionals, loops, form attributes (hx-post, hx-delete, hx-swap)
- Depends on: Template context from view models (buildView, buildWeeklyView, etc)
- Used by: Routes via `res.render()`
- Purpose: Accept HTTP requests, call business logic, respond with either full pages or OOB fragments
- Location: `routes/recipes.js`, `routes/weeks.js`, `routes/grocery.js`, `routes/history.js`
- Contains: Express Router definitions; GET for initial page render, POST/DELETE for mutations
- Depends on: Storage, helper modules (week, grocery, calc), render module
- Used by: Express app (server.js); orchestrates the request-response cycle
- Purpose: Transform raw state into template-ready objects (sorting, filtering, categorization, counting)
- Location: `lib/calc.js`
- Contains: Pure functions that accept state + date, return object keyed by view name
- Depends on: week (mondayOf), categorize, state shape
- Used by: Route handlers (GET routes + respondWithUpdates in mutations)
- Purpose: Assemble Nunjucks fragments into HTML; inject OOB markers; handle response headers
- Location: `lib/render.js`
- Contains: Sync template rendering, OOB HTML injection, fragment batching
- Depends on: buildView (for context), storage (to reload state), nunjucks env
- Used by: Mutation route handlers via `respondWithUpdates()`
- Purpose: Load/save JSON state file with atomic writes
- Location: `lib/storage.js`
- Contains: Singleton in-memory cache; file I/O with temp-rename pattern
- Depends on: fs module; defaults if file missing or corrupt
- Used by: Every route handler
- **week.js:** Week/day math, recipe tagging, confirmation logic, ingredient→grocery transfer
- **grocery.js:** Item CRUD, check toggle, bulk clear
- **scrape.js:** JSON-LD extraction from HTML, ISO 8601 duration parsing
- **id.js:** URL → stable 10-char ID via SHA256
- **categorize.js:** Keyword tables (RECIPE_CATEGORIES, GROCERY_CATEGORIES) and matching logic
## Data Flow
### Primary Request Path (Initial Page Load)
```
```
### Mutation Flow (POST/DELETE with HTMX)
```
```
### Secondary Flow: Tag Recipe (Two-Pane Update)
### Secondary Flow: Confirm Week → Add Ingredients to Grocery
- **In-memory:** `lib/storage.js` caches state after first load; all handlers see same object
- **Disk:** `data/state.json` updated atomically (write to .tmp, rename to .json)
- **No session/auth:** State is global; this is a single-user personal app
- **No transactions:** If save fails, caller does not retry; error bubbles to global handler
## Key Abstractions
- Purpose: Represents a calendar week and the recipes planned for it
- Examples: `{ weekStart: '2026-05-04', recipeIds: ['abc123'], confirmed: true, modifiedAfterConfirm: false }`
- Pattern: Value object; state mutates in-place via helpers (tagRecipe, confirmWeek)
- Purpose: Scraped recipe metadata + ingredients
- Examples: `{ id: 'abc123', title: '...', sourceUrl: '...', ingredients: [...], instructions: [...], imageUrl: '...', totalMinutes: 45, servings: '4', addedAt: '2026-05-05T...' }`
- Pattern: Stored in state.recipes; decorated by buildView with sourceDomain, totalTimeLabel, isTagged, ingredientGroups
- Purpose: Shopping list item
- Examples: `{ id: 'g_abc123xyz', text: 'eggs', checked: false }`
- Pattern: Stored in state.grocery; categorized in buildGroceryView by recipeCategoryOf() heuristic
- Purpose: Render ingredients by category (Protein, Veg, Seasoning, Flavor, Other)
- Examples: `{ category: 'Protein', items: ['2 eggs', 'chicken breast'] }`
- Pattern: Built by decorateIngredients() via keyword lookup; used in recipe.njk and pending-count calc
- Purpose: Render grocery items by aisle (Produce, Meat, Dairy, Aisle, Frozen, Other)
- Examples: `{ category: 'Produce', items: [{ id: '...', text: 'tomato', checked: false }, ...] }`
- Pattern: Built by buildGroceryView; separates unchecked/checked items
## Entry Points
- Location: `server.js`
- Triggers: `node server.js` or `npm start`
- Responsibilities: Create Express app, configure Nunjucks, mount routes, listen on port (3003 default)
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
### Direct State Mutation in Routes
### Missing Ingredient Count Logic
## Error Handling
- **Validation errors:** Return `{ ok: false, reason: '...' }` from helpers; routes respond with 400 + toast
- **Not found:** Routes return 404 if recipe/item doesn't exist
- **Scrape failures:** `scrape()` returns `{ ok: false, reason: 'timeout' | 'invalid' | 'no recipe found' }`; routes render recipes-panel with toast explaining failure
- **Storage corruption:** If `state.json` is unreadable, `storage.load()` logs warning and uses defaults (does not crash)
## Cross-Cutting Concerns
- **Input length:** Grocery item text capped at 500 chars (client + server)
- **URL input:** Validation on client (HTML5 type=url); server accepts any string to `scrape()`
- **ID format:** Only letters/numbers in params checked by Express routing; invalid IDs simply don't match any recipe/item
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
