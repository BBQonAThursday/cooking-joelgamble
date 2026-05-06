const { test } = require('node:test');
const assert = require('node:assert');
const {
  newLibraryId, newLibraryEntry,
  normalizeIngredientText, findEntryByText, extractAndSeed,
  aliasConflict
} = require('../lib/library');

// --- newLibraryId ----------------------------------------------------------

test('newLibraryId returns strings matching /^lb_[0-9a-z]{8}$/', () => {
  for (let i = 0; i < 50; i++) {
    const id = newLibraryId();
    assert.match(id, /^lb_[0-9a-z]{8}$/);
  }
});

test('newLibraryId returns unique values across many calls', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) ids.add(newLibraryId());
  // base36^8 = ~2.8e12, 1000 draws should not collide in practice.
  assert.strictEqual(ids.size, 1000);
});

// --- newLibraryEntry -------------------------------------------------------

test('newLibraryEntry returns the canonical entry shape with all required fields', () => {
  const entry = newLibraryEntry({
    name: 'garlic',
    recipeCategory: 'Veg',
    groceryCategory: 'Produce',
    aliases: ['garlic', 'cloves of garlic'],
    curated: true
  });
  assert.match(entry.id, /^lb_[0-9a-z]{8}$/);
  assert.strictEqual(entry.name, 'garlic');
  assert.deepStrictEqual(entry.aliases, ['garlic', 'cloves of garlic']);
  assert.strictEqual(entry.recipeCategory, 'Veg');
  assert.strictEqual(entry.groceryCategory, 'Produce');
  assert.strictEqual(entry.curated, true);
  assert.match(entry.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('newLibraryEntry defaults aliases to [] when omitted', () => {
  const entry = newLibraryEntry({ name: 'salt', recipeCategory: 'Seasoning', groceryCategory: 'Aisle' });
  assert.deepStrictEqual(entry.aliases, []);
});

test('newLibraryEntry defaults curated to false when omitted', () => {
  const entry = newLibraryEntry({ name: 'salt', recipeCategory: 'Seasoning', groceryCategory: 'Aisle' });
  assert.strictEqual(entry.curated, false);
});

test('newLibraryEntry coerces curated to a boolean', () => {
  const truthy = newLibraryEntry({ name: 'a', recipeCategory: 'Veg', groceryCategory: 'Produce', curated: 'yes' });
  const falsy  = newLibraryEntry({ name: 'b', recipeCategory: 'Veg', groceryCategory: 'Produce', curated: 0 });
  assert.strictEqual(truthy.curated, true);
  assert.strictEqual(falsy.curated, false);
});

test('newLibraryEntry does NOT include a nutrition placeholder (D-08)', () => {
  const entry = newLibraryEntry({ name: 'a', recipeCategory: 'Veg', groceryCategory: 'Produce' });
  assert.strictEqual('nutrition' in entry, false);
});

test('newLibraryEntry sets a fresh ISO timestamp on each call', () => {
  const before = Date.now();
  const entry = newLibraryEntry({ name: 'a', recipeCategory: 'Veg', groceryCategory: 'Produce' });
  const after = Date.now();
  const t = Date.parse(entry.createdAt);
  assert.ok(t >= before && t <= after, 'createdAt should be within the test window');
});

// --- aliasConflict ---------------------------------------------------------

test('aliasConflict returns the conflicting entry when two entries share a normalized alias', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'olive oil', aliases: ['olive oil'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const conflict = aliasConflict(state, 'garlic');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_aaaaaaaa');
});

test('aliasConflict is case- and whitespace-insensitive (trim + toLowerCase only -- D-04)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'olive oil', aliases: ['olive oil'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.ok(aliasConflict(state, '  Olive Oil  '));
  assert.ok(aliasConflict(state, 'OLIVE OIL'));
});

test('aliasConflict returns falsy when no entry shares the alias', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.ok(!aliasConflict(state, 'red onion'));
});

test('aliasConflict returns falsy when the only matching entry is the excludingId (Phase 1 SC#3)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.ok(!aliasConflict(state, 'garlic', 'lb_aaaaaaaa'));
});

