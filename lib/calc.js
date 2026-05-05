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

function buildView(state) {
  const recipes = Array.isArray(state && state.recipes) ? state.recipes : [];
  const sorted = recipes.slice().sort((a, b) =>
    (b.addedAt || '').localeCompare(a.addedAt || '')
  );
  const decorated = sorted.map(r => ({
    ...r,
    sourceDomain: sourceDomain(r.sourceUrl),
    totalTimeLabel: formatTotalTime(r.totalMinutes)
  }));
  return {
    recipes: decorated,
    hasRecipes: decorated.length > 0
  };
}

module.exports = { buildView, sourceDomain, formatTotalTime };
