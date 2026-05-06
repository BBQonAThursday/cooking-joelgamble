const { test } = require('node:test');
const assert = require('node:assert');
const { newLibraryId, newLibraryEntry, normalizeIngredientText, aliasConflict } = require('../lib/library');

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
