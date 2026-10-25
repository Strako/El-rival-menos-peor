-- Modo Relámpago: esquema, tablas y permisos.
-- La sincronización sigue usando Broadcast + polling.

alter table public.rooms drop constraint rooms_mode_check;
alter table public.rooms add constraint rooms_mode_check
  check (mode in ('classic', 'elimination', 'race')) not valid;
alter table public.rooms validate constraint rooms_mode_check;

alter table public.games drop constraint games_mode_check;
alter table public.games add constraint games_mode_check
  check (mode in ('classic', 'elimination', 'race')) not valid;
alter table public.games validate constraint games_mode_check;

-- Respuesta incorrecta en Relámpago: -100. Se permiten puntajes negativos.
alter table public.game_players drop constraint game_players_score_check;
alter table public.game_players add constraint game_players_score_check
  check (score >= -1000000) not valid;
alter table public.game_players validate constraint game_players_score_check;

create table public.game_race_questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  question_number integer not null check (question_number between 1 and 30),
  question_id uuid not null references public.questions(id) on delete restrict,
  option_order smallint[] not null
    check (array_length(option_order, 1) = 4 and option_order <@ array[0, 1, 2, 3]::smallint[]),
  status text not null default 'pending'
    check (status in ('pending', 'open', 'answered', 'expired')),
  opened_at timestamptz,
  deadline_at timestamptz,
  answered_by uuid references public.players(id) on delete set null,
  answered_at timestamptz,
  unique (game_id, question_number),
  unique (game_id, question_id)
);

create index game_race_questions_game_idx
  on public.game_race_questions (game_id, question_number);
create index game_race_questions_status_idx
  on public.game_race_questions (game_id, status);

-- Una sola respuesta por pregunta: garantiza al primero en contestar.
create table public.race_answers (
  id uuid primary key default gen_random_uuid(),
  race_question_id uuid not null unique
    references public.game_race_questions(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  selected_index smallint not null check (selected_index between 0 and 3),
  is_correct boolean not null,
  points_delta integer not null,
  response_ms integer not null check (response_ms >= 0),
  answered_at timestamptz not null default now()
);

create index race_answers_game_idx on public.race_answers (game_id);
create index race_answers_player_idx on public.race_answers (player_id);

alter table public.game_race_questions enable row level security;
alter table public.race_answers enable row level security;

drop policy if exists deny_all on public.game_race_questions;
create policy deny_all on public.game_race_questions
  for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_all on public.race_answers;
create policy deny_all on public.race_answers
  for all to anon, authenticated using (false) with check (false);

revoke all on public.game_race_questions from public, anon, authenticated;
revoke all on public.race_answers from public, anon, authenticated;
grant all on public.game_race_questions to service_role;
grant all on public.race_answers to service_role;

notify pgrst, 'reload schema';
