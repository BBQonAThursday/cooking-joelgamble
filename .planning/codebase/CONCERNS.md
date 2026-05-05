# Codebase Concerns

**Analysis Date:** 2026-05-05

## Tech Debt

**Heuristic-driven ingredient categorization:**
- Issue: `lib/categorize.js` uses keyword tables and longest-match-first matching. Category placement is imperfect by design and depends on insertion order within categories and exact keyword matches with word boundary `\b`.
- Files: `lib/categorize.js` (lines 3–117), `lib/calc.js` (lines 128–140), `lib/render.js`
- Impact: Misclassifications surface as incorrect category grouping in recipe ingredient lists and grocery lists. Users may see ingredients in unexpected categories.
- Fix approach: 
  - Add test cases for edge cases (compound ingredients, common misspellings).
  - Maintain a blacklist of known false positives and handle them explicitly.
  - Document the matching rules in the code so future keyword additions don't regress.
  - Consider ML-based categorization if misclassifications become frequent.

**Prefix-match collision (peanut/pea):**
- Issue: The word-boundary regex `\bpea` in `GROCERY_KEYWORDS.Produce` (line 78) matches `peanut` because `peanut` is written as a single token and contains `pea` at the word boundary. This routes "peanut butter" to Produce instead of Aisle.
- Files: `lib/categorize.js` (lines 19, 78, 103)
- Impact: "peanut butter" is categorized as Produce instead of Aisle on the grocery list, confusing users.
- Fix approach: Replace `'pea'` with `'pea,'` or use a negative lookahead `(?!nut)` to avoid matching peanut. Add test case `groceryCategoryOf('peanut butter')` should return 'Aisle'.

**Dead Aisle entries removed but pattern risk remains:**
- Issue: Recent commits (6b81dfb, b5d5927) cleaned up unreachable Aisle herb entries (`thyme`, `basil`, `rosemary`) that were shadowed by Produce entries due to insertion order. The fix was to remove them, but the underlying pattern (insertion-order-dependent keyword ranking) is still fragile.
- Files: `lib/categorize.js` (lines 3–117)
- Impact: Future keyword additions may create new dead code or shadowing bugs if insertion order changes.
- Fix approach: Refactor the index to sort by category priority first, then by length within category (e.g., Produce > Seasoning > Aisle for shared terms). Document this clearly.

## Known Bugs

**Cloudflare bot protection blocks scraping:**
- Symptoms: URLs from sites protected by Cloudflare bot management (e.g., foodandwine.com) fail to scrape. The response has status 403 or similar with `cf-mitigated` header set.
- Files: `lib/scrape.js` (lines 179–181)
- Trigger: Attempt to scrape a recipe from a Cloudflare-protected site via POST `/recipes` with a URL.
- Workaround: Users must manually paste the recipe ingredients and instructions, then save. There is no bookmarklet or alternative input method yet.
- Fix approach: 
  - Implement a manual recipe input form (title, ingredients, instructions, servings, total time).
  - Add a "paste recipe" endpoint that accepts structured JSON or YAML.
  - Consider a browser extension or bookmarklet as a future feature.

**Non-ASCII characters in toast headers break Node HTTP layer:**
- Symptoms: An em-dash (U+2014 — "–") in the toast message string passed to `X-Status-Toast` header caused the HTTP response to fail.
- Files: `routes/recipes.js` (lines 10–14), `routes/weeks.js` (lines 9–12), `routes/grocery.js` (similar pattern)
- Trigger: Recipe or ingredient title containing special Unicode characters (e.g., "Spaghetti — Carbonara").
- Workaround: Current code uses `.slice(0, 200)` on the message and relies on title inputs staying ASCII. Hyphen is substituted for em-dashes.
- Fix approach: 
  - Add a `sanitizeToastMessage()` function that strips or replaces non-ASCII characters (keep only 0x20–0x7E).
  - Add a test case: `assert.strictEqual(setToast('Pasta — Carbonara'), 'Pasta - Carbonara')`.
  - Consider enforcing ASCII-only validation at the point of recipe/ingredient input.

## Race Conditions & Concurrency

**Simultaneous mutations from two browser tabs can lose updates:**
- Issue: The storage module maintains a singleton in-memory state (`lib/storage.js`, line 17). When two browser tabs both call `storage.get()`, they receive the same object reference. If Tab A and Tab B both modify state and call `storage.save()`, the last write wins; Tab A's changes are lost.
- Files: `lib/storage.js` (lines 17–30), `routes/recipes.js`, `routes/weeks.js`, `routes/grocery.js`
- Impact: A user with two tabs open (e.g., editing a recipe in one tab while tagging recipes in another) may lose changes from the first tab. Data is not corrupted, but updates are silently overwritten.
- Acceptable for v1: Documented as acceptable because the app is designed for single-user LAN deployment on a Raspberry Pi. Multi-tab editing is not a typical use case.
- Improvement path (future):
  - Implement optimistic locking with generation numbers: each state write increments a version; on conflict, reject or merge.
  - Add a conflict detection middleware that compares versions before allowing save.
  - Or simplify: disable concurrent requests with a shared mutex (less ideal but simpler).

