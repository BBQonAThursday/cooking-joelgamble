# Phase 5: Library Tab - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 5-Library Tab
**Areas discussed:** Row layout & indicators, Filter & search interaction, Inline edit mechanics, Delete confirmation UX

---

## Row layout & indicators

### Q1 — What overall row format for the library entry list?

| Option | Description | Selected |
|--------|-------------|----------|
| Compact list rows | One row per entry, single line on wide screens, wraps on narrow. Closest to grocery-list pattern. Easiest to scan many entries. | ✓ |
| Cards (recipe-card style) | Cards in a grid, mirrors the Recipes tab. More whitespace, fewer entries on screen. Reuses .recipe-card CSS. | |
| Table with columns | Sortable columns: Name / Aliases / Recipe / Grocery / Status / Actions. Densest. More CSS for narrow screens. | |

**User's choice:** Compact list rows
**Notes:** Matches the dictionary-like mental model of "find an ingredient, scan it, edit it" rather than a gallery (cards) or spreadsheet (table).

### Q2 — How should aliases render in each row?

| Option | Description | Selected |
|--------|-------------|----------|
| Comma-joined inline | Plain text "garlic clove, garlic cloves...". LIB-03 literally says "comma-joined". Long lists wrap. | ✓ |
| Pill/chip list | Each alias is a small rounded pill. Visually denser, more "tag-like". Adds CSS but no JS. | |
| Truncated with count | First 2-3 aliases + "+N more". Consistent row height. Hides info. | |

**User's choice:** Comma-joined inline
**Notes:** Spec-aligned and simplest; defer pills to a possible v2.

### Q3 — How should the curated and "unused" states surface visually?

| Option | Description | Selected |
|--------|-------------|----------|
| Text badges (both) | Show [curated] or [uncurated] explicitly on every row, plus [unused] when no recipe references it. Symmetric, screen-reader-friendly. | ✓ |
| Implicit curated, badge uncurated/unused | Curated entries show no badge (default state). Only [uncurated] and [unused] surface as badges. Less noise; surfaces triage candidates. | |
| Color dot + tooltip | Tiny colored dot (green=curated, gray=uncurated, orange=unused) with title tooltip. Compact; not screen-reader-friendly without aria-label. | |

**User's choice:** Text badges (both)

### Q4 — What's the default sort order?

| Option | Description | Selected |
|--------|-------------|----------|
| Alphabetical by name | Locale-aware A→Z on canonical name. Stable, predictable. | ✓ |
| Uncurated first, then alphabetical | Uncurated entries float to the top so triage candidates surface without clicking the filter. | |
| Newest first (createdAt desc) | Mirrors the Recipes tab pattern. Surfaces "just-saved" uncurated entries. | |

**User's choice:** Alphabetical by name

---

## Filter & search interaction

### Q1 — Should the search box and filter buttons combine, or are they exclusive?

| Option | Description | Selected |
|--------|-------------|----------|
| Combinable (AND) | Both apply at once. Type "garlic" + click "Uncurated" → uncurated entries containing "garlic". | ✓ |
| Exclusive (last wins) | Clicking a filter clears search; typing resets filter to All. Simpler, less flexible. | |
| Combinable, with clear-all button | Same as combinable + a "Clear filters" link. One extra affordance. | |

**User's choice:** Combinable (AND)

### Q2 — How should the search box trigger?

| Option | Description | Selected |
|--------|-------------|----------|
| Live with debounce | hx-trigger="keyup changed delay:300ms". Fast, modern feel. Per-keystroke roundtrip is cheap on Pi LAN. | ✓ |
| Submit on Enter only | Plain form. Boring, predictable. Matches existing paste-form / grocery-add pattern. | |
| Submit button next to box | Most conservative. Slowest. | |

**User's choice:** Live with debounce

### Q3 — What should the filter request look like on the wire?

| Option | Description | Selected |
|--------|-------------|----------|
| GET with hx-get + targeted swap | hx-get="/library?q=&filter="; target #library-panel; hx-push-url="true" so refresh restores state. | ✓ |
| GET, no URL push | Same but no hx-push-url; refresh wipes state. | |
| Client-side hide via CSS classes | Server sends full list; filters toggle classes. Zero post-load roundtrips. "Unused" still needs server-side anyway. | |

**User's choice:** GET with hx-get + targeted swap

### Q4 — Empty-result panel behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Empty message reflecting the query | "No entries match 'garlic' with filter Uncurated." + "Clear search" link. | ✓ |
| Generic empty message | "No entries." Same whether library is empty or just filtered. | |
| Empty + manual-add nudge | "No matches. Want to add it manually?" + button pre-populating the form. | |

**User's choice:** Empty message reflecting the query

---

## Inline edit mechanics

### Q1 — When a user clicks "Edit", what does the form contain?

| Option | Description | Selected |
|--------|-------------|----------|
| All four fields editable | Name + aliases + Recipe `<select>` + Grocery `<select>` + Save + Cancel. | ✓ |
| Categories prominent, name+aliases inline | Same fields but visual hierarchy emphasizes the two `<select>`s. | |
| Categories only | Match Phase 6's locked Fix-editor scope. Tighter; two paths to edit one entry. | |

**User's choice:** All four fields editable
**Notes:** Phase 5 inline-edit is intentionally broader than Phase 6's Fix editor (categories only). Two distinct surfaces, not a shared component.

