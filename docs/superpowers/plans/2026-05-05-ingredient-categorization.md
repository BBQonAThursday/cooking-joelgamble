# Ingredient Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bucket recipe ingredients into Protein/Veg/Seasoning/Flavor/Other on the recipe detail page, and grocery items into Produce/Meat/Dairy/Aisle/Frozen/Other on the grocery page, with checked grocery items collected in a single "Got it" closed list at the bottom.

**Architecture:** New pure helper module `lib/categorize.js` exposes two parallel keyword tables and `recipeCategoryOf`/`groceryCategoryOf` lookup functions. View-models in `lib/calc.js` decorate ingredients/items with their categories at render time (no state migration). Templates iterate category groups instead of flat lists. The grocery-list partial restructures into category groups followed by a "Got it" closed-list section.

**Tech Stack:** Node 18+ (built-in `node:test`), Express 4, Nunjucks, HTMX. Keyword matching uses pre-compiled regexes with longest-keyword-wins semantics.

**Spec:** `docs/superpowers/specs/2026-05-05-ingredient-categorization-design.md`

---

## File Structure

**New files:**
- `lib/categorize.js` — pure helpers: `recipeCategoryOf`, `groceryCategoryOf`, `RECIPE_CATEGORIES`, `GROCERY_CATEGORIES`
- `test/categorize.test.js` — unit tests for the matcher

**Modified files:**
- `lib/calc.js` — adds `decorateIngredients`; rewrites `buildGroceryView` to expose `categorizedGroups`, `closedItems`, `hasCategorized`, `hasClosed`
- `routes/recipes.js` — GET `/recipes/:id` decorates with `ingredientGroups`
- `routes/grocery.js` — POST `/grocery/:id/check` OOB-swaps the full `#grocery-list` instead of a single row
- `views/recipe.njk` — ingredients section iterates `ingredientGroups`
- `views/partials/grocery-list.njk` — restructured into category groups + closed list
- `views/grocery.njk` — bottom "Clear N checked items" button removed (moves into closed-list header inside the partial)
- `public/styles.css` — adds `.ingredient-category`, `.grocery-group`, `.grocery-category`, `.grocery-closed*`, `.grocery-clear-closed`; removes `.grocery-clear-checked`
- `test/calc.test.js` — extended for `decorateIngredients` + rewritten `buildGroceryView`
- `test/grocery-routes.test.js` — extended/updated for category grouping + closed-list placement
- `test/recipes.test.js` — extended for ingredient category headings on detail page

---

## Task 1: `lib/categorize.js` — recipe taxonomy

