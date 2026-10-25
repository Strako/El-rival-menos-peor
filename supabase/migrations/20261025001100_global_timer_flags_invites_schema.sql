-- Timer global de 10 s, banderas por IP, invitaciones y unicidad de preguntas.

alter table public.players
  add column if not exists country_code text not null default 'UN';

alter table public.players
  add constraint players_country_code_check
  check (country_code ~ '^[A-Z]{2}$') not valid;
alter table public.players validate constraint players_country_code_check;

create index if not exists players_last_seen_idx
  on public.players (last_seen_at desc);

alter table public.game_questions
  add column if not exists deadline_at timestamptz;
alter table public.game_questions
  add column if not exists skipped_by_host boolean not null default false;

-- Cada pregunta puede aparecer una sola vez dentro de una partida.
create unique index if not exists game_questions_game_question_key
  on public.game_questions (game_id, question_id);

alter table public.game_race_questions
  add column if not exists skipped_by_host boolean not null default false;

create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  inviter_player_id uuid not null references public.players(id) on delete cascade,
  invited_player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 seconds',
  responded_at timestamptz
);

create unique index room_invites_pending_unique
  on public.room_invites (room_id, invited_player_id)
  where status = 'pending';

create index room_invites_invited_idx
  on public.room_invites (invited_player_id, status, expires_at);

create index room_invites_inviter_idx
  on public.room_invites (inviter_player_id);

alter table public.room_invites enable row level security;

drop policy if exists deny_all on public.room_invites;
create policy deny_all on public.room_invites
  for all to anon, authenticated using (false) with check (false);

revoke all on public.room_invites from public, anon, authenticated;
grant all on public.room_invites to service_role;

notify pgrst, 'reload schema';
