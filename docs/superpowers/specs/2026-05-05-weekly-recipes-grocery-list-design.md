# Weekly Recipes & Grocery List — Design Spec

**Status:** draft 2026-05-05
**Scope:** v1 — adds calendar-aware weekly meal planning + a freeform grocery list to the existing recipe-box.

## Overview

Two new sections layered onto the existing recipe-box:

1. **This Week** — tag recipes you plan to cook this week. Calendar-aware: a fresh empty week starts every Monday; previous weeks roll into a History view automatically.
2. **Grocery list** — a freeform, persistent shopping list with checkboxes for crossing items off in the aisle. A "Confirm week" action pours the tagged recipes' ingredient strings into the list (string-deduped against existing items).

Same stack as the rest of the app: Node + Express + Nunjucks + HTMX, atomic JSON state, no build step.

## Goals & non-goals

**Goals (v1):**
- Tag a recipe for the current week from either the Recipes list or the recipe detail page.
- View the tagged recipes for the current week.
- Confirm the week — adds tagged recipes' ingredients to the grocery list (one-shot, deduped).
- Re-confirm after edits — sync the list when the tagged set changes after a prior confirm.
- Manage the grocery list freeform: add items, check items off, delete items, clear all checked items.
- Browse past weeks (read-only).
- Roll over automatically every Monday with no background job.

**Non-goals (v1):**
- Quantity-aware ingredient merging (`2 tbsp salt` + `1 tbsp salt` stay as two lines).
- Recipe scaling by servings.
- Per-day or per-meal slot assignments (the week is a flat set of recipes).
- Editing past weeks; re-using a past week's selections in the current week.
- Drag-to-reorder, sharing, printing.
- Authentication (LAN-only Pi; same trust model as today).
- Notifications, reminders, calendar sync.

## Architecture

```
recipe-box/
  server.js                       (existing — mounts new routers)
  lib/
    storage.js                    (existing — migrate() grows two new arrays)
    calc.js                       (existing — gains buildWeeklyView, buildGroceryView, buildHistoryView)
    render.js                     (existing — unchanged)
    scrape.js                     (existing — unchanged)
    week.js                       NEW — pure helpers: mondayOf, ensureCurrentWeek, tagRecipe, confirmWeek, unconfirmWeek
    grocery.js                    NEW — pure helpers: addItem, toggleChecked, removeItem, clearChecked, newGroceryId
  routes/
    recipes.js                    (existing — list-card markup goes through new partial)
    weeks.js                      NEW — /this-week, /this-week/recipes/:id, /this-week/confirm, /this-week/unconfirm
    grocery.js                    NEW — /grocery, /grocery/:id/check, /grocery/:id (DELETE), /grocery/clear-checked
    history.js                    NEW — /history
  views/
    layout.njk                    (existing — gains a top tab strip)
    index.njk                     (existing — uses recipe-card partial; sets activeTab='recipes')
    recipe.njk                    (existing — gains tag-toggle next to title)
    this-week.njk                 NEW
    grocery.njk                   NEW
    history.njk                   NEW
    partials/
      recipes-panel.njk           (existing — slimmed; loops recipe-card partial)
      recipe-card.njk             NEW (extracted from recipes-panel)
      tag-toggle.njk              NEW
      this-week-panel.njk         NEW
      week-banner.njk             NEW
      grocery-list.njk            NEW
      grocery-item.njk            NEW
  public/styles.css               (existing — additions for tabs, tag toggle, grocery, week banner)
  data/state.json                 (existing — migration adds two empty arrays)
  test/                           (existing — six new test files)
```

Conventions preserved:
- Pure `lib/calc.js` and the new `lib/week.js`/`lib/grocery.js` — no fs, no http, no DOM. Inject `today` for determinism.
- `respondWithUpdates(req, res, { panels, extra })` (existing) is reused; routes return OOB-swappable partials.
- `X-Status-Toast` header drives the toast on the client (existing pattern).
- Atomic temp-file rename in `storage.persist()` (existing) covers the new arrays for free.

