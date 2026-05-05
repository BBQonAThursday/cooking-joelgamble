# Ingredient Categorization — Design Spec

**Status:** draft 2026-05-05
**Scope:** v1 — keyword-based heuristic categorization of recipe ingredients (in the recipe detail view) and grocery items (in the grocery list view), under two parallel taxonomies.

## Overview

Recipe ingredients on the detail page and grocery items on the grocery page get bucketed into category groups with section headings. Two taxonomies — one optimized for cooking, one for grocery shopping:

- **Recipe view (cooking lens):** Protein, Veg, Seasoning, Flavor, Other
- **Grocery view (shopping lens):** Produce, Meat, Dairy, Aisle, Frozen, Other

Bucketing is heuristic: a substring match against per-category keyword lists. No external service, no LLM, no metadata on items. Pure functions in `lib/categorize.js` make the matching deterministic and unit-testable.

A new "Got it" closed list at the bottom of the grocery view collects all checked items regardless of category. A single "Clear all" button on that list wipes the checked items via the existing `POST /grocery/clear-checked` endpoint.

## Goals & non-goals

**Goals (v1):**
- Group recipe ingredients into Protein / Veg / Seasoning / Flavor / Other on the detail page.
- Group grocery items into Produce / Meat / Dairy / Aisle / Frozen / Other on the grocery page.
- Keep keyword tables in source code, easy to extend by hand.
- Compute categorization at render time (no state migration; new keywords take effect on next render).
- Move checked grocery items to a single "Got it" list at the bottom of the page (regardless of category) with a "Clear all" button.

**Non-goals (v1):**
- Editing keyword tables via UI.
- Per-user or per-recipe category overrides.
- LLM-based classification.
- Stemming/lemmatization beyond prefix matching at word boundaries.
- Quantity-aware merging across recipes (still YAGNI, same as the prior weekly-recipes spec).
- Re-categorizing past archived weeks' grocery imports.

## Architecture

```
recipe-box/
  lib/
    categorize.js           NEW — pure helpers: recipeCategoryOf, groceryCategoryOf, RECIPE_CATEGORIES, GROCERY_CATEGORIES
    calc.js                 (existing — extended with decorateIngredients; buildGroceryView rewritten)
  routes/
    recipes.js              (existing — GET /recipes/:id decorates with ingredientGroups)
    grocery.js              (existing — POST /grocery/:id/check now OOB-swaps full list, not single row)
  views/
    recipe.njk              (existing — ingredients section iterates ingredientGroups)
    partials/
      grocery-list.njk      (existing — restructured into category groups + closed list)
      grocery-item.njk      (existing — unchanged)
    grocery.njk             (existing — bottom "Clear N checked" button removed; "Clear all" now lives inside the closed-list header)
  public/styles.css         (existing — additions for ingredient-category, grocery-group, grocery-closed)
  test/
    categorize.test.js      NEW
    calc.test.js            (existing — extended)
    grocery-routes.test.js  (existing — extended)
    recipes.test.js         (existing — extended)
```

Conventions preserved:
- Pure helpers in `lib/`. No fs, no http, no DOM.
- View-models in `lib/calc.js` decorate state for templates.
- HTMX OOB-swap pattern via the existing `respondWithUpdates`.

## Categorization logic

### Public API of `lib/categorize.js`

```js
module.exports = {
  recipeCategoryOf,                      // (text) => one of RECIPE_CATEGORIES
  groceryCategoryOf,                     // (text) => one of GROCERY_CATEGORIES
  RECIPE_CATEGORIES,                     // ['Protein','Veg','Seasoning','Flavor','Other']
  GROCERY_CATEGORIES                     // ['Produce','Meat','Dairy','Aisle','Frozen','Other']
};
```

### Keyword tables

Two independent tables — one per taxonomy. Each table is an object mapping a category name to an array of keyword strings.

**Recipe taxonomy** (starter set, ~40-50 keywords/category):

