---
phase: quick-260609-nph
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/scrape.js
  - test/scrape.test.js
  - views/partials/recipe-ingredient-original.njk
  - public/styles.css
  - test/recipes.test.js
  - scripts/backfill-ingredient-sections.js
  - test/backfill-ingredient-sections.test.js
  - package.json
autonomous: true
requirements: [NPH-WPRM-SECTIONS]

must_haves:
  truths:
    - "Scraping a WPRM page with >=2 named ingredient groups populates recipe.ingredientSections with decoded ASCII headings and items"
    - "A single unnamed WPRM group or a non-WPRM page yields no ingredientSections (flat fallback)"
    - "The Original ingredient view renders source sub-headers as <h3 class=\"ingredient-section\"> with plain item lines and NO pencils when sections exist"
    - "The Original view falls back to the existing flat <ul> over recipe.ingredients (with 'No ingredients found.' empty state) when no sections"
    - "The flat recipe.ingredients array, categorization, grocery transfer, and all existing tests remain unchanged"
    - "A backfill script re-scrapes existing recipes and sets ingredientSections additively, idempotently, surviving per-recipe fetch failures"
  artifacts:
    - path: "lib/scrape.js"
      provides: "parseIngredientSections + HTML-entity decode helper, wired into normalizeRecipe"
      contains: "parseIngredientSections"
    - path: "views/partials/recipe-ingredient-original.njk"
      provides: "Section-aware Original ingredient view with flat fallback"
      contains: "ingredient-section"
    - path: "scripts/backfill-ingredient-sections.js"
      provides: "Idempotent one-time backfill of ingredientSections via re-scrape"
      contains: "parseIngredientSections"
  key_links:
    - from: "lib/scrape.js#normalizeRecipe"
      to: "recipe.ingredientSections"
      via: "parseIngredientSections(html) result included in returned recipe"
      pattern: "ingredientSections"
    - from: "views/partials/recipe-ingredient-original.njk"
      to: "recipe.ingredientSections"
      via: "Nunjucks {% if recipe.ingredientSections %} branch"
      pattern: "recipe\\.ingredientSections"
    - from: "routes/recipes.js#decorateRecipeDetail"
      to: "recipe.ingredientSections"
      via: "...recipe spread passes the field through unchanged"
      pattern: "\\.\\.\\.recipe"
---

<objective>
Display the SOURCE recipe's own ingredient sub-headers (e.g. "For the dough", "For the sauce") in the Original ingredient view of the recipe detail page, grouped under those headings, for WordPress Recipe Maker (WPRM) sites. The Categorized/processed view is UNCHANGED.

Purpose: WPRM pages carry real ingredient-group structure in their HTML that JSON-LD flattens away. Surfacing it makes the Original view match the source recipe's organization.
Output: A regex WPRM section parser + ASCII entity decoder in lib/scrape.js (wired into normalizeRecipe), a section-aware Original view template, and an idempotent backfill script to populate existing recipes. All additive and non-breaking.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

<design_authority>
The approved design in the planning brief is authoritative. The spike already
established ground truth (do NOT re-investigate):
- JSON-LD recipeIngredient is FLAT with no group info. Do NOT derive groups from JSON-LD.
- WPRM markup carries groups. Non-WPRM pages (delish/Hearst, NYT, Epicurious) get flat fallback. WPRM-only coverage is APPROVED and acceptable.

WPRM markup shape:
  <div class="wprm-recipe-ingredient-group">
    <h4 class="wprm-recipe-group-name">Curry</h4>   (first/default group often has NO h4)
    <ul class="wprm-recipe-ingredients">
      <li class="wprm-recipe-ingredient">
        <span class="wprm-recipe-ingredient-amount">1</span>
        <span class="wprm-recipe-ingredient-unit">tbsp</span>
        <span class="wprm-recipe-ingredient-name">oil</span>
        <span class="wprm-recipe-ingredient-notes">...</span>
      </li>
    </ul>
  </div>

DATA MODEL (additive, NON-breaking):
- recipe.ingredientSections = [{ heading: string|null, items: [string] }]
- heading null/empty = unnamed/default group (render items with NO header).
- recipe.ingredients (flat) STAYS canonical for everything else.
- Do NOT add ingredientSections to defaultState. Absence = no sections. Do NOT backfill in migrate.