**Files:**
- Create: `lib/categorize.js`
- Create: `test/categorize.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/categorize.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { recipeCategoryOf, RECIPE_CATEGORIES } = require('../lib/categorize');

test('RECIPE_CATEGORIES is the canonical ordered list', () => {
  assert.deepStrictEqual(RECIPE_CATEGORIES, ['Protein', 'Veg', 'Seasoning', 'Flavor', 'Other']);
});

test('recipeCategoryOf maps animal proteins to Protein', () => {
  assert.strictEqual(recipeCategoryOf('500g boneless chicken thighs'), 'Protein');
  assert.strictEqual(recipeCategoryOf('1 lb ground beef'), 'Protein');
  assert.strictEqual(recipeCategoryOf('2 salmon fillets'), 'Protein');
  assert.strictEqual(recipeCategoryOf('3 eggs, beaten'), 'Protein');
});

test('recipeCategoryOf maps plant proteins to Protein', () => {
  assert.strictEqual(recipeCategoryOf('1 block firm tofu'), 'Protein');
  assert.strictEqual(recipeCategoryOf('1 cup red lentils'), 'Protein');
  assert.strictEqual(recipeCategoryOf('1 can chickpeas, drained'), 'Protein');
});

test('recipeCategoryOf maps vegetables and aromatics to Veg', () => {
  assert.strictEqual(recipeCategoryOf('1 medium onion, diced'), 'Veg');
  assert.strictEqual(recipeCategoryOf('3 cloves garlic, minced'), 'Veg');
  assert.strictEqual(recipeCategoryOf('2 large tomatoes'), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 cup mushrooms'), 'Veg');
  assert.strictEqual(recipeCategoryOf('1 lemon, juiced'), 'Veg');
});

test('recipeCategoryOf maps dry spices and herbs to Seasoning', () => {
  assert.strictEqual(recipeCategoryOf('1 tsp salt'), 'Seasoning');
  assert.strictEqual(recipeCategoryOf('1/2 tsp black pepper'), 'Seasoning');
  assert.strictEqual(recipeCategoryOf('2 tbsp curry powder'), 'Seasoning');
  assert.strictEqual(recipeCategoryOf('1 tsp dried oregano'), 'Seasoning');
});

test('recipeCategoryOf maps oils, sauces, sweeteners to Flavor', () => {
  assert.strictEqual(recipeCategoryOf('2 tbsp olive oil'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('1/4 cup soy sauce'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('2 tbsp honey'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('1 cup chicken broth'), 'Flavor');
});

test('recipeCategoryOf returns Other for unknown input', () => {
  assert.strictEqual(recipeCategoryOf('xyzzy unknown ingredient'), 'Other');
  assert.strictEqual(recipeCategoryOf(''), 'Other');
  assert.strictEqual(recipeCategoryOf(null), 'Other');
  assert.strictEqual(recipeCategoryOf(undefined), 'Other');
  assert.strictEqual(recipeCategoryOf(42), 'Other');
});

test('recipeCategoryOf handles plurals via prefix match', () => {
  assert.strictEqual(recipeCategoryOf('2 tomatoes'), 'Veg');
  assert.strictEqual(recipeCategoryOf('3 onions'), 'Veg');
});

test('recipeCategoryOf prefers longer keyword (chicken broth -> Flavor not Protein)', () => {
  assert.strictEqual(recipeCategoryOf('1 cup chicken broth'), 'Flavor');
  assert.strictEqual(recipeCategoryOf('1 cup vegetable broth'), 'Flavor');
});

test('recipeCategoryOf does not match on non-word-boundary substrings', () => {
  // "atomato" should not match "tomato"
  assert.strictEqual(recipeCategoryOf('atomato'), 'Other');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/categorize.test.js`
Expected: all tests fail with `Cannot find module '../lib/categorize'`.

- [ ] **Step 3: Create `lib/categorize.js`**

```js
const RECIPE_CATEGORIES = ['Protein', 'Veg', 'Seasoning', 'Flavor', 'Other'];

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildIndex(table) {
  const entries = [];
  for (const [category, keywords] of Object.entries(table)) {
    for (const kw of keywords) {
      entries.push({
        category,
        regex: new RegExp('\\b' + escapeRegex(kw.toLowerCase()), 'i'),
        length: kw.length
      });
    }
  }
  // Longest keyword wins.
  entries.sort((a, b) => b.length - a.length);
  return entries;
}

const RECIPE_INDEX = buildIndex(RECIPE_KEYWORDS);

function matchCategory(index, text) {
  if (typeof text !== 'string' || !text.trim()) return 'Other';
  for (const entry of index) {
    if (entry.regex.test(text)) return entry.category;
  }
  return 'Other';
}

function recipeCategoryOf(text) {
  return matchCategory(RECIPE_INDEX, text);
}

module.exports = {
  recipeCategoryOf,
  RECIPE_CATEGORIES
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/categorize.test.js`
Expected: 10 passing.

Then run `npm test` to confirm the full suite still passes.

- [ ] **Step 5: Commit**

```bash
git add lib/categorize.js test/categorize.test.js
git commit -m "feat(categorize): recipeCategoryOf + recipe keyword table"
```

---

## Task 2: `lib/categorize.js` — grocery taxonomy

**Files:**
- Modify: `lib/categorize.js`
- Modify: `test/categorize.test.js`

