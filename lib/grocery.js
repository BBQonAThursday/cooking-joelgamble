function newGroceryId() {
  // Simple non-cryptographic id; collision risk in practice is negligible
  // for a personal app and addItem returns a fresh one each call.
  return 'g_' + Math.random().toString(36).slice(2, 10);
}

function addItem(state, text) {
  const trimmed = (typeof text === 'string' ? text : '').trim().slice(0, 500);
  if (!trimmed) return { ok: false, reason: 'item required' };
  if (!Array.isArray(state.grocery)) state.grocery = [];
  const item = { id: newGroceryId(), text: trimmed, checked: false };
  state.grocery.push(item);
  return { ok: true, item };
}

function toggleChecked(state, id) {
  const item = (state.grocery || []).find(g => g.id === id);
  if (!item) return { ok: false, reason: 'unknown item' };
  item.checked = !item.checked;
  return { ok: true, item };
}

function removeItem(state, id) {
  if (!Array.isArray(state.grocery)) return { ok: false, reason: 'unknown item' };
  const idx = state.grocery.findIndex(g => g.id === id);
  if (idx < 0) return { ok: false, reason: 'unknown item' };
  const [removed] = state.grocery.splice(idx, 1);
  return { ok: true, item: removed };
}

function clearChecked(state) {
  if (!Array.isArray(state.grocery)) return { clearedCount: 0 };
  const before = state.grocery.length;
  state.grocery = state.grocery.filter(g => !g.checked);
  return { clearedCount: before - state.grocery.length };
}

module.exports = { newGroceryId, addItem, toggleChecked, removeItem, clearChecked };
