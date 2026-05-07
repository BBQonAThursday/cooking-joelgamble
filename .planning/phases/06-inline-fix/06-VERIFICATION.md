---
phase: 06-inline-fix
verified: 2026-05-07T00:00:00Z
status: human_needed
score: 5/5 must-haves verified (literal reading); 1 deferred enhancement noted under SC#3
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Pencil icon visual quality across browsers"
    expected: "SVG pencil renders crisply at body-text size in Chrome/Firefox/Safari/Edge; not jaggy or oversized; aligned with check / × buttons on grocery rows."
    why_human: "Automated tests assert HTML presence and viewBox attributes only — visual fidelity (anti-aliasing, color contrast against background, kerning vs adjacent buttons) requires eyeball verification."
  - test: "Editor open/close keyboard navigation"
    expected: "Tab to pencil button → Enter opens editor → Tab through dropdowns + Save/Cancel → Escape or Cancel closes editor → focus returns to pencil button."
    why_human: "DOM/aria assertions cover structure but not focus management or keyboard-event propagation through HTMX swaps. autofocus on first select is verified in markup but the round-trip focus restoration on Cancel is not."
  - test: "Mobile touch ergonomics"
    expected: "On Chrome devtools mobile emulation (iPhone + Pixel), tap pencil → editor expands inline; dropdowns are reachable; Save/Cancel are tappable without overflow; the 480px responsive stack rule fires."
    why_human: "Tap-target size (24×24 grocery / 20×20 recipe) and inline-expand layout under a constrained viewport need physical-device confirmation, not regex assertions."
  - test: "Categorize convergence (intent gap, not literal SC#3 violation)"
    expected: "Click pencil on unmatched grocery item 'mango' → Categorize editor → Save with default name. Re-render /grocery: ideally the same 'mango' item now shows the Fix pencil pointing at the new entry. Currently the Categorize affordance still shows because aliases is empty and findEntryInIndex matches only on aliases."
    why_human: "Decide whether the project's stated value (convergence toward accuracy through curation) is satisfied when each Categorize click creates an unmatched orphan entry that requires a follow-up Library-tab edit to add an alias. Tracked as deferred enhancement D-76 alt #2 in 06-CONTEXT.md."
deferred:
  - truth: "Categorize creates an entry that auto-matches the original item text on re-render"
    addressed_in: "Deferred (post-Phase-6 enhancement D-76 alt #2)"
    evidence: "06-CONTEXT.md line 217: 'Auto-add item text as alias on Categorize... If users find themselves repeatedly opening the Library-tab full-editor to add the original item text as an alias, revisit.' Phase 6 explicitly chose to keep Categorize scope tight (no aliases input). 06-05-SUMMARY.md lines 88-94 documents that the round-trip integration test had to inject aliases manually via POST body to make matching work end-to-end. SC#3 literal text only requires (a) Categorize affordance shown on unmatched items and (b) entry creation seeded from item text — both verified. Convergence-on-next-render is project intent but not literal SC#3."
---

# Phase 6: Inline Fix Verification Report

**Phase Goal:** Users can fix a mis-categorized ingredient's library entry in-context from the grocery list or recipe page without navigating to the Library tab.
**Verified:** 2026-05-07T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Per ROADMAP Success Criteria)