EMIT RULE: Only emit sections when there are >=2 groups OR at least one non-empty
heading. A single unnamed group => return [] (flat fallback). Non-WPRM => [].
</design_authority>

<interfaces>
<!-- Extracted from codebase. Use directly; no exploration needed. -->

lib/scrape.js current normalizeRecipe (the wiring point):
```javascript
function normalizeRecipe(node, sourceUrl) {
  const ingredients = Array.isArray(node.recipeIngredient)
    ? node.recipeIngredient.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
    : [];
  return {
    sourceUrl,
    title: trimOrEmpty(node.name),
    description: trimOrEmpty(node.description),
    imageUrl: normalizeImage(node.image),
    servings: normalizeYield(node.recipeYield),
    totalMinutes: totalMinutesFromNode(node),
    ingredients,
    instructions: flattenInstructions(node.recipeInstructions)
  };
}
```
NOTE: normalizeRecipe currently takes (node, sourceUrl). It needs the page HTML
to parse sections. scrape() has `html` in scope at the call site (line ~212:
`normalizeRecipe(node, url)`). Pass html as a 3rd arg: `normalizeRecipe(node, url, html)`.

Current module.exports (line ~215):
```javascript
module.exports = {
  extractJsonLdScripts, findRecipeNode, parseIsoDuration,
  flattenInstructions, normalizeRecipe, normalizeImage, normalizeYield,
  scrape
};
```

scrape() fetch shape (reuse in backfill script):
```javascript
const fetchFn = (ctx && ctx.fetch) || globalThis.fetch;
// AbortController + setTimeout(FETCH_TIMEOUT_MS=10000)
// headers: User-Agent 'Mozilla/5.0 (compatible; recipe-box/0.1)', Accept text/html..., Accept-Language en-US
```

lib/storage.js (backfill uses these):
```javascript
module.exports = { get, save, replace, reset, defaultState, migrateForTest: migrate, _resetForTest };
// get() returns the singleton state { recipes, weeks, grocery, library, libraryMigratedAt }
// save() persists atomically.
```

routes/recipes.js#decorateRecipeDetail spreads `...recipe`, so ingredientSections
flows through to the template automatically. No route change required; just CONFIRM
nothing strips it.

views/partials/recipe-ingredient-original.njk (current — flat list to EXTEND):
```njk
<ul class="recipe-ingredients-original">
  {% for ing in recipe.ingredients %}
    <li class="recipe-ingredient-line">
      <span class="recipe-ingredient-text">{{ ing }}</span>
    </li>
  {% else %}
    <p class="empty">No ingredients found.</p>
  {% endfor %}
</ul>
```

Categorized view header style to mirror (public/styles.css ~line 360):
```css
.ingredient-category {
  font-size: 13px;
  text-transform: uppercase;
  color: var(--muted);
  margin: 12px 0 4px;
  letter-spacing: 0.05em;
}
.ingredient-category:first-child { margin-top: 0; }
```

Template tests run THROUGH the route (no standalone njk rendering). Seed state
directly then GET /recipes/:id — see test/recipes.test.js "renders ingredients
grouped by category" (storage.get(); state.recipes.push({...}); storage.save();
then helpers.request GET /recipes/<id>).