- [ ] **Step 1: Append failing tests to `test/categorize.test.js`**

```js
const { groceryCategoryOf, GROCERY_CATEGORIES } = require('../lib/categorize');

test('GROCERY_CATEGORIES is the canonical ordered list', () => {
  assert.deepStrictEqual(GROCERY_CATEGORIES, ['Produce', 'Meat', 'Dairy', 'Aisle', 'Frozen', 'Other']);
});

test('groceryCategoryOf maps fresh produce to Produce', () => {
  assert.strictEqual(groceryCategoryOf('1 medium onion, diced'), 'Produce');
  assert.strictEqual(groceryCategoryOf('2 large tomatoes'), 'Produce');
  assert.strictEqual(groceryCategoryOf('1 lemon'), 'Produce');
});

test('groceryCategoryOf maps animal proteins to Meat', () => {
  assert.strictEqual(groceryCategoryOf('500g boneless chicken thighs'), 'Meat');
  assert.strictEqual(groceryCategoryOf('1 lb ground beef'), 'Meat');
  assert.strictEqual(groceryCategoryOf('2 salmon fillets'), 'Meat');
});

test('groceryCategoryOf maps dairy items to Dairy', () => {
  assert.strictEqual(groceryCategoryOf('1 cup milk'), 'Dairy');
  assert.strictEqual(groceryCategoryOf('2 tbsp butter'), 'Dairy');
  assert.strictEqual(groceryCategoryOf('1 cup shredded cheddar cheese'), 'Dairy');
  assert.strictEqual(groceryCategoryOf('3 eggs'), 'Dairy');
});

test('groceryCategoryOf maps shelf-stable to Aisle', () => {
  assert.strictEqual(groceryCategoryOf('1 cup rice'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 lb pasta'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 tsp salt'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('2 tbsp olive oil'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1/4 cup soy sauce'), 'Aisle');
  assert.strictEqual(groceryCategoryOf('1 can chickpeas'), 'Aisle');
});

test('groceryCategoryOf maps frozen to Frozen', () => {
  assert.strictEqual(groceryCategoryOf('1 bag frozen peas'), 'Frozen');
  assert.strictEqual(groceryCategoryOf('1 pint ice cream'), 'Frozen');
});

test('groceryCategoryOf returns Other for unknown input', () => {
  assert.strictEqual(groceryCategoryOf('xyzzy unknown'), 'Other');
  assert.strictEqual(groceryCategoryOf(''), 'Other');
  assert.strictEqual(groceryCategoryOf(null), 'Other');
});

test('groceryCategoryOf prefers Aisle over Produce for canned/processed', () => {
  // tomato sauce should be Aisle (canned/jarred), not Produce
  assert.strictEqual(groceryCategoryOf('1 cup tomato sauce'), 'Aisle');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/categorize.test.js`
Expected: 8 new tests fail (`groceryCategoryOf is not a function`).

- [ ] **Step 3: Add the grocery taxonomy to `lib/categorize.js`**

In `lib/categorize.js`, after the `const RECIPE_KEYWORDS = ...` block, add:

```js
const GROCERY_CATEGORIES = ['Produce', 'Meat', 'Dairy', 'Aisle', 'Frozen', 'Other'];

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

const GROCERY_INDEX = buildIndex(GROCERY_KEYWORDS);

function groceryCategoryOf(text) {
  return matchCategory(GROCERY_INDEX, text);
}
```

Update the `module.exports` to include the new exports:

```js
module.exports = {
  recipeCategoryOf,
  groceryCategoryOf,
  RECIPE_CATEGORIES,
  GROCERY_CATEGORIES
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/categorize.test.js`
Expected: 18 passing.

Then `npm test` for the full suite — should still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/categorize.js test/categorize.test.js
git commit -m "feat(categorize): groceryCategoryOf + grocery keyword table"
```

---

## Task 3: `lib/calc.js` — `decorateIngredients`

**Files:**
- Modify: `lib/calc.js`
- Modify: `test/calc.test.js`

- [ ] **Step 1: Append failing tests to `test/calc.test.js`**

```js
const { decorateIngredients } = require('../lib/calc');