```js
const RECIPE_KEYWORDS = {
  Protein: [
    // Animal
    'chicken','beef','pork','lamb','mutton','turkey','duck','goose','veal',
    'bacon','ham','sausage','prosciutto','salami','chorizo',
    'fish','salmon','tuna','cod','halibut','tilapia','trout','mackerel','sardine','anchovy',
    'shrimp','prawn','crab','lobster','scallop','squid','octopus','oyster','mussel','clam',
    'egg',
    // Plant
    'tofu','tempeh','seitan',
    'lentil','chickpea','black bean','kidney bean','pinto bean','navy bean','garbanzo','edamame'
  ],
  Veg: [
    'onion','garlic','shallot','leek','scallion','green onion','chive',
    'tomato','potato','sweet potato','yam','carrot','celery','bell pepper','jalapeno','habanero',
    'broccoli','cauliflower','cabbage','kale','spinach','lettuce','arugula','romaine',
    'cucumber','zucchini','squash','eggplant','mushroom','asparagus','green bean','pea',
    'corn','beet','radish','turnip','parsnip','fennel','artichoke','brussels sprout','okra',
    'ginger','lemongrass',
    'lemon','lime','orange','apple','mango','pineapple','banana','avocado','coconut',
    'raisin','date','cranberry'
  ],
  Seasoning: [
    'salt','kosher salt','sea salt','black pepper','white pepper','peppercorn',
    'cumin','coriander','paprika','smoked paprika','turmeric','garam masala','curry powder',
    'chili powder','red pepper flake','cinnamon','nutmeg','clove','cardamom','allspice',
    'fennel seed','mustard seed','caraway','anise','star anise','saffron','sumac',
    "za'atar",
    'oregano','thyme','rosemary','basil','parsley','cilantro','dill','sage','marjoram',
    'tarragon','mint','bay leaf',
    'garlic powder','onion powder','ginger powder'
  ],
  Flavor: [
    'olive oil','vegetable oil','sesame oil','coconut oil','canola oil','oil',
    'vinegar','balsamic','rice vinegar','apple cider vinegar','white wine vinegar',
    'soy sauce','fish sauce','oyster sauce','hoisin','worcestershire','tamari','miso',
    'broth','stock','bouillon','dashi','wine','sherry','mirin',
    'honey','sugar','brown sugar','maple syrup','agave',
    'mustard','dijon','ketchup','mayonnaise','sriracha','tabasco','hot sauce','chili sauce',
    'vegetable broth','chicken broth','beef broth',
    'lemon juice','lime juice','orange juice',
    'vanilla','vanilla extract','almond extract'
  ]
};
```

**Grocery taxonomy** (~30-50 keywords/category):

```js
const GROCERY_KEYWORDS = {
  Produce: [
    'onion','garlic','shallot','leek','scallion','tomato','potato','sweet potato','yam',
    'carrot','celery','bell pepper','jalapeno','habanero',
    'broccoli','cauliflower','cabbage','kale','spinach','lettuce','arugula',
    'cucumber','zucchini','squash','eggplant','mushroom','asparagus','green bean','pea',
    'corn','beet','radish','turnip','parsnip','fennel','artichoke','brussels sprout','okra',
    'ginger','lemongrass','herbs','parsley','cilantro','basil','rosemary','thyme','mint',
    'lemon','lime','orange','apple','mango','pineapple','banana','avocado','strawberry','blueberry'
  ],
  Meat: [
    'chicken','beef','pork','lamb','mutton','turkey','duck','goose','veal',
    'bacon','ham','sausage','prosciutto','salami','chorizo',
    'fish','salmon','tuna','cod','halibut','tilapia','trout','mackerel','sardine','anchovy',
    'shrimp','prawn','crab','lobster','scallop','squid','octopus','oyster','mussel','clam'
  ],
  Dairy: [
    'milk','butter','cream','heavy cream','half and half','sour cream','yogurt',
    'cheese','cream cheese','parmesan','mozzarella','cheddar','feta','ricotta','goat cheese',
    'brie','swiss','provolone','gouda','egg'
  ],
  Aisle: [
    // Pantry staples (most Seasoning + Flavor live here)
    'rice','pasta','noodle','flour','bread','cereal','oats','oatmeal','crackers','cookies',
    'tortilla','tomato sauce','tomato paste','pasta sauce','marinara',
    'salt','pepper','sugar','brown sugar','vanilla','baking powder','baking soda','yeast',
    'cornstarch','breadcrumb','panko',
    'olive oil','vegetable oil','sesame oil','coconut oil','canola oil','oil',
    'vinegar','balsamic','rice vinegar','apple cider vinegar',
    'soy sauce','fish sauce','oyster sauce','hoisin','worcestershire','tamari','miso',
    'broth','stock','bouillon','dashi','wine','sherry','mirin',
    'honey','maple syrup','agave','jam','jelly','peanut butter',
    'mustard','dijon','ketchup','mayonnaise','sriracha','tabasco','hot sauce','chili sauce',
    'cumin','coriander','paprika','turmeric','curry powder','chili powder',
    'cinnamon','nutmeg','clove','cardamom','allspice','oregano','thyme','rosemary','basil',
    'lentil','chickpea','black bean','kidney bean','pinto bean','garbanzo','canned',
    'tofu','tempeh',
    'tea','coffee','chocolate','cocoa'
  ],
  Frozen: [
    'frozen','ice cream','popsicle','frozen pizza','frozen vegetables','frozen peas',
    'frozen corn','frozen berries'
  ]
};
```

