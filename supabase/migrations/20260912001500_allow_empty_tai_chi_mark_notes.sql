alter table public.tai_chi_marks
  alter column note set default '';

alter table public.tai_chi_marks
  drop constraint if exists tai_chi_marks_note_check;

alter table public.tai_chi_marks
  add constraint tai_chi_marks_note_check
  check (char_length(note) <= 500);