test('decorateIngredients groups ingredients by recipe category in canonical order', () => {
  const ingredients = [
    '500g chicken thighs',
    '1 medium onion',
    '1 tsp salt',
    '2 tbsp olive oil',
    'something-uncategorized'
  ];
  const groups = decorateIngredients(ingredients);
  assert.deepStrictEqual(groups.map(g => g.category), ['Protein', 'Veg', 'Seasoning', 'Flavor', 'Other']);
  assert.deepStrictEqual(groups[0].items, ['500g chicken thighs']);
  assert.deepStrictEqual(groups[1].items, ['1 medium onion']);
  assert.deepStrictEqual(groups[2].items, ['1 tsp salt']);
  assert.deepStrictEqual(groups[3].items, ['2 tbsp olive oil']);
  assert.deepStrictEqual(groups[4].items, ['something-uncategorized']);
});

test('decorateIngredients omits empty categories', () => {
  const groups = decorateIngredients(['500g chicken', '1 tsp salt']);
  assert.strictEqual(groups.length, 2);
  assert.deepStrictEqual(groups.map(g => g.category), ['Protein', 'Seasoning']);
});

test('decorateIngredients preserves item order within a group', () => {
  const groups = decorateIngredients([
    '1 onion',
    '1 carrot',
    '1 tomato'
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].items, ['1 onion', '1 carrot', '1 tomato']);
});

