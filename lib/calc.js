const { mondayOf } = require('./week');

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

module.exports = { buildView, sourceDomain, formatTotalTime };
