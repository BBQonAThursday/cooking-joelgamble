# Recipe Box

Personal recipe box. Paste a URL — the app extracts the recipe via Schema.org JSON-LD and saves it.

Same stack as siblings (`workout-log`, `planner-dashboard`, `home-hub`): Node + Express + Nunjucks + HTMX, no build step. Default port 3003.

## Run

```bash
npm install
npm start          # http://127.0.0.1:3003
npm run dev        # auto-restart
npm test           # node --test
```

`HOST` and `PORT` env vars override defaults. `HOST=0.0.0.0` binds to all interfaces (LAN/Pi access).

## How it works

1. POST a URL → `lib/scrape.js` fetches the page, finds JSON-LD `<script>` blocks, walks `@graph` for a `@type: "Recipe"` node.
2. The node is normalized to our internal shape (title, description, image URL, servings, total minutes, ingredients, instructions).
3. The recipe is saved to `data/state.json` (atomic temp-file rename).
4. The list view OOB-swaps to show the new card; the detail view renders full ingredients/instructions.

If a page has no JSON-LD recipe data, the toast says so. No HTML fallback in v0.

## Structure

- `lib/storage.js` — state singleton, atomic persist
- `lib/calc.js` — pure view-model
- `lib/render.js` — OOB-swap fragment helper
- `lib/scrape.js` — fetch + JSON-LD extraction + Recipe normalization
- `lib/id.js` — stable URL → 10-char id hash
- `routes/recipes.js` — POST/GET/DELETE
- `views/` — Nunjucks templates
- `test/` — `node:test` suites with fixtures

## Deploying to the Pi

Same as the other home apps: clone as a sibling, `npm install`, run under systemd at port 3003. Picked up by `home-hub`'s recipe-box tile.