test('decorateIngredients tolerates empty/missing input', () => {
  assert.deepStrictEqual(decorateIngredients(undefined), []);
  assert.deepStrictEqual(decorateIngredients(null), []);
  assert.deepStrictEqual(decorateIngredients([]), []);
  assert.deepStrictEqual(decorateIngredients(['', '   ']), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/calc.test.js`
Expected: 4 new tests fail (`decorateIngredients is not a function`).

- [ ] **Step 3: Add `decorateIngredients` to `lib/calc.js`**

At the top of `lib/calc.js`, the existing `require('./week')` line is already there. Add another require:

```js
const { recipeCategoryOf, RECIPE_CATEGORIES } = require('./categorize');
```

(Place it next to the existing `mondayOf` require.)

Append the helper before `module.exports`:

```js
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

Add `decorateIngredients` to `module.exports`. The existing exports likely look like `{ buildView, sourceDomain, formatTotalTime, buildWeeklyView, buildGroceryView, buildHistoryView }` — add `decorateIngredients` alongside.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/calc.test.js`
Expected: all calc tests pass.

Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add lib/calc.js test/calc.test.js
git commit -m "feat(calc): decorateIngredients groups recipe ingredients by category"
```

---

## Task 4: Recipe detail — render ingredient groups

**Files:**
- Modify: `routes/recipes.js`
- Modify: `views/recipe.njk`
- Modify: `test/recipes.test.js`

This task threads `ingredientGroups` from the route into the template, and updates the template to render them as grouped sections with `<h3>` headings.

- [ ] **Step 1: Append failing test to `test/recipes.test.js`**

The existing scrape stub at the top of `test/recipes.test.js` uses `ingredients: ['salt']`. To test multi-category rendering, this task pushes the assertion further down. Append:

```js
test('GET /recipes/:id renders ingredients grouped by category', async () => {
  // The scrape stub returns ingredients: ['salt']. Add a recipe directly to state
  // for richer category coverage.
  const storage = require('../lib/storage');
  const state = storage.get();
  state.recipes.push({
    id: 'multicat',
    addedAt: '2026-05-01T00:00:00Z',
    sourceUrl: 'https://example.com/multicat',
    title: 'Multi-Category Recipe',
    description: '',
    imageUrl: null,
    servings: '4',
    totalMinutes: 30,
    ingredients: ['500g chicken', '1 onion', '1 tsp salt', '2 tbsp olive oil'],
    instructions: ['cook']
  });
  storage.save();

  const res = await helpers.request(ctx.port, { path: '/recipes/multicat' });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /<h3 class="ingredient-category">Protein<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Veg<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Seasoning<\/h3>/);
  assert.match(res.body, /<h3 class="ingredient-category">Flavor<\/h3>/);
  assert.match(res.body, />500g chicken</);
  assert.match(res.body, />1 onion</);
  assert.match(res.body, />1 tsp salt</);
  assert.match(res.body, />2 tbsp olive oil</);
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `node --test test/recipes.test.js`
Expected: the new test fails — no `<h3 class="ingredient-category">` markup yet.

- [ ] **Step 3: Update the GET handler in `routes/recipes.js`**

In `routes/recipes.js`, update the destructuring import at the top from `lib/calc`:

```js
const { sourceDomain, formatTotalTime, decorateIngredients } = require('../lib/calc');
```

(Adds `decorateIngredients` to the existing imports.)

Replace the `router.get('/recipes/:id', ...)` handler body. Find this:

```js
const decorated = {
  ...recipe,
  sourceDomain: sourceDomain(recipe.sourceUrl),
  totalTimeLabel: formatTotalTime(recipe.totalMinutes),
  isTagged
};
```

Change to:

```js
const decorated = {
  ...recipe,
  sourceDomain: sourceDomain(recipe.sourceUrl),
  totalTimeLabel: formatTotalTime(recipe.totalMinutes),
  isTagged,
  ingredientGroups: decorateIngredients(recipe.ingredients)
};
```

(One field added.)

- [ ] **Step 4: Update `views/recipe.njk`**

Replace the existing ingredients block. Currently:

```html
<section class="recipe-ingredients">
  <h2>Ingredients</h2>
  <ul>
    {% for ing in recipe.ingredients %}<li>{{ ing }}</li>{% endfor %}
  </ul>
</section>
```

Change to:

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

(The `<h2>Ingredients</h2>` stays. The flat `<ul>` is replaced by per-category sections. The `{% else %}` clause inside the `{% for %}` triggers when the loop has zero iterations.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass — including the new "renders ingredients grouped by category" test, plus existing detail-page tests like the `tag-toggle` assertion (those still match since the `<h2>Ingredients</h2>` and item text are unchanged).

- [ ] **Step 6: Commit**

```bash
git add routes/recipes.js views/recipe.njk test/recipes.test.js
git commit -m "feat(recipe): render ingredients grouped by category"
```

---

## Task 5: `lib/calc.js` — rewrite `buildGroceryView` + restructure grocery views

**Files:**
- Modify: `lib/calc.js`
- Modify: `views/partials/grocery-list.njk`
- Modify: `views/grocery.njk`
- Modify: `test/calc.test.js`
- Modify: `test/grocery-routes.test.js`

This task is the larger one — it rewrites the view-model AND the templates atomically because the partial reads the new fields.

- [ ] **Step 1: Update existing `test/calc.test.js` tests for `buildGroceryView` (failing TDD step)**

Find the existing two tests:

```js
test('buildGroceryView decorates grocery list with counts', () => { ... });
test('buildGroceryView handles empty/missing grocery', () => { ... });
```

Replace both with this expanded set:

```js
test('buildGroceryView partitions checked vs unchecked', () => {
  const state = {
    grocery: [
      { id: 'g_a', text: '1 onion', checked: false },
      { id: 'g_b', text: '1 cup milk', checked: true },
      { id: 'g_c', text: '1 tsp salt', checked: false }
    ]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.activeTab, 'grocery');
  assert.strictEqual(view.hasGrocery, true);
  assert.strictEqual(view.hasCategorized, true);
  assert.strictEqual(view.hasClosed, true);
  assert.strictEqual(view.checkedCount, 1);
  assert.strictEqual(view.closedItems.length, 1);
  assert.strictEqual(view.closedItems[0].id, 'g_b');
});

test('buildGroceryView groups unchecked items by grocery category in canonical order', () => {
  const state = {
    grocery: [
      { id: 'g_a', text: '1 cup milk', checked: false },
      { id: 'g_b', text: '1 onion', checked: false },
      { id: 'g_c', text: '500g chicken', checked: false }
    ]
  };
  const view = buildGroceryView(state);
  // GROCERY_CATEGORIES order: Produce, Meat, Dairy, Aisle, Frozen, Other
  assert.deepStrictEqual(view.categorizedGroups.map(g => g.category), ['Produce', 'Meat', 'Dairy']);
  assert.strictEqual(view.categorizedGroups[0].items[0].text, '1 onion');
  assert.strictEqual(view.categorizedGroups[1].items[0].text, '500g chicken');
  assert.strictEqual(view.categorizedGroups[2].items[0].text, '1 cup milk');
});

test('buildGroceryView omits empty category groups', () => {
  const state = {
    grocery: [{ id: 'g_a', text: '1 onion', checked: false }]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.categorizedGroups.length, 1);
  assert.strictEqual(view.categorizedGroups[0].category, 'Produce');
});

test('buildGroceryView with only checked items shows hasCategorized=false hasClosed=true', () => {
  const state = {
    grocery: [{ id: 'g_a', text: 'eggs', checked: true }]
  };
  const view = buildGroceryView(state);
  assert.strictEqual(view.hasGrocery, true);
  assert.strictEqual(view.hasCategorized, false);
  assert.strictEqual(view.hasClosed, true);
  assert.strictEqual(view.categorizedGroups.length, 0);
  assert.strictEqual(view.closedItems.length, 1);
});

test('buildGroceryView empty state', () => {
  const view = buildGroceryView({});
  assert.strictEqual(view.hasGrocery, false);
  assert.strictEqual(view.hasCategorized, false);
  assert.strictEqual(view.hasClosed, false);
  assert.deepStrictEqual(view.categorizedGroups, []);
  assert.deepStrictEqual(view.closedItems, []);
  assert.strictEqual(view.checkedCount, 0);
});
```

- [ ] **Step 2: Run calc tests to verify failures**

Run: `node --test test/calc.test.js`
Expected: 5 new `buildGroceryView` tests fail (the function still returns the old shape with `grocery: items.map(...)`, no `categorizedGroups`).

- [ ] **Step 3: Update `test/grocery-routes.test.js` add-item assertion**

Find the existing test:

```js
test('POST /grocery adds an item and OOB-swaps the list', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/grocery',
    body: { text: '  eggs  ' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, />eggs</);
  assert.match(res.headers['x-status-toast'] || '', /Added/);
});
```

Replace `>eggs<` with a stricter assertion that the item appears under its category heading. Change to:

```js
test('POST /grocery adds an item and OOB-swaps the list with category grouping', async () => {
  const res = await helpers.request(ctx.port, {
    method: 'POST', path: '/grocery',
    body: { text: '  eggs  ' }
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, /id="grocery-list"/);
  assert.match(res.body, /hx-swap-oob="true"/);
  assert.match(res.body, /<h3 class="grocery-category">Dairy<\/h3>/);
  assert.match(res.body, />eggs</);
  assert.match(res.headers['x-status-toast'] || '', /Added/);
});
```

- [ ] **Step 4: Run grocery-routes tests to verify the updated assertion fails**

Run: `node --test test/grocery-routes.test.js`
Expected: this test fails because no category heading is rendered yet.

- [ ] **Step 5: Rewrite `buildGroceryView` in `lib/calc.js`**

At the top of `lib/calc.js`, extend the categorize import:

```js
const { recipeCategoryOf, groceryCategoryOf, RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('./categorize');
```

Replace the existing `buildGroceryView` function with:

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

(The previous flat `grocery` field is gone.)

- [ ] **Step 6: Replace `views/partials/grocery-list.njk`**

Replace the entire file contents with:

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

- [ ] **Step 7: Update `views/grocery.njk`**

Find the bottom block (the `{% if checkedCount > 0 %}` button). Currently:

```html
{% include "partials/grocery-list.njk" %}
{% if checkedCount > 0 %}
  <button class="grocery-clear-checked"
          hx-post="/grocery/clear-checked"
          hx-swap="none">Clear {{ checkedCount }} checked item{{ 's' if checkedCount != 1 else '' }}</button>
{% endif %}
```

Remove the `{% if checkedCount > 0 %}...{% endif %}` block entirely. The "Clear all" button now lives inside the closed-list partial. Final tail of `grocery.njk`:

```html
{% include "partials/grocery-list.njk" %}
```

(The `{% endblock %}` and `</main>` etc. remain after.)

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all tests pass — including:
- The 5 new/updated `buildGroceryView` tests (calc.test.js)
- The updated `POST /grocery adds an item` test (grocery-routes.test.js)
- All existing tests for grocery routes (delete, check, clear-checked) still pass because they assert on item content + `hx-swap-oob` markers still present in the new partial structure

- [ ] **Step 9: Commit**

```bash
git add lib/calc.js views/partials/grocery-list.njk views/grocery.njk test/calc.test.js test/grocery-routes.test.js
git commit -m "feat(grocery): category-grouped list with closed items at bottom"
```

---

## Task 6: `routes/grocery.js` — `POST /grocery/:id/check` OOB-swaps full list

**Files:**
- Modify: `routes/grocery.js`
- Modify: `test/grocery-routes.test.js`

After Task 5, the grocery view shows un-checked items grouped by category and checked items in a separate "Got it" closed list at the bottom. Currently `POST /grocery/:id/check` OOB-swaps a single `<li>` row, which means a checked item stays visually inside its category section instead of moving to the closed list. This task changes the route to OOB-swap the full `#grocery-list` so the move actually happens.

- [ ] **Step 1: Update the existing check-toggle test in `test/grocery-routes.test.js`**

Find:

```js
test('POST /grocery/:id/check toggles checked state', async () => {
  const id = await addItem(ctx.port, 'eggs');
  assert.ok(id);
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/grocery/${id}/check` });
  assert.strictEqual(res.status, 200);
  assert.match(res.body, new RegExp(`id="grocery-item-${id}"`));
  assert.match(res.body, /class="grocery-item is-checked"/);
  assert.match(res.body, /hx-swap-oob="true"/);
});
```

Replace with:

```js
test('POST /grocery/:id/check moves the item to the Got it closed list', async () => {
  const id = await addItem(ctx.port, 'eggs');
  assert.ok(id);
  const res = await helpers.request(ctx.port, { method: 'POST', path: `/grocery/${id}/check` });
  assert.strictEqual(res.status, 200);
  // OOB-swap of the full list now (not just a single row)
  assert.match(res.body, /id="grocery-list"[^>]*hx-swap-oob="true"/);
  // The item is rendered as checked
  assert.match(res.body, new RegExp(`id="grocery-item-${id}"`));
  assert.match(res.body, /class="grocery-item is-checked"/);
  // It appears under the "Got it" header
  assert.match(res.body, /<h3>Got it<\/h3>/);
  // The Dairy category section that would normally hold it is absent (only one item, now checked)
  assert.doesNotMatch(res.body, /<h3 class="grocery-category">Dairy<\/h3>/);
});
```

- [ ] **Step 2: Run grocery-routes tests to verify failure**

Run: `node --test test/grocery-routes.test.js`
Expected: the updated test fails — the response from the current implementation OOB-swaps a single `<li>`, not the full `#grocery-list`, so it has no "Got it" header.

