insert into public.practice_types (id, name, emoji, sort_order)
values ('journal', 'Journal', '📓', 99)
on conflict (id) do update
set name = excluded.name,
    emoji = excluded.emoji,
    sort_order = excluded.sort_order;
