# Phase 6: Inline Fix - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 6-inline-fix
**Areas discussed:** Affordance style & placement, Editor open/close UX, OOB-swap scope on Save, Categorize (no-match) flow

---

## Affordance style & placement

| Option | Description | Selected |
|--------|-------------|----------|
| Icon-only, always visible | Pencil icon button, sized to match grocery × delete. Always visible on every row — no hover reveal. Lowest visual noise that still signals interactivity; equally usable on touch and mouse. | ✓ |
| Labeled text button "Fix" / "Categorize" | Small button with literal text — "Fix" when matched, "Categorize" when unmatched. More discoverable for first-time users, but heavier visually at scale. | |
| Hover-only reveal (desktop) / always visible (mobile) | Affordance hidden by default; appears on row hover (desktop) or always-visible (mobile via media query). Cleanest at rest but loses discoverability on desktop. | |

**User's choice:** Icon-only, always visible.
**Notes:** Pencil icon. Same size/shape as the existing × delete button. Decision recorded as **D-68** in CONTEXT.md.

### Follow-up: icon variant per match state

| Option | Description | Selected |
|--------|-------------|----------|
| Same icon, different aria-label only | Pencil for both states. aria-label distinguishes "Fix categorization for {name}" vs "Categorize {item.text}". Single visual vocabulary. | ✓ |
| Different icons — pencil (Fix) + plus (Categorize) | Two icons. More information at a glance, but more visual vocabulary. | |
| Single icon — silent auto-create on first interaction | Treats unmatched as silently auto-creating an entry. Loses the "Categorize" semantic from FIX-01 SC#3. | |

**User's choice:** Same icon, different aria-label only.
**Notes:** Decision recorded as **D-69**.

---

## Editor open/close UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline expand (row toggle, Phase 5 pattern) | Click pencil → row outerHTML swaps to inline edit form. Reuses Phase 5's library-row-edit toggle pattern verbatim. Same code paths. Mobile-friendly. | ✓ |
| Popover anchored to button | Floating panel next to button. Crisp on desktop, trickier on mobile. | |
| Modal dialog | Centered overlay. Strongest focus, but heaviest UX and adds a new modal pattern not present in the app. | |

**User's choice:** Inline expand (row toggle).
**Notes:** Decision recorded as **D-70**. Reuses Phase 5's exact `library-row-edit.njk` swap pattern.

### Follow-up: editor entry-name display

| Option | Description | Selected |
|--------|-------------|----------|
| Compact label: "Library entry: garlic" | One-line subtle label at top of editor. Honors FIX-04 by confining canonical name to editor surface only. | ✓ |
| Show name + first 2-3 aliases | More context for disambiguation. More visual weight. | |
| No header — dropdowns only | Smallest editor. Loses labelled-metadata guarantee implied by FIX-04. | |

**User's choice:** Compact label "Library entry: {name}".
**Notes:** Decision recorded as **D-71**. Drives the labelled-metadata guarantee for FIX-04.

---

## OOB-swap scope on Save

| Option | Description | Selected |
|--------|-------------|----------|
| Full panel re-render | Entire `#grocery-list` (or recipe ingredients section) returned as OOB. Trivially correct under group movement / emergence / disappearance. Brief repaint accepted at single-user-LAN scale. | ✓ |
| Targeted per-group swap | Only source + destination groups returned. Smaller swap, no flash. More correctness surface (group create/destroy, source = destination edge). | |
| Hybrid — single row replacement + footer count | Just row in new position + OOB. DOM-wise tricky; HTMX outerHTML can't relocate across DOM trees without custom JS. Breaks no-build-step constraint. | |

**User's choice:** Full panel re-render.
**Notes:** Decision recorded as **D-72**. One OOB target per surface.

### Follow-up: surface routing

| Option | Description | Selected |
|--------|-------------|----------|
| Use HX-Current-URL header | Save handler reads HTMX's auto-attached header. Same pattern routes/recipes.js already uses for delete-button conditional. One endpoint, three OOB shapes. | ✓ |
| Pass surface as hidden form field | Explicit but couples editor partial to its caller. | |
| Distinct routes per surface | Separate POST /grocery/:id/fix, POST /recipes/:rid/.../fix etc. Cleaner separation but multiplies route surface and duplicates save logic. | |

