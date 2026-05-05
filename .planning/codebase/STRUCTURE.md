# Codebase Structure

**Analysis Date:** 2026-05-05

## Directory Layout

```
recipe-box/
├── server.js                    # Express app factory + startup
├── package.json                 # Dependencies: express, nunjucks
├── public/                      # Static assets
│   ├── styles.css              # Global styles (mobile-first)
│   └── vendor/
│       └── htmx.min.js         # HTMX library for request/swap
├── views/                       # Nunjucks templates (full pages)
│   ├── layout.njk              # Master template (nav, toast, script)
│   ├── index.njk               # Recipes list + paste form
│   ├── recipe.njk              # Single recipe detail view
│   ├── this-week.njk           # Weekly meal plan
│   ├── grocery.njk             # Grocery list + add form
│   ├── history.njk             # Past weeks archive
│   └── partials/               # Reusable fragments (OOB-swap targets)
│       ├── recipes-panel.njk   # Recipe list grid
│       ├── recipe-card.njk     # Individual recipe card (with tag toggle)
│       ├── tag-toggle.njk      # Tag/untag button (context-aware)
│       ├── this-week-panel.njk # Weekly recipe list
│       ├── week-banner.njk     # Week header (confirmation status)
│       ├── grocery-list.njk    # Categorized grocery items + closed section
│       └── grocery-item.njk    # Individual grocery item row
├── lib/                         # Pure helper modules
│   ├── calc.js                 # View model builders (buildView, etc)
│   ├── storage.js              # State persistence (get, save, replace)
│   ├── render.js               # Nunjucks fragment assembly + OOB injection
│   ├── week.js                 # Week/day math, recipe tagging, confirmation
│   ├── grocery.js              # Grocery item CRUD + bulk operations
│   ├── scrape.js               # JSON-LD extraction, recipe parsing
│   ├── id.js                   # URL → stable recipe ID (SHA256 → base36)
│   └── categorize.js           # Ingredient/grocery categorization (keywords)
├── routes/                      # Express routers (HTTP handlers)
│   ├── recipes.js              # POST /recipes, DELETE /recipes/:id, GET /recipes/:id
│   ├── weeks.js                # GET /this-week, POST /this-week/recipes/:id, POST /this-week/confirm
│   ├── grocery.js              # GET /grocery, POST /grocery, POST /grocery/:id/check, DELETE /grocery/:id
│   └── history.js              # GET /history
├── data/                        # State persistence (auto-created if missing)
│   └── state.json              # JSON: { recipes: [...], weeks: [...], grocery: [...] }
├── test/                        # Node:test test suites
│   ├── _helpers.js             # Test utilities
│   ├── calc.test.js            # buildView, buildWeeklyView, etc
│   ├── storage.test.js         # get, save, replace, reset
│   ├── week.test.js            # mondayOf, tagRecipe, confirmWeek
│   ├── grocery.test.js         # addItem, toggleChecked, removeItem
│   ├── categorize.test.js      # recipeCategoryOf, groceryCategoryOf
│   ├── id.test.js              # idForUrl
│   ├── scrape.test.js          # scrape, JSON-LD extraction
│   ├── render.test.js          # renderSync, injectOob
│   ├── recipes.test.js         # POST/DELETE /recipes, GET /recipes/:id
│   ├── weeks-routes.test.js    # Routes for /this-week endpoints
│   ├── grocery-routes.test.js  # Routes for /grocery endpoints
│   └── history-routes.test.js  # Routes for /history endpoint
├── .gitignore                   # Excludes: node_modules, data/*, .env
└── docs/                        # Design specs & plans (external tools)
    └── superpowers/
        ├── specs/
        │   └── 2026-05-04-recipe-box-design.md
        └── plans/
            └── 2026-05-05-recipe-box.md
```

## Directory Purposes

**Root (`/`):**
- Purpose: Node.js app entry point and configuration
- Contains: server.js factory, package.json, git config, docs
- Key files: `server.js` (Express setup), `package.json` (metadata + dependencies)

**public/:**
- Purpose: Static assets served by Express.static
- Contains: CSS stylesheet, vendored HTMX library
- Key files: `styles.css` (mobile-first responsive), `vendor/htmx.min.js` (unmodified 3rd-party)

