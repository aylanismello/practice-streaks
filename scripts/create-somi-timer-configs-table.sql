create table if not exists public.somi_timer_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists somi_timer_configs_touch_updated_at on public.somi_timer_configs;
create trigger somi_timer_configs_touch_updated_at
before update on public.somi_timer_configs
for each row
execute function public.touch_updated_at();
