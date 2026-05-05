# Pitfalls Research

**Domain:** Ingredient library / canonical-record / alias-matching layer on a personal recipe app
**Researched:** 2026-05-05
**Confidence:** HIGH (critical pitfalls verified against Mealie/Tandoor issue trackers and codebase; tradeoff analysis verified against authoritative technical sources)

---

## Critical Pitfalls

### Pitfall 1: Alias Collision — Same String Registered to Two Library Entries

**What goes wrong:**
Two library entries each carry the same alias string (e.g., entry A has alias "butter" and entry B also has alias "butter"). At match time the lookup returns whichever entry appears first in `state.library` — essentially insertion order. The result is non-deterministic from the user's perspective: editing entry A's aliases doesn't fix the wrong match, and the real collision is invisible in the UI.

Mealie's ingredient parser exhibits exactly this: case-sensitive matching was implemented as a frontend loop with `===`, meaning "Butter" and "butter" resolved to different entries, and exact-duplicate food entries broke the "combine food" feature entirely (mealie-recipes/mealie#2229). The system had no guard preventing the duplicates from forming.

**Why it happens:**
Auto-extraction creates entries from raw scraped strings. If the same ingredient appears as "butter" in recipe 1 and "unsalted butter" in recipe 2, two entries are seeded. If the user later adds "butter" as an alias to "unsalted butter" without first removing it from the standalone "butter" entry, both entries claim the same alias.

**How to avoid:**
1. Enforce a uniqueness constraint on aliases at insert/update time. In `lib/storage.js`, the migration and any alias-update handler must scan all *other* entries to confirm the alias doesn't already exist before saving.
2. Return an explicit error (or inline warning in the Library tab editor) when a duplicate alias would be created.
3. Match is performed by scanning aliases case-insensitively and normalizing whitespace, so "Butter" and "butter" always resolve to the same entry — preventing phantom near-duplicates.

Concrete pattern:
```js
function aliasConflict(library, alias, excludeId) {
  const norm = alias.trim().toLowerCase();
  return library.find(e =>
    e.id !== excludeId &&
    [e.name, ...e.aliases].some(a => a.trim().toLowerCase() === norm)
  );
}
```

**Warning signs:**
- A library entry's Fix shortcut changes the category on the grocery list but the change doesn't persist (match resolved to a different entry).
- Two library entries whose `name` and first `aliases[0]` are the same string.
- `curated: true` entries being ignored because an uncurated duplicate was inserted first.

**Phase to address:**
Phase that implements alias storage and the Library tab editor. Alias uniqueness must be validated before the editor ships — retrofitting it later requires a data-repair migration.

---

### Pitfall 2: Auto-Extract Noise — Every Typo and Regional Variant Gets Its Own Entry