**views/:**
- Purpose: Nunjucks templates for rendering HTML
- Contains: Full-page templates (one per major route) and reusable partials
- Key files:
  - `layout.njk` — Master template with nav, toast div, HTMX glue script
  - `index.njk` — Recipes page (extends layout, includes recipes-panel)
  - `this-week.njk` — Weekly plan page (extends layout, includes week-banner + this-week-panel)
  - `grocery.njk` — Shopping list page (extends layout, grocery-list)
  - `history.njk` — Archive page (extends layout, loops pastWeeks)
  - `recipe.njk` — Detail page (extends layout, shows single recipe with ingredients grouped)

**views/partials/:**
- Purpose: HTML fragments returned by OOB-swap mutations
- Contains: Small template chunks that target a specific DOM ID
- Key files:
  - `recipes-panel.njk` — Rendered recipe grid (id="recipes-panel")
  - `recipe-card.njk` — Single recipe card UI with tag toggle (id="recipe-{id}")
  - `tag-toggle.njk` — Tag/untag button (id="tag-toggle-{id}")
  - `week-banner.njk` — Confirmation status badge (id="week-banner")
  - `this-week-panel.njk` — List of tagged recipes (id="this-week-panel")
  - `grocery-list.njk` — Categorized items + closed section (id="grocery-list")
  - `grocery-item.njk` — Individual item row with check/delete buttons (id="grocery-{id}")

**lib/:**
- Purpose: Pure, reusable helper modules (no side effects except storage.js)
- Contains: Business logic, state transformations, utilities
- Key files:
  - `calc.js` — View-model builders (buildView, buildWeeklyView, buildGroceryView, buildHistoryView, decorateIngredients)
  - `storage.js` — Singleton state loader/saver with atomic writes
  - `render.js` — Nunjucks template rendering + OOB HTML injection
  - `week.js` — Week/day utilities (mondayOf), recipe tagging, confirmation
  - `grocery.js` — Item management (add, toggle, remove, clear)
  - `scrape.js` — Recipe extraction from JSON-LD + duration parsing
  - `id.js` — Deterministic URL → ID mapping (SHA256)
  - `categorize.js` — Ingredient/grocery keyword tables + matching

**routes/:**
- Purpose: HTTP request handlers (Express Routers)
- Contains: POST/GET/DELETE endpoints for each app feature
- Key files:
  - `recipes.js` — Recipe scraping, storage, detail views
  - `weeks.js` — Weekly plan (tag recipes, confirm week)
  - `grocery.js` — Shopping list (add, check, remove items)
  - `history.js` — Past weeks view

**data/:**
- Purpose: Persistent application state
- Contains: Single JSON file (created on first save if missing)
- Key files: `state.json` — Object with recipes[], weeks[], grocery[] arrays
- **Not committed:** Data directory is in .gitignore; each instance has its own copy

**test/:**
- Purpose: Test suites (node:test runner)
- Contains: One test file per module, plus shared test helpers
- Key files: `*test.js` files mirroring lib/ and routes/ structure
- **Run:** `npm test` or `node --test test/*.test.js`

