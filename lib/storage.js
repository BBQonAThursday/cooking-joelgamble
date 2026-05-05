const fs = require('node:fs');
const path = require('node:path');

function defaultState() {
  return { recipes: [] };
}

function migrate(raw) {
  const base = defaultState();
  const merged = { ...base, ...(raw || {}) };
  if (!Array.isArray(merged.recipes)) merged.recipes = [];
  return merged;
}

let state = null;

function getDataDir() {
  return process.env.RECIPE_BOX_DATA_DIR || path.join(process.cwd(), 'data');
}
function getStateFile() { return path.join(getDataDir(), 'state.json'); }
function getTmpFile()   { return path.join(getDataDir(), 'state.json.tmp'); }

function persist() {
  if (!state) return;
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getTmpFile(), JSON.stringify(state, null, 2));
  fs.renameSync(getTmpFile(), getStateFile());
}

function load() {
  if (state) return state;
  const dir = getDataDir();
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(getStateFile())) {
      const raw = JSON.parse(fs.readFileSync(getStateFile(), 'utf8'));
      state = migrate(raw);
      persist();
    } else {
      state = defaultState();
      persist();
    }
  } catch (err) {
    console.warn('Could not load state, using defaults:', err.message);
    state = defaultState();
  }
  return state;
}

function get()      { return load(); }
function save()     { persist(); }
function replace(next) { load(); state = migrate(next || {}); persist(); return state; }
function reset()    { load(); state = defaultState(); persist(); return state; }
function _resetForTest() { state = null; }

module.exports = {
  get, save, replace, reset,
  defaultState, migrateForTest: migrate, _resetForTest
};
