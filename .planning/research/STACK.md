# Stack Research

**Domain:** Ingredient library feature — brownfield addition to personal recipe-box app
**Researched:** 2026-05-05
**Confidence:** HIGH (core recommendations) / MEDIUM (future nutrition sources)

---

## Summary Verdict

**Zero new production dependencies required for v1.** The library's alias-matching logic is a natural extension of the pattern already in `lib/categorize.js` — sorted alias array, word-boundary regex, longest-match-wins — implementable in pure JavaScript. The only optional dependency worth evaluating is Fuse.js, and only if the browsable-library search box needs fuzzy tolerance for typos; the base feature does not require it.

---

## Recommended Stack

### Core Technologies

All existing. No changes.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 24.x (runtime) | Server, file I/O, test runner | Already in use; `node:test` + `node:fs` cover everything needed |
| Express 4 | 4.21.1 | HTTP routing for Library tab routes | Already in use |
| Nunjucks 3 | 3.2.4 | Library tab templates, partial rendering for HTMX swaps | Already in use |
| HTMX 2 | vendored | Inline Fix shortcuts, Library tab list mutations | Already in use; OOB-swap pattern established |
| `node:fs` (sync) | built-in | Atomic state.json rename — `state.library` is another array in the same file | Already the persistence model; no migration tooling needed |

### Supporting Libraries — New Dependencies

#### v1 scope: NONE recommended

The alias-matching algorithm that feeds the library lookup is a direct extension of `lib/categorize.js`'s existing approach:

1. Build an index from all `entry.aliases[]` arrays across `state.library`, sorted by alias length descending.
2. For each alias, compile a `\b`-anchored, case-insensitive regex (same `buildIndex`/`matchCategory` pattern already in `categorize.js`).
3. At render time: try library aliases first; on hit, return `{ recipeCategory, groceryCategory }` from the matched entry; on miss, fall through to the existing keyword tables.

This is 15–25 lines of new JavaScript. No library needed.

**Why not add a library anyway:**
- The library in `state.json` will have tens to low-hundreds of entries for a single-user Pi app. The existing sorted-regex approach scales trivially to that size.
- Adding a dependency for a problem you already have a working implementation pattern for violates the project's "no build step, minimal dependencies" design constraint.
- `categorize.js` is already tested; extending it keeps test surface consolidated.

#### Optional / conditional: Fuse.js 7.3.0

| Library | Version | Purpose | When to Add |
|---------|---------|---------|-------------|
| fuse.js | 7.3.0 | Fuzzy search in the Library browser tab (tolerates typos in the search box) | Only if a Library search input is added AND user wants typo-tolerance. Deterministic alias matching does NOT need it. |

**Confidence:** HIGH — npm registry confirmed 7.3.0 stable, CJS entry `./dist/fuse.cjs`, zero dependencies, `require('fuse.js')` works without a build step.

**If added:**
```js
const Fuse = require('fuse.js');
const fuse = new Fuse(state.library, {
  keys: ['name', 'aliases'],
  threshold: 0.35,       // tolerates minor typos
  includeScore: true
});
const results = fuse.search(query).map(r => r.item);
```

The Library tab's filter/search is a server-side route that re-renders the list partial; Fuse runs on the server and the result is rendered as HTML. No client-side bundle needed.

**Verdict: Do not add in v1.** A simple `entry.name.toLowerCase().includes(q)` check on the server covers the Library filter adequately. Revisit if user requests typo-tolerant search.

---

### Data Shape — Extensible Record (no external library needed)

The entry shape below satisfies v1 requirements and leaves nutrition fields as optional future additions without any schema migration:

```js
// lib/library.js — canonical entry shape
{
  id: String,           // nanoid or Date.now().toString(36) — same pattern as existing IDs
  name: String,         // canonical name, e.g. "peanut butter"
  aliases: [String],    // additional match strings, e.g. ["pb", "peanut-butter"]
  recipeCategory: String,  // one of RECIPE_CATEGORIES
  groceryCategory: String, // one of GROCERY_CATEGORIES
  curated: Boolean,     // false = auto-extracted, true = user-confirmed
  createdAt: String,    // ISO timestamp

  // Future fields — add per-entry when nutrition phase begins:
  // nutrition: { calories, protein, fat, carbs, ... },
  // allergens: [String],
  // fdcId: String,       // USDA FoodData Central ID for lookup
  // offBarcode: String,  // OpenFoodFacts barcode if available
}
```

No JSON Schema validator (AJV, Zod, Joi) is needed in v1. The existing `storage.js` `migrate()` function pattern — spread defaults, validate arrays — is sufficient for defensive reads. Add optional fields later; the spread pattern handles missing keys silently.

**Why not AJV/Zod:**
- Both require schema maintenance that adds friction for a single-user personal app.
- AJV has a CJS-compatible `require('ajv')` API and is fast, but it solves a production data-integrity problem that doesn't exist here (one user, one file, LAN-only).
- Zod requires TypeScript or a build step to get full value; this project is plain JavaScript/CommonJS.
- The existing `migrate()` defensive-spread pattern in `storage.js` is already the project's validation idiom; extend it for `state.library`.

---

## Future Nutrition Extension — Source Recommendations (out of v1 scope)

The entry shape above reserves `fdcId` and `offBarcode` fields. When nutrition is added, use **one** of these two sources. Do not integrate both simultaneously.

### Option 1 (Recommended): USDA FoodData Central