test('aliasConflict still finds a conflict in a DIFFERENT entry when excludingId is set', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'roasted garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  // Excluding 'aaaaaaaa' should still surface the duplicate alias on 'bbbbbbbb'.
  const conflict = aliasConflict(state, 'garlic', 'lb_aaaaaaaa');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_bbbbbbbb');
});

test('aliasConflict tolerates a state with no library array', () => {
  assert.ok(!aliasConflict({}, 'garlic'));
  assert.ok(!aliasConflict({ library: null }, 'garlic'));
  assert.ok(!aliasConflict({ library: 'nope' }, 'garlic'));
});

test('aliasConflict returns falsy for empty/whitespace alias input', () => {
  const state = { library: [{ id: 'lb_aaaaaaaa', name: 'a', aliases: ['a'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' }] };
  assert.ok(!aliasConflict(state, ''));
  assert.ok(!aliasConflict(state, '   '));
  assert.ok(!aliasConflict(state, null));
});

// --- normalizeIngredientText -----------------------------------------------

test('normalizeIngredientText returns "" for empty/whitespace/non-string input', () => {
  assert.strictEqual(normalizeIngredientText(''), '');
  assert.strictEqual(normalizeIngredientText('   '), '');
  assert.strictEqual(normalizeIngredientText(null), '');
  assert.strictEqual(normalizeIngredientText(undefined), '');
  assert.strictEqual(normalizeIngredientText(42), '');
});

test('normalizeIngredientText lowercases and trims (Order step 1)', () => {
  assert.strictEqual(normalizeIngredientText('  Garlic  '), 'garlic');
  assert.strictEqual(normalizeIngredientText('OLIVE OIL'), 'olive oil');
});

test('normalizeIngredientText strips parentheticals (D-14)', () => {
  assert.strictEqual(normalizeIngredientText('garlic (minced)'), 'garlic');
  assert.strictEqual(normalizeIngredientText('pasta (e.g. penne or rigatoni)'), 'pasta');
  // Nested groups: iterated paren strip handles them. After paren collapse the
  // string becomes 'a   d', and step (4) strips the leading article 'a' (UNIT_TOKENS-equivalent)
  // along with the whitespace, leaving 'd'. This is the documented behavior of the locked
  // operation order (paren-strip before quantity-strip); the synthetic case is intentionally
  // contrived to exercise nesting and is NOT a real ingredient string.
  assert.strictEqual(normalizeIngredientText('a (b (c)) d'), 'd');
});

test('normalizeIngredientText strips trailing-comma tail (D-15) -- first comma wins', () => {
  assert.strictEqual(normalizeIngredientText('garlic, minced'), 'garlic');
  assert.strictEqual(normalizeIngredientText('garlic, minced, optional'), 'garlic');
  // No comma -> unchanged.
  assert.strictEqual(normalizeIngredientText('garlic minced'), 'garlic minced');
});

test('normalizeIngredientText strips leading <number><fraction>? <unit>? <of>? (D-13)', () => {
  assert.strictEqual(normalizeIngredientText('2 cups of garlic'), 'garlic');
  assert.strictEqual(normalizeIngredientText('1/2 lb chicken'), 'chicken');
  assert.strictEqual(normalizeIngredientText('a pinch of salt'), 'salt');
  assert.strictEqual(normalizeIngredientText('an onion'), 'onion');
  assert.strictEqual(normalizeIngredientText('2 1/2 cups flour'), 'flour');
  assert.strictEqual(normalizeIngredientText('1.5 cups milk'), 'milk');
  assert.strictEqual(normalizeIngredientText('3 tbsp olive oil'), 'olive oil');
  assert.strictEqual(normalizeIngredientText('2 cloves garlic'), 'garlic');
});

test('normalizeIngredientText does NOT stem singular/plural (D-16)', () => {
  assert.strictEqual(normalizeIngredientText('clove'), 'clove');
  assert.strictEqual(normalizeIngredientText('cloves'), 'cloves');
  assert.strictEqual(normalizeIngredientText('tomato'), 'tomato');
  assert.strictEqual(normalizeIngredientText('tomatoes'), 'tomatoes');
});

test('normalizeIngredientText collapses whitespace + final trim', () => {
  assert.strictEqual(normalizeIngredientText('garlic    minced'), 'garlic minced');
  assert.strictEqual(normalizeIngredientText('  garlic  cloves  '), 'garlic cloves');
});

test('normalizeIngredientText runs the full pipeline in the locked order on a real recipe string', () => {
  // (1) lowercase, (2) paren strip, (3) comma cut, (4) quantity strip, (5) collapse.
  // '2 cups of Garlic Cloves (minced), drained'
  // -> '2 cups of garlic cloves (minced), drained'   (lowercase)
  // -> '2 cups of garlic cloves  , drained'          (paren strip)
  // -> '2 cups of garlic cloves'                     (comma cut)
  // -> 'garlic cloves'                               (quantity+unit+of strip)
  // -> 'garlic cloves'                               (whitespace collapse)
  assert.strictEqual(
    normalizeIngredientText('2 cups of Garlic Cloves (minced), drained'),
    normalizeIngredientText('garlic cloves')
  );
  assert.strictEqual(normalizeIngredientText('2 cups of Garlic Cloves (minced), drained'), 'garlic cloves');
});

test('normalizeIngredientText: SC#1 equivalence -- normalizeIngredientText("2 cups of Garlic Cloves (minced)") === normalizeIngredientText("garlic cloves")', () => {
  assert.strictEqual(
    normalizeIngredientText('2 cups of Garlic Cloves (minced)'),
    normalizeIngredientText('garlic cloves')
  );
  assert.strictEqual(normalizeIngredientText('2 cups of Garlic Cloves (minced)'), 'garlic cloves');
});

test('normalizeIngredientText: paren-then-quantity case "1 (14 oz) can tomatoes" -> "tomatoes"', () => {
  // Paren strip first -> '1  can tomatoes' -> quantity+unit strip eats '1 can'.
  assert.strictEqual(normalizeIngredientText('1 (14 oz) can tomatoes'), 'tomatoes');
});

test('normalizeIngredientText: messy real-world corpus (CONTEXT "Test corpus for messy inputs")', () => {
  // ~12 representative cases spanning the corpus the user asked us to build.
  assert.strictEqual(normalizeIngredientText('2 cloves garlic, minced'), 'garlic');
  assert.strictEqual(normalizeIngredientText('2 1/2 cups all-purpose flour, sifted'), 'all-purpose flour');
  assert.strictEqual(normalizeIngredientText('1 (14 oz) can diced tomatoes (drained)'), 'diced tomatoes');
  assert.strictEqual(normalizeIngredientText('1/4 tsp red pepper flakes'), 'red pepper flakes');
  assert.strictEqual(normalizeIngredientText('a pinch of kosher salt'), 'kosher salt');
  assert.strictEqual(normalizeIngredientText('1 lb boneless skinless chicken breast'), 'boneless skinless chicken breast');
  assert.strictEqual(normalizeIngredientText('3 tablespoons olive oil'), 'olive oil');
  assert.strictEqual(normalizeIngredientText('2 large eggs'), 'large eggs');                 // 'large' is not in UNIT_TOKENS -- preserved.
  assert.strictEqual(normalizeIngredientText('Salt and pepper to taste'), 'salt and pepper to taste'); // No leading quantity to strip.
  assert.strictEqual(normalizeIngredientText('1 cup grated parmesan, optional'), 'grated parmesan');
  assert.strictEqual(normalizeIngredientText('2 sprigs fresh thyme'), 'fresh thyme');
  assert.strictEqual(normalizeIngredientText('1 head broccoli, chopped'), 'broccoli');
});

// --- newLibraryEntry validation (WR-04, IN-01, IN-02 closure) --------------

test('newLibraryEntry throws on invalid recipeCategory (WR-04)', () => {
  assert.throws(
    () => newLibraryEntry({ name: 'x', recipeCategory: 'XYZ', groceryCategory: 'Produce' }),
    /recipeCategory/
  );
});

test('newLibraryEntry throws on invalid groceryCategory (WR-04)', () => {
  assert.throws(
    () => newLibraryEntry({ name: 'x', recipeCategory: 'Veg', groceryCategory: 'XYZ' }),
    /groceryCategory/
  );
});

test('newLibraryEntry throws on undefined / empty / non-string recipeCategory', () => {
  assert.throws(() => newLibraryEntry({ name: 'x', recipeCategory: undefined, groceryCategory: 'Produce' }), /recipeCategory/);
  assert.throws(() => newLibraryEntry({ name: 'x', recipeCategory: '',        groceryCategory: 'Produce' }), /recipeCategory/);
  assert.throws(() => newLibraryEntry({ name: 'x', recipeCategory: 42,        groceryCategory: 'Produce' }), /recipeCategory/);
});

test('newLibraryEntry throws on missing/whitespace name (IN-02)', () => {
  assert.throws(() => newLibraryEntry({}), /name is required/);
  assert.throws(() => newLibraryEntry({ recipeCategory: 'Veg', groceryCategory: 'Produce' }), /name is required/);
  assert.throws(() => newLibraryEntry({ name: '   ', recipeCategory: 'Veg', groceryCategory: 'Produce' }), /name is required/);
  assert.throws(() => newLibraryEntry({ name: 42, recipeCategory: 'Veg', groceryCategory: 'Produce' }), /name is required/);
});

test('newLibraryEntry trims the stored name (IN-02)', () => {
  const entry = newLibraryEntry({ name: '  garlic  ', recipeCategory: 'Veg', groceryCategory: 'Produce' });
  assert.strictEqual(entry.name, 'garlic');
});

test('newLibraryEntry defensively copies aliases (IN-01)', () => {
  const aliases = ['garlic'];
  const entry = newLibraryEntry({ name: 'garlic', recipeCategory: 'Veg', groceryCategory: 'Produce', aliases });
  aliases.push('cloves of garlic'); // Caller mutates THEIR array post-construction.
  assert.deepStrictEqual(entry.aliases, ['garlic']);  // Stored array is unaffected.
});

test('newLibraryEntry dedupes within-entry aliases by normalized key (WR-03 closure)', () => {
  const entry = newLibraryEntry({
    name: 'garlic',
    recipeCategory: 'Veg',
    groceryCategory: 'Produce',
    aliases: ['garlic', 'GARLIC', '  garlic  ', '2 cloves garlic']
  });
  // 'garlic', 'GARLIC', '  garlic  ' all normalize to 'garlic' -> first occurrence ('garlic') wins.
  // '2 cloves garlic' -- with cloves in UNIT_TOKENS, normalizes to 'garlic' too -- also collapsed.
  assert.strictEqual(entry.aliases.length, 1);
  assert.strictEqual(entry.aliases[0], 'garlic');
});

// --- aliasConflict messy-input cases (D-05 deferred -> Phase 2) ------------

test('aliasConflict normalizes the query through normalizeIngredientText -- D-13 quantity strip', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  // The query is a messy recipe string; the stored alias is the normalized root.
  const conflict = aliasConflict(state, '2 cloves garlic, minced');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_aaaaaaaa');
});

test('aliasConflict normalizes the stored alias too -- both sides go through the pipeline', () => {
  // A library entry with a not-yet-normalized alias still matches a clean query.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['2 cups Garlic Cloves (minced)'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const conflict = aliasConflict(state, 'garlic cloves');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_aaaaaaaa');
});

test('aliasConflict still distinguishes "garlic powder" from "garlic" after normalization', () => {
  // Normalization does not stem -- "garlic powder" and "garlic" stay distinct keys.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic',        aliases: ['garlic'],        recipeCategory: 'Veg',       groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'garlic powder', aliases: ['garlic powder'], recipeCategory: 'Seasoning', groceryCategory: 'Aisle',   curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  // Querying 'garlic' must NOT collide with 'garlic powder' -- the bag-of-words collapse
  // logic in extractAndSeed (Plan 3) is a SEPARATE concern; aliasConflict is exact-key.
  const conflict = aliasConflict(state, 'garlic');
  assert.ok(conflict);
  assert.strictEqual(conflict.id, 'lb_aaaaaaaa');
});

// --- findEntryByText -------------------------------------------------------

test('findEntryByText returns undefined for empty/whitespace/non-string text input', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(findEntryByText(state, ''), undefined);
  assert.strictEqual(findEntryByText(state, '   '), undefined);
  assert.strictEqual(findEntryByText(state, null), undefined);
  assert.strictEqual(findEntryByText(state, undefined), undefined);
  assert.strictEqual(findEntryByText(state, 42), undefined);
});

test('findEntryByText returns undefined when state has no library', () => {
  assert.strictEqual(findEntryByText({}, 'garlic'), undefined);
  assert.strictEqual(findEntryByText({ library: null }, 'garlic'), undefined);
  assert.strictEqual(findEntryByText({ library: 'nope' }, 'garlic'), undefined);
});

test('findEntryByText returns undefined when no alias matches', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(findEntryByText(state, 'xyzzy unknown ingredient'), undefined);
});

test('findEntryByText returns the matching entry (with id, MATCH-03)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const match = findEntryByText(state, '2 cloves garlic, minced');
  assert.ok(match);
  assert.strictEqual(match.id, 'lb_aaaaaaaa');
  assert.match(match.id, /^lb_[0-9a-z]{8}$/);
});