- [ ] **Step 3: Update the handler in `routes/grocery.js`**

Find the existing handler:

```js
router.post('/grocery/:id/check', (req, res) => {
  const state = storage.get();
  const result = toggleChecked(state, req.params.id);
  if (!result.ok) return res.status(404).type('text').send('Not found');
  storage.save();
  // OOB-swap the single row
  respondWithUpdates(req, res, {
    panels: ['partials/grocery-item.njk'],
    extra: { item: result.item }
  });
});
```

Replace with:

```js
router.post('/grocery/:id/check', (req, res) => {
  const state = storage.get();
  const result = toggleChecked(state, req.params.id);
  if (!result.ok) return res.status(404).type('text').send('Not found');
  storage.save();
  // OOB-swap the full list — required because checking moves the item
  // from its category section to the closed list at the bottom.
  const view = buildGroceryView(state);
  respondWithUpdates(req, res, {
    panels: ['partials/grocery-list.njk'],
    extra: view
  });
});
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all tests pass — including the updated check-toggle test and the existing 404 test for unknown id.

- [ ] **Step 5: Commit**

```bash
git add routes/grocery.js test/grocery-routes.test.js
git commit -m "fix(grocery): check-toggle OOB-swaps full list so item moves to closed"
```

---

## Task 7: CSS — categorization styles

**Files:**
- Modify: `public/styles.css`

- [ ] **Step 1: Find and remove the existing `.grocery-clear-checked` styles**

In `public/styles.css`, find this block:

```css
.grocery-clear-checked {
  margin-top: 12px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: var(--radius);
  cursor: pointer;
}
.grocery-clear-checked:hover { color: var(--fg); border-color: var(--fg); }
```

Delete both rules. The button no longer exists.

- [ ] **Step 2: Append new styles before the `@media (max-width: 640px)` block**

Add the following CSS, immediately before the responsive media query at the bottom of the file:

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

- [ ] **Step 3: Verify nothing broke**

Run: `npm test`
Expected: all tests pass (CSS doesn't influence them; this is just a syntactic sanity check).

- [ ] **Step 4: Commit**

```bash
git add public/styles.css
git commit -m "ui: styles for ingredient/grocery categories + closed list"
```

---

## Task 8: Manual smoke test

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open `http://127.0.0.1:3003`.

