const RECIPE_CATEGORIES = ['Protein', 'Veg', 'Seasoning', 'Flavor', 'Other'];

const RECIPE_KEYWORDS = {
  Protein: [
    // Animal
    'chicken','beef','pork','lamb','mutton','turkey','duck','goose','veal',
    'bacon','ham','sausage','sausages','prosciutto','salami','chorizo',
    'fish','salmon','tuna','cod','halibut','tilapia','trout','mackerel','sardine','sardines','anchovy','anchovies',
    'shrimp','shrimps','prawn','prawns','crab','crabs','lobster','scallop','scallops','squid','octopus','oyster','oysters','mussel','mussels','clam','clams',
    'egg','eggs',
    // Plant
    'tofu','tempeh','seitan',
    'lentil','lentils','chickpea','chickpeas','black bean','kidney bean','pinto bean','navy bean','garbanzo','edamame',
    'beans',
    // Peanut (nut-based protein; explicit to prevent pea-prefix mismatch)
    'peanut','peanuts'
  ],
  Veg: [
    'onion','onions','garlic','shallot','shallots','leek','leeks','scallion','scallions','green onion','green onions','chive',
    'tomato','tomatoes','potato','potatoes','sweet potato','sweet potatoes','yam','yams','carrot','carrots','celery','bell pepper','bell peppers','jalapeno','jalapenos','habanero','habaneros',
    'broccoli','cauliflower','cabbage','kale','spinach','lettuce','arugula','romaine',
    'cucumber','zucchini','squash','eggplant','mushroom','mushrooms','asparagus','green bean','green beans','pea','peas',
    'corn','beet','beets','radish','radishes','turnip','turnips','parsnip','parsnips','fennel','artichoke','artichokes','brussels sprout','brussels sprouts','okra',
    'ginger','lemongrass',
    'lemon','lemons','lime','limes','orange','oranges','apple','apples','mango','mangoes','pineapple','banana','bananas','avocado','avocados','coconut',
    'raisin','raisins','date','dates','cranberry','cranberries'
    // 'pepper','peppers' removed (D-35) — bare tokens false-matched 'black pepper' to Veg.
    // Bell variants on line 20 ('bell pepper','bell peppers','jalapeno','jalapenos','habanero','habaneros') stay.
    // Seasonings on line 30 ('black pepper','white pepper','peppercorn') stay and now win cleanly.
  ],
  Seasoning: [
    'salt','kosher salt','sea salt','black pepper','white pepper','peppercorn','peppercorns',
    'cumin','coriander','paprika','smoked paprika','turmeric','garam masala','curry powder',
    'chili powder','red pepper flake','cinnamon','nutmeg','clove','cloves','cardamom','allspice',
    'fennel seed','mustard seed','caraway','anise','star anise','saffron','sumac',
    "za'atar",
    'oregano','thyme','rosemary','basil','parsley','cilantro','dill','sage','marjoram',
    'tarragon','mint','bay leaf','bay leaves',
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
    'vegetable stock','chicken stock','beef stock',
    'lemon juice','lime juice','orange juice',
    'vanilla','vanilla extract','almond extract'
  ]
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Unit/measure tokens stripped after the leading numeric chunk in normalizeIngredientText.
// Bare 'a'/'an' articles also count as quantity prefixes (e.g. 'a pinch of salt').
// Initial set per CONTEXT D-13; extend as the user's recipe corpus surfaces gaps.
// Moved from lib/library.js (03-REVISION-1 Approach A) so normalizeIngredientText
// becomes the canonical normalizer accessible to lib/categorize.js#matchRawLibrary
// without breaking the library -> categorize import-direction rule.
const UNIT_TOKENS = [
  'cups', 'cup',
  'tablespoons', 'tablespoon', 'tbsp', 'tbs',
  'teaspoons', 'teaspoon', 'tsp',
  'ounces', 'ounce', 'oz',
  'pounds', 'pound', 'lbs', 'lb',
  'grams', 'gram', 'g',
  'kilograms', 'kilogram', 'kg',
  'milliliters', 'milliliter', 'ml',
  'liters', 'liter', 'l',
  'pinch', 'pinches', 'dash', 'dashes',
  'cloves', 'clove',
  'slices', 'slice',
  'cans', 'can',
  'packages', 'package', 'packs', 'pack',
  'bunches', 'bunch',
  'heads', 'head',
  'sprigs', 'sprig',
  'sticks', 'stick',
  'pieces', 'piece'
];

// Build a single regex matching any token in UNIT_TOKENS. Sorted longest-first
// so 'tablespoons' matches before 'tbs', 'cups' before 'cup', etc. Built once
// at module load -- UNIT_TOKENS is a constant.
const UNIT_PATTERN = UNIT_TOKENS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

// Leading quantity chunk: optional 'a'/'an' article, OR <integer><optional-fraction-tail>
//   forms covered: '2', '1.5', '1/2', '2 1/2', 'a', 'an'
//   followed by an optional unit token (UNIT_PATTERN), followed by an optional 'of'.
// Anchored at start; one regex per call -- ReDoS-safe (bounded alternations, no nested quantifiers).
const QTY_RE = new RegExp(
  '^(?:' +
    '(?:a|an)' +                           // bare article
    '|' +
    '(?:\\d+(?:\\.\\d+)?(?:\\s+\\d+)?(?:\\s*\\/\\s*\\d+)?)' +  // 2 | 1.5 | 2 1/2 | 1/2
  ')' +
  '(?:\\s+(?:' + UNIT_PATTERN + '))?' +    // optional unit
  '(?:\\s+of)?' +                          // optional 'of'
  '\\s+',                                  // trailing space (forces at least one delimiter before the ingredient)
  'i'
);

/**
 * Normalize an ingredient string to a stable matching key.
 *
 * Order of operations (locked per CONTEXT D-13..D-16):
 *   (1) lowercase + initial trim
 *   (2) strip parentheticals (D-14) -- iterated for nested groups
 *   (3) strip trailing-comma tail (D-15) -- first comma wins
 *   (4) strip leading quantity/unit/of chunk (D-13)
 *   (5) collapse whitespace + final trim
 *
 * D-16: NO singular/plural stemming. 'clove' and 'cloves' stay distinct.
 *
 * Source-of-truth lives here (moved from lib/library.js per 03-REVISION-1
 * Approach A). lib/library.js imports + re-exports for back-compat. The move
 * unblocks lib/categorize.js#matchRawLibrary to call this normalizer without
 * importing library.js (which would violate the import-direction rule).
 *
 * @param {*} s
 * @returns {string} normalized key, '' for empty/whitespace/non-string input.
 */
function normalizeIngredientText(s) {
  if (typeof s !== 'string') return '';
  // (1) lowercase + initial trim
  let out = s.toLowerCase().trim();
  if (!out) return '';
  // (2) strip parentheticals (D-14): iterate until no match -- handles nested cases like 'a (b (c)) d'.
  // The bracket-class form '\([^()]*\)' is flat and ReDoS-safe; nested groups collapse across passes.
  let prev;
  do {
    prev = out;
    out = out.replace(/\([^()]*\)/g, ' ');
  } while (out !== prev);
  // (3) strip trailing-comma tail (D-15): first comma wins.
  const comma = out.indexOf(',');
  if (comma >= 0) out = out.slice(0, comma);
  // (4) strip leading quantity/unit/of chunk (D-13).
  out = out.replace(QTY_RE, '');
  // (5) collapse whitespace + final trim.
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function buildIndex(table) {
  const entries = [];
  for (const [category, keywords] of Object.entries(table)) {
    for (const kw of keywords) {
      entries.push({
        category,
        regex: new RegExp('\\b' + escapeRegex(kw.toLowerCase()) + '\\b', 'i'),
        length: kw.length
      });
    }
  }
  // Longest keyword wins.
  entries.sort((a, b) => b.length - a.length);
  return entries;
}

const RECIPE_INDEX = buildIndex(RECIPE_KEYWORDS);

const GROCERY_CATEGORIES = ['Produce', 'Meat', 'Dairy', 'Aisle', 'Frozen', 'Other'];

const GROCERY_KEYWORDS = {
  Produce: [
    'onion','onions','garlic','shallot','shallots','leek','leeks','scallion','scallions','tomato','tomatoes','potato','potatoes','sweet potato','sweet potatoes','yam','yams',
    'carrot','carrots','celery','bell pepper','bell peppers','jalapeno','jalapenos','habanero','habaneros','pepper','peppers',
    'broccoli','cauliflower','cabbage','kale','spinach','lettuce','arugula',
    'cucumber','zucchini','squash','eggplant','mushroom','mushrooms','asparagus','green bean','green beans','pea','peas',
    'corn','beet','beets','radish','radishes','turnip','turnips','parsnip','parsnips','fennel','artichoke','artichokes','brussels sprout','brussels sprouts','okra',
    'ginger','lemongrass','herbs','parsley','cilantro','basil','rosemary','thyme','mint',
    'lemon','lemons','lime','limes','orange','oranges','apple','apples','mango','mangoes','pineapple','banana','bananas','avocado','avocados','strawberry','strawberries','blueberry','blueberries'
  ],
  Meat: [
    'chicken','beef','pork','lamb','mutton','turkey','duck','goose','veal',
    'bacon','ham','sausage','sausages','prosciutto','salami','chorizo',
    'fish','salmon','tuna','cod','halibut','tilapia','trout','mackerel','sardine','sardines','anchovy','anchovies',
    'shrimp','shrimps','prawn','prawns','crab','crabs','lobster','scallop','scallops','squid','octopus','oyster','oysters','mussel','mussels','clam','clams'
  ],
  Dairy: [
    'milk','butter','cream','heavy cream','half and half','sour cream','yogurt',
    'cheese','cream cheese','parmesan','mozzarella','cheddar','feta','ricotta','goat cheese',
    'brie','swiss','provolone','gouda','egg','eggs'
  ],
  Aisle: [
    'rice','pasta','noodle','noodles','flour','bread','cereal','oats','oatmeal','crackers','cookies',
    'tortilla','tortillas','tomato sauce','tomato paste','pasta sauce','marinara',
    'salt','sugar','brown sugar','vanilla','baking powder','baking soda','yeast',
    'cornstarch','breadcrumb','panko',
    'olive oil','vegetable oil','sesame oil','coconut oil','canola oil','oil',
    'vinegar','balsamic','rice vinegar','apple cider vinegar',
    'soy sauce','fish sauce','oyster sauce','hoisin','worcestershire','tamari','miso',
    'broth','stock','bouillon','dashi','wine','sherry','mirin',
    'honey','maple syrup','agave','jam','jelly','peanut butter',
    'mustard','dijon','ketchup','mayonnaise','sriracha','tabasco','hot sauce','chili sauce',
    'cumin','coriander','paprika','turmeric','curry powder','chili powder',
    'cinnamon','nutmeg','clove','cloves','cardamom','allspice','oregano',
    'lentil','lentils','chickpea','chickpeas','black bean','kidney bean','pinto bean','garbanzo','canned',
    'beans',
    'tofu','tempeh',
    'tea','coffee','chocolate','cocoa'
  ],
  Frozen: [
    'frozen','ice cream','popsicle','frozen pizza','frozen vegetables','frozen peas',
    'frozen corn','frozen berries'
  ]
};

const GROCERY_INDEX = buildIndex(GROCERY_KEYWORDS);

// Discriminate between a raw state.library array and a pre-built library index.
// Both are arrays at runtime; index rows are objects with a `.regex` property
// (built by lib/library.js#buildLibraryIndex). A library array's elements are
// LibraryEntry objects without `.regex`. Empty array -> treat as no library.
//
// IMPORTANT: lib/categorize.js does NOT require lib/library.js (import-direction
// rule -- STATE.md). The raw-library form does an inline regex walk that mirrors
// buildLibraryIndex's shape without storing it -- using the now-module-local
// normalizeIngredientText (moved from library.js per 03-REVISION-1 Approach A)
// for byte-equivalent alias compilation. The hot path in lib/calc.js still
// passes a pre-built index from buildLibraryIndex (D-33 -- index built once
// per render).
function isPreBuiltLibraryIndex(arg) {
  return Array.isArray(arg) && arg.length > 0 && arg[0] && typeof arg[0] === 'object' && arg[0].regex instanceof RegExp;
}

// Inline alias-walk for the raw-library form. Mirrors lib/library.js#buildLibraryIndex
// shape without importing library.js (preserves the import-direction rule). Used
// only when the caller passes a raw state.library array; the hot path in
// lib/calc.js passes a pre-built index.
//
// Word-boundary regex on the lowercased alias; first-match-wins after sorting
// by alias-length DESC, curated DESC, arrayIndex ASC -- same comparator as
// lib/library.js. Returns the matched library entry or undefined.
function matchRawLibrary(library, text) {
  if (!Array.isArray(library) || library.length === 0) return undefined;
  if (typeof text !== 'string' || !text.trim()) return undefined;
  const rows = [];
  for (let arrayIndex = 0; arrayIndex < library.length; arrayIndex++) {
    const entry = library[arrayIndex];
    const aliases = (entry && Array.isArray(entry.aliases)) ? entry.aliases : [];
    for (const alias of aliases) {
      if (typeof alias !== 'string') continue;
      // 03-REVISION-1 BLOCKER fix: use the canonical normalizeIngredientText
      // (now module-local thanks to Plan 03-01's move) for byte-equivalent
      // alias-regex compilation with buildLibraryIndex. This closes the D-36
      // divergence between the raw-library and pre-built-index paths so SC#1
      // ('1 clove garlic' against alias '  GARLIC  ') works in BOTH forms.
      const normalized = normalizeIngredientText(alias);
      if (!normalized) continue;
      rows.push({
        regex: new RegExp('\\b' + escapeRegex(normalized) + '\\b', 'i'),
        length: normalized.length,
        curated: !!(entry && entry.curated),
        arrayIndex,
        entry
      });
    }
  }
  rows.sort((a, b) =>
    (b.length - a.length) ||
    (Number(b.curated) - Number(a.curated)) ||
    (a.arrayIndex - b.arrayIndex)
  );
  for (const row of rows) {
    if (row.regex.test(text)) return row.entry;
  }
  return undefined;
}

function matchCategory(index, text) {
  if (typeof text !== 'string' || !text.trim()) return 'Other';
  for (const entry of index) {
    if (entry.regex.test(text)) return entry.category;
  }
  return 'Other';
}

/**
 * Recipe-side category for an ingredient string.
 *
 * Optional second arg `libraryOrIndex`:
 *   - undefined / null / empty array -> heuristic-only (existing behavior).
 *   - pre-built index (rows with `.regex`) -> use directly.
 *   - raw state.library array -> inline-build the alias index.
 *
 * D-26: library hit returns entry.recipeCategory directly.
 * D-27: no further validation -- entry categories are validated at newLibraryEntry time.
 * D-28: library hit with category 'Other' returns 'Other' -- does NOT fall through.
 *
 * SC#5 backwards compat: single-arg call behaves byte-identically to today.
 */
function recipeCategoryOf(text, libraryOrIndex) {
  if (libraryOrIndex && Array.isArray(libraryOrIndex) && libraryOrIndex.length > 0) {
    let match;
    if (isPreBuiltLibraryIndex(libraryOrIndex)) {
      // Pre-built index path -- iterate rows in already-sorted order.
      if (typeof text === 'string' && text.trim()) {
        for (const row of libraryOrIndex) {
          if (row.regex.test(text)) { match = row.entry; break; }
        }
      }
    } else {
      // Raw library array -- inline-build then walk.
      match = matchRawLibrary(libraryOrIndex, text);
    }
    if (match && typeof match.recipeCategory === 'string') {
      return match.recipeCategory; // D-27 + D-28: even 'Other' wins over heuristic.
    }
    // No library hit -- fall through to heuristic (D-26).
  }
  return matchCategory(RECIPE_INDEX, text);
}

/**
 * Grocery-side category for a grocery item / ingredient string.
 * See recipeCategoryOf above for the libraryOrIndex contract; same rules apply
 * to entry.groceryCategory.
 */
function groceryCategoryOf(text, libraryOrIndex) {
  if (libraryOrIndex && Array.isArray(libraryOrIndex) && libraryOrIndex.length > 0) {
    let match;
    if (isPreBuiltLibraryIndex(libraryOrIndex)) {
      if (typeof text === 'string' && text.trim()) {
        for (const row of libraryOrIndex) {
          if (row.regex.test(text)) { match = row.entry; break; }
        }
      }
    } else {
      match = matchRawLibrary(libraryOrIndex, text);
    }
    if (match && typeof match.groceryCategory === 'string') {
      return match.groceryCategory;
    }
  }
  return matchCategory(GROCERY_INDEX, text);
}

module.exports = {
  recipeCategoryOf,
  groceryCategoryOf,
  RECIPE_CATEGORIES,
  GROCERY_CATEGORIES,
  normalizeIngredientText
};