## Atomic Write Durability

**Temp-file rename is mostly atomic but not guaranteed on all filesystems:**
- Issue: `lib/storage.js#persist()` (lines 25–31) writes to `state.json.tmp`, then renames it to `state.json`. On POSIX filesystems (Linux), this is atomic. On FAT variants and some network mounts, it may not be.
- Files: `lib/storage.js` (lines 25–31)
- Impact: In the rare event of a power loss or OS crash during the rename, the file may be left in an inconsistent state (both `.tmp` and `.json` missing, or `state.json` partially written).
- Acceptable for target platform: The deployment target is a Raspberry Pi running Linux. On Linux (ext4, btrfs, etc.), the rename is atomic. This is acceptable.
- Risk: If the app is run on Windows, macOS, or a network-mounted filesystem without atomic rename semantics, data loss is possible.
- Fix approach (if needed):
  - Add a write-ahead log (WAL) or journal file before rename.
  - Or use a library like `safe-file-replace` that guarantees atomicity.
  - Document the supported filesystems in README.

## Stale/Dangling References

**Deleted recipes leave dangling IDs in week and history records:**
- Issue: When a recipe is deleted via DELETE `/recipes/:id`, it is removed from `state.recipes`. However, the recipe ID may still exist in `state.weeks[].recipeIds` (for the current week) and historical week records. The render layer filters out these IDs at display time using `.filter(Boolean)` (e.g., `lib/calc.js` line 117), but the dangling IDs accumulate in the JSON file.
- Files: `lib/storage.js`, `routes/recipes.js` (line 73), `lib/calc.js` (lines 51–53, 116–119)
- Impact: 
  - The `state.json` file grows slightly with each deleted recipe (a few bytes per ID).
  - No corruption or user-visible bug, but orphaned data remains.
  - If a new recipe is created with the same URL-derived ID, it may be incorrectly tagged as part of past weeks.