- [ ] **Step 2: Recipe detail page**

Open any recipe with a typical mix of ingredients (e.g., the existing `chana aloo curry` recipe). Confirm:
- Ingredients are grouped under headings (Protein / Veg / Seasoning / Flavor / Other) in canonical order.
- Empty categories don't render their heading.
- Item order within each category matches the source recipe order.

- [ ] **Step 3: Grocery list — adding items**

On the Grocery tab, add one item per category to verify routing:
- `1 onion` → Produce
- `500g chicken` → Meat
- `1 cup milk` → Dairy
- `1 tsp salt` → Aisle
- `1 bag frozen peas` → Frozen
- `xyzzy unknown` → Other

Confirm each appears under the correct heading.

- [ ] **Step 4: Grocery list — shopping mode**

- Tap the checkbox on a couple of items. Each should disappear from its category section and appear under the "Got it" closed list at the bottom.
- Tap the checkbox again on a closed item. It should return to its category.
- Click "Clear all" in the closed-list header. All checked items disappear.

- [ ] **Step 5: Grocery list — empty state**

- Delete all items. Confirm "Grocery list is empty." copy renders.
- Confirm no "Got it" section is shown when the list is empty.

- [ ] **Step 6: Confirm flow integration**

- Tag a recipe via the ★ on the Recipes tab. Switch to This Week → Confirm. Switch to Grocery — the imported ingredient strings appear under their categories.
- Items that don't match any keyword fall into "Other" gracefully.

- [ ] **Step 7: Stop the server**

Ctrl-C in the terminal.

If anything misfires, file an issue with the offending input string + the wrong category. Tuning the keyword tables is the typical follow-up.

---

## Self-review checklist

After every task above is complete, verify:

- [ ] All commits present in `git log`.
- [ ] `npm test` shows the full suite passing.
- [ ] No remaining TODO/TBD comments in source.
- [ ] Hand the user the URL for a final live check.