### Matching algorithm

For each table, build an index once at module load:

```js
function buildIndex(table) {
  const entries = [];
  for (const [category, keywords] of Object.entries(table)) {
    for (const kw of keywords) {
      entries.push({
        category,
        // Word-boundary at start, no boundary at end → matches "tomato" in "tomatoes" too.
        regex: new RegExp('\\b' + escapeRegex(kw.toLowerCase()), 'i'),
        length: kw.length
      });
    }
  }
  // Longest keyword wins.
  entries.sort((a, b) => b.length - a.length);
  return entries;
}
```

Lookup:

```js
function matchCategory(index, text) {
  if (typeof text !== 'string' || !text.trim()) return 'Other';
  for (const entry of index) {
    if (entry.regex.test(text)) return entry.category;
  }
  return 'Other';
}
```

`recipeCategoryOf` and `groceryCategoryOf` are thin wrappers that pass their respective indexes.

`escapeRegex(s)` is a 3-line helper escaping `[.*+?^${}()|[\]\\]`.

## State & view-model

State on disk is unchanged. Categorization is computed from `state.recipes[].ingredients` (strings) and `state.grocery[].text` (strings) at render time.

### `lib/calc.js` — `decorateIngredients`

```js
const { recipeCategoryOf, groceryCategoryOf, RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('./categorize');

function decorateIngredients(ingredients) {
  const buckets = new Map(RECIPE_CATEGORIES.map(c => [c, []]));
  for (const text of (ingredients || [])) {
    if (typeof text !== 'string' || !text.trim()) continue;
    buckets.get(recipeCategoryOf(text)).push(text);
  }
  const groups = [];
  for (const cat of RECIPE_CATEGORIES) {
    const items = buckets.get(cat);
    if (items.length > 0) groups.push({ category: cat, items });
  }
  return groups;
}
```

Order of categories is preserved from `RECIPE_CATEGORIES`. Empty categories are dropped. Items inside a group keep original order.

### `lib/calc.js` — `buildGroceryView` (rewritten)

```js
function buildGroceryView(state) {
  const items = Array.isArray(state && state.grocery) ? state.grocery : [];
  const unchecked = items.filter(g => !g.checked);
  const checked = items.filter(g => g.checked);

  const buckets = new Map(GROCERY_CATEGORIES.map(c => [c, []]));
  for (const item of unchecked) {
    buckets.get(groceryCategoryOf(item.text)).push({ ...item });
  }
  const categorizedGroups = [];
  for (const cat of GROCERY_CATEGORIES) {
    const groupItems = buckets.get(cat);
    if (groupItems.length > 0) categorizedGroups.push({ category: cat, items: groupItems });
  }

  return {
    categorizedGroups,
    closedItems: checked.map(g => ({ ...g })),
    hasGrocery: items.length > 0,
    hasCategorized: unchecked.length > 0,
    hasClosed: checked.length > 0,
    checkedCount: checked.length,
    activeTab: 'grocery'
  };
}
```

The previous flat `grocery: items` field is removed from the view-model; the partial template iterates `categorizedGroups` and `closedItems` directly.

### `routes/recipes.js` GET handler