- Acceptable for v1: This is YAGNI (You Aren't Gonna Need It). For a personal recipe app with dozens of recipes, the overhead is negligible.
- Fix approach (future):
  - Add a cleanup function that removes recipe IDs from `state.weeks` if the recipe no longer exists.
  - Run cleanup on app startup or as a manual maintenance command.

## Error Handling & Observability

**No structured logging or error monitoring:**
- Issue: `server.js` (lines 33–35) has a single `console.error(err)` middleware. There is no structured logging (JSON logs), no log rotation, and no alerting.
- Files: `server.js` (lines 33–35)
- Impact: 
  - Errors are printed to stdout but are not persisted or indexed.
  - No way to query historical errors or track error rates.
  - If the app crashes, errors are lost unless logs are manually captured.
- Acceptable for personal Pi use: For a single-user app on a trusted local network, this is fine. The developer can SSH into the Pi and check stdout if needed.
- Fix approach (future):
  - Add a logging library like `pino` or `winston` with file rotation.
  - Log all POST/DELETE mutations with operation name, user, timestamp, and result.
  - Add simple error alerting (e.g., log critical errors to a syslog server).

**Minimal validation on inputs:**
- Issue: Recipe titles, ingredient texts, and user-submitted data are not validated. The scraper normalizes ingredient strings (`lib/scrape.js` lines 73–74) but user-typed ingredients are not checked for length, encoding, or special characters.
- Files: `routes/recipes.js`, `routes/weeks.js`, `routes/grocery.js`, `lib/scrape.js`
- Impact: A user could submit an extremely long ingredient string, or Unicode that breaks rendering. This is unlikely to cause data corruption but could degrade UX.
- Fix approach:
  - Add validation helpers: `validateRecipeTitle()`, `validateIngredient()`, etc.
  - Enforce max lengths (e.g., title ≤ 200 chars, ingredient ≤ 500 chars).
  - Test with edge cases (emoji, right-to-left scripts, control characters).

## Test Isolation Concerns

**Storage singleton reset via `require.cache` deletion:**
- Issue: Test isolation for the storage module (`lib/storage.js`) relies on deleting the module from Node's `require.cache` and re-requiring it (`test/storage.test.js` lines 11–12, `test/_helpers.js` line 28). This is a code smell: if any helper or test fixture transitively imports storage, the deletion may not fully reset the singleton.
- Files: `test/storage.test.js` (lines 9–13), `test/_helpers.js` (lines 25–28)
- Impact: 
  - Tests are slightly fragile if the dependency tree changes.
  - It works in practice, but is not a robust pattern.
- Fix approach:
  - Refactor storage to export a factory function: `createStorageModule(dataDir)` that returns a fresh instance.
  - Or wrap the singleton in a reset function that clears internal state without requiring cache deletion.
  - Example: Add `storage._clearState()` that resets the module-level `state` variable to `null`.

## Security Considerations

**No authentication or authorization:**
- Issue: The app has no login, no user accounts, and no access control. Any client on the LAN can read and modify all recipes, weeks, and grocery lists.
- Files: `server.js`, all route handlers
- Impact: Acceptable for the stated use case (single-user Pi on a home LAN). Not acceptable for internet-facing deployment.
- Documented: This is noted in the design as acceptable for the trust model (LAN-only, personal device).
- Risk if deployed outside LAN: Complete data disclosure and modification by any user with network access.

**No CSRF protection:**
- Issue: Route handlers accept POST/DELETE requests without CSRF tokens. A malicious website could submit cross-origin requests on behalf of a user.
- Files: `routes/recipes.js`, `routes/weeks.js`, `routes/grocery.js`
- Impact: Low risk on LAN (no internet access), but high risk if exposed to the internet.
- Fix approach (if internet-facing):
  - Add CSRF token validation using `express-csrf` or similar.
  - Validate `Origin` and `Referer` headers on state-modifying requests.

## Scalability Limits

**In-memory state limits:**
- Issue: The entire `state.json` (recipes, weeks, grocery) is loaded into memory on every request. For a personal app with a few hundred recipes, this is fine. At ~1K per recipe, 1000 recipes = 1MB, still acceptable.
- Files: `lib/storage.js` (lines 33–50)
- Impact: Linear memory growth with recipe count. No problem for a single-user app.
- Scaling limit: Beyond 10,000 recipes or ~10MB, the app would need optimization (pagination, indexing, database).

**No indexing on recipe lookups:**
- Issue: Finding a recipe by ID uses linear search (`state.recipes.find(r => r.id === id)`) in multiple places. This is O(n) per request.
- Files: `routes/recipes.js` (lines 51–54, 71), `routes/weeks.js` (lines 21, 49), `lib/calc.js` (lines 47, 109), `lib/week.js` (lines 50, 55)
- Impact: Negligible for hundreds of recipes, but becomes noticeable at thousands.
- Fix approach (future): Cache a `recipesById` Map in memory or use a database with indexed lookups.

## Dependencies at Risk

**Nunjucks template engine:**
- Risk: `nunjucks` is used for server-side rendering. It is actively maintained but not as widely used as EJS or Handlebars. No imminent risk.
- Impact: Template syntax lock-in; switching would require rewriting all `.njk` files.
- Mitigation: Nunjucks is stable and well-documented. No action needed for v1.

**No pinned versions in package.json:**
- Risk: `package.json` does not specify exact versions for dependencies (e.g., `"express": "^4.18.0"`). The `^` caret allows minor and patch version updates.
- Files: `package.json`
- Impact: A minor version bump in a dependency could introduce unexpected behavior.
- Fix approach: Commit `package-lock.json` (already done) and use `npm ci` in production instead of `npm install` to lock exact versions.

## Missing Critical Features

**No manual recipe input:**
- Problem: Users cannot add recipes by manually typing or pasting ingredients. The only input method is URL scraping.
- Blocks: Users with recipes from Cloudflare-protected sites or paper recipes cannot add them to the app.
- Improvement path: Add a form to POST `/recipes/manual` with title, ingredients, instructions, servings, totalMinutes.

**No recipe export:**
- Problem: Recipes are stored in `state.json` but there is no way to export them to a standard format (JSON, CSV, HTML).
- Blocks: Users cannot back up recipes or migrate to another app.
- Improvement path: Add GET `/recipes/export` endpoint that returns `state.json` or an HTML/PDF file.

## Test Coverage Gaps

**Scraper error paths minimally tested:**
- What's not tested: The scraper's error handling for edge cases (malformed JSON-LD, missing fields, timeout scenarios).
- Files: `lib/scrape.js`, `test/scrape.test.js`
- Risk: Edge cases like a Recipe node with no `name` field could still slip through.
- Priority: Low (errors are handled gracefully with user feedback), but good to add.

**Cross-tab mutation not tested:**
- What's not tested: The race condition where two simultaneous requests modify state.
- Files: All route handlers, `lib/storage.js`
- Risk: Regressions could introduce lost updates.
- Priority: Medium (acceptable for current use case, but test would prevent regression).

**Ingredient categorization edge cases:**
- What's not tested: Recipes with very long ingredient strings, Unicode, or special characters. The categorization function is tested for common cases but not for:
  - Emoji in ingredient text.
  - Right-to-left scripts (Arabic, Hebrew).
  - Control characters (null, newline, etc.).
- Files: `lib/categorize.js`, `test/categorize.test.js`
- Risk: UI rendering could be broken by unexpected input.
- Priority: Low (unlikely in practice, but good to add guard tests).

---

*Concerns audit: 2026-05-05*
