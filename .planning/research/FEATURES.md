# Feature Research — Ingredient Library

**Domain:** Ingredient library / food catalog for a personal recipe app
**Researched:** 2026-05-05
**Confidence:** MEDIUM-HIGH (grounded in Mealie, Tandoor, Grocy source review and issue tracker analysis; personal-app scope reduces reference pool vs. commercial apps)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = library feels broken or pointless.

| Feature | Why Expected | Complexity | Touches Existing Code? | Notes |
|---------|--------------|------------|------------------------|-------|
| Browse all entries in a Library tab | Users need a single place to see and curate what the system knows | LOW | Yes — new tab in `layout.njk`, new route in `routes/library.js` | Mealie surfaces this as "Manage Data > Foods"; Tandoor has a Foods section. Both are essential for trust. |
| Filter by curated / uncurated | Auto-extracted entries are low-confidence; users must be able to triage them without wading through already-correct entries | LOW | No | Mealie has no equivalent and users complain about noise from auto-seeded data (Discussion #3551). The `curated` flag on each entry makes this trivial to implement. |
| Edit canonical name, aliases, and categories inline | The primary curation action. Users fix miscategorized items here. | MEDIUM | No | Must edit both `recipeCategory` and `groceryCategory` in one place. Tandoor's supermarket category assignment requires separate admin-panel visits — users find that cumbersome (selfhosting.sh review). |
| Inline "Fix" shortcut from grocery list and recipe pages | Users spot a mis-category while using the app, not while browsing the Library tab. Context-driven fixes have higher completion rates than dedicated maintenance sessions. | MEDIUM | Yes — `views/partials/grocery-item.njk`, `views/partials/recipe-ingredient.njk` (new partials), route handlers | HTMX click-to-edit pattern maps naturally here. Only edits categories, not the scraped ingredient string (PROJECT.md constraint). |
| Partial-text / substring search within the Library tab | Library will grow to hundreds of entries. "Starts-with" filtering is too narrow; "contains" is the expected default. | LOW | No | All matching happens server-side on `state.library`; a simple `name.toLowerCase().includes(q)` over aliases satisfies this. No full-text index needed at personal-app scale. |
| Delete an entry | Users will create garbage entries from malformed scrapes. No way to remove = library rots. | LOW | No | Must handle gracefully: deleting an entry does not mutate any `state.recipes[].ingredients[]` string — categorization just falls back to heuristic. |
| Manually add an entry | Library can only be auto-seeded from URLs that succeed. Users cook things they don't have recipes for. | LOW | No | Simple form: canonical name + optional aliases + both categories. |
| Layered categorization: library first, heuristic fallback | The whole point. If the library doesn't override heuristic, curation has no effect. | MEDIUM | Yes — `lib/categorize.js` (add `lib/library.js` lookup before heuristic keyword tables) | PROJECT.md explicitly requires this. Render-time, not precomputed. |
| Auto-extract on recipe save | Library must grow organically — users can't face an empty library, and can't manually populate hundreds of entries at once. | MEDIUM | Yes — `routes/recipes.js` POST handler; new `lib/library.js` helper | Only unmatched strings create new entries. Matched strings confirm an existing alias and do nothing else. |
| One-time backfill of existing recipes | Users already have recipes. Without backfill, the library feels broken for existing data. | MEDIUM | Yes — `lib/storage.js` migrate() | Run once on first startup after deploy. Idempotent: skip entries that already exist. |

---

### Differentiators (Competitive Advantage for This Use Case)

Features that set this implementation apart. Not table stakes, but directly serve the core value.

| Feature | Value Proposition | Complexity | Touches Existing Code? | Notes |
|---------|-------------------|------------|------------------------|-------|
| Dual-category per entry (recipe-side + grocery-side) | Other apps (Mealie, Tandoor) use a single category system. Having separate `recipeCategory` (Protein/Veg/Seasoning/Flavor/Other) and `groceryCategory` (Produce/Meat/Dairy/Aisle/Frozen/Other) matches how this app already displays ingredients differently in two contexts. | LOW (schema only; UI is one extra field) | No | This is a design already baked into PROJECT.md. It's genuinely unusual and solves a real problem: "chicken breast" is Protein when planning, Meat when shopping. |
| Uncurated-first triage UX | Surfacing `curated: false` entries prominently (e.g., default filter on Library tab) means the user gets a guided cleanup flow, not a sea of 200 entries to dig through. Mealie's seeded-foods model has no equivalent and users resort to custom Python scripts to clean up (Discussion #3551). | LOW | No | Default to "show uncurated first" or offer a "Review new" count badge. |
| In-context fix — no page-leave required | Mealie requires navigating to Manage Data > Foods to fix a category. Tandoor requires Foods > Edit > assign supermarket category. Both pull users away from what they were doing. An inline HTMX fix that saves and re-renders the item without a page transition is meaningfully better. | MEDIUM | Yes — partials, route handlers | HTMX click-to-edit is the canonical pattern for this; the `respondWithUpdates` + OOB-swap model already in place makes this straightforward. |
| Alias-first matching (longest-match-wins) | Same algorithm as the existing heuristic — users already trust it. Extending it to library aliases means zero new mental model. | LOW | Yes — `lib/categorize.js` or new `lib/library.js` | Mealie uses fuzzy matching (Postgres-only feature), which breaks for SQLite users and has false-positive risk. Deterministic alias matching is simpler and safer for a single-user app. |
| Extensible shape without v1 implementation | Nutrition, allergens, notes can be added later without a migration. The library entry is a plain JS object in a JSON file — adding a field is a one-liner. | LOW | No | Mentioned in PROJECT.md. Do not implement nutrition UI in v1, but do not block it structurally. |

---

### Anti-Features (Deliberately NOT Building)

Commonly built, often requested, actively harmful for this use case.

| Feature | Why It Seems Appealing | Why It's Harmful Here | What to Do Instead |
|---------|----------------------|----------------------|-------------------|
| Import from CSV / OpenFoodFacts | "Seed the library instantly with real data" sounds great | OpenFoodFacts full DB is 9 GB uncompressed. A seeded library of 200+ foods means 200+ entries with heuristic-guessed categories that need manual review — Mealie users literally write Python scripts to clean this up (Discussion #3551). The library's value comes from *your* ingredient vocabulary, not a generic corpus. | Auto-extract from the user's own recipes. Start with their actual ingredients. Curate what matters. (PROJECT.md Out of Scope) |
| Library export (CSV / Schema.org) | "Portability" | The library won't have enough curated data in v1 to know what format would be useful. Building export before the data exists wastes time and creates a maintenance obligation. | Defer until the library has been used long enough to know what shape the data needs to be in. (PROJECT.md Out of Scope) |
| Cross-recipe ingredient merging | Replace "2 cups chicken broth" everywhere with canonical "chicken broth" | Mutating `state.recipes[].ingredients[]` strings is a separate scope that conflicts with the rule that recipe pages show original scraped text. It also risks data loss if matching is wrong. | Categories improve without touching recipe strings. The library's job is categorization, not normalization. (PROJECT.md Out of Scope) |
| Nutrition info / allergens in v1 | "Future-proof from day one" | Without real usage data, the schema will be wrong. Building UI for nutrition before the basic category flow is validated is premature. | Leave the entry shape open (no migration needed later); implement when the user asks for it. (PROJECT.md Out of Scope) |
| AI / LLM fuzzy matching | "Smart ingredient recognition" | Non-deterministic. A library entry with alias "peanut butter" should *always* match "peanut butter", not sometimes match "almond butter" because the model found them semantically similar. Surprises erode trust. Also requires network, API key, latency. | Deterministic alias matching + existing heuristic covers the tail. (PROJECT.md Out of Scope) |
| Bulk operations (batch-edit category, bulk delete) | "Power user efficiency" | Mealie's mass-operations page is described as a "great hidden tool" that nobody can find (no visible links; direct URL only — Discussion #3682). Complexity without discoverability = dead feature. For a personal single-user library of a few hundred entries, search + individual edit is fast enough. | One-at-a-time edits in the Library tab. If bulk need emerges, add it as a v1.x. |
| Recently-used / favorites within the library | "Surfaces what matters most" | The library is a *categorization* system, not an inventory or discovery system. "Recently used" is meaningful for grocery lists (ingredients you always buy), not for a catalog that users consult when fixing a misfire. The recipe and grocery tabs already surface context. | Frequency-based surfacing belongs on the grocery list (already shows items as you add them), not in the library. |
| Per-recipe ingredient linking (replace scraped string with library entry) | "Canonical name appears on recipe page" | PROJECT.md explicitly defers this. Mutating `state.recipes[].ingredients[]` is a separate project. | Categorization at render-time covers the user-visible improvement without touching stored recipe data. |
| History / change log for library entries | "Audit trail for curation decisions" | Adds persistence complexity, UI surface, and storage cost for a single-user personal app where undo is not expected. No open-source personal recipe app implements this. | Keep it simple: edits are immediate and permanent. |
| Multi-select / drag-and-drop category assignment | Tandoor uses drag-and-drop for supermarket category assignment. Users find it unfamiliar for a web app and require admin panel access. | Extra JS state, mobile-unfriendly, inconsistent with existing HTMX no-build-step constraint. | Inline edit per entry is simpler, mobile-friendly, consistent with existing patterns. |

---

## Feature Dependencies

```
[Auto-extract on recipe save]
    └──requires──> [lib/library.js match-or-create helper]
                       └──requires──> [state.library schema + storage.js migrate()]

[Layered categorization at render-time]
    └──requires──> [lib/library.js match helper]
                       └──requires──> [state.library schema]
    └──enhances──> [grocery list category groups]  (existing buildGroceryView)
    └──enhances──> [recipe ingredient groups]      (existing decorateIngredients)

[Inline Fix shortcut]
    └──requires──> [Library entry edit endpoint]
    └──requires──> [lib/library.js match helper] (to know WHICH entry the item resolves to)
    └──enhances──> [grocery-item partial]
    └──enhances──> [recipe ingredient partial]

[Library tab — Browse / Filter / Edit / Delete / Add]
    └──requires──> [state.library schema]
    └──requires──> [CRUD route handlers in routes/library.js]
    └──enhances──> [Filter by curated/uncurated]
    └──enhances──> [Partial-text search]

[One-time backfill]
    └──requires──> [state.library schema + storage.js migrate()]
    └──requires──> [lib/library.js match-or-create helper]
    └──must run before──> [user first opens Library tab]
```

### Dependency Notes

- **state.library schema is the root dependency:** Everything else — auto-extract, backfill, layered categorization, the Library tab, inline Fix — requires `state.library` to exist in `state.json`. This is the first thing to implement.
- **lib/library.js must exist before routes:** Both the auto-extract-on-save route and the Library tab routes share the same match-or-create logic. Build the helper, not inline logic in routes.
- **Layered categorization must land in the same phase as backfill:** If backfill runs but `lib/categorize.js` still calls only the heuristic, the user sees no improvement. These two must ship together.
- **Inline Fix depends on knowing the matched entry:** The Fix shortcut needs to open the *correct* library entry for the displayed ingredient. This requires the match function to return the entry ID, not just the category string. Design `lib/library.js` accordingly from the start.

---

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] `state.library` schema + `storage.js` migrate() — foundation for everything
- [ ] `lib/library.js` with `matchOrCreate(ingredientString, state)` and `matchEntry(ingredientString, state)` helpers
- [ ] One-time backfill of existing recipe ingredients into library
- [ ] Auto-extract on recipe save (unmatched strings → new `curated: false` entries)
- [ ] Layered categorization at render-time (library aliases checked before heuristic)
- [ ] Library tab: browse all, filter curated/uncurated, partial-text search
- [ ] Library tab: inline edit (canonical name, aliases, both categories, delete)
- [ ] Library tab: manually add entry
- [ ] Inline Fix shortcut on grocery items and recipe ingredient lines

### Add After Validation (v1.x — when user has used it long enough to know what's missing)

- [ ] Bulk delete of uncurated entries — add when user has 50+ garbage entries from edge-case scrapes and wants to clear them in one action
- [ ] "Review new entries" count badge on Library tab nav item — add when backlog of uncurated entries becomes distracting

### Future Consideration (v2+)

- [ ] Export library — after the library has accumulated real curated data; format TBD
- [ ] Nutrition fields per entry — after categorization flow is validated as the right abstraction
- [ ] Allergen / dietary flags per entry — same trigger as nutrition

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| state.library schema + migrate | HIGH | LOW | P1 |
| lib/library.js helpers | HIGH | MEDIUM | P1 |
| One-time backfill | HIGH | MEDIUM | P1 |
| Auto-extract on recipe save | HIGH | MEDIUM | P1 |
| Layered categorization at render-time | HIGH | MEDIUM | P1 |
| Library tab (browse + filter + search) | HIGH | MEDIUM | P1 |
| Library tab (edit + delete + add) | HIGH | MEDIUM | P1 |
| Inline Fix shortcut | MEDIUM | MEDIUM | P1 |
| Uncurated-first sort/badge | MEDIUM | LOW | P2 |
| Bulk delete uncurated | LOW | LOW | P2 |
| Export | LOW | MEDIUM | P3 |
| Nutrition fields | LOW | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | Mealie | Tandoor | Grocy | recipe-box v1 Approach |
|---------|--------|---------|-------|------------------------|
| Ingredient alias support | Yes — aliases on Food entries; add-as-alias button in parser UI (Issue #6209) | Via merge/rename only; no separate alias field | Barcodes as product aliases (not text aliases) | Aliases array on each library entry; matched before heuristic |
| Category assignment | Labels on shopping list items; no separate recipe-side vs grocery-side | Supermarket categories via drag-and-drop in admin (selfhosting.sh) | Userfields + product groups | Dual category: recipeCategory + groceryCategory on each entry |
| Merge/deduplicate | Explicit merge tool — broken when entry in shopping list (Bug #3624, #4936) | Merge-and-rename for foods, tags, units | No native merge; barcodes serve as product pointers | No merge in v1 — aliases handle variant strings pointing to same entry |
| Bulk operations | Data management page (hidden, direct URL only — Discussion #3682) | Batch tag assignment | None | Not in v1; per-entry edits sufficient |
| Import | Seed from 200+ built-in foods; CSV/JSON export | OpenFoodFacts integration | Barcode lookup via external services | Not in v1 — auto-seeded from user's own recipes |
| Search in library | Fuzzy (Postgres only; SQLite users get exact-match only — Bug #3845) | Full-text with TrigramSimilarity | Product name search | Substring (contains) match over name + aliases; deterministic; no DB required |
| Auto-populate from recipes | No — requires manual parsing step per recipe | No | No | Yes — on every recipe save; unmatched strings become candidates |
| Inline fix from context pages | No — must navigate to Foods page | No — must navigate to Foods > Edit | No | Yes — HTMX click-to-edit shortcut on grocery + recipe pages |
| Curated/uncurated triage | No equivalent — seeded entries have no quality flag | No equivalent | No equivalent | curated: false flag on auto-extracted entries; filterable in Library tab |

---

## Lessons from Real Apps

**What works (adopt):**
- Mealie's alias field on food entries is the right abstraction. Users in Discussion #1852 explicitly asked for an "ingredient dictionary" mapping variants to a primary name — that is exactly what the aliases array provides.
- Tandoor's principle of assign-once-reuse-forever for supermarket categories is sound. The `groceryCategory` on a library entry achieves the same result without the drag-and-drop admin interface.
- The bheisler.github.io recipe manager's insight — store only the original text + matched entry ID, compute everything else at render time — directly validates PROJECT.md's render-time categorization constraint.

**What fails (avoid):**
- Mealie's merge tool breaks when entries are in active shopping lists (Bug #3624, #4936). For recipe-box, avoid any operation that modifies the meaning of items already in `state.grocery` — the inline Fix only changes the library entry, which changes how *future renders* categorize the item.
- Mealie seeding 200+ generic foods creates a cleanup burden users address with custom scripts, not the app. Auto-seeding from the user's own recipes is strictly better for a personal app.
- Mealie's bulk-edit page is "a great hidden tool" that nobody finds (no nav link, direct URL only). Discoverability is not optional for personal apps; power features that nobody finds have zero value.
- Tandoor's supermarket category assignment requires admin panel access + drag-and-drop, which is technically powerful but practically high-friction for a single-user personal app.

---

## Sources

- Mealie discussion #1852: Grouping ingredients with different names — https://github.com/mealie-recipes/mealie/discussions/1852
- Mealie discussion #3551: Managing unused foods — https://github.com/mealie-recipes/mealie/discussions/3551
- Mealie discussion #3682: Mass operations on items — https://github.com/mealie-recipes/mealie/discussions/3682
- Mealie bug #3624: Merging ingredient breaks shopping list — https://github.com/mealie-recipes/mealie/issues/3624
- Mealie bug #4936: Cannot merge units in shopping list — https://github.com/mealie-recipes/mealie/issues/4936
- Mealie bug #6209: Add-as-alias button shows when values are identical — https://github.com/mealie-recipes/mealie/issues/6209
- Tandoor shopping features — https://docs.tandoor.dev/features/shopping/
- Tandoor selfhosting review (supermarket categories) — https://selfhostwise.com/posts/how-to-set-up-tandoor-recipes-self-hosted-recipe-manager/
- Mealie features overview — https://docs.mealie.io/documentation/getting-started/features/
- bheisler.github.io Recipe Manager Part 5 (data integrity, alias, render-time) — https://bheisler.github.io/post/recipe-manager-part-5-data-integrity/
- HTMX click-to-edit pattern — https://htmx.org/examples/click-to-edit/

---

*Feature research for: ingredient library in recipe-box*
*Researched: 2026-05-05*
