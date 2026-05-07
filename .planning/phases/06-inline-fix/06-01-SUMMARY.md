---
phase: 06-inline-fix
plan: 01
subsystem: views
tags: [inline-fix, pencil-affordance, html-presence, fix-04-invariant, partial-extraction]
dependency_graph:
  requires:
    - phase-3 buildGroceryView attaches libraryEntryId per item (D-31)
    - phase-3 decorateIngredients returns { text, libraryEntryId } per line (D-32)
    - phase-5 Library tab routes for /library/:id (referenced by hx-get targets, wired in plan 02)
  provides:
    - FIX-01-partial (grocery pencil affordance — UI only; routes wire in plan 02)
    - FIX-02-partial (recipe-line pencil affordance — UI only; routes wire in plan 02)
    - FIX-04-partial (FIX-04 invariant locked at render layer — recipe ingredient text rendered as ing.text, never entry.name)
    - D-69 shared icon partial (one source of bytes for pencil SVG on both surfaces)
    - D-73 OOB target id on <section class="recipe-ingredients"> (consumed by plan 04 OOB swap)
    - per-line stable <li> id (consumed by plan 02 Cancel-fragment reload + plan 04 outerHTML toggle)
    - reusable views/partials/recipe-ingredient-groups.njk (consumed by plan 04 OOB swap)
  affects:
    - views/partials/grocery-item.njk
    - views/recipe.njk
    - views/partials/icon-pencil.njk (new)
    - views/partials/recipe-ingredient-line.njk (new)
    - views/partials/recipe-ingredient-groups.njk (new)
    - test/grocery-routes.test.js
    - test/recipes.test.js
tech_stack:
  added: []
  patterns:
    - shared icon partial via {% include "partials/icon-pencil.njk" %} (no Nunjucks variables, pure markup) — both grocery and recipe surfaces emit identical SVG bytes
    - conditional Nunjucks block on libraryEntryId branching pencil hx-get between Fix and Categorize URLs
    - urlencode filter on user-supplied text in hx-get query params (T-06-01-01 mitigation)
    - per-line stable id pattern recipe-ing-{recipe.id}-{group.category}-{index} (UI-SPEC § stable per-line id; per-group loop.index0)
    - extracted groups partial (recipe-ingredient-groups.njk) for shared initial-render + future OOB-swap use
key_files:
  created:
    - views/partials/icon-pencil.njk
    - views/partials/recipe-ingredient-line.njk
    - views/partials/recipe-ingredient-groups.njk
  modified:
    - views/partials/grocery-item.njk
    - views/recipe.njk
    - test/grocery-routes.test.js
    - test/recipes.test.js
decisions:
  - kept the planner's index-includes-group.category id format (recipe-ing-{id}-{category}-{index}) instead of the global-loop-index alternative — same call as RESEARCH §663-665 option (b); avoids a lib/calc.js mutation
  - FIX-04 rename test seeds entry.name = 'pomme' with alias 'apple' so libraryEntryId still matches the ingredient (alias-based match), proving the rendered text (ing.text "1 apple, sliced") is independent of the canonical name
  - urlencode test uses a regex tolerant of both %20 and + for space encoding (Nunjucks may emit either) — avoids over-specifying engine internals
  - did NOT pre-compute or cache categories on grocery items / recipe ingredients (CLAUDE.md render-time categorization rule preserved — plan adds zero new caches)
metrics:
  duration: ~12 min
  completed: 2026-05-07
  tasks_completed: 3
  files_modified: 7
  tests_added: 11
  tests_total: 360
---

# Phase 6 Plan 01: Inline-Fix UI Scaffolding Summary

Inline pencil affordance scaffolded on every grocery item row and every recipe ingredient line, with shared SVG bytes and FIX-04 render-layer invariant locked by tests. No route wiring (plan 02 lands that); 360 tests passing (baseline 349 + 11 new HTML-presence + invariant assertions).

## Goal Achieved

The pencil button now renders on every grocery row and every recipe ingredient line. Click target points at:
- `/library/{libraryEntryId}/categories-edit?surface=...&...` when the item/ingredient resolves to a library entry (Fix mode), OR
- `/library/categorize-edit?text={item.text|urlencode}&surface=...&...` when no entry matches (Categorize mode).

