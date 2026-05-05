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
