const { test } = require('node:test');
const assert = require('node:assert');
const { mondayOf } = require('../lib/week');

test('mondayOf returns the same date when given a Monday', () => {
  // 2026-05-04 is a Monday
  assert.strictEqual(mondayOf(new Date(2026, 4, 4)), '2026-05-04');
});

test('mondayOf returns the prior Monday when given a Tuesday', () => {
  assert.strictEqual(mondayOf(new Date(2026, 4, 5)), '2026-05-04');
});

test('mondayOf returns the prior Monday when given a Sunday', () => {
  // 2026-05-10 is a Sunday → Mon = 2026-05-04
  assert.strictEqual(mondayOf(new Date(2026, 4, 10)), '2026-05-04');
});

test('mondayOf strips time-of-day', () => {
  assert.strictEqual(mondayOf(new Date(2026, 4, 5, 23, 59, 59)), '2026-05-04');
});

test('mondayOf zero-pads months and days', () => {
  // 2026-01-04 is a Sunday → Mon = 2025-12-29
  assert.strictEqual(mondayOf(new Date(2026, 0, 4)), '2025-12-29');
});

test('mondayOf works across DST transitions (US spring-forward)', () => {
  // 2026-03-08 is a Sunday and is the US DST start in 2026 → Mon = 2026-03-02
  assert.strictEqual(mondayOf(new Date(2026, 2, 8)), '2026-03-02');
});

const { ensureCurrentWeek } = require('../lib/week');

test('ensureCurrentWeek creates an empty week when none exists', () => {
  const state = { recipes: [], weeks: [], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.strictEqual(week.weekStart, '2026-05-04');
  assert.deepStrictEqual(week.recipeIds, []);
  assert.strictEqual(week.confirmed, false);
  assert.strictEqual(week.modifiedAfterConfirm, false);
  assert.strictEqual(state.weeks.length, 1);
  assert.strictEqual(state.weeks[0], week);
});

test('ensureCurrentWeek returns the existing active week', () => {
  const existing = { weekStart: '2026-05-04', recipeIds: ['abc'], confirmed: true, modifiedAfterConfirm: false };
  const state = { recipes: [], weeks: [existing], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 7));
  assert.strictEqual(week, existing);
  assert.strictEqual(state.weeks.length, 1);
});

test('ensureCurrentWeek leaves prior weeks alone', () => {
  const past = { weekStart: '2026-04-27', recipeIds: ['x'], confirmed: true, modifiedAfterConfirm: false };
  const state = { recipes: [], weeks: [past], grocery: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.notStrictEqual(week, past);
  assert.strictEqual(state.weeks.length, 2);
  assert.strictEqual(state.weeks[0], past);
  assert.strictEqual(week.weekStart, '2026-05-04');
});

test('ensureCurrentWeek tolerates missing weeks array', () => {
  const state = { recipes: [] };
  const week = ensureCurrentWeek(state, new Date(2026, 4, 5));
  assert.ok(Array.isArray(state.weeks));
  assert.strictEqual(state.weeks[0], week);
});