Both surfaces share `views/partials/icon-pencil.njk` so the SVG bytes are identical (D-69). The recipe `<section>` now carries `id="recipe-ingredient-groups-{recipe.id}"` so plan 04's OOB swap has a fixed target. Each ingredient `<li>` carries a stable per-render id, consumed by plan 02's Cancel-fragment reload and plan 04's outerHTML toggle.

The FIX-04 invariant — recipe ingredient text never substitutes the library entry's canonical name — is now locked at the render layer and verified by two tests including a rename-the-entry case.

## What Shipped

### New files
- **`views/partials/icon-pencil.njk`** (1 line): pure-static `<svg>` with the pencil glyph. `width="14" height="14"`, `viewBox="0 0 16 16"`, `fill="currentColor"`, `aria-hidden="true"`. No Nunjucks variables — both consumers emit byte-identical markup.
- **`views/partials/recipe-ingredient-line.njk`**: single `<li class="recipe-ingredient-line">` with stable per-render id, `<span class="recipe-ingredient-text">{{ ing.text }}</span>`, and a conditional `<button class="recipe-pencil">` that branches `hx-get` on `ing.libraryEntryId`. Shared icon include.
- **`views/partials/recipe-ingredient-groups.njk`**: the `{% for group in recipe.ingredientGroups %}...{% else %}...{% endfor %}` block factored out so plan 04's OOB swap (`#recipe-ingredient-groups-{recipe.id}`) and the initial recipe page render share one source of truth.

### Modified files
- **`views/partials/grocery-item.njk`**: pencil button inserted between `.grocery-text` and `.grocery-delete`, branching `hx-get` on `item.libraryEntryId`. `urlencode` filter applied to `item.text` in the unmatched-branch query string.
- **`views/recipe.njk`**: `<section class="recipe-ingredients">` now carries `id="recipe-ingredient-groups-{{ recipe.id }}"` (D-73). The inline `<h2>` + group loop body collapsed to `{% include "partials/recipe-ingredient-groups.njk" %}`.
- **`test/grocery-routes.test.js`**: 5 new tests + `seedLibrary` / `makeEntry` helpers (copied, not imported, from `test/library-routes.test.js`).
- **`test/recipes.test.js`**: 6 new tests + `seedLibraryAndRecipe` / `makeEntry` / `makeRecipe` helpers.

## Decisions & Deviations

No deviations from the plan snippets — code was written verbatim from the action blocks. The few pragmatic choices documented in frontmatter `decisions`:

1. **Per-line id format** — kept `recipe-ing-{recipe.id}-{group.category}-{index}` (per-group `loop.index0`) per RESEARCH §663-665 option (b). The alternative (global loop index across all groups) would require touching `lib/calc.js` to attach a globalIndex; the per-group + category-prefix form is unique within the page without backend changes.
2. **urlencode tolerance** — the test regex `/text=salt(%20|\+)%26(%20|\+)pepper/` accepts either `%20` or `+` for space encoding because Nunjucks `urlencode` engine output isn't part of our contract. The actual emission verified manually was `%20`.
3. **FIX-04 rename test** — seeds entry as `{ name: 'pomme', aliases: ['apple'] }` so `decorateIngredients` still matches the ingredient `'1 apple, sliced'` to this entry by alias, attaching its `libraryEntryId` — yet the rendered `<span>` shows `'1 apple, sliced'` and the body must NOT contain `'pomme'`. This is a stronger assertion than just "ing.text is rendered" because it proves the substitution is impossible even when the entry IS matched.

## Tests Added

**5 in `test/grocery-routes.test.js`:**
1. `GET /grocery renders a pencil button on each item row` — class presence + shared SVG include.
2. `GET /grocery: unmatched item pencil targets /library/categorize-edit` — Categorize-branch hx-get + aria-label.
3. `GET /grocery: matched item pencil targets /library/:id/categories-edit` — Fix-branch hx-get + aria-label.
4. `GET /grocery: pencil button sits between .grocery-text and .grocery-delete` — DOM ordering via `body.indexOf` triple.
5. `GET /grocery: special chars in item text are URL-encoded in pencil hx-get` — `'salt & pepper'` round-trip (T-06-01-01 / Pitfall 4).

