# Phase 6: Inline Fix - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 ships the **inline Fix shortcut** — a small in-context editor that lets the user re-categorize a library entry from the grocery list or from a recipe-detail page without navigating to the Library tab. Items not currently matching any library entry get a sibling **Categorize** affordance that creates a new library entry seeded from the item text. The Fix editor is **categories-only** (recipe + grocery dropdowns); canonical name and aliases require the full Library tab editor (Phase 5). The Categorize editor additionally allows setting the canonical `name` (since the entry doesn't exist yet) but not aliases.

In scope: pencil-icon affordance on every grocery item row (`views/partials/grocery-item.njk`) and every recipe ingredient line (`views/recipe.njk`); two new partials `views/partials/library-fix-editor.njk` (categories-only) and `views/partials/library-categorize-editor.njk` (name + categories); new routes `GET /library/:id/categories-edit` (returns Fix editor fragment), `POST /library/:id/categories` (saves categories only, sets `curated: true`), `GET /library/categorize-edit?text=...` (returns Categorize editor fragment seeded from item text), and reuse of existing `POST /library` for Categorize submission with the editor's name + categories. Save responses use the existing `HX-Current-URL` header to choose which surface (`#grocery-list`, `#recipe-ingredients-{recipeId}`, or `#library-panel`) to OOB-re-render. Recipe ingredient lines gain stable per-line ids (planner's call on the exact format). CSS additions to `public/styles.css` under the `library-fix-*` / `library-categorize-*` namespace. HTTP-level tests in `test/library-routes.test.js` and (potentially) `test/recipes-routes.test.js` for the per-surface OOB shapes.

Out of scope (not in this phase): editing aliases inline (always Library tab); deleting library entries from inline (Library tab only); recipe-string mutation (FIX-04 invariant); modal / popover patterns for the editor; bulk multi-row selection; smart "you meant X?" auto-link suggestions on Categorize-name conflict (deferred — Phase 6 uses the same inline-error pattern as Phase 5 D-61); pre-fill alias auto-add on Categorize (item text becomes the entry name only, not an alias — keeps Categorize scope tight). The 03-REVIEW WR-01 / WR-02 carryovers from Phase 3 stay deferred.

</domain>

<decisions>
## Implementation Decisions

### Affordance style & placement (FIX-01 / FIX-02 / SC#1 / SC#2)

- **D-68:** **Icon-only, always-visible pencil button.** Sized to match the existing grocery `×` delete button. Always visible on every grocery item row and every recipe ingredient line — no hover-only reveal. Lowest visual noise that still signals interactivity; equally usable on touch and mouse. Matches the grocery item's existing icon-button vocabulary. NO labeled "Fix"/"Categorize" text — the pencil is the universal verb.

- **D-69:** **Same pencil icon for both Fix (matched) and Categorize (unmatched) states.** Distinguished only by `aria-label` ("Fix categorization for {entryName}" vs "Categorize {item.text}") and by the `hx-get` target the button points to. Server determines behavior from the row's `libraryEntryId` presence. Single visual vocabulary; users learn one icon.

### Editor open/close UX (FIX-01 / FIX-02 / SC#1 / SC#2)

- **D-70:** **Inline row-toggle expand**, reusing Phase 5's `library-row-edit.njk` pattern verbatim. Click pencil → `hx-get` returns the editor fragment → HTMX `outerHTML` swaps the row's `<li>` with the editor's `<li>` (same outer DOM id so toggle is bidirectional). Cancel hits a `GET /library/:id` (matched) or has no server round-trip needed for Categorize (close = remove the editor element via `hx-on::cancel` or a Cancel button that re-fetches the original row); Save submits the editor's two-or-three field POST. Mobile-friendly: editor takes the space of one row. Same code path the user reviewed in Phase 5; no new modal/popover machinery introduced. CSS class on the expanded `<li>` is `library-fix-editor` (Fix mode) or `library-categorize-editor` (Categorize mode).