**docs/**
- Purpose: Design documentation and planning artifacts
- Contains: External tool outputs (design specs, phase plans)
- Not core to the app; reference material

## Key File Locations

**Entry Points:**
- `server.js` — HTTP server startup (createApp factory + listen)
- `views/layout.njk` — Master template (all pages extend this)

**Configuration:**
- `package.json` — Dependencies, scripts, metadata
- `.gitignore` — Excludes node_modules, data/, .env*
- `public/styles.css` — Global CSS (breakpoints, layout, color)

**Core Logic:**
- `lib/calc.js` — All view model builders
- `lib/storage.js` — State I/O
- `lib/week.js` — Calendar week utilities + recipe planning
- `lib/grocery.js` — Shopping list operations
- `lib/categorize.js` — Ingredient/grocery categorization

**Routes (Request Handlers):**
- `routes/recipes.js` — Recipe CRUD + scraping
- `routes/weeks.js` — Weekly plan management
- `routes/grocery.js` — Shopping list CRUD
- `routes/history.js` — Archive view

**UI (Nunjucks):**
- Full pages: `views/{index,this-week,grocery,history,recipe}.njk`
- Partials (OOB-swap targets): `views/partials/{recipes-panel,recipe-card,tag-toggle,grocery-list,etc}.njk`

**Tests:**
- `test/calc.test.js`, `test/storage.test.js`, `test/week.test.js`, `test/grocery.test.js`, `test/categorize.test.js`, `test/id.test.js`, `test/scrape.test.js`, `test/render.test.js`
- `test/recipes.test.js`, `test/weeks-routes.test.js`, `test/grocery-routes.test.js`, `test/history-routes.test.js`

## Naming Conventions

**Files:**
- **Routes:** `routes/{feature}.js` — One router per top-level feature (recipes, weeks, grocery, history)
- **Tests:** `test/{module}.test.js` — Matches source file name with `.test.js` suffix
- **Templates:** `views/{page}.njk` — One per major page; partials in `views/partials/{component}.njk`
- **Lib modules:** `lib/{responsibility}.js` — Named by purpose (calc, storage, week, grocery, categorize, scrape, id, render)
- **Data:** `data/state.json` — Single state file (not versioned)

**Functions:**
- **View builders:** `build{Feature}View()` — buildView, buildWeeklyView, buildGroceryView, buildHistoryView
- **State mutators:** Verb-first — `tagRecipe()`, `confirmWeek()`, `addItem()`, `toggleChecked()`
- **Utilities:** Verb-first or noun-first — `mondayOf()`, `idForUrl()`, `sourceDomain()`, `decorateIngredients()`
- **Exports:** Module.exports = { functionA, functionB } — Named exports, no default

**Variables:**
- **camelCase:** All variables, parameters, object keys (e.g., `state.recipes`, `decoratedRecipe`, `weekStart`)
- **UPPER_CASE:** Constants only — `RECIPE_CATEGORIES`, `GROCERY_CATEGORIES`, `RECIPE_KEYWORDS`, `GROCERY_KEYWORDS`
- **Prefixed IDs:** `g_` for grocery items (auto-generated), no prefix for recipes (hash-based)

**Types/Objects:**
- No TypeScript; all vanilla JavaScript
- Recipe: `{ id, title, sourceUrl, totalMinutes, servings, description, imageUrl, ingredients[], instructions[], addedAt }`
- Week: `{ weekStart, recipeIds[], confirmed, modifiedAfterConfirm }`
- Grocery Item: `{ id, text, checked }`
- Categorized Group: `{ category, items[] }` (used for template display)

## Where to Add New Code

**New Feature (e.g., recipe notes, meal prep tips):**
1. **Route handler:** Add POST/GET/DELETE in `routes/recipes.js` or create `routes/notes.js`
2. **State shape:** Update default state in `lib/storage.js` if adding new top-level field
3. **View model:** Add function to `lib/calc.js` (e.g., `buildNotesView()`) to decorate state
4. **Helper:** Create `lib/notes.js` for note-specific CRUD if logic is complex
5. **Template:** Create `views/notes.njk` (full page) and `views/partials/notes-panel.njk` (OOB-swap target)
6. **Tests:** Add `test/notes.test.js` for helpers, `test/notes-routes.test.js` for endpoints

**New Component/Partial (e.g., ingredient search autocomplete):**
1. **Template:** Create `views/partials/ingredient-search.njk`
2. **CSS:** Add styles to `public/styles.css` (or create `public/ingredient-search.css` if large)
3. **JavaScript:** Add to `views/layout.njk` or separate script tag if HTMX + vanilla JS
4. **Route handler:** If fetching data, add endpoint in appropriate `routes/*.js` file

**New Utility/Helper:**
1. **Pure logic:** Add function to existing `lib/*.js` (e.g., new math function → `lib/calc.js`)
2. **New responsibility:** Create `lib/{responsibility}.js` (e.g., `lib/export.js` for CSV export)
3. **Tests:** Add to `test/{module}.test.js` or create new test file

**Styling:**
- All CSS lives in `public/styles.css`
- Mobile-first approach (min-width breakpoints)
- Use utility classes or semantic selectors (no BEM or CSS-in-JS)

## Special Directories

**data/:**
- Purpose: Persistent state file(s)
- Generated: Yes (auto-created by storage.js if missing)
- Committed: No (in .gitignore)
- Caution: Manual editing is possible; backups recommended before migrations

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)
- Contains: express, nunjucks, and their transitive dependencies

**.git/:**
- Purpose: Git version control metadata
- Committed: Yes (auto-managed by git)
- Key branch: `main` (default branch)

**public/vendor/:**
- Purpose: Vendored 3rd-party JS (HTMX)
- Committed: Yes
- Caution: Manual updates required (npm does not manage this)

**test/**
- Purpose: Test suites and test helpers
- Committed: Yes
- Run: `npm test` (runs all *.test.js files in node:test)

---

*Structure analysis: 2026-05-05*
