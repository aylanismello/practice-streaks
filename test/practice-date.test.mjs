import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePracticeDate } from '../src/lib/dates.ts';

test('resolves an explicit date without changing it', () => {
  assert.equal(
    resolvePracticeDate({ date: '2026-05-24', timeZone: 'Asia/Shanghai' }, new Date('2026-05-25T06:46:00Z')),
    '2026-05-24'
  );
});

test('resolves missing date from caller timezone using 4am local boundary', () => {
  assert.equal(
    resolvePracticeDate({ timeZone: 'Asia/Shanghai' }, new Date('2026-05-25T06:46:00Z')),
    '2026-05-25'
  );
});

test('defaults missing date to LA fallback using 4am boundary', () => {
  assert.equal(
    resolvePracticeDate({}, new Date('2026-05-25T06:46:00Z')),
    '2026-05-24'
  );
});

test('accepts browserTimeZone alias from clients', () => {
  assert.equal(
    resolvePracticeDate({ browserTimeZone: 'Asia/Shanghai' }, new Date('2026-05-25T06:46:00Z')),
    '2026-05-25'
  );
});