| Attribute | Detail |
|-----------|--------|
| Auth | Free API key required (register at fdc.nal.usda.gov); DEMO_KEY available for exploration |
| Rate limit | 1,000 req/hour/IP — more than sufficient for a single-user app doing on-demand enrichment |
| Data type to use | **Foundation Foods** subset — basic unprocessed/minimally processed ingredients, extensive nutrient metadata |
| Access pattern | On-demand: when user clicks "Enrich" on a library entry, call `/foods/search?query={name}`, cache `fdcId` on the entry, then call `/food/{fdcId}` for nutrients |
| Offline | Download Foundation Foods CSV (~200MB) for fully offline Pi deployment if needed |
| Terms | Public domain, CC0 1.0 — no caching restrictions for personal use |
| Node.js client | None needed — `globalThis.fetch` (already used in `lib/scrape.js`) is sufficient |

**Confidence:** HIGH — official USDA docs verified at fdc.nal.usda.gov/api-guide/

### Option 2: OpenFoodFacts

| Attribute | Detail |
|-----------|--------|
| Auth | None required — completely open, no API key |
| Access pattern | Product lookup by barcode (`/api/v2/product/{barcode}`) or search by name |
| Data quality | Community-contributed — good for branded/packaged goods, weaker for raw ingredients |
| Node.js client | `@openfoodfacts/openfoodfacts-nodejs` v2.0.0-alpha (alpha — unstable API); plain `fetch` to REST endpoints is more reliable |
| Terms | Open Database License (ODbL) — attribution required |

**Why FDC wins for this app:** The recipe-box user's library skews toward raw cooking ingredients (chicken, garlic, olive oil) where USDA Foundation Foods has authoritative nutrient data. OpenFoodFacts excels at packaged products by barcode, which is not the primary ingredient type here.

**Implementation note:** Neither source should be integrated at library-build time. Enrich lazily (on user request per entry) and cache the result on the entry's `nutrition` field. This avoids rate-limit concerns and keeps the Pi deployment from doing bulk API calls on startup.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Zod / AJV / Joi | No TypeScript, no build step, single-user file — schema validation adds maintenance overhead with no real safety benefit | `storage.js` `migrate()` defensive-spread pattern |
| `natural` (NLP library) | Stemming/lemmatization is overkill for a curated alias list; pulls in significant dependencies | Alias array with longest-match regex (native JS) |
| `string-similarity` / `string-similarity-js` | Needed only if doing fuzzy deduplication at import time — not a v1 requirement | Deterministic alias lookup; defer to v2 if dedup is needed |
| SQLite / `better-sqlite3` | This is a single-JSON-file app; adding a database changes the deployment model and introduces a native binary dependency (problematic on Pi arm64) | Extend `state.library` in `state.json` |
| Any ORM | Same reason as SQLite — no relational model exists or is needed | — |
| `openfoodfacts-nodejs` alpha | v2.0.0-alpha.17 — unstable API surface, not suitable for a production personal app | Plain `globalThis.fetch` to OpenFoodFacts REST endpoints |
| Fuse.js in v1 | Adds a dep to solve a problem (Library browser search) that `String.prototype.includes` handles fine at this scale | `entry.name.toLowerCase().includes(q)` server-side |

---

## Installation

```bash
# v1: No new production dependencies.
# npm install is unchanged.

# If/when Fuse.js is added for Library search (post-v1):
npm install fuse.js@7.3.0
```

---

## Alternatives Considered

| Decision | Recommended | Alternative | Why Alternative Loses |
|----------|-------------|-------------|----------------------|
| Alias matching algorithm | Extend `categorize.js` sorted-regex pattern | Fuse.js fuzzy search | Deterministic matching is correct for a curated alias list; fuzziness would cause false positives (e.g. "pea" matching "peanut butter") |
| State persistence for library | `state.library[]` in existing `state.json` | Separate `library.json` | Two files means two atomic-write operations per recipe save; single file keeps the transaction simple |
| Nutrition data (future) | USDA FoodData Central | Edamam | Edamam prohibits caching except in user accounts, which conflicts with writing to state.json; USDA is public domain with no such restriction |
| Schema validation | None (migrate() pattern) | AJV | AJV is correct for production multi-user APIs; unnecessary for a single-user personal tool with in-place migration |

---

## Version Compatibility

| Package | Existing Version | Compatible With | Notes |
|---------|------------------|-----------------|-------|
| fuse.js | 7.3.0 (if added) | Node 24, CommonJS | `require('fuse.js')` resolves to `./dist/fuse.cjs`; zero dependencies; no build step |
| express | 4.21.1 | All new lib modules | Library routes follow existing route patterns |
| nunjucks | 3.2.4 | All new templates | Library tab/partials follow existing partial patterns |

---

## Sources

- USDA FoodData Central API Guide — https://fdc.nal.usda.gov/api-guide/ — verified rate limits, auth requirements, Foundation Foods scope (HIGH confidence)
- npm registry (fuse.js) — https://registry.npmjs.org/fuse.js/latest — confirmed version 7.3.0, CJS entry point `./dist/fuse.cjs` (HIGH confidence)
- fuse.js GitHub package.json — https://github.com/krisk/Fuse/blob/master/package.json — confirmed exports map, zero dependencies (HIGH confidence)
- OpenFoodFacts API docs — https://openfoodfacts.github.io/openfoodfacts-server/api/ — confirmed no API key required; `@openfoodfacts/openfoodfacts-nodejs` confirmed alpha status (MEDIUM confidence on SDK stability)
- WebSearch: AJV vs Zod for CommonJS — multiple sources confirm AJV CJS compatibility; Zod TypeScript dependency (MEDIUM confidence — consistent across sources)
- `lib/categorize.js` (this repo) — read directly; existing sorted-regex pattern confirmed as the extension model (HIGH confidence)
- `lib/storage.js` (this repo) — read directly; migrate() pattern confirmed as validation idiom (HIGH confidence)

---

*Stack research for: ingredient-library feature (recipe-box brownfield)*
*Researched: 2026-05-05*
