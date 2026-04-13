alter table if exists wot_log
  add column if not exists legacy_color text;

update wot_log
set legacy_color = color,
    color = case color
      when 'green' then 'green'
      when 'yellow' then 'yellow'
      when 'orange' then 'orange'
      when 'red' then 'red'
      else color
    end
where color in ('green', 'yellow', 'orange', 'red');

alter table wot_log
  drop constraint if exists wot_log_color_check;

alter table wot_log
  add constraint wot_log_color_check
  check (color in ('green', 'yellow_green', 'yellow', 'orange', 'red'));
