const { newGroceryId } = require('./grocery');

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

function confirmWeek(state, today) {
  const week = ensureCurrentWeek(state, today);
  if (week.recipeIds.length === 0) {
    return { ok: false, reason: 'no recipes tagged' };
  }
  const recipes = Array.isArray(state.recipes) ? state.recipes : [];
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  if (!Array.isArray(state.grocery)) state.grocery = [];
  const existingTexts = new Set(state.grocery.map(g => g.text));
  let added = 0;
  for (const id of week.recipeIds) {
    const r = recipesById.get(id);
    if (!r) continue;
    for (const text of (r.ingredients || [])) {
      if (typeof text !== 'string' || !text.trim()) continue;
      if (existingTexts.has(text)) continue;
      state.grocery.push({ id: newGroceryId(), text, checked: false });
      existingTexts.add(text);
      added++;
    }
  }
  week.confirmed = true;
  week.modifiedAfterConfirm = false;
  return { ok: true, addedCount: added };
}

function unconfirmWeek(state, today) {
  const week = ensureCurrentWeek(state, today);
  week.confirmed = false;
  week.modifiedAfterConfirm = false;
  return { ok: true };
}

module.exports = { mondayOf, ensureCurrentWeek, tagRecipe, confirmWeek, unconfirmWeek };
