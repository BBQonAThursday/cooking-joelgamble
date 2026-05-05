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
