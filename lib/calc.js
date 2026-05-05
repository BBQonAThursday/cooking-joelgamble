const { mondayOf } = require('./week');
const { recipeCategoryOf, RECIPE_CATEGORIES } = require('./categorize');

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
  return {
    grocery: items.map(g => ({ ...g })),
    hasGrocery: items.length > 0,
    checkedCount: items.filter(g => g.checked).length,
    activeTab: 'grocery'
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

module.exports = { buildView, sourceDomain, formatTotalTime, buildWeeklyView, buildGroceryView, buildHistoryView, decorateIngredients };
