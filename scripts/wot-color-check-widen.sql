-- Widen wot_log_color_check so score=4 ('yellow_green') inserts succeed.
-- The pre-existing constraint only allowed (green, yellow, orange, red, deep_red),
-- which silently blocked the 5-tier numeric scoring from writing score=4 rows.
-- Backwards-compatible: existing rows (red/orange/yellow/green) remain valid,
-- and 'deep_red' is preserved for any legacy data still present.
alter table public.wot_log
  drop constraint if exists wot_log_color_check;

alter table public.wot_log
  add constraint wot_log_color_check
  check (color in ('red', 'orange', 'yellow', 'yellow_green', 'green', 'deep_red'));