test('findEntryByText is case-insensitive against the raw input', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'olive oil', aliases: ['olive oil'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(findEntryByText(state, 'OLIVE OIL').id, 'lb_aaaaaaaa');
  assert.strictEqual(findEntryByText(state, '1 tbsp Olive Oil').id, 'lb_aaaaaaaa');
});

test('findEntryByText: longest alias wins (D-22)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'olive oil',              aliases: ['olive oil'],              recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'extra virgin olive oil', aliases: ['extra virgin olive oil'], recipeCategory: 'Flavor', groceryCategory: 'Aisle', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  // Both aliases match 'extra virgin olive oil'; the longer one wins.
  const match = findEntryByText(state, '1 tbsp extra virgin olive oil');
  assert.ok(match);
  assert.strictEqual(match.id, 'lb_bbbbbbbb');
});

test('findEntryByText: word-boundary regression -- alias "pea" does NOT match "peanut butter"', () => {
  // Mirrors the lib/categorize.js Phase 1 pea-prefix-bug regression.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'pea', aliases: ['pea'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(findEntryByText(state, 'peanut butter'), undefined);
  assert.strictEqual(findEntryByText(state, '1 tbsp peanut butter'), undefined);
  // Sanity: a standalone 'pea' token DOES still match (proves the regex isn't
  // broken in the other direction). The plan added a 'peas' check here originally
  // but \bpea\b will not match 'peas' either -- that case is covered in the
  // next test below.
  assert.ok(findEntryByText(state, 'a pea'));
  assert.strictEqual(findEntryByText(state, 'a pea').id, 'lb_aaaaaaaa');
});

