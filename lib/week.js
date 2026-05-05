function mondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ensureCurrentWeek(state, today) {
  const monday = mondayOf(today);
  if (!Array.isArray(state.weeks)) state.weeks = [];
  let week = state.weeks.find(w => w.weekStart === monday);
  if (!week) {
    week = { weekStart: monday, recipeIds: [], confirmed: false, modifiedAfterConfirm: false };
    state.weeks.push(week);
  }
  return week;
}

function tagRecipe(state, recipeId, today) {
  const recipes = Array.isArray(state.recipes) ? state.recipes : [];
  if (!recipes.some(r => r.id === recipeId)) {
    return { ok: false, reason: 'unknown recipe' };
  }
  const week = ensureCurrentWeek(state, today);
  const idx = week.recipeIds.indexOf(recipeId);
  let isTagged;
  if (idx >= 0) {
    week.recipeIds.splice(idx, 1);
    isTagged = false;
  } else {
    week.recipeIds.push(recipeId);
    isTagged = true;
  }
  if (week.confirmed) week.modifiedAfterConfirm = true;
  return { ok: true, isTagged };
}

module.exports = { mondayOf, ensureCurrentWeek, tagRecipe };