```js
const { sourceDomain, formatTotalTime, decorateIngredients } = require('../lib/calc');

router.get('/recipes/:id', (req, res) => {
  const state = storage.get();
  const recipe = state.recipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).type('text').send('Not found');
  const { mondayOf } = require('../lib/week');
  const monday = mondayOf(new Date());
  const week = (state.weeks || []).find(w => w.weekStart === monday);
  const isTagged = !!(week && week.recipeIds.includes(recipe.id));
  const decorated = {
    ...recipe,
    sourceDomain: sourceDomain(recipe.sourceUrl),
    totalTimeLabel: formatTotalTime(recipe.totalMinutes),
    isTagged,
    ingredientGroups: decorateIngredients(recipe.ingredients)
  };
  res.render('recipe.njk', { recipe: decorated });
});
```

The handler grows by one decoration line and one new export it imports from `lib/calc.js`.

## Routes

Only one route changes behavior:

| Verb | Path | Change |
|---|---|---|
| `POST` | `/grocery/:id/check` | OOB-swap target changes from `partials/grocery-item.njk` (single row) to `partials/grocery-list.njk` (full list including category groups + closed list). Required because checking an item must move it from its category section to the closed list — a single-row swap can't move elements. |

All other routes (`GET /grocery`, `POST /grocery`, `DELETE /grocery/:id`, `POST /grocery/clear-checked`) already OOB-swap the full list, so they need no change other than reading the new view-model fields the rewritten partial expects.

## Views

### `views/recipe.njk` — ingredients block

```html
<section class="recipe-ingredients">
  <h2>Ingredients</h2>
  {% for group in recipe.ingredientGroups %}
    <h3 class="ingredient-category">{{ group.category }}</h3>
    <ul>
      {% for ing in group.items %}<li>{{ ing }}</li>{% endfor %}
    </ul>
  {% else %}
    <p class="empty">No ingredients found.</p>
  {% endfor %}
</section>
```

The instructions block stays as-is. The two-column layout (added in the prior pass) keeps wrapping the ingredients + instructions sections.

### `views/partials/grocery-list.njk` — restructured

```html
<section id="grocery-list" class="grocery-list">
  {% for group in categorizedGroups %}
    <div class="grocery-group">
      <h3 class="grocery-category">{{ group.category }}</h3>
      <ul class="grocery-items">
        {% for item in group.items %}{% include "partials/grocery-item.njk" %}{% endfor %}
      </ul>
    </div>
  {% endfor %}

  {% if hasClosed %}
    <div class="grocery-closed">
      <div class="grocery-closed-header">
        <h3>Got it</h3>
        <button class="grocery-clear-closed"
                hx-post="/grocery/clear-checked"
                hx-swap="none">Clear all</button>
      </div>
      <ul class="grocery-items">
        {% for item in closedItems %}{% include "partials/grocery-item.njk" %}{% endfor %}
      </ul>
    </div>
  {% endif %}

  {% if not hasGrocery %}
    <p class="empty grocery-empty">Grocery list is empty.</p>
  {% endif %}
</section>
```

The outer element changes from `<ul>` to `<section>` (ids preserved; tests asserting `id="grocery-list"` continue to match).

### `views/grocery.njk` — bottom "Clear N checked" button removed

The freestanding button at the bottom of the page is removed. Its replacement ("Clear all") lives inside the closed-list header inside the partial. The add-item form at the top is unchanged.

### `views/partials/grocery-item.njk` — unchanged

The `<li>` row markup, ids, hx-post, hx-delete are unchanged. It is included from a different parent now, but the contract with the route handlers is identical.

## CSS

Additions to `public/styles.css`:

```css
/* Ingredient categories on recipe detail */
.ingredient-category {
  font-size: 13px;
  text-transform: uppercase;
  color: var(--muted);
  margin: 12px 0 4px;
  letter-spacing: 0.05em;
}
.ingredient-category:first-child { margin-top: 0; }

/* Grocery category groups */
.grocery-group { padding: 8px 0; border-bottom: 1px solid var(--border); }
.grocery-group:last-of-type { border-bottom: none; }
.grocery-category {
  font-size: 13px;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0;
  padding: 4px 14px;
  letter-spacing: 0.05em;
}
.grocery-items { list-style: none; padding: 0; margin: 0; }

/* Closed (checked) list */
.grocery-closed {
  margin-top: 16px;
  padding-top: 8px;
  border-top: 2px solid var(--border);
  opacity: 0.65;
}
.grocery-closed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px;
}
.grocery-closed-header h3 {
  font-size: 13px;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0;
  letter-spacing: 0.05em;
}
.grocery-clear-closed {
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: var(--radius);
  font-size: 12px;
  cursor: pointer;
}
.grocery-clear-closed:hover { color: var(--fg); border-color: var(--fg); }
```

