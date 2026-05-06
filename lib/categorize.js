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
    'raisin','raisins','date','dates','cranberry','cranberries',
    'pepper','peppers'
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
    'carrot','carrots','celery','bell pepper','bell peppers','jalapeno','jalapenos','habanero','habaneros',
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
    'salt','pepper','sugar','brown sugar','vanilla','baking powder','baking soda','yeast',
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

function groceryCategoryOf(text) {
  return matchCategory(GROCERY_INDEX, text);
}

module.exports = {
  recipeCategoryOf,
  groceryCategoryOf,
  RECIPE_CATEGORIES,
  GROCERY_CATEGORIES
};
