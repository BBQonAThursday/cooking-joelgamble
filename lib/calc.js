const { mondayOf } = require('./week');
const { recipeCategoryOf, groceryCategoryOf, RECIPE_CATEGORIES, GROCERY_CATEGORIES } = require('./categorize');
const { buildLibraryIndex, findEntryInIndex } = require('./library');

function sourceDomain(url) {
  if (typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatTotalTime(min) {
  if (!Number.isFinite(min) || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function buildView(state, today) {
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const sorted = recipes.slice().sort((a, b) =>
    (b.addedAt || '').localeCompare(a.addedAt || '')
  );
  const taggedIds = today
    ? new Set(((state && state.weeks) || [])
        .find(w => w.weekStart === mondayOf(today))?.recipeIds || [])
    : new Set();
  const decorated = sorted.map(r => ({
    ...r,
    sourceDomain: sourceDomain(r.sourceUrl),
    totalTimeLabel: formatTotalTime(r.totalMinutes),
    isTagged: taggedIds.has(r.id)
  }));
  return {
    recipes: decorated,
    hasRecipes: decorated.length > 0,
    activeTab: 'recipes'
  };
}

function buildWeeklyView(state, today) {
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const monday = mondayOf(today);
  const week = ((state && state.weeks) || []).find(w => w.weekStart === monday)
    || { weekStart: monday, recipeIds: [], confirmed: false, modifiedAfterConfirm: false };
  const decorated = week.recipeIds
    .map(id => recipesById.get(id))
    .filter(Boolean)
    .map(r => ({
      ...r,
      sourceDomain: sourceDomain(r.sourceUrl),
      totalTimeLabel: formatTotalTime(r.totalMinutes),
      isTagged: true
    }));
  const existingTexts = new Set(((state && state.grocery) || []).map(g => g.text));
  let pendingCount = 0;
  for (const r of decorated) {
    for (const text of (r.ingredients || [])) {
      if (typeof text !== 'string' || !text.trim()) continue;
      if (existingTexts.has(text)) continue;
      pendingCount++;
      existingTexts.add(text);
    }
  }
  return {
    week,
    weekRecipes: decorated,
    weekRecipeCount: decorated.length,
    pendingIngredientCount: pendingCount,
    hasRecipes: decorated.length > 0,
    activeTab: 'this-week'
  };
}

function buildGroceryView(state) {
  const items = Array.isArray(state && state.grocery) ? state.grocery : [];
  const unchecked = items.filter(g => !g.checked);
  const checked = items.filter(g => g.checked);

  // D-33: build the library index ONCE per render. D-34 defensive guard --
  // empty / missing / non-array library skips the build and falls through to
  // the heuristic-only path (behavior identical to pre-Phase-3).
  const libraryIndex = (state && Array.isArray(state.library) && state.library.length > 0)
    ? buildLibraryIndex(state.library)
    : null;

  const buckets = new Map(GROCERY_CATEGORIES.map(c => [c, []]));
  for (const item of unchecked) {
    // D-31 / D-32: attach libraryEntryId per item (null on no match).
    const match = libraryIndex ? findEntryInIndex(libraryIndex, item.text) : undefined;
    const libraryEntryId = match ? match.id : null;
    // Library-aware categorize: pass the index when present, undefined otherwise.
    const category = libraryIndex
      ? groceryCategoryOf(item.text, libraryIndex)
      : groceryCategoryOf(item.text);
    buckets.get(category).push({ ...item, libraryEntryId });
  }
  const categorizedGroups = [];
  for (const cat of GROCERY_CATEGORIES) {
    const groupItems = buckets.get(cat);
    if (groupItems.length > 0) categorizedGroups.push({ category: cat, items: groupItems });
  }

  // D-32: closed (checked) items also carry libraryEntryId so the Phase 6 FIX
  // affordance can render against checked items too.
  const closedItems = checked.map(g => {
    const match = libraryIndex ? findEntryInIndex(libraryIndex, g.text) : undefined;
    const libraryEntryId = match ? match.id : null;
    return { ...g, libraryEntryId };
  });

  return {
    categorizedGroups,
    closedItems,
    hasGrocery: items.length > 0,
    hasCategorized: unchecked.length > 0,
    hasClosed: checked.length > 0,
    checkedCount: checked.length,
    activeTab: 'grocery'
  };
}

function buildLibraryView(state, { q = '', filter = 'All' } = {}) {
  const library = Array.isArray(state && state.library) ? state.library : [];
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];

  // D-66: build recipe-count map by walking recipes once per render.
  // Build library index once for findEntryInIndex lookup.
  const libraryIndex = library.length > 0 ? buildLibraryIndex(library) : null;
  const recipeCountMap = new Map(library.map(e => [e.id, 0]));
  if (libraryIndex) {
    for (const recipe of recipes) {
      const seen = new Set(); // avoid counting the same entry twice per recipe
      for (const text of (recipe.ingredients || [])) {
        if (typeof text !== 'string') continue;
        const match = findEntryInIndex(libraryIndex, text);
        if (match && !seen.has(match.id)) {
          recipeCountMap.set(match.id, (recipeCountMap.get(match.id) || 0) + 1);
          seen.add(match.id);
        }
      }
    }
  }

  // D-55: alphabetical sort by name (locale-aware)
  const sorted = library.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Apply filter — D-56: combines with search via AND
  let visible = sorted;
  if (filter === 'Uncurated') visible = visible.filter(e => !e.curated);
  if (filter === 'Unused')    visible = visible.filter(e => (recipeCountMap.get(e.id) || 0) === 0);

  // Apply search (case-insensitive substring on name OR aliases)
  if (q) {
    const term = q.toLowerCase();
    visible = visible.filter(e =>
      (e.name || '').toLowerCase().includes(term) ||
      (e.aliases || []).some(a => a.toLowerCase().includes(term))
    );
  }

  // Decorate entries for template
  const entries = visible.map(e => {
    const count = recipeCountMap.get(e.id) || 0;
    return {
      id: e.id,
      name: e.name,
      aliases: e.aliases || [],
      aliasesDisplay: (e.aliases || []).join(', '),
      recipeCategory: e.recipeCategory,
      groceryCategory: e.groceryCategory,
      curated: !!e.curated,
      recipeCount: count,
      unused: count === 0,
      deleteConfirm: count === 0
        ? `Delete "${e.name}"? This entry is unused.`
        : `Delete "${e.name}"? Used in ${count} recipe${count === 1 ? '' : 's'}. Categorization will fall back to the heuristic.`
    };
  });

  // unusedCount is computed over the full library (not visible slice) so the footer
  // always reflects the total number of unused entries regardless of active filter.
  const unusedCount = library.filter(e => (recipeCountMap.get(e.id) || 0) === 0).length;

  return {
    entries,
    hasEntries: entries.length > 0,
    unusedCount,
    totalCount: library.length,
    q,
    filter,
    activeTab: 'library',
    RECIPE_CATEGORIES,
    GROCERY_CATEGORIES
  };
}

function buildHistoryView(state, today) {
  const monday = mondayOf(today);
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const past = ((state && state.weeks) || [])
    .filter(w => w.weekStart < monday)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map(w => ({
      weekStart: w.weekStart,
      confirmed: !!w.confirmed,
      recipes: (w.recipeIds || [])
        .map(id => recipesById.get(id))
        .filter(Boolean)
        .map(r => ({ id: r.id, title: r.title }))
    }));
  return {
    pastWeeks: past,
    hasHistory: past.length > 0,
    activeTab: 'history'
  };
}

function decorateIngredients(ingredients, library) {
  // D-33: build the library index ONCE per call. D-34 defensive guard.
  const libraryIndex = (Array.isArray(library) && library.length > 0)
    ? buildLibraryIndex(library)
    : null;

  const buckets = new Map(RECIPE_CATEGORIES.map(c => [c, []]));
  for (const text of (ingredients || [])) {
    if (typeof text !== 'string' || !text.trim()) continue;
    // D-31: items are now { text, libraryEntryId } objects, NOT bare strings.
    // libraryEntryId is null when library is missing / empty / no match (D-31 contract).
    const match = libraryIndex ? findEntryInIndex(libraryIndex, text) : undefined;
    const libraryEntryId = match ? match.id : null;
    const category = libraryIndex
      ? recipeCategoryOf(text, libraryIndex)
      : recipeCategoryOf(text);
    buckets.get(category).push({ text, libraryEntryId });
  }
  const groups = [];
  for (const cat of RECIPE_CATEGORIES) {
    const items = buckets.get(cat);
    if (items.length > 0) groups.push({ category: cat, items });
  }
  return groups;
}

module.exports = { buildView, sourceDomain, formatTotalTime, buildWeeklyView, buildGroceryView, buildHistoryView, decorateIngredients, buildLibraryView };