### Q2 — Where does an aliasConflict error render?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline below the conflicting field | Edit form stays open; red error under aliases input. 400 returns edit-form fragment with error baked in. | ✓ |
| Toast only, form stays open | X-Status-Toast; form stays open via 200. Toast auto-hides after 1.2s. | |
| Toast + visual highlight | Both. Belt-and-suspenders. | |

**User's choice:** Inline below the conflicting field

### Q3 — How does Cancel restore the read-only row?

| Option | Description | Selected |
|--------|-------------|----------|
| Server fragment via GET /library/:id | One round-trip; always shows latest server state. Symmetric with Edit (GET /library/:id/edit). | ✓ |
| Client-side via cached snapshot | Zero round-trips. Risk: stale data if user edited elsewhere. Adds inline JS. | |
| Cancel reloads the panel | hx-get="/library". Heaviest; preserves filter state via URL. Probably overkill. | |

**User's choice:** Server fragment via GET /library/:id

### Q4 — Save success behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Row outerHTML in place + OOB footer | Edited row swaps to read-only via outerHTML; OOB-swap unused-count footer. Row stays in old alphabetical position even if name changed. | ✓ |
| Full panel re-render | Re-sorted, re-filtered. Visual jump on rename but always correct. Heavier. | |
| Row in place + smart re-sort | Detect rename → full re-render; else row-in-place. Two response paths to test. | |

**User's choice:** Row outerHTML in place + OOB footer
**Notes:** Accepted trade-off — row briefly out-of-order on rename until next page interaction.

---

## Delete confirmation UX

### Q1 — How should the delete confirmation be presented?

| Option | Description | Selected |
|--------|-------------|----------|
| hx-confirm with baked count | Server-rendered hx-confirm string with count baked in. Native browser confirm(). Zero new templates. | ✓ |
| Two-step inline | First click swaps row to "Are you sure? Used in N. [Yes][Cancel]". Nicer UX, more code. | |
| Server-side modal overlay | hx-get a modal fragment. Most polished. Significant CSS + a11y work. | |

**User's choice:** hx-confirm with baked count

### Q2 — What should the confirmation message say when N=0 vs N>0?

| Option | Description | Selected |
|--------|-------------|----------|
| Different copy per case | N=0: "Delete 'garlic'? This entry is unused." N>0: "Delete 'garlic'? Used in 4 recipes. Categorization will fall back to the heuristic." | ✓ |
| Always show count | Always: "Delete 'garlic'? Used in N recipe(s)." Awkward at N=0. | |
| Generic warning | "Delete 'garlic'? This cannot be undone." Violates LIB-06's literal requirement. | |

**User's choice:** Different copy per case

### Q3 — Where does the recipe count come from at panel render time?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-render walk inside buildLibraryView | Walks state.recipes once with the alias index. ~13 × ~10 × ~50 = trivial cost. Render-time-categorization rule applies. | ✓ |
| Lazy per-button via separate route | hx-get='/library/:id/usage' just before showing confirm(). Saves render cost; adds round-trip. | |
| Server-rendered with no count | Skip the count in v1. Violates LIB-06. | |

**User's choice:** Per-render walk inside buildLibraryView

### Q4 — How should delete-success copy handle non-ASCII entry names?

| Option | Description | Selected |
|--------|-------------|----------|
| Generic 'Removed entry' toast | Doesn't echo the name. No ASCII concern. Loses confirmation of which entry. | ✓ |
| Strip non-ASCII from name in toast | "crème fraîche" → "Removed: crme frache". Mostly works, mangles the name. | |
| Strip + fallback if mangled | Compute ASCII version; use generic if it differs. Best of both. | |

**User's choice:** Generic 'Removed entry' toast
**Notes:** Conservative rule extends to all Library-tab toasts (verb-only, no name interpolation) to honor CLAUDE.md's HTTP-header ASCII safety constraint.

---

## Claude's Discretion

- **HTTP verbs:** Phase 5 picks `POST /library/:id` for edit and `POST /library/:id/delete` for delete (vs `PATCH` / `DELETE`). REQUIREMENTS.md LIB-05 explicitly authorizes `POST + _method=PATCH` as an alternative; LIB-06's `DELETE /library/:id` wording is preferred but planner can flip.
- **Tab-add timing:** the `views/layout.njk` `<a href="/library">` line is the FINAL commit/wave of the phase per STATE.md "broken tab is never visible" rule.
- **Manual-add form placement:** top of the Library panel, mirroring the recipe paste-form / grocery-add-form pattern.
- **CSS class prefix:** `library-*` consistent with existing `recipe-*` / `grocery-*` naming.
- **Concurrent-edit prevention:** out of scope for v1 (single-user trust model).

## Deferred Ideas

- Concurrent-edit prevention via `updatedAt` + If-Match.
- Manual-add form with heuristic-derived category presets on blur.
- Bulk operations (multi-select edit/delete).
- Drag-and-drop reorder.
- Library entry change log / audit trail.
- Pill / chip rendering for aliases (D-53 alternative).
- "Uncurated first" sort variant (D-55 alternative).
- Manual-add form expand/collapse pattern.
- PATCH verb usage with `_method` middleware.
- Server-rendered modal pattern for delete (richer dialog).
- Search highlighting (`<mark>` wrapping of matched substrings).
- `updatedAt` field on library entries (would require `migrate()`).
