import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEKLY_PRACTICES,
  getMondayToSunday,
  summarizeWeeklyPractices,
} from '../src/lib/weekly-practices.ts';

test('weekly targets are two runs, two lifts, and one long hike', () => {
  assert.deepEqual(
    WEEKLY_PRACTICES.map(({ id, target }) => ({ id, target })),
    [
      { id: 'run', target: 2 },
      { id: 'lift', target: 2 },
      { id: 'long_hike', target: 1 },
    ]
  );
});

test('returns the Monday through Sunday containing the practice date', () => {
  assert.deepEqual(getMondayToSunday('2026-07-23'), [
    '2026-07-20',
    '2026-07-21',
    '2026-07-22',
    '2026-07-23',
    '2026-07-24',
    '2026-07-25',
    '2026-07-26',
  ]);
});

test('counts only logs inside the current Monday-Sunday week', () => {
  const summary = summarizeWeeklyPractices(
    [
      { practice_date: '2026-07-19', practice_id: 'run' },
      { practice_date: '2026-07-20', practice_id: 'run' },
      { practice_date: '2026-07-22', practice_id: 'lift' },
      { practice_date: '2026-07-23', practice_id: 'run' },
      { practice_date: '2026-07-25', practice_id: 'lift' },
      { practice_date: '2026-07-26', practice_id: 'long_hike' },
      { practice_date: '2026-07-27', practice_id: 'run' },
      { practice_date: '2026-07-24', practice_id: 'qigong' },
    ],
    '2026-07-23'
  );

  assert.equal(summary.run.count, 2);
  assert.equal(summary.lift.count, 2);
  assert.equal(summary.long_hike.count, 1);
  assert.deepEqual(summary.run.dates, ['2026-07-20', '2026-07-23']);
});

test('reports whether each weekly activity is already logged today', () => {
  const summary = summarizeWeeklyPractices(
    [
      { practice_date: '2026-07-23', practice_id: 'run' },
      { practice_date: '2026-07-22', practice_id: 'lift' },
    ],
    '2026-07-23'
  );

  assert.equal(summary.run.doneToday, true);
  assert.equal(summary.lift.doneToday, false);
  assert.equal(summary.long_hike.doneToday, false);
});