- **D-71:** **Compact `Library entry: {name}` header at the top of the Fix editor.** The canonical `entry.name` is shown ONCE, clearly labelled as metadata — never substituted in place of the original ingredient text. Honors FIX-04 by confining canonical name to the editor header surface only. Aliases are NOT shown in the editor header (would push form down; Library tab is the right surface for full entry inspection). The Categorize editor uses a different header — `New library entry` — since no entry exists yet.

### OOB-swap scope on Save (FIX-01 / FIX-02)

- **D-72:** **Full panel re-render on Save.** Server returns the entire `#grocery-list` (or `#recipe-ingredients-{recipeId}`, or `#library-panel`) as the OOB target — whichever surface initiated the request. Trivially correct: no missed-edge cases when an item moves between category groups, when a group becomes empty, or when a group emerges. One OOB target per surface, one response shape per surface. Brief visual repaint of unchanged groups is accepted at single-user-LAN scale. Matches Phase 5's `respondWithUpdates({ panels: { ... } })` pattern.

- **D-73:** **`HX-Current-URL` header drives OOB target selection.** The Save handler reads `req.get('HX-Current-URL')` (HTMX automatically attaches this header). Path mapping:
  - `/grocery` (or `/grocery?...`) → re-render `#grocery-list` via `buildGroceryView`
  - `/recipes/:id` → re-render `#recipe-ingredients-{id}` via `buildView`'s recipe-detail decoration (uses `decorateIngredients`)
  - `/library` (or `/library?...`) → re-render `#library-panel` via `buildLibraryView` (this is essentially Phase 5's existing edit-save behavior; reusing the new categories-only endpoint from `/library` should work identically)
  
  Same conditional-rendering pattern that `routes/recipes.js` already uses for the delete-button affordance based on `HX-Current-URL`. One endpoint, three OOB shapes, no per-surface route duplication.

### Route shape

- **D-74:** **Two new endpoints for the categories-only Fix flow:**
  - `GET /library/:id/categories-edit` → returns `library-fix-editor.njk` fragment (categories-only editor for an existing entry).
  - `POST /library/:id/categories` → accepts `{ recipeCategory, groceryCategory }`, validates each is in `RECIPE_CATEGORIES` / `GROCERY_CATEGORIES`, sets `curated: true`, saves, returns the per-surface OOB fragment (D-72/D-73). Toast: `'Saved categories'` (verb-only, ASCII-safe per D-67).
  
  These are **distinct from Phase 5's `POST /library/:id`** — the Fix endpoint never touches name/aliases, so a regression in either path can't silently break the other. The existing `POST /library/:id` keeps the full-form contract.

- **D-75:** **Categorize submission reuses existing `POST /library`** (created in Phase 5 Plan 03 with `curated: true` semantics). The new `GET /library/categorize-edit?text=...` returns `library-categorize-editor.njk` fragment with name + categories pre-filled (D-76). Submit posts the editor's three fields (`name`, `recipeCategory`, `groceryCategory`) to existing `POST /library`. Toast on Categorize success: `'Added entry'` (existing Phase 5 toast).

### Categorize (no-match) flow (FIX-01 SC#3)

- **D-76:** **Categorize editor pre-fills:**
  - **Name** = `normalizeIngredientText(item.text)` (lowercased, qty/unit stripped — uses the existing `lib/library.js` export). Editable text input, maxlength 200.
  - **Aliases** = empty. NO aliases UI in the Categorize editor — keeps scope tight; user can add aliases later via the Library tab full-editor. (Aliases auto-population is a deferred enhancement; tracked below.)
  - **Recipe category dropdown** = pre-selected from the existing `recipeCategoryOf(item.text)` heuristic (Phase 5's "category presets via heuristic on blur" idea, shipped here in the Categorize flow).
  - **Grocery category dropdown** = pre-selected from `groceryCategoryOf(item.text)`.
  - **Save button** = posts to `POST /library`. **Cancel button** = closes the editor (restores the original row's `pencil + text` view).

- **D-77:** **Inline error + form stays open on Categorize-name conflict.** Server-side validation: existing entry name match (case-insensitive equality on `entry.name`) OR existing entry alias match (via `aliasConflict()` against the typed name). On conflict: HTTP 400, body = same `library-categorize-editor.njk` fragment with an error `<div>` slotted under the name input: `Name "{typed}" is already used by entry "{owning entry name}". Open it in the Library tab.` plus an "Open it in the Library tab" link. Form preserves the user's typed values. Mirrors Phase 5 D-61 alias-conflict UX exactly. The HTMX 4xx-swap meta tag (Plan 05-01) is already in place — no infra change needed.

### Toasts (CLAUDE.md HTTP-header ASCII rule)

- **D-78:** **Toast strings are verb-only literal ASCII strings, no name interpolation:**
  - `POST /library/:id/categories` success → `'Saved categories'`
  - `POST /library` success (Categorize submission) → `'Added entry'` (existing Phase 5 toast — reused)
  - 400 paths (validation / conflict) → silent (inline error fragment IS the user feedback, per Phase 5 D-61 / D-77)
  - 404 → silent (route returns plain-text 'Not found' body)

### Carried forward from Phase 5 (no re-discussion)

- **D-79:** **HTMX 4xx-swap meta tag is in place** (`views/layout.njk` per Plan 05-01) — the Categorize-conflict 400 path (D-77) and any future Fix 400 path get HTMX outerHTML-swapped automatically.

- **D-80:** **`renderSync` is exported from `lib/render.js`** (per Plan 05-01) — Phase 6's row-fragment routes call it directly with `injectOob` for compound responses, NOT `respondWithUpdates`. Per Phase 5 RESEARCH §Pitfall 2, `respondWithUpdates` injects `hx-swap-oob` on every panel and would corrupt the primary outerHTML row swap target. Phase 6 follows the same pattern that Plans 05-03/04/05 established: row fragment as primary swap target, OOB fragments via `injectOob` directly.

- **D-81:** **Render-time categorization** (CLAUDE.md). The `recipeCategory` and `groceryCategory` saved on the library entry are the source-of-truth for future renders; no precomputation onto grocery items, recipe ingredients, or any other store.

- **D-82:** **Per-render walk for categorization** continues. After Save sets new categories on the library entry, the next render of `buildGroceryView` / `decorateIngredients` reads the updated categories and re-buckets the affected items. The full-panel-re-render OOB (D-72) is exactly this re-render — no separate categorization update path needed.

### Claude's Discretion

- **Pencil icon SVG vs Unicode glyph:** Recommend SVG inline (~50 bytes), accessible via `aria-label`, consistent across platforms. Unicode `✏` works without a build step but renders inconsistently (especially on Windows). Planner picks; if SVG, prefer a single shared `views/partials/icon-pencil.njk` so both `grocery-item.njk` and `recipe.njk` reuse the same markup.

- **"Edit full entry" link target inside the Fix editor:** Recommend `/library?q={encodeURIComponent(entry.name)}` (search-narrowed). Pre-filters the Library tab to show only this entry (or close matches), then user clicks the row's "Edit" button there for full-form access. Anchor-jump (`/library#library-row-{id}`) is also acceptable — picks scrolls to the row directly. Either works; planner picks based on whichever simpler test scaffold supports.

- **Recipe ingredient line id format:** Recommend `id="recipe-ing-{recipe.id}-{loop.index0}"` (recipe id + zero-based ingredient index). Stable per render (same input → same id), unique per page, scopable for OOB targeting if a future phase wants per-line swaps. Planner picks.

- **Cancel button behavior in Fix editor:** Two options — (a) `hx-get="/library/:id"` returning a row fragment (server round-trip; matches Phase 5 D-62) but the row fragment shape there is `library-row.njk` which is the Library-tab row, NOT the grocery-item or recipe-ingredient row. So we'd need a per-surface Cancel-fragment route (`GET /grocery/:id/row-fragment`?) — heavy. Recommend (b) **client-side reset via HTMX `hx-on::cancel-click="this.closest('li').outerHTML = previousMarkup"`** OR simply re-emit the original row template inline using a new lightweight server endpoint per surface. Planner picks; recommend the simpler approach that keeps Cancel zero-state-changing.

- **Recipe page ingredient OOB target id:** Recommend `id="recipe-ingredient-groups-{recipe.id}"` on the `<section class="recipe-ingredients">` element so the OOB selector is unambiguous.

- **CSS class naming:** New classes prefixed `library-fix-*` and `library-categorize-*`. Reuse Phase 5's button-icon styles where possible (`.library-row-edit` button styles for Save/Cancel inside the editor). Planner picks the exact class breakdown.

- **Test scaffolding:** New `test/library-categories-routes.test.js` for the categories-only Fix endpoints AND the Categorize flow. Test/library-routes.test.js (Phase 5) stays focused on the full-form edit/delete/manual-add. Keeps each test file under ~500 lines. Alternative: extend `test/library-routes.test.js` — planner picks. Per-surface OOB shape tests can live where the surface tests live (`test/grocery-routes.test.js`, `test/recipes-routes.test.js`) or be batched in the new file.

- **`POST /library/:id/categories` reuse from /library tab:** When `HX-Current-URL` is `/library`, the categories-only Save can either re-render the Phase 5 row fragment (cleaner — narrow swap) or re-render the full panel (uniform with grocery/recipe). Recommend **row fragment** when called from `/library` (Phase 5 already uses row-level swaps for Library tab) and **full panel** when called from `/grocery` or `/recipes/:id`. Planner picks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & locked decisions
- `.planning/PROJECT.md` — Core value (categorization converges via curation), out-of-scope list (no recipe-string mutation), Phase 6 callout: "Inline 'Fix' shortcut on grocery items and recipe ingredient lines — opens a small editor for the matched library entry's categories (no recipe-string mutation)".
- `.planning/REQUIREMENTS.md` §FIX — FIX-01 (grocery row Fix + Categorize affordance), FIX-02 (recipe-page row affordance, same behavior), FIX-03 (categories-only editor; "Edit full entry" link to Library tab), FIX-04 (Fix never substitutes canonical name for ingredient.text — recipe pages always show ingredient.text).
- `.planning/research/SUMMARY.md` lines 133, 174 — "Templates always display ingredient.text. The canonical entry.name appears only inside the Fix editor as clearly-labelled metadata. Never substitute entry.name for ingredient.text in any recipe or grocery template." Drives D-71's labelled-metadata header.
- `.planning/STATE.md` "Architecture Conventions (Ingredient Library)" — `routes/library.js` thin orchestrator; route additions for Fix go in this file, not a new routes/fix.js.
- `.planning/ROADMAP.md` §"Phase 6: Inline Fix" — 5 success criteria.
- `./CLAUDE.md` — Render-time categorization, HTTP-header ASCII safety (drives D-78 verb-only toasts), library entries override the heuristic, no auth, no build step (HTMX 2.0.4 vendored), `node:test`.

### Prior phase context (locked decisions to honor)
- `.planning/phases/05-library-tab/05-CONTEXT.md` D-60 — "Phase 6's Fix editor (FIX-03) is locked to *categories only*, so Phase 5's edit form is the broader version — the two are intentionally distinct surfaces, not a shared component." Phase 6 honors this — Fix editor partials are NEW (`library-fix-editor.njk`, `library-categorize-editor.njk`), not reuses of `library-row-edit.njk`.
- `.planning/phases/05-library-tab/05-CONTEXT.md` D-61 — Inline error + form stays open on alias conflict. Phase 6 D-77 mirrors this for Categorize-name conflict.
- `.planning/phases/05-library-tab/05-CONTEXT.md` D-62 — Cancel returns read-only row via GET; Phase 6 needs the per-surface variant (Claude's Discretion above).
- `.planning/phases/05-library-tab/05-CONTEXT.md` D-67 — Generic verb-only toasts; D-78 inherits this.
- `.planning/phases/05-library-tab/05-RESEARCH.md` §"HTMX 4xx-swap pitfall" — meta tag is in place (Plan 05-01); Phase 6's 400 paths get auto-swap.
- `.planning/phases/05-library-tab/05-RESEARCH.md` §"Pitfall 2: respondWithUpdates corrupts row swaps" — Phase 6 routes use `renderSync + injectOob` directly, NOT `respondWithUpdates`, when returning row fragments.
- `.planning/phases/03-categorization-layering/03-CONTEXT.md` D-31 — `libraryEntryId` attached per grocery item by `buildGroceryView`. Phase 6 reads this from item view-models in `views/partials/grocery-item.njk`.
- `.planning/phases/03-categorization-layering/03-CONTEXT.md` D-32 — `libraryEntryId` attached per recipe ingredient line by `decorateIngredients`. Phase 6 reads this from `ing.libraryEntryId` in `views/recipe.njk`.
- `.planning/phases/02-library-helpers/02-CONTEXT.md` D-25 — `aliasConflict(state, alias, excludingId)` validator. Phase 6 D-77 calls it for Categorize-name conflict checking.
- `.planning/phases/02-library-helpers/02-CONTEXT.md` — `normalizeIngredientText` and `recipeCategoryOf` / `groceryCategoryOf` exports used by D-76 Categorize prefill.

### Existing code & conventions
- `.planning/codebase/CONVENTIONS.md` — CommonJS, 2-space indent, single quotes, named exports, view-builder pattern, OOB fragments via `respondWithUpdates` (with the Phase 5 exception for single-row responses).
- `.planning/codebase/STRUCTURE.md` — Where new code lands.
- `.planning/codebase/STACK.md` — Express 4, Nunjucks 3, HTMX 2.0.4 vendored, `node:test`.
- `routes/library.js` — Phase 6 routes are appended to this file (NOT a new routes/fix.js). Existing route shape: `setToast`, `respondWithUpdates`, `storage.get()` / `storage.save()`. New routes use `renderSync + injectOob` for primary fragment + OOB pattern.
- `routes/grocery.js` — Reference for the per-surface OOB shape that the Save endpoint will emit when `HX-Current-URL` is `/grocery`.
- `routes/recipes.js` — Existing `HX-Current-URL`-conditional rendering pattern for the delete-button affordance — Phase 6's Save handler mirrors it.
- `views/partials/grocery-item.njk` (lines 1-13) — Phase 6 adds the pencil button after the existing `grocery-text` span and before the existing `grocery-delete` button.
- `views/recipe.njk` (lines 19-29) — Phase 6 modifies the ingredient `<li>` to include the pencil button alongside `{{ ing.text }}`.
- `views/layout.njk` — htmx-config meta tag (Plan 05-01) is already present; no further layout changes for Phase 6.
- `lib/library.js` (existing exports) — `aliasConflict`, `normalizeIngredientText`, `findEntryInIndex`, `newLibraryEntry`, `newLibraryId`. NO changes to library.js in Phase 6.
- `lib/categorize.js` — `recipeCategoryOf` and `groceryCategoryOf` exports used for Categorize prefill heuristic; `RECIPE_CATEGORIES` / `GROCERY_CATEGORIES` for dropdown options. NO changes to categorize.js in Phase 6.
- `lib/calc.js#buildGroceryView` (line 81) — Re-rendered as the OOB target on Save when `HX-Current-URL` is `/grocery`. NO changes.
- `lib/calc.js#decorateIngredients` (line 226) — Re-runs on every recipe-page render so the OOB swap reflects new categorizations. NO changes.
- `lib/calc.js#buildView` — Per-recipe view-builder; Phase 6 uses it to re-render the recipe-ingredients section as OOB. NO changes.
- `lib/render.js` (Plan 05-01) — `renderSync` and `injectOob` are exported. Phase 6 uses both directly.
- `views/partials/library-row-edit.njk` (Phase 5) — Reference pattern for the row-toggle outerHTML expand. Phase 6's editors mirror the structure but live in different partials with their own DOM ids and form actions.

### Files to create or modify in Phase 6
- `routes/library.js` — **EXTEND.** Four new routes:
  - `GET /library/:id/categories-edit` (returns library-fix-editor.njk fragment for matched item)
  - `POST /library/:id/categories` (saves categories only; OOB-swaps the surface from `HX-Current-URL`)
  - `GET /library/categorize-edit?text=<>` (returns library-categorize-editor.njk fragment seeded from item text)
  - (Categorize submission reuses the existing `POST /library` from Phase 5 Plan 03)
- `views/partials/library-fix-editor.njk` — **NEW.** Categories-only editor for matched items. Uses `id="library-row-{{ entry.id }}"` for outerHTML toggle compatibility OR a per-surface id (`grocery-item-{{ item.id }}` / `recipe-ing-{{ recipe.id }}-{{ idx }}`) — planner decides based on the toggle target.
- `views/partials/library-categorize-editor.njk` — **NEW.** Name + categories editor for unmatched items. Pre-filled fields per D-76.
- `views/partials/grocery-item.njk` — **EXTEND.** Add the pencil button (icon-only). Conditional `hx-get` based on `item.libraryEntryId`: matched → `/library/{libraryEntryId}/categories-edit`, unmatched → `/library/categorize-edit?text={item.text|urlencode}`. `hx-target="closest li"` `hx-swap="outerHTML"`.
- `views/recipe.njk` — **EXTEND.** Modify the ingredient `<li>` to include the pencil button alongside `{{ ing.text }}`. Same conditional `hx-get` based on `ing.libraryEntryId`. Add stable per-line id (planner picks format).
- `public/styles.css` — **EXTEND.** New classes prefixed `library-fix-*` / `library-categorize-*` for the editor partials and the row-level pencil button. Reuse `.library-row-edit` styles where possible.
- `test/library-categories-routes.test.js` (or extend `test/library-routes.test.js`) — **NEW (or extend).** HTTP-level coverage:
  - GET /library/:id/categories-edit returns fragment with two dropdowns + Save + Edit-full-entry link
  - POST /library/:id/categories saves curated:true; verifies grocery-list OOB fragment shape when called from /grocery; recipe-ingredients OOB shape when called from /recipes/:id; library-panel OOB shape when called from /library
  - POST /library/:id/categories 400 on bad enum; 404 on unknown id
  - GET /library/categorize-edit?text=... returns fragment with name pre-filled, heuristic dropdowns selected
  - POST /library (Categorize submission) creates entry with curated:true, verified existing Phase 5 path still works
  - POST /library (Categorize) 400 on name conflict — body contains the categorize-editor fragment with inline error
- `test/grocery-routes.test.js` — **EXTEND.** GET /grocery includes the pencil button on each item; conditional href routing matched vs unmatched.
- `test/recipes-routes.test.js` — **EXTEND.** GET /recipes/:id ingredient lines include the pencil button; conditional href routing matched vs unmatched.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/library.js#aliasConflict(state, alias, excludingId)`** — Already shipped (Phase 1+2). Phase 6 D-77 calls it for Categorize-name conflict validation. NO changes.
- **`lib/library.js#normalizeIngredientText(text)`** — Already shipped (Phase 2). Phase 6 D-76 uses it to seed the Categorize editor's name field.
- **`lib/categorize.js#recipeCategoryOf(text)` / `groceryCategoryOf(text)`** — Already shipped. Phase 6 D-76 uses both to pre-select the Categorize editor's dropdowns.
- **`lib/categorize.js#RECIPE_CATEGORIES` / `GROCERY_CATEGORIES`** — Already exported. Editor `<select>` options pull from these arrays.
- **`lib/render.js#renderSync` / `injectOob`** — Both exported (Plan 05-01). Phase 6 uses both directly for compound row+OOB-panel responses.
- **`lib/calc.js#buildGroceryView(state)` and `#buildView(state, ...)` and `#decorateIngredients(ingredients, library)`** — All already-tested view-builders. Phase 6's Save handler calls whichever matches the HX-Current-URL surface. NO changes.
- **`views/partials/library-row-edit.njk` (Phase 5)** — Reference pattern. Phase 6's two new editor partials mirror its structure (Save/Cancel row, hx-target=closest li, hx-swap=outerHTML, autoescape on field values) but with different field sets and different hx-post endpoints.
- **HTMX 4xx-swap meta tag in `views/layout.njk`** — Plan 05-01 added it. Phase 6's Categorize-conflict 400 path inherits the swap behavior with no change.
- **`buildGroceryView` / `decorateIngredients` already attach `libraryEntryId` to each item** — `views/partials/grocery-item.njk` and `views/recipe.njk` can branch on this directly with `{% if item.libraryEntryId %}` / `{% if ing.libraryEntryId %}`. No view-model changes needed.

### Established Patterns
- **HTMX outerHTML row-toggle for inline edit** (Phase 5 D-60..D-63) — Phase 6 reuses verbatim. Two row variants share the same outer DOM id; HTMX swaps between them via `hx-target="closest li"` + `hx-swap="outerHTML"`.
- **`HX-Current-URL`-conditional response shape** (`routes/recipes.js`) — Phase 6's Save handler reads this header and chooses among three OOB shapes (D-73). Existing test pattern: set `HX-Current-URL` header in test request, assert OOB content matches.
- **`renderSync + injectOob` for compound row+OOB responses** (Phase 5 Plans 03/04/05) — Phase 6's Save handler returns either an empty primary body + OOB panel (full panel re-render with no row swap target needed) OR a primary row fragment + OOB panel. Planner picks based on Cancel-button strategy (Claude's Discretion).
- **Verb-only toast strings** (CLAUDE.md / Phase 5 D-67) — `Saved categories`, `Added entry`. Both ASCII literal.
- **Atomic-tab-launch convention** (STATE.md) — N/A for Phase 6 (no nav additions; the Library tab landed in Phase 5 Plan 06).

### Integration Points
- `routes/library.js` ← gets four new routes appended (no new routes/library-fix.js).
- `views/partials/grocery-item.njk` ← gains a third button (between text and delete).
- `views/recipe.njk` ← `<li>` markup augmented with pencil button + per-line id.
- `views/partials/library-fix-editor.njk` (NEW) and `views/partials/library-categorize-editor.njk` (NEW).
- `public/styles.css` ← appended `library-fix-*` / `library-categorize-*` block.
- `test/library-routes.test.js` (Phase 5) ← either extended or paired with a new `test/library-categories-routes.test.js`. `test/grocery-routes.test.js` and `test/recipes-routes.test.js` ← extended for pencil-button presence.
- No changes to: `lib/library.js`, `lib/calc.js`, `lib/categorize.js`, `lib/render.js`, `lib/storage.js`, `server.js`, `views/layout.njk`, `views/library.njk`, `views/partials/library-row.njk`, `views/partials/library-row-edit.njk`, `views/partials/library-panel.njk`, `views/partials/library-footer.njk`.

</code_context>

<specifics>
## Specific Ideas

- **D-68's "icon-only same size as ×"** is the visual-noise target. The grocery row currently is `[✓] text [×]` with the check button and × button being equal-sized circle/square buttons. The pencil should be the same. Goal: rows look like `[✓] text [✏][×]` and `text [✏]` (recipe), with no labels.
- **D-71's "Library entry: garlic" header** is the FIX-04 invariant made tangible. The user sees the canonical name ONCE per editor, in a clearly-labelled position; everywhere else (the row text behind the editor; the recipe ingredient text; the grocery item text) keeps showing what the user typed/scraped.
- **D-72's "full panel re-render"** is the boring-is-correct call. It's slightly heavier on the wire but trivially correct under category-group movement, group emergence/disappearance, and curated-flag flip. The cost (a 50-line panel HTML payload at single-user-LAN scale) is invisible.
- **D-73's HX-Current-URL routing** unlocks one Save endpoint serving three surfaces. The existing routes/recipes.js delete-button conditional is the playbook.
- **D-76's pre-fill via heuristic** is the deferred Phase 5 quality-of-life shipped here. Categorize is the right surface for it: the user is already in flow, the heuristic guess shows up as the dropdown's pre-selection, and the user clicks Save (one click) when the guess is right.
- **D-77's inline error mirrors D-61** verbatim — same UX shape, same response code, same form-stays-open behavior. Users who mastered Phase 5's edit-error already understand Phase 6's create-error.

</specifics>

<deferred>
## Deferred Ideas

- **Smart auto-link on Categorize-name conflict.** D-77 alternative #2 ("You meant garlic? Use it for this item?" with one-click alias-add). Adds a route variant and the alias-merge logic. Could ship as a Phase 7 enhancement once the basic Fix/Categorize loop is in users' hands.

- **Auto-add item text as alias on Categorize.** D-76 alternative #2 ("Name = exact text; aliases auto-add normalized form"). Currently aliases are left empty in Categorize. If users find themselves repeatedly opening the Library-tab full-editor to add the original item text as an alias, revisit.

- **Hover-only / responsive pencil affordance.** D-68 alternative #3 ("hover-only desktop, always-visible mobile"). The icon-only-always-visible call may feel cluttered as the project scales (50+ entries on grocery, 20+ ingredients per recipe). If row noise becomes a complaint, revisit a `:hover` reveal pattern.

- **Modal / popover Fix editor.** D-70 alternatives — different UX patterns (popover anchored to button, or modal dialog). Inline expand was chosen for code-path reuse from Phase 5. If users find the row-expand jarring on long pages (scroll position shifts), revisit a popover.

- **Per-group / targeted OOB swaps.** D-72 alternative #2 (only swap source + destination groups, not full panel). Performance optimization; only worth doing if the full-panel-re-render starts showing visible jank at scale, which it shouldn't on single-user-LAN.

- **PATCH HTTP verb for `/library/:id/categories`.** Same Phase 5 D-67-style discretion. Currently using POST for form-action alignment.

- **Per-line edit in Library tab table.** Phase 5 ships row-level edit. If users find row-toggle jarring, a future phase could ship a popover or table-cell-level edit instead.

- **Categorize-from-search.** When the user is in Library tab search and the query matches no entries, offer "Create entry for 'foo'" inline in the empty state. Convergence between the Categorize affordance (Phase 6) and the manual-add form (Phase 5) — maybe a future Phase 7 polish item.

- **Recipe-string mutation (renaming an ingredient.text on the recipe page).** Out of scope per FIX-04 and PROJECT.md. Would require a separate phase with new constraints and probably new template surfaces.

- **`updatedAt` field on library entries.** Same as Phase 5 deferred — not in the locked entry shape; revisit if a future phase needs an audit trail.

- **Concurrent-edit prevention for Fix.** Same as Phase 5 deferred — last-write-wins acceptable at single-user trust model. Two-tab Fix editing remains theoretically racy.

</deferred>

---

*Phase: 6-Inline Fix*
*Context gathered: 2026-05-07*
