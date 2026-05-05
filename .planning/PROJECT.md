# Ingredient Library

## What This Is

A curated library of ingredient entries layered on top of recipe-box's existing heuristic categorization. Each entry has a canonical name, a list of matching aliases, recipe-side category (Protein/Veg/Seasoning/Flavor/Other), and grocery-side category (Produce/Meat/Dairy/Aisle/Frozen/Other). The library is auto-seeded as recipes are saved — any unmatched ingredient string becomes a new candidate entry with heuristic-guessed categories. The entry shape is intentionally extensible so future fields (nutrition info, allergens, etc.) can be added without schema migration.

## Core Value

Ingredient categorization on the grocery list and recipe detail pages converges toward accuracy as the user curates their library, replacing the brittle keyword-table heuristic with a personal source of truth.

## Requirements

### Validated

<!-- Existing recipe-box capabilities — already shipped, relied upon. -->

- ✓ Save a recipe by URL (JSON-LD scrape) — existing
- ✓ Browse saved recipes as a card list — existing
- ✓ View a recipe's detail page with categorized ingredients (Protein/Veg/Seasoning/Flavor/Other) — existing
- ✓ Delete a saved recipe — existing
- ✓ Tag recipes for the current week (calendar-aware Monday rollover) — existing
- ✓ Confirm the week to import tagged recipes' ingredients into the grocery list (string-deduped) — existing
- ✓ Manage a freeform grocery list with shopping-mode checkboxes and a "Got it" closed list — existing
- ✓ Heuristic ingredient categorization via word-boundary keyword matching, longest-match-wins (`lib/categorize.js`) — existing
- ✓ View past weeks' tagged recipes (read-only History tab) — existing

### Active

<!-- Current scope. Hypotheses until shipped. -->

- [ ] State extends with a new `state.library` collection of ingredient entries — `{ id, name, aliases[], recipeCategory, groceryCategory, curated, createdAt }`
- [ ] Auto-extract on recipe save: each ingredient string is checked against existing entries' aliases; unmatched strings create new entries with heuristic-guessed categories and `curated: false`
- [ ] One-time backfill: existing saved recipes' ingredients are migrated into the library on first run after deploy
- [ ] Categorization at render time becomes layered: library aliases checked first (longest-match-wins), then existing heuristic keyword tables, then "Other"
- [ ] New top-level "Library" tab — browse all entries, filter by curated/uncurated, edit canonical name/aliases/categories, delete, manually add
- [ ] Inline "Fix" shortcut on grocery items and recipe ingredient lines — opens a small editor for the matched library entry's categories (no recipe-string mutation)
- [ ] Library data shape designed for extension: future fields (nutrition info, allergens) can be added per entry without schema migration

### Out of Scope

<!-- Explicit boundaries. Reasons recorded so they don't get re-added. -->

- **Recipe ingredient inline-edit** (mutating `state.recipes[].ingredients[]`) — handled separately as a follow-on project. Confusing scope creep here.
- **Nutrition info / allergens / serving sizes / unit conversion** — the data shape is designed to absorb these, but v1 ships only categories. Avoid lock-in to a particular schema before the user has tried the basic flow.
- **Library imports/exports** (CSV / Schema.org / OpenFoodFacts sync) — defer until the library has accumulated enough manual data to know what export format would be useful.
- **Cross-recipe ingredient merging** (replacing duplicate scraped strings with canonical names) — recipe pages still show the original scraped text. Cleaning that up is a display question, not a data question.
- **Multi-user library / sharing** — single-user Pi deployment; same trust model as the rest of recipe-box.
- **AI/LLM-based fuzzy matching** — keep the matching deterministic and fast. Library handles the curation; heuristic handles the long tail.

## Context

**Brownfield project.** Recipe-box is an Express + Nunjucks + HTMX personal app on port 3003, intended for LAN-only Pi deployment. State lives in `data/state.json` with atomic temp-file rename. View-models in `lib/calc.js` decorate state for templates. The existing heuristic categorization (`lib/categorize.js`, added in commit `b5d5927` and prior) uses two independent keyword tables (recipe-side and grocery-side) with longest-match-wins. It works well for ~80% of common ingredients but produces predictable misses (e.g., "peanut butter" → Veg via the `pea` keyword; freshly added recipe formats with regional variations).

**Why now:** The user has accumulated enough recipes to feel the heuristic's limits. A keyword-only solution can't be tuned indefinitely without bloating the table. A library-first approach lets the user curate their actual ingredient vocabulary while the heuristic remains as a fallback for new things.

**Codebase map:** `.planning/codebase/` (committed `222a08a`) — STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS. Use these as the planning agents' starting point.

**Spec/Plan history:** Two prior major features have been brainstormed → spec'd → planned → executed in this session. The patterns established there (TDD per task, OOB-swap response shape, view-model + partial decomposition, full-list OOB on mutations that move items between sections) should be followed for consistency.

## Constraints

- **Tech stack**: Node 18+, Express 4, Nunjucks 3, HTMX 2, no build step. CommonJS, `node:test`. Match the existing recipe-box patterns documented in `.planning/codebase/CONVENTIONS.md`.
- **Persistence**: JSON state file with atomic rename. New collection `state.library` joins existing `state.recipes`, `state.weeks`, `state.grocery`. Migration via `lib/storage.js#migrate`.
- **Categorization layering**: library entries take priority over the existing heuristic tables. The keyword tables in `lib/categorize.js` stay in place as the fallback — do not delete them.
- **HTTP header safety**: toast strings must remain ASCII (em-dashes break Node's HTTP layer — discovered earlier in this session).
- **No auth**: trust model is "single user, LAN-only". No new auth concerns introduced by the library.
- **Render-time categorization**: do not pre-compute and store categories on grocery items or recipe ingredients. Compute fresh on every render so the library is always the source of truth.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Entry shape: canonical name + aliases array (Q2 = B) | One real-world ingredient = one library record. Future nutrition fields attach to the canonical entry; aliases handle spelling variants without duplication. | — Pending |
| Population: auto-extract on recipe save (Q3 = B) | Library grows organically. User never faces an empty library, and never has to triage hundreds at once. | — Pending |
| UI: top-level tab + inline shortcuts (Q4 = D) | Tab serves browsing and bulk curation; inline shortcuts let user fix a category in context without leaving the page. | — Pending |
| Recipe inline-edit deferred (Q5 = D) | Keeps the project tight and shippable. The library alone solves categorization; recipe-string cleanup is a separate concern. | — Pending |
| Library aliases checked BEFORE heuristic keyword tables | Library is the user's curated truth. Heuristic is the fallback for the long tail. | — Pending |
| Auto-extracted entries are seeded with heuristic-guessed categories and `curated: false` | Categorization works from day one without forcing review. UI can surface uncurated entries for cleanup. | — Pending |
| Categories computed at render time (no precomputation on items) | The library evolves; render-time lookup ensures every page reflects the current library state without state migrations. | — Pending |
| Data shape extensible for nutrition (no v1 implementation) | User signaled future intent; we leave room without locking in a schema. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-05 after initialization*
