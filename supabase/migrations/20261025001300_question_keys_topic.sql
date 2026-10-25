-- Clave normalizada para evitar preguntas duplicadas y metadato de tema.

alter table public.questions add column if not exists topic text;
alter table public.questions add column if not exists question_key text;

create or replace function public.set_question_key()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.question_key := btrim(regexp_replace(
    translate(
      lower(new.question),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
  return new;
end;
$$;

drop trigger if exists questions_set_question_key on public.questions;
create trigger questions_set_question_key
  before insert or update of question on public.questions
  for each row execute function public.set_question_key();

update public.questions
set question_key = btrim(regexp_replace(
  translate(
    lower(question),
    'áàäâãéèëêíìïîóòöôõúùüûñç',
    'aaaaaeeeeiiiiooooouuuunc'
  ),
  '[^a-z0-9]+',
  ' ',
  'g'
))
where question_key is null;

create unique index if not exists questions_question_key_unique
  on public.questions (question_key);

notify pgrst, 'reload schema';