**User's choice:** Use HX-Current-URL header.
**Notes:** Decision recorded as **D-73**. Mirrors existing routes/recipes.js pattern.

### Follow-up: route shape

| Option | Description | Selected |
|--------|-------------|----------|
| New endpoint POST /library/:id/categories | Categories-only payload. Distinct from Phase 5's full-form POST /library/:id. | ✓ |
| Reuse POST /library/:id with partial form | Couples two surfaces; regression in either could silently break the other. | |
| GET fragment + POST per surface | Most surface-aware but most route surface. | |

**User's choice:** New endpoint POST /library/:id/categories.
**Notes:** Decision recorded as **D-74**. Companion `GET /library/:id/categories-edit` returns the editor fragment.

---

## Categorize (no-match) flow

| Option | Description | Selected |
|--------|-------------|----------|
| Name = normalized item text; aliases empty; categories from heuristic | Name = `normalizeIngredientText(item.text)`. Aliases empty. Both dropdowns pre-selected from heuristic. One-click Save in common case. | ✓ |
| Name = exact item text; aliases auto-add normalized form | Name preserves what user sees. Aliases get normalized form. Risks naming entries with quantity/unit bleed-through. | |
| Name editable from scratch — user types | No pre-fill. Most flexible but slowest. | |

**User's choice:** Pre-fill name with normalized text + heuristic dropdowns.
**Notes:** Decision recorded as **D-75** / **D-76**. Ships the Phase 5 deferred "category presets via heuristic" idea here in the Categorize flow.

### Follow-up: name field editability in Categorize

| Option | Description | Selected |
|--------|-------------|----------|
| Editable | User can refine canonical name before Save. Maxlength 200 (mirrors Phase 5). | ✓ |
| Read-only — name fixed at normalized item text | Stricter scope-only-fixes contract; but creates "why can't I fix the typo" moment. | |

**User's choice:** Editable.
**Notes:** Decision recorded as **D-76**. Categorize editor scope: name + categories editable; aliases NOT in editor (Library tab full-editor only).

### Follow-up: name conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Inline error fragment, form stays open | Server validates via aliasConflict() + name-equality. On conflict: 400 + same editor fragment with inline error under name input. Mirrors Phase 5 D-61. | ✓ |
| Auto-link to existing entry — "You meant garlic?" | Server detects conflict and offers to add as alias. Smarter UX but new interaction pattern. | |
| Silent dedupe — add as alias to existing entry | Surprising — user pressed Save expecting a new entry; got a mutation of a different one. | |

**User's choice:** Inline error fragment, form stays open.
**Notes:** Decision recorded as **D-77**. HTMX 4xx-swap meta tag from Plan 05-01 already enables this.

---

## Claude's Discretion

The following tactical decisions are flagged for the planner to make based on simplicity / test-scaffold ergonomics:

- Pencil icon: SVG inline (recommended) vs Unicode glyph
- "Edit full entry" link target: `/library?q={name}` (recommended) vs `/library#library-row-{id}`
- Recipe ingredient line id format: `id="recipe-ing-{recipe.id}-{loop.index0}"` recommended
- Cancel button behavior: client-side reset (recommended) vs per-surface fragment route
- Recipe ingredient OOB target id: `id="recipe-ingredient-groups-{recipe.id}"` recommended
- CSS class breakdown under `library-fix-*` / `library-categorize-*` namespace
- Test file layout: new `test/library-categories-routes.test.js` vs extending Phase 5's file
- POST /library/:id/categories OOB shape when called from /library: row fragment (recommended) vs full panel

## Deferred Ideas

(All preserved in `06-CONTEXT.md` `<deferred>` section)

- Smart auto-link on Categorize-name conflict ("You meant X?")
- Auto-add item text as alias on Categorize submission
- Hover-only / responsive pencil affordance
- Modal / popover Fix editor
- Per-group / targeted OOB swaps (performance optimization)
- PATCH HTTP verb for `/library/:id/categories`
- Per-line edit in Library tab table (popover or table-cell-level edit)
- Categorize-from-search empty state in Library tab
- Recipe-string mutation (renaming ingredient.text on recipe page) — out of scope per FIX-04
- `updatedAt` field on library entries
- Concurrent-edit prevention (last-write-wins remains acceptable)