## State shape

```js
state = {
  recipes: [
    { id, addedAt, sourceUrl, title, description, imageUrl, servings, totalMinutes, ingredients: [...], instructions: [...] }
    // unchanged
  ],
  weeks: [
    {
      weekStart: '2026-05-04',          // YYYY-MM-DD, Monday, server local time
      recipeIds: ['abc', 'def'],        // tagged recipes, in tag order
      confirmed: false,                 // true after the user presses Confirm
      modifiedAfterConfirm: false       // true if recipeIds changes after confirmed=true
    }
  ],
  grocery: [
    { id: 'g_xxxxxxxx', text: '2 tbsp curry powder', checked: false }
  ]
}
```

**Migration (`storage.migrate`):**
- Add `weeks: []` if missing.
- Add `grocery: []` if missing.
- Coerce non-arrays to `[]` (matches existing `recipes` handling).
- Existing fields untouched.

## Week semantics

**The active week** is the week record whose `weekStart` equals `mondayOf(today)`. Past weeks remain in `state.weeks` and surface in History automatically.

**Rollover is lazy.** No cron, no scheduler, no background process. Every state-touching path that needs the active week calls:

```js
ensureCurrentWeek(state, today) {
  const monday = mondayOf(today)
  let week = state.weeks.find(w => w.weekStart === monday)
  if (!week) {
    week = { weekStart: monday, recipeIds: [], confirmed: false, modifiedAfterConfirm: false }
    state.weeks.push(week)
  }
  return week
}
```

The first request after Monday 00:00 (server local) creates a fresh empty week; the previous week stays in `state.weeks` and is treated as archived simply because it isn't the current Monday's record.

**`mondayOf(date)`:** returns YYYY-MM-DD for the Monday of the given date's local week. Implemented via date-component arithmetic, not millisecond offsets, so DST is a non-issue.

## Tagging

`tagRecipe(state, recipeId, today)`:
- Verifies `recipeId` exists in `state.recipes` — rejects with `{ ok: false, reason: 'unknown recipe' }` otherwise.
- Calls `ensureCurrentWeek`.
- Toggles: if `recipeId` is in `recipeIds`, removes; otherwise appends.
- If the active week is `confirmed`, sets `modifiedAfterConfirm = true`.
- Returns `{ ok: true, isTagged: boolean }`.

The toggle button (a `★`) appears in two places:
- Each card on the Recipes list (one-click planning while browsing).
- The recipe detail page (next to the title).

The button POSTs to `/this-week/recipes/:id` with `hx-swap="none"`. The server replies with OOB-swap markup re-rendering the affected card and/or the detail-page toggle.

## Confirm

`confirmWeek(state, today)`:
- Calls `ensureCurrentWeek`.
- If `recipeIds` is empty: no state mutation; returns `{ ok: false, reason: 'no recipes tagged' }`. The route surfaces this as the `No recipes tagged for this week` toast and skips the OOB-swap.
- Otherwise resolves `recipeIds` against `state.recipes`, filtering out any that no longer exist.
- For each resolved recipe, walks its `ingredients` strings.
- For each ingredient string, appends a new grocery item if no existing item has that exact `text` (string-equal, case-sensitive).
- Sets `confirmed = true` and `modifiedAfterConfirm = false`.
- Returns `{ ok: true, addedCount: N }`. `N` may be 0 (everything was already a dupe).

`unconfirmWeek(state, today)`:
- Sets `confirmed = false`, `modifiedAfterConfirm = false`.
- Does **not** remove items from the grocery list. Unconfirming is reversible (the user can confirm again); removing items would be destructive and irreversible.

## Grocery list

`state.grocery` is independent of weeks — it survives Monday transitions and lives across confirms.

**Item shape:** `{ id, text, checked }`.
- `id`: 8-char base36, generated by `newGroceryId()`. Reused if collision (defensive).
- `text`: trimmed string, max 500 chars (silently capped).
- `checked`: boolean, default false.