**What goes wrong:**
On recipe save, every unmatched ingredient string creates a new `curated: false` entry. After importing 20 recipes, `state.library` contains entries like "garlic cloves", "garlic clove", "2 cloves garlic", "garlic (minced)", "minced garlic" — all separate. The curation backlog grows faster than the user can work through it. Mealie users reported "a large number of unused foods" in their database that cluttered search dropdowns and provided null search results, and the community had to write API scripts to batch-delete unused entries because there was no built-in cleanup tool (mealie-recipes/mealie discussion #3551).

**Why it happens:**
Auto-extract is keyed on exact string match. Scraped ingredient strings contain quantities ("2 cloves"), preparation notes ("minced"), and parentheticals that prevent a match against any existing canonical entry. Without a normalization pre-pass, nearly every distinct scraped string becomes its own entry.

**How to avoid:**
1. **Normalize before matching.** Strip leading quantity tokens (numbers, fractions, measurement words) and common preparation suffixes from the string before checking the library. This doesn't require NLP: a simple regex pass removes "2 cups of", "(minced)", "finely chopped" etc. Match the remainder against aliases.
2. **Deduplicate at extract time, not curation time.** If normalization reduces "garlic cloves" and "garlic clove" to the same root, check that root against existing entries' aliases before creating a new one.
3. **Cap uncurated entry creation.** Never create more than one uncurated entry per normalized root per save operation. If two ingredients in the same recipe normalize to the same root, create one entry with both originals as aliases.
4. **Surface the backlog progressively.** The Library tab's uncurated filter shows entries one at a time for review. Showing hundreds at once demotivates users.

**Warning signs:**
- After importing 5–10 recipes, `state.library` contains >100 entries for ~30 distinct ingredients.
- Multiple entries differ only by quantity prefix or preparation note.
- Library tab filter for `curated: false` produces a scroll-to-infinity list.

**Phase to address:**
Phase that implements auto-extraction on recipe save. Normalization logic must be in place before the first recipe is saved with the library active — backfilling normalization after the fact requires a data migration and alias dedup pass.

---

### Pitfall 3: Backfill Creating Duplicates and Wrong-Category Entries

**What goes wrong:**
The one-time backfill runs on first boot after deploy, passes all existing recipe ingredients through auto-extract logic, and creates library entries. If the backfill is not idempotent, a second unexpected run (e.g., app restart, bug in startup guard) creates duplicate entries with different IDs for the same ingredient. Worse, the heuristic that seeds categories is the same buggy heuristic the library is meant to fix — so backfilled entries start life with wrong categories, but `curated: false` is easily missed, and users assume library-derived categories are correct.

Mealie's v0 → v1 migration lost 60% of recipes (mealie-recipes/mealie#2650). While recipe-box has far less complexity, the pattern is the same: an untested, one-shot migration that silently drops or duplicates data.

**Why it happens:**
Backfill is typically implemented as "if library is empty, run extract over all recipes". If the startup guard checks `state.library.length === 0`, a second run after deleting all entries (user housekeeping) re-backfills. Heuristic-seeded categories feel authoritative because they're stored in the library, which users trust more than a heuristic.

**How to avoid:**
1. **Use a migration version flag, not a length check.** Add `state.libraryMigratedAt` (ISO date string). The backfill only runs if this field is absent. This is consistent with how `lib/storage.js#migrate()` currently works — add the flag there.
2. **Make the backfill a dry-run-first operation.** Log how many entries it would create before writing. In test, assert the expected count.
3. **Seed categories from heuristic, but mark every backfilled entry `curated: false`.** The Library tab should display a banner: "N entries need review — heuristic categories were used as a starting point." This sets accurate expectations.
4. **Backfill uses the same normalization pre-pass as live auto-extract.** Do not write a separate path.

**Warning signs:**
- `state.library` contains two entries whose `name` fields are identical after a restart.
- Backfill count is suspiciously high (greater than total unique ingredients across all recipes).
- App restart produces a different library state than the first run.

**Phase to address:**
Phase that implements `lib/storage.js` migration for `state.library`. The idempotency guard must be part of the initial migration commit — never retrofitted.

---

### Pitfall 4: Mutation Lifecycle — Alias Changes Don't Propagate; Deletes Orphan Library Entries

**What goes wrong:**
Two related failure modes:

**A — Alias change, stale display.** A user renames the canonical name of a library entry from "scallions" to "green onions". Recipe ingredient strings still contain "scallions". Because recipe pages compute category at render time (correct), the display category updates. But if anywhere in the render pipeline the canonical name is shown instead of the original scraped text (see Pitfall 6), recipe pages now show "green onions" in the ingredient list even though the recipe says "scallions". Users think the recipe was changed.

**B — Recipe delete, orphaned library entry.** A recipe is deleted. Its ingredient strings were the only thing holding several `curated: false` library entries in existence. Those entries accumulate indefinitely. The existing CONCERNS.md already documents that deleted recipes leave dangling IDs in `state.weeks`; the library adds a new category of dangling reference. Mealie had the inverse bug: deleting a food entry *blanked the ingredient name in recipes* (mealie-recipes/mealie#3225). recipe-box has the opposite risk: deleting a recipe leaves uncurated library entries that will never be matched again.

**Why it happens:**
Alias changes are library mutations; recipe ingredient strings are recipe data. The two are independent. Without an explicit "on alias change, do nothing to recipe strings" policy, a developer may be tempted to "helpfully" update recipe strings — which is out-of-scope per PROJECT.md. Conversely, without an explicit "on recipe delete, optionally clean up library entries" policy, orphaned entries accumulate silently.

**How to avoid:**
1. **Never mutate recipe ingredient strings from the library.** This is already the PROJECT.md out-of-scope decision. Enforce it architecturally: the library route handlers must not touch `state.recipes`.
2. **Always show original scraped text on recipe pages.** The canonical name is metadata for matching, not a display replacement (see Pitfall 6).
3. **On recipe delete, decrement a usage count or scan for orphans.** Simple approach: after deleting a recipe, filter `state.library` for entries whose `aliases` appear in no remaining recipe's ingredient strings. Mark them or offer deletion — do not auto-delete (the user may have curated them for future use). A footer count in the Library tab ("12 entries unused by any recipe") is sufficient for v1.
4. **Document the orphan behavior explicitly.** The CONCERNS.md pattern is appropriate: "Deleted recipes may leave uncurated library entries. These are harmless. Use the Library tab to delete them."

**Warning signs:**
- Library tab shows `curated: false` entries for ingredients that no longer appear in any recipe.
- After renaming a canonical name, recipe pages show the new name instead of the original text.
- `state.library` grows without bound after repeated recipe add/delete cycles.

**Phase to address:**
Phase implementing the delete route (`DELETE /library/:id`) and the Library tab. Orphan guidance in the UI should ship with the tab, not as a follow-on.

---

### Pitfall 5: Render-Time vs. Precomputed Categories — Wrong Choice, Wrong Failure Mode

**What goes wrong:**
The PROJECT.md already mandates render-time categorization ("do not pre-compute and store categories on grocery items or recipe ingredients"). This is the right call, but the failure mode of the *opposite* choice is worth documenting so it isn't revisited.

**Precomputed failure mode:** Categories stored on grocery items go stale the moment a library entry's `groceryCategory` is updated. The grocery list would show old categories until the next "confirm week" operation recreates it. A user who fixes "peanut butter" from Produce to Aisle sees no change on the current grocery list. This is analogous to the materialized view problem: stale snapshots serving the wrong answer.

**Render-time failure mode (the actual risk):** Category lookup runs on every render of every ingredient on every grocery item. With <500 library entries this is a linear scan of ~500 items per ingredient. A grocery list of 40 items = 40 scans × 500 entries = 20,000 comparisons per page load. On a Raspberry Pi this is fast (microseconds), but it must be a simple O(n) scan, not a nested scan (O(n²)) caused by calling `aliases.find()` inside an outer `library.find()`.

The deeper failure mode of render-time is case/whitespace sensitivity: if the match function is `alias === ingredientText` (strict), a single extra space or capital letter causes a miss and falls through to the heuristic silently. Users see unexpected categories and assume the library isn't working.

**How to avoid:**
1. Keep render-time as designed.
2. Use case-insensitive, whitespace-trimmed comparison in the alias scan.
3. The scan function: iterate library entries; for each entry, check `[entry.name, ...entry.aliases].some(a => normalize(a) === normalize(text))`. Return first match. If no match, fall through to `categorize.js`.
4. Do not build a Map/index for <500 entries. The linear scan is fine and the simpler code is safer.
5. If performance ever becomes a concern (unlikely before 5,000+ entries), a pre-built normalized alias → entry Map cached in memory (rebuilt on library mutation) is the appropriate optimization.

**Warning signs:**
- Category on a fixed library entry still shows wrong category after page reload.
- Match works for some ingredient strings but not others with identical canonical meaning.
- Server response time noticeably increases as library grows (would signal O(n²) nesting).

**Phase to address:**
Phase implementing `lib/categorize.js` layering and the view-model in `lib/calc.js`. The normalize helper must be extracted as a pure function and tested independently before integration.

---

### Pitfall 6: Showing Canonical Name Instead of Original Ingredient Text

**What goes wrong:**
On recipe pages, the ingredient list shows "green onions, sliced" from the scraped recipe. The library has a canonical entry named "green onion". If the render template uses `entry.name` rather than `ingredient.text` for display, users see "green onion" — the canonical name — instead of the original text. This is confusing in two ways: (a) it feels like the app edited the recipe, and (b) preparation notes ("sliced") are lost.

This is a real UX pattern failure seen in Mealie, where the parser's best-guess ingredient display was shown to users who didn't recognize it as different from what they typed (mealie-recipes/mealie#6209 adjacent behavior). The canonical name surfaced as an alias suggestion even when the values were identical, indicating the system's model of "name" vs. "display text" had leaked into the UI.

**Why it happens:**
The canonical entry is found via alias match, and a developer naturally reaches for `entry.name` to display something clean. The original ingredient string is present on the recipe object but one layer of indirection away in the template.

**How to avoid:**
1. Templates always display `ingredient.text` (the original scraped string). The library match result provides only a category — it never replaces display text.
2. The Fix shortcut editor shows `entry.name` and `entry.aliases` as metadata, but the ingredient line above it continues to show the original text.
3. A template lint rule: no template should reference `libraryEntry.name` in the context of a recipe ingredient line.
4. If the canonical name is ever shown (e.g., in a tooltip or the Fix editor title), label it clearly as "Library entry:" to distinguish it from the ingredient text.

**Warning signs:**
- Recipe detail page shows different text than what was scraped (preparation notes missing).
- Renaming a library entry changes the text on a recipe page.
- Users report "the app changed my recipe".

**Phase to address:**
Phase implementing the inline Fix shortcut partial and the recipe detail template changes. The distinction between `ingredient.text` (display) and `entry.name` (metadata) must be explicit in the partial's API contract.

---

### Pitfall 7: Extensibility Trap — Under-Specified Schema Blocks Future Nutrition Fields

**What goes wrong:**
The entry shape is `{ id, name, aliases[], recipeCategory, groceryCategory, curated, createdAt }`. This is intentionally minimal per PROJECT.md. The trap is the opposite: adding a `nutrition: {}` placeholder now (to "leave room") without defining what goes in it creates an ambiguous schema. When nutrition is actually added, the code must either: (a) handle entries with `nutrition: {}` (empty object) alongside entries where the field is absent entirely, or (b) run a migration to normalize all entries. Both are avoidable if the empty placeholder is never written.

This is the "premature extensibility" form of under-specification: the field exists but its semantics are undefined. Any code that tries to read `entry.nutrition.calories` will throw on entries where `nutrition` is `{}` rather than `null` or absent.

**Why it happens:**
Developers write `nutrition: {}` "just in case" during initial migration. It signals intent but creates a inconsistent state: some entries have the field, others don't (after future entries are added without it).

**How to avoid:**
1. Do not add any placeholder fields to the entry shape in v1. The schema is the fields listed in PROJECT.md and nothing else.
2. When nutrition is added in a future milestone, `lib/storage.js#migrate()` adds the field with a defined default (e.g., `nutrition: null`) to all existing entries in a single migration pass.
3. Code reading optional future fields uses optional chaining: `entry.nutrition?.calories ?? null`. Never assume the field exists.
4. The entry shape in code should be documented once, in the migrate function's default shape, and nowhere else — preventing drift.

**Warning signs:**
- `state.library` entries have inconsistent shapes (some have extra fields, others don't).
- A migration adds a field to new entries but not existing ones, causing `undefined` reads.
- Template code has `{% if entry.nutrition %}` guards that are sometimes wrong.

**Phase to address:**
Phase implementing `state.library` schema in `lib/storage.js`. The migrate function's default entry shape is the single source of truth — establish this discipline in Phase 1 and never deviate.

---

### Pitfall 8: Match Priority Ambiguity — Library Hit, Heuristic Hit, or Both

**What goes wrong:**
The layering rule is: library alias → heuristic keyword table → "Other". But two sub-cases cause silent confusion:

**A — Library miss, heuristic hit.** An ingredient isn't in the library yet. The heuristic correctly categorizes it as "Produce". User never adds it to the library because it "works". Over time the library understates the ingredient vocabulary and the heuristic carries more load than intended. This isn't a bug, but it means the library's `curated` count understates coverage, and a curated library entry that conflicts with the heuristic won't be discovered until the library entry is actually created.

**B — Library hit, wrong category (uncurated).** Auto-extracted entry has heuristic-seeded `groceryCategory: 'Produce'`. The heuristic's `\bpea\b` bug (documented in CONCERNS.md) means "peanut butter" → Produce. The library now stores that wrong category, the library takes priority over the heuristic, and the user can't fix it by patching `categorize.js` — they must also fix the library entry. Two places to fix one bug.

**Why it happens:**
The priority chain "library first" is correct but means the library *inherits and amplifies* heuristic bugs during backfill and auto-extract. Users fixing the keyword table still see wrong categories because library entries shadow the corrected heuristic.

**How to avoid:**
1. **Fix known heuristic bugs before backfill runs.** The `\bpea\b` → "peanut butter" bug (CONCERNS.md) must be patched in `categorize.js` before the backfill seeds library entries. Otherwise every recipe containing "peanut butter" seeds a wrong-category library entry.
2. **Surface uncurated entries explicitly.** The Library tab's default view shows uncurated entries first, with a visible "heuristic-guessed" badge, so users know these have not been validated.
3. **The Fix shortcut on the grocery list is the primary correction path.** Fixing one item there corrects every future grocery list render without requiring the Library tab.
4. **Document the priority chain in code comments** at the top of the categorization lookup function, so future developers don't accidentally bypass the library.

**Warning signs:**
- Fixing `categorize.js` for "peanut butter" doesn't fix the grocery list — library entry still says Produce.
- Library tab shows 0 uncurated entries but many ingredients still show wrong categories (means library is not being consulted at all).
- Grocery list categories change unexpectedly after a recipe delete (orphaned library entry was providing the category; heuristic takes over after it's gone).

**Phase to address:**
Phase implementing categorization layering in `lib/categorize.js` and `lib/calc.js`. Fix the `\bpea\b` heuristic bug in the same phase, before the backfill runs — they are co-dependent.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip alias uniqueness validation on insert | Simpler code for first pass | Silent wrong-category matches; impossible to debug | Never — validate at insert time from day one |
| Store category on grocery item at confirm-week time | No render-time lookup needed | Stale categories on current grocery list after library edits | Never for this app — render-time is already decided |
| Use `entry.name` as display text on recipe pages | Avoids template complexity | User sees different text than scraped recipe; preparation notes lost | Never |
| Add `nutrition: {}` placeholder to entry shape | Signals future intent | Inconsistent schema; `undefined` read errors when accessing sub-fields | Never — add fields only when implementing them |
| Check `state.library.length === 0` as backfill guard | Simple one-liner | Re-runs backfill after user deletes all entries; creates duplicates | Never — use a `libraryMigratedAt` timestamp flag |
| Linear scan without normalize() | Simpler match logic | "Butter" and "butter" resolve differently; silent misses | Never — always normalize before comparing |
| Auto-delete orphaned library entries on recipe delete | Keeps library clean automatically | Deletes curated entries the user added for ingredients they plan to re-use | Never auto-delete; surface orphans as a count |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| O(n²) alias scan — `library.find()` wrapping `aliases.find()` per ingredient | Page load slows as library grows | Single flat scan: iterate library once, check aliases array inline | Noticeable above ~2,000 entries; irrelevant at <500 |
| Rebuilding alias Map on every render instead of caching | Repeated redundant Map construction | Rebuild Map only when `state.library` is mutated; cache in module scope | Any size — wasted work even at 50 entries |
| Running backfill synchronously at request time | First request after deploy hangs | Run backfill in startup hook before server starts accepting requests | Any recipe count — even 100 recipes is perceptible if sync I/O stalls a response |
| Regex-based alias matching (full regex per alias) | Slower than string comparison at scale | Use normalized string equality, not regex, for alias matching in the library layer | Above ~1,000 aliases |

For this app's expected scale (<500 entries, single user), none of these traps are likely to be felt. They are documented to prevent accidental O(n²) patterns during implementation.

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Library tab shows all entries by default (hundreds uncurated) | Overwhelming; user abandons curation | Default to uncurated filter; show curated entries as secondary view |
| Fix shortcut changes category but no visual confirmation | User unsure if action registered | OOB-swap the ingredient line with updated category badge + toast (consistent with existing patterns) |
| Canonical name displayed on recipe ingredient line | User thinks app changed their recipe text | Always display `ingredient.text`; show canonical name only in Fix editor as metadata |
| Deleting a library entry silently breaks categorization for recipes that used it | Grocery items suddenly show "Other" | Warn before delete: "This entry matches N recipes. Deleting will revert those ingredients to heuristic categorization." |
| Curation filter shows count of 0 when backfill hasn't run yet | User confused — library tab appears empty on first visit | Trigger backfill eagerly on first library tab render if not already run; show loading state |

---

## "Looks Done But Isn't" Checklist

- [ ] **Alias uniqueness:** Duplicate alias across two entries is possible if validation is only on the edit form, not in the storage layer — verify `aliasConflict()` runs in the route handler, not just the UI.
- [ ] **Backfill idempotency:** Restart the server twice after deploy — `state.library` should have the same entry count both times — verify by length assertion in integration test.
- [ ] **Render-time normalize:** Test that `'Butter'`, `'butter'`, and `' butter '` all resolve to the same library entry — without this, Fix shortcut may appear to do nothing.
- [ ] **Original text preserved:** Recipe detail page shows the original scraped ingredient string, not the canonical name — verify by renaming a library entry and reloading the recipe page.
- [ ] **Heuristic fallback active:** Delete a library entry for a well-known ingredient — verify the grocery list still shows a reasonable (heuristic) category, not "Other".
- [ ] **Orphan visibility:** Delete a recipe — verify the Library tab shows a count of entries that no longer match any recipe (even if no auto-delete occurs).
- [ ] **Pre-backfill heuristic fix:** "peanut butter" categorizes as Aisle (not Produce) both in `categorize.js` tests and on a grocery list — verify before backfill runs.
- [ ] **Toast safety:** Any ingredient text passed through a toast header is stripped of non-ASCII (em-dash bug documented in CONCERNS.md applies to canonical names too).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Alias collision producing wrong categories | LOW | Find colliding entries in Library tab; remove alias from one entry; reload page |
| Backfill ran twice, duplicate entries created | MEDIUM | Write a one-off Node script: `dedupeLibrary(state)` that merges entries with identical normalized names, combining aliases arrays; run via `node scripts/dedup-library.js`; restart app |
| Canonical name shown on recipe pages instead of original text | LOW (template fix) | Fix template to use `ingredient.text`; no data migration needed |
| Heuristic bugs baked into backfilled entries | MEDIUM | Patch `categorize.js`; write a `reseedException(state)` script that re-seeds categories for all `curated: false` entries; run once |
| Nutrition placeholder field `{}` causes read errors | MEDIUM | `lib/storage.js#migrate()` pass: for each entry, `if (entry.nutrition !== undefined && typeof entry.nutrition !== 'object') entry.nutrition = null` |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Alias collision (Pitfall 1) | Phase: Library data model + alias storage | Test: inserting duplicate alias returns validation error; no two entries share an alias after N recipe imports |
| Auto-extract noise (Pitfall 2) | Phase: Auto-extract on recipe save | Test: importing 5 recipes with "garlic cloves", "garlic clove", "minced garlic" produces ≤2 library entries for garlic |
| Backfill duplicates (Pitfall 3) | Phase: `lib/storage.js` migration for `state.library` | Test: server restart 3x — library entry count is stable; `libraryMigratedAt` is set |
| Mutation lifecycle / orphans (Pitfall 4) | Phase: Library tab + delete route | Test: delete a recipe → library tab shows orphan count > 0 for entries that appeared only in that recipe |
| Render-time normalize (Pitfall 5) | Phase: Categorization layering in `lib/calc.js` | Test: `normalizedMatch('Butter') === normalizedMatch('butter') === normalizedMatch(' butter ')` → same entry |
| Canonical name display (Pitfall 6) | Phase: Recipe detail partial + Fix shortcut | Test: rename library entry → recipe page still shows original scraped text |
| Schema extensibility (Pitfall 7) | Phase: `lib/storage.js` migration | Test: no entry in `state.library` has fields beyond the defined shape; migrate() adds only defined defaults |
| Match priority / heuristic inheritance (Pitfall 8) | Phase: Categorization layering (same as Pitfall 5) — fix `\bpea\b` in same PR as library layer | Test: "peanut butter" → Aisle on grocery list; library entry for "peanut butter" has `groceryCategory: 'Aisle'` after backfill |

---

## Sources

- [mealie-recipes/mealie#6841 — Unit alias "gr" ignored by NLP parser](https://github.com/mealie-recipes/mealie/issues/6841)
- [mealie-recipes/mealie#2229 — Disallow duplicate ingredients](https://github.com/mealie-recipes/mealie/issues/2229)
- [mealie-recipes/mealie#3225 — Deleting food data blanks recipe ingredient name](https://github.com/mealie-recipes/mealie/issues/3225)
- [mealie-recipes/mealie#6826 — Ghost foods: not searchable, not parseable, not recreatable](https://github.com/mealie-recipes/mealie/issues/6826)
- [mealie-recipes/mealie#6209 — "Add as alias" button shows when values are identical](https://github.com/mealie-recipes/mealie/issues/6209)
- [mealie-recipes/mealie#2650 — v1 migration lost 60% of recipes](https://github.com/mealie-recipes/mealie/issues/2650)
- [mealie-recipes/mealie discussion #3551 — Managing unused foods: community-built cleanup scripts](https://github.com/mealie-recipes/mealie/discussions/3551)
- [mealie-recipes/mealie discussion #1852 — Grouping ingredients with different names](https://github.com/mealie-recipes/mealie/discussions/1852)
- [Tandoor Recipes — Automation/aliasing design and order-dependency](https://docs.tandoor.dev/features/automation/)
- [bheisler.github.io — Building a Recipe Manager Part 5: Data Integrity (cached data desync, fuzzy match instability)](https://bheisler.github.io/post/recipe-manager-part-5-data-integrity/)
- recipe-box `.planning/codebase/CONCERNS.md` — `\bpea\b` collision bug, dangling week IDs, toast non-ASCII bug
- recipe-box `lib/categorize.js` — existing longest-match-wins index structure

---
*Pitfalls research for: Ingredient library / canonical-record / alias-matching layer*
*Researched: 2026-05-05*