Removed (no longer used): `.grocery-clear-checked`. Its replacement is `.grocery-clear-closed` above.

## Edge cases

| Case | Behavior |
|---|---|
| Recipe has no ingredients | `decorateIngredients` returns `[]`. Template's `{% else %}` shows "No ingredients found." |
| All ingredients fall into "Other" | Only the "Other" heading and items render. Acceptable — surfaces a tuning gap without breaking the page. |
| Multi-keyword conflict (`"chicken broth"`) | Longest-keyword-wins prevents `"chicken"` from short-circuiting. Required: explicit `"chicken broth"` entries in Flavor (recipe) and Aisle (grocery). |
| Plurals (`"tomatoes"`, `"onions"`) | Prefix-match at word boundary catches them. |
| Pathological substring (`"atomato"`) | `\btomato` regex requires word-start boundary; doesn't match. |
| Empty grocery list | `hasGrocery=false` → "Grocery list is empty." Closed list hidden. |
| Only checked items | No category groups; only the "Got it" closed list. Empty-state copy not triggered (because `hasGrocery` is true). |
| Manually added items | Categorized at render time. New entries flow into the right group on the next render. No state migration needed. |
| Existing data on disk | No migration. The next render of `/grocery` or `/recipes/:id` simply applies the new categorization. |

## Testing

### `test/categorize.test.js` (NEW)

```js
// Recipe taxonomy
test('recipeCategoryOf maps chicken to Protein', ...);
test('recipeCategoryOf maps salt to Seasoning', ...);
test('recipeCategoryOf maps olive oil to Flavor', ...);
test('recipeCategoryOf maps tomato to Veg', ...);
test('recipeCategoryOf returns Other for unknown text', ...);
test('recipeCategoryOf handles plurals via prefix match (tomatoes -> Veg)', ...);
test('recipeCategoryOf does not match on non-word-boundary substrings (atomato -> Other)', ...);
test('recipeCategoryOf prefers longer keyword (vegetable broth -> Flavor not Veg)', ...);

// Grocery taxonomy
test('groceryCategoryOf maps milk to Dairy', ...);
test('groceryCategoryOf maps frozen peas to Frozen', ...);
test('groceryCategoryOf maps chicken to Meat (not Protein)', ...);
test('groceryCategoryOf maps salt to Aisle', ...);
test('groceryCategoryOf returns Other for unknown text', ...);
```

### `test/calc.test.js` (extend)

- `decorateIngredients` returns ordered groups in `RECIPE_CATEGORIES` order with empty categories omitted.
- `decorateIngredients` puts unmatched ingredients into the trailing `Other` group.
- `buildGroceryView` partitions checked vs unchecked correctly.
- `buildGroceryView` exposes `categorizedGroups` in `GROCERY_CATEGORIES` order, omitting empty categories.
- `buildGroceryView` exposes `closedItems` as flat array in original order.
- `buildGroceryView` flags: `hasGrocery`, `hasCategorized`, `hasClosed`, `checkedCount`.

### `test/grocery-routes.test.js` (extend / adjust)

- `POST /grocery {text:'milk'}` — response includes a "Dairy" heading and `>milk<` under it.
- `POST /grocery/:id/check` — response now carries the full `#grocery-list` markup with the checked item appearing under the "Got it" header, NOT under its original category. (This replaces the existing assertion on `class="grocery-item is-checked"` for the same row.)
- `POST /grocery/clear-checked` — "Got it" section is gone after the call when all checked items were cleared.

### `test/recipes.test.js` (extend)

- `GET /recipes/:id` for a stub recipe with `chicken` and `salt` ingredients shows "Protein" and "Seasoning" headings.

## Out of scope (explicitly)

- UI for editing keyword tables.
- Per-user category overrides / customization.
- LLM or remote-API classification.
- Stemming, synonyms, multilingual matching beyond what prefix-matching gives for free.
- Re-categorizing past archived weeks' grocery imports (read-only history is unchanged).
- Promoting "Got it" items back to active (just check-toggle the same row again — already supported).
