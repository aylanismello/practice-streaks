-- Add Self-Somatic as a Practice Streaks check-in item.
-- It sits immediately after Meditate and before Nighttime Routine.
-- Safe to rerun: rewrites the affected ordering deterministically.

begin;

insert into public.practice_types (id, name, emoji, sort_order)
values ('self_somatic', 'Self-Somatic', '🌀', 8)
on conflict (id) do update
set name = excluded.name,
    emoji = excluded.emoji;

update public.practice_types
set sort_order = case id
  when 'self_somatic' then 8
  when 'nighttime' then 9
  when 'journal' then 10
  else sort_order
end
where id in ('self_somatic', 'nighttime', 'journal');

commit;