test('findEntryByText: \\bpea\\b does NOT match "peas" either (no stemming, no prefix match)', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'pea', aliases: ['pea'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  // Confirms the bilateral \b\b regex is strict -- 'peas' is a different word.
  assert.strictEqual(findEntryByText(state, '1 cup peas'), undefined);
  // To match plurals, the user adds 'peas' as a separate alias on the same entry.
  state.library[0].aliases.push('peas');
  assert.strictEqual(findEntryByText(state, '1 cup peas').id, 'lb_aaaaaaaa');
});

test('findEntryByText: curated tiebreaker -- curated wins over uncurated on equal-length aliases (D-24)', () => {
  // Same alias 'garlic' on two entries (cross-entry conflict the Library tab will surface).
  // Both length 6; curated entry must win regardless of array order.
  const stateCuratedFirst = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic',          aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true,  createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'minced garlic',   aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const stateUncuratedFirst = {
    library: [
      { id: 'lb_bbbbbbbb', name: 'minced garlic',   aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_aaaaaaaa', name: 'garlic',          aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true,  createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(findEntryByText(stateCuratedFirst,   'garlic').id, 'lb_aaaaaaaa');
  assert.strictEqual(findEntryByText(stateUncuratedFirst, 'garlic').id, 'lb_aaaaaaaa');
});

test('findEntryByText: array-order tiebreaker on equal length + equal curation (D-24)', () => {
  // Both uncurated, both 'garlic' alias -- earlier array index wins.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic',          aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'minced garlic',   aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  assert.strictEqual(findEntryByText(state, 'garlic').id, 'lb_aaaaaaaa');
});

test('findEntryByText: skips entries with missing or non-array aliases without crashing', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'a' /* missing aliases */, recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'b', aliases: 'not-an-array', recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_cccccccc', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  // The third entry (with valid aliases) is the only one matchable.
  const match = findEntryByText(state, 'garlic');
  assert.ok(match);
  assert.strictEqual(match.id, 'lb_cccccccc');
});

test('findEntryByText: returns undefined when library is empty', () => {
  assert.strictEqual(findEntryByText({ library: [] }, 'garlic'), undefined);
});

// --- extractAndSeed --------------------------------------------------------

test('extractAndSeed returns { ok: true, added: [], aliasesAppended: [] } on empty input', () => {
  const state = { library: [] };
  assert.deepStrictEqual(extractAndSeed(state, []), { ok: true, added: [], aliasesAppended: [] });
  assert.deepStrictEqual(extractAndSeed(state, undefined), { ok: true, added: [], aliasesAppended: [] });
  assert.deepStrictEqual(extractAndSeed(state, null), { ok: true, added: [], aliasesAppended: [] });
});

test('extractAndSeed initializes state.library when missing', () => {
  const state = {};
  const result = extractAndSeed(state, ['salt']);
  assert.ok(Array.isArray(state.library));
  assert.strictEqual(state.library.length, 1);
  assert.strictEqual(result.added.length, 1);
});

test('extractAndSeed filters empty/whitespace/non-string ingredients', () => {
  const state = { library: [] };
  const result = extractAndSeed(state, ['', '   ', null, undefined, 42, 'salt']);
  assert.strictEqual(result.added.length, 1);
  assert.strictEqual(state.library.length, 1);
  assert.strictEqual(state.library[0].name, 'salt');
});

test('extractAndSeed seeds a new entry with heuristic categories (D-20 step 4)', () => {
  const state = { library: [] };
  const result = extractAndSeed(state, ['garlic']);
  assert.strictEqual(result.added.length, 1);
  const entry = result.added[0];
  assert.strictEqual(entry.name, 'garlic');
  assert.deepStrictEqual(entry.aliases, ['garlic']);
  assert.strictEqual(entry.recipeCategory, 'Veg');
  assert.strictEqual(entry.groceryCategory, 'Produce');
  assert.strictEqual(entry.curated, false);
});

test('extractAndSeed seeds an unknown ingredient with both categories "Other"', () => {
  const state = { library: [] };
  const result = extractAndSeed(state, ['xyzzy']);
  assert.strictEqual(result.added.length, 1);
  assert.strictEqual(result.added[0].recipeCategory, 'Other');
  assert.strictEqual(result.added[0].groceryCategory, 'Other');
});

test('extractAndSeed creates at most one entry per normalized root per call (SC#2)', () => {
  // CORE PHASE 2 TEST. The locked D-18 subset rule plus D-19 stemming produces
  // 2 entries from this 3-string corpus (NOT 3, NOT 1):
  //   - 'garlic cloves' + 'garlic clove' collapse via D-19 final-s strip (subset both ways).
  //   - 'minced garlic' has bag {garlic, minced}; vs staged {garlic, clove} neither set
  //     is a subset of the other -- so it does NOT collapse. This is intentional per D-18:
  //     'garlic powder' and 'garlic salt' must not collapse either.
  // The "spirit" of SC#2 ("at most one entry per normalized root") is satisfied here:
  // 'garlic cloves' and 'garlic clove' share a root and collapse; 'minced garlic' is a
  // different normalized root. The Library tab (Phase 5) is the manual-cleanup affordance
  // for any further consolidation the user wants.
  const state = { library: [] };
  const result = extractAndSeed(state, ['garlic cloves', 'garlic clove', 'minced garlic']);
  assert.strictEqual(result.added.length, 2);
  // The 'garlic cloves' / 'garlic clove' entry should carry both aliases.
  const garlicEntry = result.added.find(e => e.name === 'garlic cloves');
  assert.ok(garlicEntry);
  assert.strictEqual(garlicEntry.aliases.length, 2);
  assert.deepStrictEqual(garlicEntry.aliases.slice().sort(), ['garlic clove', 'garlic cloves'].sort());
  // The 'minced garlic' entry stands alone.
  const mincedEntry = result.added.find(e => e.name === 'minced garlic');
  assert.ok(mincedEntry);
  assert.deepStrictEqual(mincedEntry.aliases, ['minced garlic']);
});

test('extractAndSeed: subset rule positive case -- "garlic" subset of "garlic clove" collapses', () => {
  const state = { library: [] };
  const result = extractAndSeed(state, ['garlic', 'garlic clove']);
  // {garlic} subset {garlic, clove} -> collapse to one entry.
  assert.strictEqual(result.added.length, 1);
  assert.strictEqual(result.added[0].aliases.length, 2);
});

test('extractAndSeed: subset rule negative case -- "garlic powder" and "garlic salt" do NOT collapse (D-18)', () => {
  const state = { library: [] };
  const result = extractAndSeed(state, ['garlic powder', 'garlic salt']);
  // Neither {garlic, powder} subset {garlic, salt} nor vice versa -> no collapse.
  assert.strictEqual(result.added.length, 2);
});

test('extractAndSeed: D-19 stemming -- "garlic cloves" and "garlic clove" collapse via final-s strip', () => {
  // bagOfWords('garlic cloves') = {garlic, clove} (s-strip on cloves).
  // bagOfWords('garlic clove')  = {garlic, clove} (no s).
  // Subset both ways -> collapse.
  const state = { library: [] };
  const result = extractAndSeed(state, ['garlic cloves', 'garlic clove']);
  assert.strictEqual(result.added.length, 1);
  // Stored aliases retain D-16 (no stemming on stored output).
  const stored = result.added[0].aliases.slice().sort();
  assert.deepStrictEqual(stored, ['garlic clove', 'garlic cloves'].sort());
});

test('extractAndSeed: library-first wins -- existing curated entry absorbs new aliases (D-20 step 2)', () => {
  // The user has a curated 'garlic' entry. A re-saved recipe brings in '2 cloves garlic' and
  // 'minced garlic' -- both should auto-append to the existing entry, NOT seed new ones.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const result = extractAndSeed(state, ['2 cloves garlic', 'minced garlic']);
  assert.strictEqual(result.added.length, 0);
  // '2 cloves garlic' normalizes to 'garlic' (alias already present -- no append).
  // 'minced garlic' normalizes to 'minced garlic' (new alias -- one append).
  assert.strictEqual(result.aliasesAppended.length, 1);
  assert.strictEqual(result.aliasesAppended[0].entryId, 'lb_aaaaaaaa');
  assert.strictEqual(result.aliasesAppended[0].alias, 'minced garlic');
  // The curated flag is unchanged by auto-append (D-21 last sentence).
  assert.strictEqual(state.library[0].curated, true);
  // The entry's aliases now contain both 'garlic' and 'minced garlic'.
  assert.ok(state.library[0].aliases.includes('garlic'));
  assert.ok(state.library[0].aliases.includes('minced garlic'));
});

test('extractAndSeed: alias auto-append is gated by aliasConflict against OTHER entries (D-21)', () => {
  // Two entries. Entry A has alias 'garlic'. Entry B already owns the alias
  // 'minced garlic'. The candidate input is 'minced garlic'; longest-wins matches B
  // directly -- so the alias is already present and no append happens. Nothing should
  // be added to A either. This proves cross-entry duplicates are not introduced.
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic',        aliases: ['garlic'],        recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true,  createdAt: '2026-05-05T00:00:00.000Z' },
      { id: 'lb_bbbbbbbb', name: 'minced garlic', aliases: ['minced garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: false, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const result = extractAndSeed(state, ['minced garlic']);
  assert.strictEqual(result.added.length, 0);
  assert.strictEqual(result.aliasesAppended.length, 0);
  // Entry A's aliases unchanged; entry B's aliases unchanged.
  assert.deepStrictEqual(state.library[0].aliases, ['garlic']);
  assert.deepStrictEqual(state.library[1].aliases, ['minced garlic']);
});

test('extractAndSeed: aliasConflict gate prevents writing duplicate aliases on repeat calls (SC#4 / EXTR-04)', () => {
  // First call seeds 'salt'. Second call sees the seeded entry on the library-first step
  // and does nothing.
  const state = { library: [] };
  const first = extractAndSeed(state, ['salt']);
  assert.strictEqual(first.added.length, 1);
  assert.strictEqual(state.library.length, 1);

  const second = extractAndSeed(state, ['salt']);
  assert.strictEqual(second.added.length, 0);
  assert.strictEqual(second.aliasesAppended.length, 0);
  assert.strictEqual(state.library.length, 1); // No new entry.
  assert.strictEqual(state.library[0].aliases.length, 1); // No duplicate alias.
});

test('extractAndSeed: full repeat-call idempotency -- realistic recipe re-saved', () => {
  // EXTR-04 + EXTR-01 prep. Phase 4 will gate `storage.save()` on
  // `result.added.length || result.aliasesAppended.length`. Verify that on a
  // repeat call with the same ingredients, BOTH are zero.
  const state = { library: [] };
  const ingredients = ['2 cloves garlic, minced', '1 tbsp olive oil', 'salt', 'pepper to taste'];
  const first = extractAndSeed(state, ingredients);
  assert.ok(first.added.length > 0); // First call seeds entries.
  const beforeCount = state.library.length;

  const second = extractAndSeed(state, ingredients);
  assert.strictEqual(second.added.length, 0);
  assert.strictEqual(second.aliasesAppended.length, 0);
  assert.strictEqual(state.library.length, beforeCount); // No new entries.
});

test('extractAndSeed: return shape has exactly { ok, added, aliasesAppended } -- no extra fields', () => {
  const state = { library: [] };
  const result = extractAndSeed(state, ['salt']);
  assert.deepStrictEqual(Object.keys(result).sort(), ['added', 'aliasesAppended', 'ok']);
  assert.strictEqual(result.ok, true);
  assert.ok(Array.isArray(result.added));
  assert.ok(Array.isArray(result.aliasesAppended));
});

test('extractAndSeed: aliasesAppended records carry { entryId, alias }', () => {
  const state = {
    library: [
      { id: 'lb_aaaaaaaa', name: 'garlic', aliases: ['garlic'], recipeCategory: 'Veg', groceryCategory: 'Produce', curated: true, createdAt: '2026-05-05T00:00:00.000Z' }
    ]
  };
  const result = extractAndSeed(state, ['minced garlic']);
  assert.strictEqual(result.aliasesAppended.length, 1);
  const record = result.aliasesAppended[0];
  assert.strictEqual(record.entryId, 'lb_aaaaaaaa');
  assert.strictEqual(record.alias, 'minced garlic');
});
