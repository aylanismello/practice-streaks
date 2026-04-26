alter table if exists wot_log
  add column if not exists score integer;

update wot_log
set score = case coalesce(color, legacy_color)
  when 'red' then 1
  when 'orange' then 2
  when 'yellow' then 3
  when 'yellow_green' then 4
  when 'green' then 5
  else 3
end
where score is null;

alter table wot_log
  alter column score set not null;

alter table wot_log
  drop constraint if exists wot_log_score_check;

alter table wot_log
  add constraint wot_log_score_check check (score between 1 and 5);
