---
phase: quick-260609-nph
plan: 01
subsystem: scraper, template, backfill
tags: [ingredients, wprm, sections, ascii, backfill]
dependency_graph:
  requires: []
  provides: [recipe.ingredientSections, parseIngredientSections, decodeHtmlEntities, backfill:sections]
  affects: [lib/scrape.js, views/partials/recipe-ingredient-original.njk, public/styles.css]
tech_stack:
  added: []
  patterns: [regex-based HTML parsing, injected-fetch testing, additive schema extension]
key_files:
  created:
    - scripts/backfill-ingredient-sections.js
    - test/backfill-ingredient-sections.test.js
  modified:
    - lib/scrape.js
    - test/scrape.test.js
    - views/partials/recipe-ingredient-original.njk
    - public/styles.css
    - test/recipes.test.js
    - package.json
decisions:
  - WPRM-only coverage approved; non-WPRM pages get flat fallback ([] sections)
  - Emit rule: suppress sections for single unnamed group - no structure to surface
  - ingredientSections is additive (absent = no sections); not added to defaultState or migrate
  - decodeHtmlEntities maps all non-ASCII to ASCII equivalents to satisfy HTTP header constraint
  - backfillAll persists once after all recipes processed (not per-recipe)
metrics:
  duration: ~25min
  completed: 2026-06-09
  tasks_completed: 3
  files_created: 2
  files_modified: 6
---

# Phase quick-260609-nph Plan 01: WPRM Section Parser + Original View + Backfill Summary

**One-liner:** Regex WPRM ingredient-section parser with ASCII entity decoder wired into `normalizeRecipe`, section-aware Original view template, and idempotent injected-fetch backfill script.

## What Was Built

### Task 1: WPRM section parser + ASCII entity decoder + normalizeRecipe wiring

Added two new exports to `lib/scrape.js`:

- `decodeHtmlEntities(s)`: Maps named entities (amp, lt, gt, quot, apos, nbsp, ndash, mdash, lsquo, rsquo, ldquo, rdquo, hellip, deg) and numeric decimal/hex entities to plain text, then forces ASCII-only output by mapping Unicode dashes to `-`, smart quotes to `'`/`"`, ellipsis to `...`, non-breaking space to ` `, and stripping remaining codepoints >127.

- `parseIngredientSections(html)`: Regex-matches `<div class="...wprm-recipe-ingredient-group...">` blocks. For each block extracts optional `<h4 class="...wprm-recipe-group-name...">` heading (tags stripped, entities decoded, trimmed) and `<li class="...wprm-recipe-ingredient...">` items (inner spans stripped, whitespace collapsed, entities decoded). Applies emit rule: returns `[]` if fewer than 2 groups AND no non-empty heading (flat fallback for single unnamed groups and non-WPRM pages).

`normalizeRecipe` signature extended to `(node, sourceUrl, html)` and now includes `ingredientSections: parseIngredientSections(html)` in the returned object. The `scrape()` call site updated to pass `html`. The flat `recipe.ingredients` array is completely unchanged.

16 new tests added to `test/scrape.test.js` covering: 2-named-groups happy path, ASCII-only output assertion, entity decoding (named + decimal + hex), single unnamed group -> [], non-WPRM -> [], normalizeRecipe integration (sections populated AND flat ingredients unchanged).

### Task 2: Section-aware Original view template + CSS + route render tests

`views/partials/recipe-ingredient-original.njk` updated with a conditional branch:
- `{% if recipe.ingredientSections and recipe.ingredientSections.length > 0 %}`: renders `<h3 class="ingredient-section">` per group heading (only when heading is truthy) and plain `<ul class="recipe-ingredients-original">` with `<li><span>` items. No pencils, no category headers.
- `{% else %}`: existing flat `<ul>` over `recipe.ingredients` with `{% else %}<p class="empty">No ingredients found.</p>` unchanged.

`.ingredient-section` CSS rule added to `public/styles.css` mirroring `.ingredient-category` style (13px, uppercase, muted color, margin 12px 0 4px, letter-spacing 0.05em; first-child margin-top 0).