scrape.test.js pattern: `const { fn } = require('../lib/scrape');` then plain
`test('...', () => { assert... })` with inline HTML string fixtures.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: WPRM section parser + ASCII entity decoder + normalizeRecipe wiring</name>
  <files>lib/scrape.js, test/scrape.test.js</files>
  <behavior>
    - decodeHtmlEntities: '&amp;' -> '&', '&ndash;'/'&mdash;' -> '-', '&nbsp;' -> ' ', '&#8217;'/'&#x2019;' (smart apostrophe) -> "'", '&#8220;'/'&#8221;' (smart quotes) -> '"', '&quot;' -> '"', '&#39;'/'&apos;' -> "'", '&lt;'/'&gt;' -> '<'/'>'. Numeric &#NN; and &#xNN; decoded; map non-ASCII codepoints to closest ASCII (dashes->'-', smart quotes->'/"') or drop. Output MUST be ASCII-only.
    - parseIngredientSections(html): WPRM fixture with 2 named groups ("To Saute & Puree", "For Matar Paneer Gravy") -> returns 2 sections, headings decoded ('&' kept as ASCII), each with items = full ingredient text (amount+unit+name+notes joined, inner tags stripped, whitespace collapsed, entities decoded, trimmed).
    - parseIngredientSections: single unnamed WPRM group (no <h4>) -> returns [] (emit rule: <2 groups AND no non-empty heading).
    - parseIngredientSections: non-WPRM HTML (no wprm-recipe-ingredient-group) -> returns [].
    - normalizeRecipe(node, url, wprmHtml) includes ingredientSections from the HTML; the flat ingredients array is still produced from node.recipeIngredient UNCHANGED.
  </behavior>
  <action>
    In lib/scrape.js add:
    1. A decodeHtmlEntities(s) helper. Handle a named-entity map (amp, lt, gt, quot, apos, nbsp, ndash, mdash, lsquo, rsquo, ldquo, rdquo, hellip, deg) plus numeric &#N; and &#xH; via a regex replace. After decoding, force ASCII: replace common Unicode (U+2013/U+2014 en/em dash -> '-', U+2018/U+2019 -> "'", U+201C/U+201D -> '"', U+2026 -> '...', U+00A0 -> ' '); strip any remaining non-ASCII (codepoint > 127). Decode &amp; LAST is unnecessary here since we map directly — but ensure entities are resolved in a single pass to avoid double-decoding. Explain the ASCII-only intent in a comment (CLAUDE.md HTTP-header constraint).
    2. parseIngredientSections(html): regex-match each `<div class="...wprm-recipe-ingredient-group...">...</div>` block (the design's markup uses class="wprm-recipe-ingredient-group"; match that class token tolerant of extra classes/attrs). Within each block: extract optional `<h4 class="...wprm-recipe-group-name...">(.*?)</h4>` -> heading (strip tags, decodeHtmlEntities, trim; null/'' if absent). Extract each `<li class="...wprm-recipe-ingredient...">(.*?)</li>`; for each li, strip ALL inner tags (`/<[^>]+>/g` -> ' '), collapse whitespace (`/\s+/g` -> ' '), decodeHtmlEntities, trim; drop empty items. Build [{ heading, items }] per group. EMIT RULE: after building, if groups.length < 2 AND no group has a non-empty heading, return []. Otherwise return the groups (each with its items; a leading unnamed group keeps heading null). Use the same regex-based, dependency-free style as extractJsonLdScripts. Add explanatory comments for each regex.
    3. Wire into normalizeRecipe: change signature to `normalizeRecipe(node, sourceUrl, html)`. After building the existing return object, add `ingredientSections: parseIngredientSections(html)` (only ADD the field; leave ingredients/title/etc. exactly as-is). Update the scrape() call site (currently `normalizeRecipe(node, url)`) to `normalizeRecipe(node, url, html)`.
    4. Export parseIngredientSections and decodeHtmlEntities in module.exports.

    In test/scrape.test.js append node:test cases covering every bullet in <behavior>, using inline WPRM HTML string fixtures (model them on the indianhealthyrecipes shape from the design). Include: 2-named-groups happy path, entity decoding (group name with &amp;/&ndash; and item with &#8217;), single-unnamed-group -> [], non-WPRM -> [], and a normalizeRecipe case asserting ingredientSections populated AND flat ingredients unchanged from recipeIngredient.

    CONSTRAINTS: CommonJS, 2-space, single quotes, semicolons, ASCII-only in all code and fixture EXPECTATIONS (you may put entities in fixture INPUT, but asserted output is ASCII). No new dependency.
  </action>
  <verify>
    <automated>node --test test/scrape.test.js</automated>
  </verify>
  <done>node --test test/scrape.test.js passes including new section/decode/normalizeRecipe cases; parseIngredientSections and decodeHtmlEntities exported; flat ingredients logic untouched; full `node --test` still green.</done>
</task>

<task type="auto">
  <name>Task 2: Section-aware Original view template + CSS + route render test</name>
  <files>views/partials/recipe-ingredient-original.njk, public/styles.css, test/recipes.test.js</files>
  <action>
    1. Extend views/partials/recipe-ingredient-original.njk: wrap the logic in
       `{% if recipe.ingredientSections and recipe.ingredientSections.length > 0 %}`.
       In the truthy branch, `{% for section in recipe.ingredientSections %}`:
       render `{% if section.heading %}<h3 class="ingredient-section">{{ section.heading }}</h3>{% endif %}`
       then `<ul class="recipe-ingredients-original">` with
       `{% for ing in section.items %}<li class="recipe-ingredient-line"><span class="recipe-ingredient-text">{{ ing }}</span></li>{% endfor %}</ul>`.
       (Plain spans, NO pencils, NO category headers.)
       In the `{% else %}` branch, keep the EXISTING flat `<ul>` over recipe.ingredients
       with the current `{% for %}...{% else %}<p class="empty">No ingredients found.</p>{% endfor %}`
       empty state, unchanged.
    2. In public/styles.css add an `.ingredient-section` rule mirroring `.ingredient-category`
       (font-size 13px, text-transform uppercase, color var(--muted), margin 12px 0 4px,
       letter-spacing 0.05em) plus `.ingredient-section:first-child { margin-top: 0; }`.
       ASCII only.
    3. CONFIRM (read only, no change) routes/recipes.js#decorateRecipeDetail still
       spreads `...recipe` so ingredientSections passes through. Add nothing that strips it.
    4. Append route tests to test/recipes.test.js (seed state directly then GET
       /recipes/:id, mirroring the existing "renders ingredients grouped by category" test):
       - Recipe with ingredientSections=[{heading:'For the dough',items:['2 cups flour']},{heading:'For the sauce',items:['1 can tomatoes']}] and viewMode 'original' (or default) -> body matches `<h3 class="ingredient-section">For the dough</h3>` and `<h3 class="ingredient-section">For the sauce</h3>` and the item text, and does NOT match `ingredient-category` or a pencil/edit button.
       - Recipe with NO ingredientSections (omit field) -> falls back to flat list containing the ingredient text, no `ingredient-section` header.
       - Recipe with ingredientSections=[] and ingredients=[] -> renders `No ingredients found.`.
    CONSTRAINTS: ASCII only; 2-space; existing tests must still pass.
  </action>
  <verify>
    <automated>node --test test/recipes.test.js</automated>
  </verify>
  <done>node --test test/recipes.test.js passes including new section-render, flat-fallback, and empty-state cases; Categorized view and pencils untouched; full `node --test` green.</done>
</task>

<task type="auto">
  <name>Task 3: Backfill script (injected-fetch unit-tested) + npm script</name>
  <files>scripts/backfill-ingredient-sections.js, test/backfill-ingredient-sections.test.js, package.json</files>
  <action>
    1. Create scripts/backfill-ingredient-sections.js. Structure it so the core
       transform is unit-testable WITHOUT live network: export an async function
       e.g. `backfillRecipe(recipe, { fetchFn })` and `backfillAll(state, { fetchFn, sleepFn })`,
       and guard the live run with `if (require.main === module) { ... }`.
       - backfillRecipe: fetch recipe.sourceUrl via injected fetchFn (default: a
         fetch using the SAME User-Agent/Accept headers + 10000ms AbortController
         timeout as lib/scrape.js#scrape). On success, read html = await res.text(),
         run ONLY scrapeMod.parseIngredientSections(html), set
         recipe.ingredientSections = result (ADDITIVE — do NOT touch title/ingredients/
         instructions/any other field). Return a report object
         { host, status: 'sections'|'flat'|'failed', count, headings, reason }.
         On fetch/parse error, catch, leave recipe untouched, return status 'failed'
         with reason. Failures MUST NOT throw out of backfillAll.
       - backfillAll: load state via storage.get() (or accept passed state in tests),
         iterate recipes, await backfillRecipe for each, throttle ~500ms between
         requests via injected sleepFn (default: real setTimeout promise), collect
         reports, storage.save() at the end, print a per-recipe line:
         `host - <N sections: a, b>` or `host - flat (no groups)` or
         `host - FETCH FAILED: reason`. Idempotent: re-running just recomputes/overwrites
         ingredientSections (no duplication, no growth of other collections).
         ASCII-only console output.
       - Export backfillRecipe and backfillAll for tests.
    2. Add npm script to package.json: `"backfill:sections": "node scripts/backfill-ingredient-sections.js"`.
       (Use the Edit tool to add the line to the existing scripts block; do not
       reformat the rest of package.json.)
    3. Create test/backfill-ingredient-sections.test.js (node:test, NO real network):
       - Inject a fetchFn returning a WPRM fixture (text() -> the 2-named-group HTML)
         -> assert recipe.ingredientSections is set with the 2 headings; assert
         title/ingredients are unchanged from before; assert report.status === 'sections'.
       - Inject a fetchFn that throws (or returns res.ok=false) -> assert recipe
         UNCHANGED (no ingredientSections added or pre-existing value preserved) and
         report.status === 'failed' with a reason; backfillAll does NOT throw and
         continues to a second recipe.
       - Idempotency: run backfillRecipe twice with the WPRM fetchFn -> sections
         identical, other fields unchanged.
       Use a stub sleepFn (resolved promise) so tests don't wait 500ms.
    CONSTRAINTS: CommonJS, 2-space, single quotes, semicolons, ASCII-only, no new
    dependency. Reuse lib/storage and lib/scrape (do NOT duplicate parser logic).
  </action>
  <verify>
    <automated>node --test test/backfill-ingredient-sections.test.js</automated>
  </verify>
  <done>node --test test/backfill-ingredient-sections.test.js passes (injected-fetch success, failure-survives, idempotency cases); npm script "backfill:sections" present; script importable without running network; full `node --test` green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote recipe page -> scraper/backfill | Untrusted HTML fetched from third-party recipe sites is parsed by regex |
| stored recipe.ingredientSections -> Nunjucks template | Parsed strings rendered into the detail page |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nph-01 | Tampering | parseIngredientSections regex over remote HTML | mitigate | Strip all inner tags (`/<[^>]+>/g`), collapse whitespace, decode entities to ASCII-only; no eval, no DOM, regex-only — stored output is inert plain text |
| T-nph-02 | Information Disclosure / XSS | recipe-ingredient-original.njk rendering section heading/items | mitigate | Nunjucks auto-escapes `{{ }}` by default (no `\| safe`); section text is plain interpolation, so any residual markup is escaped at render time |
| T-nph-03 | Denial of Service | backfill re-fetch of all recipe sourceUrls | accept | Single-user LAN tool run manually; reuses scrape's 10000ms timeout + 500ms throttle; per-recipe failures are caught and do not abort the run |
| T-nph-04 | Denial of Service | catastrophic regex backtracking on hostile HTML | mitigate | Use non-greedy bounded matches mirroring SCRIPT_RE style; rely on existing 5MB MAX_BYTES page cap in scrape() for live scrapes |
</threat_model>

<verification>
- `node --test` (full suite) passes — no existing scrape/recipes/library/calc test regresses.
- WPRM 2-group fixture -> 2 sections with decoded ASCII headings + items.
- Single unnamed group and non-WPRM HTML -> [] (flat fallback).
- normalizeRecipe adds ingredientSections without altering flat ingredients.
- Original view: sections render as <h3 class="ingredient-section"> + plain lines, no pencils/categories; absent -> flat list; empty -> "No ingredients found.".
- Backfill: success sets sections additively, failure leaves recipe untouched and continues, idempotent on re-run.
- Grep confirms no non-ASCII bytes introduced in code/templates/output (decode-to-ASCII honored).
</verification>

<success_criteria>
- recipe.ingredientSections is an optional additive field populated only for WPRM pages meeting the emit rule; absent/empty otherwise.
- Original ingredient view shows source sub-headers when present, flat list otherwise; Categorized view and pencils unchanged.
- Flat recipe.ingredients remains canonical for categorization, grocery transfer, and pendingCount.
- Backfill script is idempotent, network-injectable for tests, and resilient to per-recipe failures; `npm run backfill:sections` wired.
- All ASCII; no new dependencies; full `node --test` green.
</success_criteria>

<output>
After completion, create `.planning/quick/260609-nph-extract-and-display-source-ingredient-su/260609-nph-SUMMARY.md`
</output>
