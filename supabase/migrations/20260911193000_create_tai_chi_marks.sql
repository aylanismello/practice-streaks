create table if not exists public.tai_chi_marks (
  id uuid primary key default gen_random_uuid(),
  form_id text not null check (form_id in ('yang24', 'chen18')),
  movement_number integer not null check (movement_number between 1 and 24),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  seconds integer not null check (seconds >= 0),
  note text not null check (char_length(note) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists tai_chi_marks_lesson_time_idx
  on public.tai_chi_marks (form_id, movement_number, video_id, seconds, created_at);

alter table public.tai_chi_marks enable row level security;
