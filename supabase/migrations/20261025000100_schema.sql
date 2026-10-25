-- Esquema base de "El Rival Más Débil"
-- Fase 2: tablas, índices, helpers y triggers de sincronización.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Jugadores
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(btrim(nickname)) between 2 and 20),
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Salas
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_player_id uuid not null references public.players(id) on delete restrict,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  mode text not null default 'classic' check (mode in ('classic', 'elimination')),
  max_rounds integer not null default 5 check (max_rounds between 1 and 30),
  current_game_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Miembros de una sala
-- ---------------------------------------------------------------------------
create table public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  nickname text not null,
  seat integer not null check (seat >= 0),
  status text not null default 'in_room' check (status in ('in_room', 'left')),
  joined_at timestamptz not null default now(),
  primary key (room_id, player_id),
  unique (room_id, seat)
);

create unique index room_players_room_nickname_key
  on public.room_players (room_id, lower(nickname));

create index room_players_player_idx on public.room_players (player_id, status);

-- ---------------------------------------------------------------------------
-- Partidas
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_number integer not null check (game_number >= 1),
  mode text not null check (mode in ('classic', 'elimination')),
  max_rounds integer not null check (max_rounds between 1 and 30),
  status text not null default 'playing' check (status in ('playing', 'finished')),
  phase text not null default 'question'
    check (phase in ('question', 'reveal', 'voting', 'vote_result', 'results')),
  current_round integer not null default 1 check (current_round >= 1),
  current_player_id uuid references public.players(id) on delete set null,
  reveal_until timestamptz,
  winner_player_id uuid references public.players(id) on delete set null,
  last_eliminated_player_id uuid references public.players(id) on delete set null,
  last_vote_result jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (room_id, game_number)
);

create index games_room_idx on public.games (room_id, status, game_number desc);

alter table public.rooms
  add constraint rooms_current_game_fk
  foreign key (current_game_id) references public.games(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Participantes de una partida
-- ---------------------------------------------------------------------------
create table public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  nickname text not null,
  seat integer not null check (seat >= 0),
  score integer not null default 0 check (score >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  total_response_ms bigint not null default 0 check (total_response_ms >= 0),
  status text not null default 'active' check (status in ('active', 'eliminated', 'left')),
  eliminated_round integer,
  final_rank integer,
  is_winner boolean not null default false,
  primary key (game_id, player_id),
  unique (game_id, seat)
);

create index game_players_active_idx on public.game_players (game_id, status);

-- ---------------------------------------------------------------------------
-- Preguntas
-- ---------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  category text not null check (category in ('general', 'videogames', 'series_90s')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  question text not null check (char_length(question) between 5 and 500),
  options jsonb not null
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index questions_category_difficulty_idx
  on public.questions (category, difficulty)
  where is_active;

-- ---------------------------------------------------------------------------
-- Preguntas repartidas en una partida
-- ---------------------------------------------------------------------------
create table public.game_questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  turn_index integer not null check (turn_index >= 0),
  player_id uuid not null references public.players(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  option_order smallint[] not null
    check (array_length(option_order, 1) = 4 and option_order <@ array[0, 1, 2, 3]::smallint[]),
  status text not null default 'pending' check (status in ('pending', 'answered', 'skipped')),
  served_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (game_id, round_number, turn_index),
  unique (game_id, player_id, round_number)
);

create index game_questions_game_round_idx
  on public.game_questions (game_id, round_number, status, turn_index);

-- ---------------------------------------------------------------------------
-- Respuestas
-- ---------------------------------------------------------------------------
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  game_question_id uuid not null unique
    references public.game_questions(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round_number integer not null,
  selected_index smallint check (selected_index between 0 and 3),
  is_correct boolean not null default false,
  points integer not null default 0 check (points >= 0),
  response_ms integer not null default 0 check (response_ms >= 0),
  answered_at timestamptz not null default now()
);

create index answers_game_idx on public.answers (game_id, round_number);

-- ---------------------------------------------------------------------------
-- Votos de eliminación
-- ---------------------------------------------------------------------------
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  voter_player_id uuid not null references public.players(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, round_number, voter_player_id),
  check (voter_player_id <> target_player_id)
);

create index votes_game_round_idx on public.votes (game_id, round_number);

-- ---------------------------------------------------------------------------
-- Señal de sincronización para Realtime
-- ---------------------------------------------------------------------------
create table public.room_sync (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.bump_room_sync(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_room_id is null then
    return;
  end if;
  if not exists (select 1 from rooms where id = p_room_id) then
    return;
  end if;
  insert into room_sync (room_id, version, updated_at)
  values (p_room_id, 1, now())
  on conflict (room_id) do update
    set version = room_sync.version + 1,
        updated_at = now();
end;
$$;

create or replace function public.bump_room_sync_from_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    return null;
  end if;
  perform bump_room_sync(new.id);
  return null;
end;
$$;

create or replace function public.bump_room_sync_from_room_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform bump_room_sync(coalesce(new.room_id, old.room_id));
  return null;
end;
$$;

create or replace function public.bump_room_sync_from_game()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id
  from games
  where id = coalesce(new.game_id, old.game_id);
  perform bump_room_sync(v_room_id);
  return null;
end;
$$;

create or replace function public.bump_room_sync_from_game_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform bump_room_sync(coalesce(new.room_id, old.room_id));
  return null;
end;
$$;

create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i integer;
  v_exists boolean;
begin
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
    end loop;
    select exists(select 1 from rooms where code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger rooms_touch_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

create trigger rooms_bump_sync
  after insert or update on public.rooms
  for each row execute function public.bump_room_sync_from_room();

create trigger room_players_bump_sync
  after insert or update or delete on public.room_players
  for each row execute function public.bump_room_sync_from_room_player();

create trigger games_bump_sync
  after insert or update on public.games
  for each row execute function public.bump_room_sync_from_game_row();

create trigger game_players_bump_sync
  after insert or update or delete on public.game_players
  for each row execute function public.bump_room_sync_from_game();

create trigger game_questions_bump_sync
  after insert or update or delete on public.game_questions
  for each row execute function public.bump_room_sync_from_game();

create trigger answers_bump_sync
  after insert or update or delete on public.answers
  for each row execute function public.bump_room_sync_from_game();

create trigger votes_bump_sync
  after insert or update or delete on public.votes
  for each row execute function public.bump_room_sync_from_game();
