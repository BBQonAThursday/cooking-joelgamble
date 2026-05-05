# Recipe Box — Design Spec

**Status:** approved 2026-05-04
**Scope:** v0 (Tier A — bare minimum)

## Overview

Personal recipe box. Paste a URL → app scrapes the recipe via Schema.org JSON-LD → recipe is saved and displayed. Browse all saved recipes, view one in full, delete. No tags, search, notes, or edit — those wait until they're earned by use.

Sibling of `home-hub`, `workout-log`, `planner-dashboard`. Same stack: Node + Express + Nunjucks + HTMX, atomic JSON state, no build step. Default port **3003**.

## Goals & non-goals

**Goals (v0):**
- Save a recipe by URL
- Browse saved recipes as a list
- View one recipe in full
- Delete a saved recipe
- Show recipe count + latest title in the home-hub tile
- Run cleanly on the Pi alongside the other home apps

**Non-goals (v0):**
- Search, filtering, tags, categories
- Notes, ratings, "made on" dates
- Editing scraped fields
- Image caching (recipes hotlink the source image)
- Author, nutrition, cuisine fields (skipped from JSON-LD)
- Per-site HTML fallback when JSON-LD is missing
- Multi-user
- Recipe scaling, shopping lists, meal planning

## Architecture

Clone-and-rename of `workout-log`'s baseline. The novel module is `lib/scrape.js`.

```
recipe-box/
  server.js                     wiring + route mounts (port 3003 default)
  lib/
    storage.js                  state singleton + atomic persist + defaultState() + migrate()
    calc.js                     pure view-model builder
    render.js                   respondWithUpdates — OOB fragments
    scrape.js                   NEW — fetch URL, extract JSON-LD Recipe, normalize fields
  routes/
    recipes.js                  POST/GET/DELETE recipes
  views/
    layout.njk
    index.njk                   list view + paste-URL form
    recipe.njk                  single-recipe page
    partials/
      recipes-panel.njk         OOB-swappable list
  public/
    styles.css
    vendor/htmx.min.js
  data/state.json               (gitignored)
  test/
```

Conventions inherited from workout-log/CLAUDE.md:
- **Pure `calc.js`** — no fs, no http, no DOM
- **HTMX OOB swaps** — every mutation route returns OOB fragments
- **Atomic writes** — temp file + rename, via `storage.save()`
- **No build step** — plain Node, plain CSS, plain HTML
- **No external JS libs beyond HTMX**

## State shape (`data/state.json`)

```js
{
  recipes: [
    {
      id,                  // string; 10-char base36 hash of sourceUrl; stable
      sourceUrl,           // string; original URL
      title,               // string; from JSON-LD `name`
      description,         // string; from JSON-LD `description`; may be ""
      imageUrl,            // string | null; first image from JSON-LD
      servings,            // string | null; from JSON-LD `recipeYield` (raw)
      totalMinutes,        // number | null; computed
      ingredients,         // string[]; from JSON-LD `recipeIngredient`
      instructions,        // string[]; flattened from JSON-LD `recipeInstructions`
      addedAt              // ISO 8601 timestamp string
    }
  ]
}
```

`migrate()` ensures `state.recipes` is an array. New installs start with `recipes: []`.

## Scraper module (`lib/scrape.js`)

Pure-ish: `async function scrape(url, ctx)` where `ctx = { fetch, now }`. Returns either:

- `{ ok: true, recipe }` — fully shaped recipe object **without** `id`/`addedAt` (the route adds those)
- `{ ok: false, reason }` — human-readable reason for the toast

Tests inject `ctx.fetch` so they never hit the network. `ctx.now` provides the timestamp for any time-dependent logic.

### Fetch step
- `globalThis.fetch` with `User-Agent: Mozilla/5.0 (compatible; recipe-box/0.1)` and a 10s timeout via `AbortController`.
- Reject if status !== 200, `Content-Type` doesn't include `text/html`, or body > 5MB.
- Surface fetch failures as `reason: "Couldn't reach <hostname>"`.

### JSON-LD extraction
- Find every `<script ... type="application/ld+json" ...>...</script>` block. Matcher must be tolerant of additional attributes (e.g. `id`) and any attribute order; the only requirement is the `type="application/ld+json"` attribute is present on a `<script>` tag. Per the JSON spec, ld+json blocks cannot contain raw `</script>`, so a non-greedy match is safe.
- `JSON.parse` each block; ignore parse failures and continue to the next block.
- Walk each parsed value: if it's an array, walk each element; if it has `@graph`, walk each element of that; otherwise check the value itself.
- A node is a recipe if `@type === "Recipe"` OR `@type` is an array containing `"Recipe"`.
- If no recipe found, return `{ ok: false, reason: "No recipe data found on this page" }`.

### Field normalization

| JSON-LD field | Output field | Notes |
|---|---|---|
| `name` | `title` | trim |
| `description` | `description` | trim; default `""` |
| `image` | `imageUrl` | string → use; array → first element (recursively); object with `url` → use that; else `null` |
| `recipeYield` | `servings` | coerce to string, trim; if array, first element |
| `totalTime` / `prepTime` + `cookTime` | `totalMinutes` | parse ISO 8601 duration `PT[XH][YM]`; fall back to prep+cook sum if no totalTime; `null` if neither present |
| `recipeIngredient` | `ingredients` | array of strings; trim each; filter empties |
| `recipeInstructions` | `instructions` | flatten (see below) |

