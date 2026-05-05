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

module.exports = { newGroceryId, addItem };