**6 in `test/recipes.test.js`:**
1. `GET /recipes/:id wraps ingredient section with id="recipe-ingredient-groups-:id"` — D-73 OOB target.
2. `GET /recipes/:id renders each ingredient line with stable per-line id` — UI-SPEC stable-id contract.
3. `GET /recipes/:id matched ingredient pencil targets /library/:id/categories-edit` — Fix branch with surface/recipeId/index in query.
4. `GET /recipes/:id unmatched ingredient pencil targets /library/categorize-edit` — Categorize branch with urlencoded text.
5. `GET /recipes/:id renders ing.text not entry.name (FIX-04)` — invariant; renders `1 apple, sliced` verbatim.
6. `GET /recipes/:id rendering does not substitute entry.name even after rename (FIX-04)` — invariant under entry rename; body must not contain `'pomme'`.

## Verification

- `npm test` → `tests 360`, `pass 360`, `fail 0` (baseline 349 + 11 new).
- `node --test test/grocery-routes.test.js` → `tests 14`, `pass 14`.
- `node --test test/recipes.test.js` → `tests 22`, `pass 22`.
- `grep -c 'class="grocery-pencil"' views/partials/grocery-item.njk` → `2` (matched + unmatched branches).
- `grep -c 'class="recipe-pencil"' views/partials/recipe-ingredient-line.njk` → `2` (matched + unmatched branches).
- `grep -q 'partials/icon-pencil.njk' views/partials/grocery-item.njk views/partials/recipe-ingredient-line.njk` → both surfaces include the shared icon partial (D-69).
- `grep -q 'id="recipe-ingredient-groups-{{ recipe.id }}"' views/recipe.njk` → present (plan 04 OOB target wired).

## Next Plan Hooks

- **Plan 02 (`GET /library/:id/categories-edit` + Cancel-fragment routes):** consumes the pencil's `hx-get` URLs (currently 404 from these targets — that's the intended RED state for the route-shape tests). Plan 02 also consumes `recipe-ingredient-line.njk` from the Cancel handler to re-render the original `<li>` server-authoritatively per UI-SPEC § Interaction Contract.
- **Plan 03 (`POST /library/:id/categories`):** uses `views/partials/recipe-ingredient-groups.njk` as the OOB-swap body when `HX-Current-URL` matches `/recipes/:id`, targeting the new `id="recipe-ingredient-groups-{recipe.id}"` selector.
- **Plan 04 (Categorize submission OOB):** same OOB target/partial as plan 03 for the Categorize-from-recipe-page surface.
- **Plan 05 (CSS):** `views/partials/icon-pencil.njk` `currentColor` fill means the pencil paints with whatever `color:` the parent button declares — `.grocery-pencil { color: var(--muted) } :hover { color: var(--accent) }` will style the SVG without further changes.

## Self-Check: PASSED

- `views/partials/icon-pencil.njk` — FOUND
- `views/partials/recipe-ingredient-line.njk` — FOUND
- `views/partials/recipe-ingredient-groups.njk` — FOUND
- `views/partials/grocery-item.njk` — modified, both pencil branches present
- `views/recipe.njk` — modified, section id present
- `test/grocery-routes.test.js` — 5 new tests pass
- `test/recipes.test.js` — 6 new tests pass
- Commits: `a4eb597` (Task 1), `f4bdfdf` (Task 2), `5cf4906` (Task 3) — all present in `git log --oneline`
- `npm test`: 360 / 360 pass

## Threat Flags

None. Plan strictly extends existing partials/templates (Nunjucks autoescape applies to all interpolations of `item.text` and `ing.text`); the `urlencode` filter is applied to user-supplied text in `hx-get` URLs; no new network endpoints, no new auth paths, no new file-access patterns. T-06-01-01 (XSS via item.text) is mitigated as planned (autoescape + urlencode); T-06-01-02 (forged libraryEntryId) is accepted under the single-user LAN trust model and pending plan 02's server-side id lookup + 404.
