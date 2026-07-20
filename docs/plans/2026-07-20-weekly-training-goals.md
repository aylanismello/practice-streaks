# Weekly movement counters

**Goal:** Add a separate “This week” card beneath daily practices without creating another fitness-tracking system.

## Product behavior

- Runs / run-walks: 0/2
- Full-body lifting: 0/2
- Long hike / hill walk: 0/1
- Monday–Sunday counting
- Tapping a row adds or removes today’s completion
- No green-week streak
- No duration, distance, sets, reps, workout notes, or extra history UI
- Weekly movement is excluded from daily cards, daily streaks, clean-sweep celebrations, and daily completion ratios

## Data model

No new table and no schema migration.

The three weekly activities are rows in the existing `practice_types` table. Completions use the existing `practice_log` table and `/api/log` route. The existing one-completion-per-practice-per-day behavior is sufficient for these simple weekly counts.

## Implementation

- `src/lib/weekly-practices.ts`: goal definitions, Monday–Sunday boundaries, and weekly aggregation
- `src/components/WeeklyPracticesCard.tsx`: separate weekly card
- `src/app/page.tsx`: daily/weekly filtering and card placement
- `test/weekly-practices.test.mjs`: target, boundary, filtering, and today-state tests
- `scripts/add-weekly-training-practices.sql`: repeatable seed for the three `practice_types` rows

## Verification

- Read back all three seeded rows through the app’s Supabase connection
- Run `node --test test/*.test.mjs`
- Run `npm run lint`
- Run `npm run build`
- Commit only the feature files, push `main`, and rely on the configured Vercel Git integration for deployment