`routes/recipes.js#decorateRecipeDetail` already uses `...recipe` spread so `ingredientSections` passes through automatically with no route changes needed.

3 route tests added to `test/recipes.test.js`: sections render as `h3.ingredient-section`, flat fallback when field absent, empty state "No ingredients found." when `ingredientSections=[]` and `ingredients=[]`.

### Task 3: Backfill script + npm script + injected-fetch tests

`scripts/backfill-ingredient-sections.js` created with:
- `backfillRecipe(recipe, { fetchFn })`: fetches `recipe.sourceUrl` with same headers/timeout as `lib/scrape.js`, runs `parseIngredientSections(html)`, sets `recipe.ingredientSections` additively. Returns `{ host, status: 'sections'|'flat'|'failed', count, headings, reason }`. Catches all fetch/parse errors, leaves recipe untouched on failure, never throws.
- `backfillAll(state, { fetchFn, sleepFn })`: iterates recipes, calls `backfillRecipe`, throttles 500ms between requests via injected `sleepFn`, prints ASCII console log per recipe, calls `storage.save()` once at the end. Returns reports array.
- Live run guarded by `require.main === module`.

`package.json` updated: `"backfill:sections": "node scripts/backfill-ingredient-sections.js"`.

9 tests in `test/backfill-ingredient-sections.test.js` (all injected-fetch, no live network): success sets sections + 2 headings, other fields unchanged, fetch-throws leaves recipe untouched and report.status=failed, HTTP error leaves recipe untouched, non-WPRM sets sections=[], backfillAll continues after per-recipe failure, running twice yields identical result, pre-existing stale sections are overwritten.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 218291d | feat(quick-260609-nph-01): WPRM section parser, entity decoder, normalizeRecipe wiring |
| 2 | 2c18a62 | feat(quick-260609-nph-01): section-aware Original view template, CSS, route tests |
| 3 | 463678f | feat(quick-260609-nph-01): backfill script with injected-fetch tests and npm script |

## Verification

Full suite: 435 tests, 0 failures.

Exports check: `typeof s.parseIngredientSections` = `function`, `typeof s.decodeHtmlEntities` = `function`.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced beyond those documented in the plan's threat model (T-nph-01 through T-nph-04). All mitigations applied: inner HTML tags stripped via `/<[^>]+>/g`, Nunjucks auto-escapes `{{ }}` output, backfill throttled with per-recipe error isolation.

## Self-Check: PASSED

- lib/scrape.js: exists and exports parseIngredientSections + decodeHtmlEntities
- views/partials/recipe-ingredient-original.njk: updated with sections branch
- public/styles.css: .ingredient-section rule added
- scripts/backfill-ingredient-sections.js: created
- test/backfill-ingredient-sections.test.js: created
- package.json: backfill:sections script added
- All 3 task commits verified in git log (218291d, 2c18a62, 463678f)
- Full suite: 435 pass, 0 fail

## Post-execution deviation (live backfill on real data)

Running `npm run backfill:sections` against the 15 real recipes surfaced two WPRM
markup variants the fixtures did not cover. Fixed in commit 7aa2016:

1. The group-name heading is not always an `<h4>` -- indianhealthyrecipes.com
   renders it on a `<div>`. The heading regex is now tag-agnostic (tag-name
   backreference).
2. The group `<div>` nests the heading `<div>`, so terminating the group match on
   the first `</div>` truncated the heading and items. Each group is now bounded by
   a lookahead to the next ingredient-group / instructions block / end-of-string.
3. Excluded the heading class `wprm-recipe-ingredient-group-name` from matching as a
   group div via a `(?!-)` negative lookahead.

Regression test added (group-name on a `<div>`). Re-ran backfill: 5/15 recipes now
carry real sub-headers (stellanspice, heygrillhey, noracooks, indianhealthyrecipes
matar-paneer, recipetineats); the other 10 are genuinely flat (Delish/NYT/Epicurious
non-WPRM, plus single-group WPRM pages like naan and aloo-matar). Full suite: 436 pass.
Note: data/ is gitignored, so the populated state.json is not committed.
