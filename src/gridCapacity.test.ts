import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGridCapacity } from './gridCapacity.js';

test('keeps the gallery within the visible height for the small card size', () => {
  const result = computeGridCapacity({
    width: 1000,
    height: 520,
    itemWidth: 140,
    itemHeight: 150,
    gap: 18,
  });

  assert.equal(result, 18);
});

test('keeps the minimum 3-row gallery even when the container is short', () => {
  const result = computeGridCapacity({
    width: 700,
    height: 300,
    itemWidth: 140,
    itemHeight: 150,
    gap: 18,
  });

  assert.equal(result, 12);
});
