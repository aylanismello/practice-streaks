-- Add weekly movement counters to the existing practice log system.
-- No new table: each completion remains one practice_log row per date/type.

begin;

insert into public.practice_types (id, name, emoji, sort_order)
values
  ('run', 'Runs / Run-walks', '🏃', 20),
  ('lift', 'Full-body lifting', '🏋️', 21),
  ('long_hike', 'Long hike / hill walk', '🥾', 22)
on conflict (id) do update
set name = excluded.name,
    emoji = excluded.emoji,
    sort_order = excluded.sort_order;

commit;