**Helpers in `lib/grocery.js`:**
- `addItem(state, text)` — trim/cap/reject empty; append.
- `toggleChecked(state, id)` — flip the boolean.
- `removeItem(state, id)` — splice.
- `clearChecked(state)` — keep only items where `!checked`.

## Routes

### Existing (unchanged)

| Verb | Path |
|---|---|
| GET | `/` |
| GET | `/healthz` |
| POST | `/recipes` |
| GET | `/recipes/:id` |
| DELETE | `/recipes/:id` |

### New

| Verb | Path | Behavior |
|---|---|---|
| GET | `/this-week` | Render This Week page. View context: tagged recipes (filtered to those still in library), the week banner state, `activeTab='this-week'`. |
| POST | `/this-week/recipes/:id` | `tagRecipe`. Response always returns two OOB-swap fragments: (1) the re-rendered card with id `recipe-card-<id>` (matched if the user is on the Recipes list or This Week), and (2) the re-rendered standalone tag toggle with id `tag-toggle-<id>` (matched if the user is on the recipe detail page). HTMX silently ignores fragments whose target id isn't in the current DOM, so the same response works from any page. Toast: "Added to this week" or "Removed from this week". |
| POST | `/this-week/confirm` | `confirmWeek`. OOB-swap: `#week-banner`. Toast: `No recipes tagged for this week` if `recipeIds` is empty; `Added N items to grocery list` if N > 0; `Already up to date — 0 items added` if recipes were tagged but every ingredient string was already in the list. |
| POST | `/this-week/unconfirm` | `unconfirmWeek`. OOB-swap: `#week-banner`. Toast: "Confirmation cleared". |
| GET | `/grocery` | Render Grocery page. View context: the grocery list, `activeTab='grocery'`. |
| POST | `/grocery` | `addItem`. OOB-swap: `#grocery-list` (full re-render so new row sorts correctly). Toast: "Added". |
| POST | `/grocery/:id/check` | `toggleChecked`. OOB-swap: `#grocery-item-<id>` (single row). No toast (high-frequency action). |
| DELETE | `/grocery/:id` | `removeItem`. OOB-swap: `#grocery-list` (full re-render — matches the existing convention used by `DELETE /recipes/:id`). Toast: "Removed". |
| POST | `/grocery/clear-checked` | `clearChecked`. OOB-swap: `#grocery-list`. Toast: `Cleared N items` (or "Nothing to clear" if N=0). |
| GET | `/history` | Render History page. View context: weeks where `weekStart < mondayOf(today)`, sorted newest first, with each week's resolved recipe titles. `activeTab='history'`. |

All response bodies are HTML fragments (existing pattern). Errors return text + 4xx; the toast surfaces the message via `X-Status-Toast`.

## Views

### Layout

`views/layout.njk` adds a `<nav class="tabs">` strip below the `<h1>`:

```html
<nav class="tabs">
  <a href="/" class="tab {% if activeTab == 'recipes' %}active{% endif %}">Recipes</a>
  <a href="/this-week" class="tab {% if activeTab == 'this-week' %}active{% endif %}">This Week</a>
  <a href="/grocery" class="tab {% if activeTab == 'grocery' %}active{% endif %}">Grocery</a>
  <a href="/history" class="tab {% if activeTab == 'history' %}active{% endif %}">History</a>
</nav>
```

Each route passes `activeTab` in its render context.

### Pages

- **`index.njk`** — sets `activeTab='recipes'`; otherwise unchanged in structure. The card markup goes through the new partial.
- **`this-week.njk`** — renders `partials/week-banner.njk` then `partials/this-week-panel.njk`. Empty state: "No recipes tagged for this week. Tap a ★ on the Recipes tab to add one."
- **`grocery.njk`** — add-item form, then `partials/grocery-list.njk`, then a "Clear checked" button. Empty state: "Grocery list is empty."
- **`history.njk`** — list of past weeks, each showing the date range and recipe titles. Empty state: "No past weeks yet."