| #   | Success Criterion                                                                                                                                                                                                                                                                                                                                          | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Each grocery item that matches a library entry shows a "Fix" affordance; clicking it opens a small inline editor with two category dropdowns; saving updates the library entry, sets `curated: true`, and OOB-swaps the grocery list so the item immediately appears in its new category group.                                                            | VERIFIED | `views/partials/grocery-item.njk` lines 9-21 emit pencil button conditioned on `item.libraryEntryId` (matched → `categories-edit`). `library-fix-editor.njk` has 2 `<select>` dropdowns. `routes/library.js` line 479 sets `curated: true` on POST /library/:id/categories. OOB-swap path: `respondPerSurface` lines 40-72; verified by `Round-trip /grocery` integration test (`test/library-categories-routes.test.js` lines 445-484: GET → POST → re-GET, item moves from Produce to Meat bucket).                                                                                                                                                                                          |
| 2   | Each recipe ingredient line that matches a library entry shows the same "Fix" affordance with the same behavior; saving OOB-swaps the recipe ingredient groups to reflect the updated category.                                                                                                                                                            | VERIFIED | `views/partials/recipe-ingredient-line.njk` lines 3-15 emit conditional pencil; `recipe-ingredient-groups-oob.njk` is the OOB swap target wrapper. `respondPerSurface` recipe branch at `routes/library.js` lines 55-66 selects this partial when `HX-Current-URL` matches `/recipes/:id`. Verified by `Round-trip /recipes/:id` integration test (lines 486-519: ingredient moves from Veg to Protein group across the round-trip). |
| 3   | Grocery items and recipe ingredient lines that do not match any library entry show a "Categorize" affordance instead; clicking it creates a new library entry seeded from the item text.                                                                                                                                                                   | VERIFIED (literal); WARNING (intent gap) | Categorize affordance verified by `test/grocery-routes.test.js` line 130s and `test/recipes.test.js` line 295. Entry-creation seeded from item text verified by `library-categories-routes.test.js` line 340 (creates `mango` entry with `curated:true`). **Intent gap:** Categorize editor (`library-categorize-editor.njk`) has no aliases input, and `findEntryInIndex` (`lib/library.js` line 226) matches on aliases only — so a freshly Categorize-created entry does NOT auto-match the original item text on next render. The same item still shows the Categorize pencil. Deferred enhancement D-76 alt #2 (06-CONTEXT.md line 217) acknowledges this. The literal SC#3 wording is satisfied; the project's stated convergence intent is partially deferred. See `human_verification` and `deferred` sections.                                                                                              |
| 4   | The Fix editor contains only category dropdowns and a Save button — canonical name and aliases are not editable inline; an "Edit full entry" link navigates to the Library tab entry.                                                                                                                                                                       | VERIFIED | `views/partials/library-fix-editor.njk`: no `<input name="name">`, no `<input name="aliases">` (lines 1-37); 2 `<select>` only. "Edit full entry →" link at line 4 targets `/library?q={{ entry.name|urlencode }}`. Test `library-categories-routes.test.js` line 65 (categories-only invariant), line 564 (FIX-03 hijack-attempt: POST `name=HIJACK aliases=evil` to `POST /library/:id/categories` is silently ignored — entry name and aliases UNCHANGED while categories DID change). Test line 583 verifies link integrity. |
| 5   | Recipe pages always display the original scraped ingredient text (`ingredient.text`); renaming a library entry's canonical name does not change any text on any recipe page.                                                                                                                                                                                | VERIFIED | `views/partials/recipe-ingredient-line.njk` line 2: `<span class="recipe-ingredient-text">{{ ing.text }}</span>` — never `entry.name`. Tests in `test/recipes.test.js` lines 307, 318, 341, 362 (4 invariants including in-session rename). Tests in `test/grocery-routes.test.js` lines 181, 208 (grocery surface invariants). All four scan every `<span class="recipe-ingredient-text">` / `<span class="grocery-text">` match for canonical name leakage. |

