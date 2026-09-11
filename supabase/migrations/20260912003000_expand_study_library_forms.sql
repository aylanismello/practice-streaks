alter table public.tai_chi_marks
  drop constraint if exists tai_chi_marks_form_id_check;

alter table public.tai_chi_marks
  add constraint tai_chi_marks_form_id_check
  check (form_id in (
    'yang24',
    'chen18',
    'taichi10',
    'six_healing_sounds',
    'eight_brocades'
  ));