`recipeInstructions` flattening:
- `string` → `[trim(string)]`
- array of strings → strings (trimmed)
- array of objects with `@type: "HowToStep"` → use `.text` of each
- array of objects with `@type: "HowToSection"` → recurse into `.itemListElement`
- empty/missing → `[]`

### ID generation
- `id` is a 10-char base36 hash of `sourceUrl`. Same URL twice = same id (idempotent re-scrape — the route decides what to do with that).

## Routes (`routes/recipes.js`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/recipes` | body: `{ url }`. Scrape, push to state, save. OOB-swap `#recipes-panel` + status toast. |
| `GET` | `/recipes/:id` | Full-page recipe view. Returns `recipe.njk`. 404 if missing. |
| `DELETE` | `/recipes/:id` | Remove from state, save. OOB-swap `#recipes-panel` + status toast. |

**POST behavior on success (new URL):** prepend the new entry to `state.recipes`. Toast says `Saved: <title>`.

**POST behavior on duplicate URL:** if `id` already exists in state, replace the existing entry with the freshly-scraped one (overwriting `addedAt` too — re-saving is a meaningful action and bumping `addedAt` re-promotes the recipe to the top of the list). Toast says `Updated: <title>`.

**POST behavior on scraper failure:** state unchanged, toast says the failure reason ("No recipe data found on this page", "Couldn't reach <hostname>", etc.).

## UI

### `index.njk`
- Page title: "Recipe Box"
- Paste-URL form at top: single text input + submit button. `<form hx-post="/recipes" hx-swap="none">`. Form clears on success.
- Below: `#recipes-panel` (the OOB target) listing recipe cards, newest first.

### `partials/recipes-panel.njk`
- Each card: hero image (or placeholder block), title (linked to `/recipes/:id`), one-line metadata row (`Servings · Total time · source domain`), `.delete-btn ×` in corner.
- Empty state: "No recipes yet. Paste a URL above to get started."

### `recipe.njk` (full page)
- Title (h1)
- Hero image
- Description (if present)
- Metadata row: `Servings · Total time · Source (link to original)`
- Ingredients (`<ul>`)
- Instructions (`<ol>`)
- "Back to recipes" link

### Mobile
- Single-column layout under `@media (max-width: 640px)`
- Hero image full-width
- Lists keep readable font size

## Home-hub tile integration

### Adapter — `home-hub/lib/adapters/recipe-box.js`

Follows the existing planner adapter pattern: direct function export, sync `fs.readFileSync` with `tile.sourcePath`, lines are `{ label, value }` objects, status `'unknown'` (healthcheck supplies up/down).

```js
const fs = require('node:fs');

module.exports = async function read(tile, ctx) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(tile.sourcePath, 'utf8'));
  } catch (err) {
    return { status: 'unknown', latencyMs: null, lines: [], error: err.message };
  }
  const recipes = Array.isArray(raw.recipes) ? raw.recipes : [];
  const latest = recipes.slice().sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))[0];
  const lines = [
    { label: 'Recipes', value: String(recipes.length) },
    { label: 'Latest', value: latest ? latest.title : '—' }
  ];
  return { status: 'unknown', latencyMs: null, lines, error: null };
};
```

Errors (file missing, parse failure) are returned as `error` strings per the existing adapter convention; `lib/tiles.js` also wraps the call with timeout + try/catch.

### Tile config — added to `home-hub/data/state.json` and `defaultState()` in `home-hub/lib/storage.js`

```js
{
  id: 'recipes',
  name: 'Recipe Box',
  kind: 'recipe-box',
  url: 'http://127.0.0.1:3003',
  healthCheck: 'http://127.0.0.1:3003',
  sourcePath: '../recipe-box/data/state.json',
  order: 3
}
```

## Testing

Inherits the `node:test` suite pattern from workout-log. Coverage targets:

- **`lib/scrape.js`** (the novel module):
  - JSON-LD extraction with three real-world fixture pages (e.g. AllRecipes, NYT Cooking, Smitten Kitchen), saved as HTML fixtures under `test/fixtures/`
  - ISO duration parsing (`PT1H30M`, `PT45M`, `PT2H`, malformed)
  - `recipeInstructions` flattening for each shape (string, string[], HowToStep[], HowToSection[])
  - `image` normalization for each shape (string, string[], object with `url`)
  - `@graph` traversal
  - Failure paths: no JSON-LD, no Recipe in graph, JSON parse error, fetch error, non-200 status, oversized body
- **`lib/calc.js`**: view-model assembly with empty and populated state
- **`routes/recipes.js`**: POST + DELETE happy paths via supertest-style request, scraper mocked
- **`home-hub` adapter** (recipe-box.js): file-read happy path + missing-file error

## Pi deployment (future, not v0 scope)

When the Pi is provisioned (per the existing remote-access plan):
- Clone `recipe-box` as a sibling of the other home apps
- `npm install`
- systemd unit at port 3003, `HOST=0.0.0.0` for LAN binding
- Inherits whatever Cloudflare Tunnel routing is already configured for the other apps

## Open questions (none blocking v0)

- Dedupe by canonicalized URL (strip `?utm_*`, fragments) at scrape time? Probably yes, but punting until duplicates actually annoy.
- "Latest" on the hub tile could show "X minutes ago" instead of the title. Title is more useful out of the gate; revisit if it gets noisy.