### Partials

- **`partials/recipe-card.njk`** — extracted from the current inline markup in `recipes-panel.njk`. Accepts `r` (the decorated recipe) and `context` ('recipes' | 'this-week'). Includes `tag-toggle.njk`. The delete button stays only on the Recipes list (not on This Week).
- **`partials/tag-toggle.njk`** — small `<button>` with `id="tag-toggle-{{ id }}"`, `hx-post="/this-week/recipes/{{ id }}"`, `hx-swap="none"`. Visual state via `is-tagged` class.
- **`partials/recipes-panel.njk`** — outer `<section id="recipes-panel">`, `<ul class="recipe-list">`, `{% include "partials/recipe-card.njk" %}` per item. Empty state preserved.
- **`partials/this-week-panel.njk`** — outer `<section id="this-week-panel">`, same card partial filtered to the active week's recipes.
- **`partials/week-banner.njk`** — three states keyed off `confirmed` and `modifiedAfterConfirm`:
  - Unconfirmed: "Confirm week" button. Subtitle shows the count of tagged recipes (e.g., "5 recipes — 32 ingredients to add").
  - Confirmed + clean: muted `Confirmed ✓` pill plus "Unconfirm" button.
  - Confirmed + modifiedAfterConfirm: warning banner with "Re-confirm to sync" button.
- **`partials/grocery-list.njk`** — `<ul id="grocery-list">` of `partials/grocery-item.njk` per item.
- **`partials/grocery-item.njk`** — `<li id="grocery-item-{{ id }}">` with checkbox (`hx-post="/grocery/{{ id }}/check"`), text, and a delete button (`hx-delete="/grocery/{{ id }}"`).

### Visual state

- Tag toggle: outline `★` when untagged; filled `★` (accent color) when tagged.
- Tagged card on the Recipes list: a thin accent-colored left border, so it's recognizable while browsing.
- Grocery item: checked items get strikethrough text + muted color.
- Week banner warning state: accent border + warning copy.

### CSS

Additions only (no rewrites of existing rules):
- `.tabs` / `.tab` / `.tab.active` — horizontal flex with active underline.
- `.tag-toggle` / `.tag-toggle.is-tagged` — button reset, color states.
- `.recipe-card.is-tagged` — left-border indicator.
- `.grocery-item` / `.grocery-item.is-checked` — row layout, strikethrough state.
- `.week-banner` / `.week-banner.warning` — banner styles.

## HTMX flow examples

**Toggling a tag from the Recipes list:**
1. User taps `★` on a card.
2. HTMX POSTs `/this-week/recipes/abc` with `hx-swap="none"`.
3. Server: `tagRecipe(state, 'abc', new Date())`; `storage.save()`.
4. Server returns OOB-swap markup: re-rendered `recipe-card.njk` (with new `is-tagged` state) + the `tag-toggle.njk` (in case the detail page is open in another tab — harmless if not).
5. Client: HTMX swaps the card in place; toast displays "Added to this week".

**Confirming the week:**
1. User taps the "Confirm week" button on This Week.
2. HTMX POSTs `/this-week/confirm` with `hx-swap="none"`.
3. Server: `confirmWeek(state, new Date())` returns `{ addedCount: N }`; `storage.save()`.
4. Server returns OOB-swap of `#week-banner` (now in the confirmed state).
5. Client: banner updates; toast: `Added N items to grocery list`.

**Checking a grocery item:**
1. User taps the checkbox.
2. HTMX POSTs `/grocery/g_abc/check` with `hx-swap="none"`.
3. Server: `toggleChecked(state, 'g_abc')`; `storage.save()`.
4. Server returns OOB-swap of `#grocery-item-g_abc`.
5. Client: row updates with strikethrough/clear; no toast.

## Edge cases