**Score:** 5/5 truths VERIFIED (with warning on SC#3 intent — see deferred items)

---

### Required Artifacts

| Artifact                                                       | Expected                                          | Status     | Details                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `views/partials/icon-pencil.njk`                               | Shared SVG pencil glyph                           | VERIFIED | 1 line, valid SVG with `viewBox="0 0 16 16"`, `fill="currentColor"`, `aria-hidden="true"`. Included in both grocery-item.njk and recipe-ingredient-line.njk.                                                                                                          |
| `views/partials/library-fix-editor.njk`                        | Categories-only editor                            | VERIFIED | 37 lines. Surface-relative outer id `library-fix-{{ surfaceItemId }}`. Header with strong-tagged entry name + Edit-full-entry link. Form posts to `/library/{{ entry.id }}/categories`. 5 hidden inputs round-trip surface context. 2 dropdowns; Save + Cancel buttons. NO name/aliases inputs. |
| `views/partials/library-categorize-editor.njk`                 | Name + categories editor                          | VERIFIED | 48 lines. Surface-relative outer id. Form posts to `/library`. 5 hidden inputs. Name input with `prefilledName`, `required`, `maxlength="200"`, `autofocus`. Conditional `<div class="library-categorize-error" role="alert">` slot. 2 dropdowns. Save + Cancel. NO aliases input (D-76 keeps scope tight — see SC#3 deferred). |
| `views/partials/recipe-ingredient-line.njk`                    | Per-line render + pencil                          | VERIFIED | 16 lines. Stable per-line id `recipe-ing-{recipe.id}-{group.category}-{index}`. `<span class="recipe-ingredient-text">{{ ing.text }}</span>` — FIX-04 invariant locked at render layer. Conditional pencil button. |
| `views/partials/recipe-ingredient-groups.njk`                  | Inner groups loop, sources `ing.flatIndex`       | VERIFIED | 11 lines. `{% set index = ing.flatIndex %}` (06-02 change). Else-block "No ingredients found". |
| `views/partials/recipe-ingredient-groups-oob.njk`              | OOB swap wrapper for recipe surface              | VERIFIED | 4 lines. Wraps `recipe-ingredient-groups.njk` with `<section class="recipe-ingredients" id="recipe-ingredient-groups-{{ recipe.id }}">` so `injectOob` attaches `hx-swap-oob="true"` to a single root. Matches the live-render id in `views/recipe.njk` line 19. |
| `views/partials/grocery-item.njk` (modified)                   | Pencil between text and delete                    | VERIFIED | Pencil button positioned between `.grocery-text` (line 8) and `.grocery-delete` (line 22), conditional on `item.libraryEntryId`. Verified by `test/grocery-routes.test.js` lines 156-164 (DOM-order assertion). |
| `views/recipe.njk` (modified)                                  | Section id + groups partial include               | VERIFIED | Line 19: `<section class="recipe-ingredients" id="recipe-ingredient-groups-{{ recipe.id }}">` (D-73 OOB target). Line 21: `{% include "partials/recipe-ingredient-groups.njk" %}`. |
| `routes/library.js` — GET `/library/categorize-edit`           | Categorize editor fragment                        | VERIFIED | Lines 78-101. Static-segment route registered before `/library/:id` wildcard. Pre-fills name via `normalizeIngredientText`, dropdowns via `recipeCategoryOf`/`groceryCategoryOf`. |
| `routes/library.js` — GET `/library/cancel-fix`                | Surface-aware row restore                         | VERIFIED | Lines 106-151. Branches on `surface=grocery|recipe`. 404 on unknown id; 400 on unknown surface. |
| `routes/library.js` — GET `/library/:id/categories-edit`       | Fix editor fragment                               | VERIFIED | Lines 156-174. 404 on unknown id. Surface-relative outer id. |
| `routes/library.js` — POST `/library/:id/categories`           | Categories-only Save                              | VERIFIED | Lines 439-498. Sets `curated: true`. Validates each enum. 400 returns Fix editor; 404 plain text; 200 toast `'Saved categories'`. Per-surface OOB via `respondPerSurface`. |
| `routes/library.js` — POST `/library` Categorize branch        | Hidden-surfaceItemId mode dispatch                | VERIFIED | Lines 218-332. Categorize mode triggered by `!!surfaceItemId`. Inline-error helper `renderCategorizeError` for 400 paths preserves typed values. Phase 5 plain-text 400 contract preserved when `surfaceItemId` absent. |
| `lib/calc.js#decorateIngredients` — `flatIndex` attached       | Cross-group render-stable per-line index          | VERIFIED | Lines 233-249. Counter ticks only for emitted items (skipped non-strings/empties don't consume slots). Comment block explains rationale. |
| `public/styles.css` — Phase 6 block                            | Pencil + editor styles, ~145 lines                | VERIFIED | File grew from 495 to 640 lines. Selectors `.grocery-pencil`, `.recipe-pencil`, `.library-fix-*`, `.library-categorize-*` present at lines 500-639. `:focus-visible` rules at 515-516. `@media (max-width: 480px)` stack rule at 635-639. Reuses existing `:root` tokens — zero new CSS variables. |
| Test files — `test/library-categories-routes.test.js`          | 37 tests for the new endpoints + integration     | VERIFIED | 590 lines. 37 tests; per-surface OOB shape, FIX-03 hijack-attempt, round-trip, link integrity, route-order assertions. |
| Test files — `test/grocery-routes.test.js` (extended)          | 16 tests including pencil + FIX-04 invariants    | VERIFIED | 225 lines. 16 tests: pencil presence, branch routing, urlencode, DOM ordering, FIX-04 rename + category-change. |
| Test files — `test/recipes.test.js` (extended)                 | 24 tests including pencil + FIX-04 invariants    | VERIFIED | 387 lines. 24 tests: pencil presence/branching, FIX-04 rename invariant (static + cross-render), per-line stable id, OOB section id. |

---

### Key Link Verification

| From                                     | To                                                                               | Via                                          | Status | Details                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grocery-item.njk` pencil                | `GET /library/:id/categories-edit` (matched) / `GET /library/categorize-edit` (unmatched) | Conditional `hx-get` branching on `item.libraryEntryId` | WIRED | Lines 9-21. URL parameters include `surface=grocery&itemId={{ item.id }}` and (unmatched) `text={{ item.text|urlencode }}`. Verified end-to-end by integration test at `library-categories-routes.test.js` line 445.                                                                                                                                                                                       |
| `recipe-ingredient-line.njk` pencil      | Same conditional `hx-get`                                                         | Conditional on `ing.libraryEntryId`         | WIRED | Lines 3-15. `surface=recipe&recipeId=...&index={{ index }}` (where index = `ing.flatIndex` cross-group counter).                                                                                                                                                                                                                                                                       |
| `library-fix-editor.njk` Save            | `POST /library/{{ entry.id }}/categories`                                         | `hx-post` form submission                   | WIRED | Line 7. 5 hidden inputs round-trip surface context. `hx-target="#library-fix-{{ surfaceItemId }}"` matches editor's outer id (RESEARCH Pitfall 2 — surface-relative).                                                                                                                                                                                                                  |
| `library-categorize-editor.njk` Save     | `POST /library`                                                                   | `hx-post` form submission                   | WIRED | Line 4. Hidden `surfaceItemId` triggers Categorize mode in `POST /library` route handler.                                                                                                                                                                                                                                                                                              |
| `library-fix-editor.njk` Cancel          | `GET /library/cancel-fix?surface=...&itemId=...`                                  | `hx-get` button                              | WIRED | Lines 31-34. Conditional recipeId/index in query string.                                                                                                                                                                                                                                                                                                                                |
| `library-categorize-editor.njk` Cancel   | Same cancel route                                                                  | Same `hx-get` button                         | WIRED | Lines 42-45.                                                                                                                                                                                                                                                                                                                                                                            |
| `POST /library/:id/categories` 200       | OOB grocery list / OOB recipe groups / row+footer (library)                       | `respondPerSurface(req, res, state)`         | WIRED | `routes/library.js` lines 487-498. URL routing tested at `library-categories-routes.test.js` lines 248, 263, 288.                                                                                                                                                                                                                                                                       |
| `POST /library` Categorize 200           | Same per-surface OOB shapes                                                       | Same helper                                  | WIRED | Line 327. Categorize-from-/grocery, Categorize-from-/recipes, Categorize-from-/library all tested.                                                                                                                                                                                                                                                                                       |
| `decorateIngredients` flatIndex          | `recipe-ingredient-groups.njk` line 5                                             | Server-computed cross-group counter         | WIRED | `lib/calc.js` lines 238-249 emit `flatIndex` per item; consumed by partial via `{% set index = ing.flatIndex %}`. Cancel-fix recipe branch at `routes/library.js` lines 132-144 walks groups looking for `ing.flatIndex === index`. |
| `lib/library.js#findEntryInIndex` matching | `entry.aliases` only (NOT `entry.name`)                                         | Index built from aliases at line 191         | KNOWN-INTENT-GAP | This is by design (MATCH-03 contract). Combined with the Categorize editor having no aliases input (D-76), it produces the SC#3 intent gap noted in `human_verification`. NOT a bug — intentional architectural choice + deferred enhancement. |

---

### Data-Flow Trace (Level 4)

| Artifact                                            | Data Variable                                              | Source                                                                                                       | Produces Real Data | Status      |
| --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `library-fix-editor.njk` `entry.name` header        | `entry`                                                    | `entryViewById(state, req.params.id)` → `buildLibraryView(state).entries.find(...)`                          | YES (real state)   | FLOWING |
| `library-fix-editor.njk` dropdowns selected option | `entry.recipeCategory` / `entry.groceryCategory`           | Same `buildLibraryView` projection                                                                            | YES                | FLOWING |
| `library-categorize-editor.njk` prefilled name     | `prefilledName`                                            | `normalizeIngredientText(text)` from `?text=` query param                                                    | YES                | FLOWING |
| `library-categorize-editor.njk` heuristic dropdown | `prefilledRecipeCategory` / `prefilledGroceryCategory`     | `recipeCategoryOf(text)` / `groceryCategoryOf(text)`                                                          | YES                | FLOWING |
| `grocery-item.njk` pencil branch                   | `item.libraryEntryId`                                      | `buildGroceryView(state)` attaches via `findEntryByText(state, item.text)` (Phase 3 D-31)                    | YES                | FLOWING |
| `recipe-ingredient-line.njk` pencil branch         | `ing.libraryEntryId` + `ing.flatIndex`                     | `decorateIngredients(recipe.ingredients, state.library)` attaches both                                       | YES                | FLOWING |
| OOB grocery-list response on Save                  | `view`                                                     | `buildGroceryView(state)` after `storage.save()` of mutated entry                                            | YES — fresh re-render | FLOWING |
| OOB recipe-ingredient-groups response on Save      | `recipe.ingredientGroups`                                  | `decorateIngredients(recipe.ingredients, state.library)` after `storage.save()`                              | YES — fresh re-render | FLOWING |

All data flows are live and source from `storage.get()` after each mutation; no hardcoded test data, no static returns. Render-time categorization rule (CLAUDE.md) preserved — no precomputed categories on grocery items or recipe ingredients.

---

### Behavioral Spot-Checks

| Behavior                                       | Command                                                                        | Result                                                       | Status |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------ |
| Full test suite green                          | `npm test`                                                                     | `tests 401, pass 401, fail 0, duration_ms 1025`             | PASS |
| Phase 6 test files run independently           | `node --test test/library-categories-routes.test.js test/grocery-routes.test.js test/recipes.test.js` | `tests 77, pass 77, fail 0`                          | PASS |
| Recipe-id regex correctly distinguishes paths  | Manual verification of regex against 12 URL shapes                             | All 6 valid match cases capture id; all 6 reject cases (no slash, no id, query, fragment, double-slash) correctly NO MATCH | PASS |
| Module loads without syntax error              | `node -e "require('./routes/library')"`                                        | Exit 0                                                        | PASS |
| Route order: static segments before `:id`      | `grep -n 'router\.' routes/library.js`                                         | `/library/categorize-edit` (78) and `/library/cancel-fix` (106) BOTH before `/library/:id` (178) | PASS |
| `findEntryInIndex` matches via aliases only    | `node -e "..."` round-trip with name-only entry vs alias-bearing entry         | name-only: `undefined`; with alias: matches                  | PASS (confirms SC#3 intent gap is real) |
| `curated: true` set on POST /library/:id/categories | Test `library-categories-routes.test.js` line 245                          | `assert.strictEqual(entry.curated, true)` passes             | PASS |
| `curated: true` set on Categorize entry creation | Test `library-categories-routes.test.js` line 355                            | `assert.strictEqual(entry.curated, true)` passes             | PASS |

---

### Requirements Coverage

| Requirement | Source Plans                              | Description                                                                                                                                       | Status     | Evidence                                                                                                                                                                                                  |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIX-01      | 06-01, 06-02, 06-04, 06-05               | Grocery item Fix + Categorize affordance with OOB-swap                                                                                            | SATISFIED  | Tests at `grocery-routes.test.js` (Pencil presence + branch routing); `library-categories-routes.test.js` (Fix editor GET, POST /library/:id/categories with `surfaceItemId`, OOB grocery-list, round-trip). 14 tests total cover this requirement. **Note:** Categorize convergence has the deferred-enhancement gap noted under SC#3. |
| FIX-02      | 06-01, 06-02, 06-04, 06-05               | Recipe page ingredient line Fix + Categorize with OOB recipe-section swap                                                                          | SATISFIED  | Tests at `recipes.test.js` (pencil per ingredient line, conditional branching, OOB section id, FIX-04 invariants); `library-categories-routes.test.js` (POST + recipe OOB; Round-trip /recipes/:id at line 486). |
| FIX-03      | 06-02, 06-04, 06-05                       | Categories-only Fix editor + "Edit full entry" link                                                                                               | SATISFIED  | `library-categories-routes.test.js` line 65 (categories-only invariant — no `<input name="name">`, no `<input name="aliases">`); line 564 (POST hijack-attempt is silently ignored); line 583 (link integrity). |
| FIX-04      | 06-01 (partial render-layer lock), 06-05  | Recipe pages always show `ingredient.text`; renaming entry does not change recipe text                                                            | SATISFIED  | 4 invariant tests across 2 files: `recipes.test.js` lines 307, 318 (static + post-rename), 341 (round-trip), 362 (cross-render rename). `grocery-routes.test.js` lines 181, 208 (grocery surface invariants). All scan every text-span match for canonical name leakage. |

**No orphaned requirements.** REQUIREMENTS.md traceability table maps FIX-01..04 to Phase 6; all 4 IDs are claimed by at least one plan's `requirements` field and have automated test coverage.

---

### Anti-Patterns Found

| File                                  | Line | Pattern                       | Severity | Impact                                                                                                                                                                                                                                                              |
| ------------------------------------- | ---- | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/library.js`                   | 42   | Substring `.includes('/grocery')` for HX-Current-URL routing | INFO    | Theoretical false-match if `HX-Current-URL` is `/library/grocery-something` — but no such library subpath exists in this codebase, so practically safe. Documented as an intentional simplification (per 06-04 SUMMARY's pragmatic-choices section). Leave as-is. |
| `views/partials/library-categorize-editor.njk` | n/a (entire file) | No aliases input (D-76 deliberate scope decision) | INFO | Combined with `findEntryInIndex` matching on aliases only, produces the SC#3 intent gap. Not a stub — intentional design + deferred enhancement D-76 alt #2. |

No TODO/FIXME comments, no `return null`/`return []` stubs, no `console.log`-only handlers, no placeholder text, no hardcoded empty state. Every grep target was either intentional (props with hardcoded `value=""` for empty-name initial state in Categorize editor) or absent.

---

### Verdict on the 06-04 regex deviation

The recipe-id regex was broadened from `/^[^?#]*\/recipes\/([a-z0-9]+)/i` to `/^[^?#]*\/recipes\/([^/?#]+)/`.

**Manual regex verification against 12 URL shapes (run via `node -e`):**

| Input                                               | Result            | Behavior |
| --------------------------------------------------- | ----------------- | -------- |
| `http://x/recipes/abc`                              | MATCH `id="abc"`  | Correct  |
| `http://x/recipes/abc/`                             | MATCH `id="abc"`  | Correct (trailing slash truncated by `[^/?#]+`) |
| `http://x/recipes/abc?q=1`                          | MATCH `id="abc"`  | Correct |
| `http://x/recipes/r_test01`                         | MATCH `id="r_test01"` | Correct (was the failing case for the original regex; this fix unblocks it) |
| `http://x/recipes/`                                 | NO MATCH          | Correct — index-page-with-trailing-slash, no id |
| `http://x/recipes`                                  | NO MATCH          | Correct — index page, no id |
| `http://x/recipes//foo`                             | NO MATCH          | Correct — `[^/?#]+` requires at least one non-slash char |
| `http://x/recipes?id=abc`                           | NO MATCH          | Correct — query string before slash |
| `http://x/recipes#abc`                              | NO MATCH          | Correct — fragment before slash |
| `/recipes/abc`                                      | MATCH `id="abc"`  | Correct (works without scheme/host) |
| `/recipes`                                          | NO MATCH          | Correct |
| `/library/lb_apple01/categories-edit?surface=recipe&recipeId=r_test01&index=0` | NO MATCH | Correct — the URL is `/library/...`, not `/recipes/...`, so the regex correctly rejects it. The hidden-form `recipeId` param doesn't false-trigger the regex against the editor URL. |

**Verdict:** The broadened regex is correct. It accepts `/recipes/{id}` for any id-segment-shape (matching Express's `:id` permissiveness), and correctly rejects all index-page variants and non-recipe paths. No false-shadowing of `/recipes` or `/recipes/`. The character class `[^/?#]+` is the right level of strictness for the route layer; charset validation belongs to id generation, not URL routing (per 06-04 SUMMARY rationale and RESEARCH Pitfall 1). PASS.

---

### Verdict on the 06-05 alias-only-match observation (SC#3)

**Observation:** The Categorize editor (`library-categorize-editor.njk`) has no `<input name="aliases">`. `lib/library.js#findEntryInIndex` matches text to entries via the alias index only — never via `entry.name`. Result: a Categorize submission like `{name: 'mango', recipeCategory: 'Veg', groceryCategory: 'Produce'}` creates an entry with `aliases: []`, and on the next render of `/grocery`, the original `mango` grocery item still does NOT match this entry — its pencil still points at `/library/categorize-edit`, not `/library/{newId}/categories-edit`.

**Verdict against literal SC#3:** SATISFIED.
- "Items not currently matching a library entry get a Categorize affordance" — VERIFIED at `grocery-routes.test.js` line 130s and `recipes.test.js` line 295.
- "Clicking it creates a new library entry seeded from the item text" — VERIFIED at `library-categories-routes.test.js` line 340 (entry created with `name='mango'`, `curated:true`).

**Verdict against project intent (PROJECT.md "categorization converges toward accuracy as the user curates their library"):** PARTIAL.
- The convergence cycle (Categorize → match → Fix → curate) doesn't auto-close because the new entry has no aliases. The user must follow up via the Library tab to add the original item text as an alias before the same item will auto-match next render.
- This is honestly documented in 06-CONTEXT.md as **deferred enhancement D-76 alt #2** ("Auto-add item text as alias on Categorize"), and in 06-05-SUMMARY.md lines 88-94 as the reason the round-trip integration test had to inject `aliases: 'mango'` in the POST body.

**Recommendation:** This is a verifiable-but-intentional deviation from project intent. Not a Phase 6 BLOCKER (literal SC#3 is satisfied), but should be surfaced to the user for an explicit accept/defer decision. See `human_verification` section, item 4. Listed in `deferred:` frontmatter for traceability into the next milestone.

---

### Test Count Progression

| Plan                  | Tests Added | Cumulative |
| --------------------- | ----------- | ---------- |
| Baseline (start)      | —           | 349        |
| 06-01 (Wave 1)        | +11         | 360        |
| 06-02 (Wave 2)        | +19         | 379        |
| 06-03 (Wave 2 — CSS)  | 0           | 379        |
| 06-04 (Wave 3)        | +13 (14 added, 1 baseline absorbed per 06-04-SUMMARY line 115) | 392 |
| 06-05 (Wave 4)        | +9          | 401        |
| **Net delta**         | **+52**     | **401**    |

Verified by `npm test` output: `tests 401, pass 401, fail 0`. Phase-6-specific test count (3 files): 77 tests.

---

### Anti-Patterns: None Blocking

- No TODO/FIXME/PLACEHOLDER comments in modified files.
- No empty implementations (`return null`, `return []`, `return {}`) in new code paths.
- No hardcoded empty state on user-visible data.
- No ASCII-violation toast strings (`'Saved categories'`, `'Added entry'` are both verb-only ASCII per CLAUDE.md HTTP-header rule).
- All grep matches for `=\s*\[\]` / `=\s*\{\}` etc. occurred in `aliases: []` initial-construction paths or test fixtures — appropriate.

---

### Human Verification Required

See `human_verification:` section in frontmatter. Four items requiring browser/eyeball confirmation:

1. **Pencil icon visual quality** across browsers — automated tests verify SVG presence + viewBox, not crispness or alignment.
2. **Editor open/close keyboard navigation** — focus restoration on Cancel needs physical-keyboard test.
3. **Mobile touch ergonomics** — 24×24/20×20 tap targets and inline expand under constrained viewport need device confirmation.
4. **SC#3 intent decision** — accept the literal-SC#3-PASS-but-convergence-deferred Categorize behavior, or escalate to a follow-up plan (D-76 alt #2 enhancement) before closing the milestone. Documented in `deferred:` frontmatter.

---

### Gaps Summary

**No BLOCKER gaps.** All five ROADMAP success criteria are satisfied at the literal-text level. All four FIX-XX requirement IDs have automated test coverage. The full test suite passes 401/401 with the +52 net new tests claimed in the summaries (verified). The 06-04 regex deviation is correct and does not introduce shadowing bugs against `/recipes` or `/recipes/`. The 06-05 alias-only-match observation is a verifiable intent gap (Categorize convergence deferred to D-76 alt #2) that does not violate the literal SC#3 wording but is worth surfacing to the user for an explicit decision.

**Status: human_needed** — code-level acceptance is clean; remaining items are visual/keyboard/mobile spot-checks plus the project-intent decision on Categorize convergence.

---

_Verified: 2026-05-07T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
