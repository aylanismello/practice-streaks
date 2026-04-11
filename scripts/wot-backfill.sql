alter table if exists wot_log
  add column if not exists legacy_color text;

update wot_log
set legacy_color = color,
    color = case color
      when 'green' then 'green'
      when 'yellow' then 'orange'
      when 'red' then 'deep_red'
      else color
    end
where color in ('green', 'yellow', 'red');

alter table wot_log
  drop constraint if exists wot_log_color_check;

alter table wot_log
  add constraint wot_log_color_check
  check (color in ('green', 'yellow', 'orange', 'red', 'deep_red'));