| Case | Handling |
|---|---|
| Toggle a recipe id that doesn't exist in `state.recipes` | `tagRecipe` rejects; route returns 404. Should never occur via UI. |
| Confirm with no recipes tagged | No state change (`confirmed` stays as it was). Toast: `No recipes tagged for this week`. |
| Confirm with all ingredients already in grocery | `confirmed = true`, `modifiedAfterConfirm = false`. Toast: `Already up to date — 0 items added`. |
| Tagged recipe deleted from library afterwards | `recipeIds` keeps the dangling id. Render filters it out everywhere. Confirm import skips it silently. |
| Midnight Monday rollover mid-session | First state-touching request after `mondayOf(today)` changes triggers `ensureCurrentWeek`. Previous week is implicitly archived. Open browser tabs are unaffected; their next action picks up the new week. |
| Two browser tabs simultaneously toggling the same recipe | Last write wins; atomic temp-rename persist prevents partial writes. UI flicker, no corruption. |
| Empty grocery item submitted (whitespace) | 400 + toast `Item required`. |
| Item text > 500 chars | Trimmed to 500 silently (matches the toast cap precedent). |
| Migrating an old `state.json` with no `weeks`/`grocery` | Migration adds empty arrays; existing recipes preserved. |
| DST transition crossing a Monday | `mondayOf` operates on date components, not millisecond offsets. Unaffected. |
| Pi reboots between toggle and persist | Atomic write means we either have the prior valid state or the new valid state. No partial writes. |

## Testing

All tests use the existing `node:test` runner and the `test/_helpers.js` ephemeral-server + temp-data-dir helpers.

**Unit:**
- `test/week.test.js` (NEW): `mondayOf` (every weekday across DST), `ensureCurrentWeek` (creates/no-ops), `tagRecipe` (add/remove, modifiedAfterConfirm, unknown id rejection), `confirmWeek` (dedupe, missing recipes filtered, idempotency, addedCount).
- `test/grocery.test.js` (NEW): `addItem` (trim/cap/empty), `toggleChecked`, `removeItem`, `clearChecked`, `newGroceryId` uniqueness.
- `test/calc.test.js` (extend): `buildWeeklyView` filters dangling ids; `buildGroceryView` shape + decorate; `buildHistoryView` excludes active week, sorts newest-first.
- `test/storage.test.js` (extend): migration adds `weeks: []` and `grocery: []`; preserves existing recipes; coerces non-arrays.

**Route/integration:**
- `test/weeks-routes.test.js` (NEW): `POST /this-week/recipes/:id` (toggle on/off, confirmed-state flag transitions, 404 on unknown), `POST /this-week/confirm` (addedCount, dedupe, modifiedAfterConfirm cleared), `POST /this-week/unconfirm` (no destructive grocery mutation).
- `test/grocery-routes.test.js` (NEW): `POST /grocery` (add, trim, reject empty), `POST /grocery/:id/check`, `DELETE /grocery/:id`, `POST /grocery/clear-checked` (count + empty list case).
- `test/history-routes.test.js` (NEW): `GET /history` excludes active week; sorts newest first; renders titles for past weeks' recipes.
- `test/recipes.test.js` (existing): adjust assertions if extracting `recipe-card.njk` changes the rendered markup any tests grep for.

**Manual smoke (post-implementation):**
- Tag a recipe, confirm, see ingredients in grocery.
- Tag a second recipe, re-confirm — only the new ingredients append.
- Check a grocery item, refresh, still checked.
- Clear-checked clears them.
- Walk past Monday (e.g., set system clock or call `confirmWeek` with a Date far in the future) — fresh active week appears, prior week shows in History.

## Out of scope (explicitly)

- Quantity-aware ingredient merging.
- Recipe scaling.
- Per-day or per-meal slot assignments.
- Editing past weeks.
- Drag-to-reorder, sharing, printing.
- Authentication.
- Notifications, calendar sync.
- Bookmarklet for bot-protected sites — separate spec, planned next.
