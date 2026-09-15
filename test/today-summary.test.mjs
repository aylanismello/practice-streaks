import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFocusDuration } from '../src/lib/today-summary.ts';

test('formats focus minutes in the compact daily-summary style', () => {
  assert.equal(formatFocusDuration(1), '1m');
  assert.equal(formatFocusDuration(30), '30m');
  assert.equal(formatFocusDuration(60), '1hr');
  assert.equal(formatFocusDuration(90), '1hr30m');
  assert.equal(formatFocusDuration(125), '2hr5m');
});

test('normalizes empty and fractional totals', () => {
  assert.equal(formatFocusDuration(0), '0m');
  assert.equal(formatFocusDuration(-20), '0m');
  assert.equal(formatFocusDuration(30.9), '30m');
});
