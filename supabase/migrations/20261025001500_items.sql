-- Sistema de ítems por partida.
-- Inventario, premios, efectos, configuración y estado.

alter table public.rooms
  add column if not exists items_enabled boolean not null default false;
alter table public.rooms
  add column if not exists multiple_items_enabled boolean not null default false;

alter table public.games
  add column if not exists items_enabled boolean not null default false;
alter table public.games
  add column if not exists multiple_items_enabled boolean not null default false;

alter table public.game_players
  add column if not exists correct_streak integer not null default 0;

alter table public.game_questions
  add column if not exists revision integer not null default 0;
alter table public.game_race_questions
  add column if not exists revision integer not null default 0;

create table if not exists public.game_items (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  owner_player_id uuid not null references public.players(id) on delete cascade,
  item_type smallint not null check (item_type between 1 and 5),
  status text not null default 'held'
    check (status in ('held', 'pending', 'active', 'consumed', 'expired')),
  target_player_id uuid references public.players(id) on delete set null,
  award_source text not null default 'random'
    check (award_source in ('random', 'streak', 'race', 'meta')),
  award_question_id uuid,
  used_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_items_game_owner_idx
  on public.game_items (game_id, owner_player_id, status);
create index if not exists game_items_game_target_idx
  on public.game_items (game_id, target_player_id, status);
create unique index if not exists game_items_award_once_idx
  on public.game_items (game_id, award_question_id, award_source)
  where award_question_id is not null and award_source in ('random', 'streak', 'race');

alter table public.game_items enable row level security;
drop policy if exists game_items_deny_all on public.game_items;
create policy game_items_deny_all on public.game_items
  for all using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.random_item_type()
returns smallint
language sql
volatile
set search_path = public
as $$
  select (1 + floor(random() * 5))::smallint;
$$;

create or replace function public.random_attack_item_type()
returns smallint
language sql
volatile
set search_path = public
as $$
  select (1 + floor(random() * 4))::smallint;
$$;

create or replace function public.swap_game_scores(
  p_game_id uuid,
  p_player_a uuid,
  p_player_b uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a integer;
  v_b integer;
begin
  if p_player_a is null or p_player_b is null or p_player_a = p_player_b then
    return;
  end if;

  select score into v_a from game_players
  where game_id = p_game_id and player_id = p_player_a
  for update;

  select score into v_b from game_players
  where game_id = p_game_id and player_id = p_player_b
  for update;

  if v_a is null or v_b is null then
    return;
  end if;

  update game_players set score = v_b
  where game_id = p_game_id and player_id = p_player_a;

  update game_players set score = v_a
  where game_id = p_game_id and player_id = p_player_b;
end;
$$;

create or replace function public.award_item(
  p_game_id uuid,
  p_player_id uuid,
  p_source text,
  p_question_id uuid default null,
  p_item_type smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_type smallint;
  v_count integer;
  v_item_id uuid;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or not v_game.items_enabled then
    return null;
  end if;

  if p_question_id is not null and p_source in ('random', 'streak', 'race')
     and exists (
       select 1 from game_items
       where game_id = p_game_id
         and award_question_id = p_question_id
         and award_source = p_source
     ) then
    return null;
  end if;

  v_type := coalesce(p_item_type, random_item_type());
  if v_type not between 1 and 5 then
    return null;
  end if;

  select count(*) into v_count
  from game_items
  where game_id = p_game_id
    and owner_player_id = p_player_id
    and status = 'held';

  if v_game.multiple_items_enabled then
    if v_count >= 3 then
      delete from game_items
      where game_id = p_game_id
        and owner_player_id = p_player_id
        and status = 'held';
      return null;
    end if;
  else
    delete from game_items
    where game_id = p_game_id
      and owner_player_id = p_player_id
      and status = 'held';
  end if;

  begin
    insert into game_items (
      game_id, owner_player_id, item_type, status, award_source, award_question_id
    ) values (
      p_game_id, p_player_id, v_type, 'held', p_source, p_question_id
    ) returning id into v_item_id;
  exception when unique_violation then
    return null;
  end;

  return v_item_id;
end;
$$;

create or replace function public.activate_pending_items(
  p_game_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_gq game_questions%rowtype;
  v_item game_items%rowtype;
  v_target uuid;
  v_expires timestamptz;
begin
  if p_player_id is null then
    return;
  end if;

  select * into v_game from games where id = p_game_id;
  if not found or not v_game.items_enabled or v_game.status <> 'playing'
     or v_game.phase <> 'question' or v_game.mode = 'race' then
    return;
  end if;

  select * into v_gq
  from game_questions
  where game_id = p_game_id
    and round_number = v_game.current_round
    and player_id = p_player_id
    and status = 'pending'
  order by turn_index
  limit 1;

  if not found then
    return;
  end if;

  for v_item in
    select * from game_items
    where game_id = p_game_id
      and target_player_id = p_player_id
      and status = 'pending'
    order by used_at, created_at
    for update
  loop
    if v_item.item_type = 4 then
      select player_id into v_target
      from game_players
      where game_id = p_game_id
        and status = 'active'
        and player_id <> p_player_id
      order by random()
      limit 1;

      if v_target is not null then
        perform swap_game_scores(p_game_id, p_player_id, v_target);
      end if;

      update game_items
      set status = 'consumed',
          activated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('swappedWith', v_target)
      where id = v_item.id;
    elsif v_item.item_type in (1, 2, 3) then
      v_expires := case v_item.item_type
        when 1 then now() + interval '5 seconds'
        when 2 then least(now() + interval '10 seconds', coalesce(v_gq.deadline_at, now() + interval '10 seconds'))
        else least(now() + interval '4 seconds', coalesce(v_gq.deadline_at, now() + interval '10 seconds'))
      end;

      update game_items
      set status = 'active',
          activated_at = now(),
          expires_at = v_expires,
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('turnRound', v_game.current_round)
      where id = v_item.id;
    else
      update game_items
      set status = 'expired',
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('reason', 'invalid_pending_item')
      where id = v_item.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Premios automáticos
-- ---------------------------------------------------------------------------

create or replace function public.item_award_after_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_streak integer;
begin
  select * into v_game from games where id = new.game_id;
  if not found or not v_game.items_enabled then
    return new;
  end if;

  if new.selected_index is null then
    update game_players
    set correct_streak = 0
    where game_id = new.game_id and player_id = new.player_id;
    return new;
  end if;

  if new.is_correct then
    update game_players
    set correct_streak = correct_streak + 1
    where game_id = new.game_id and player_id = new.player_id
    returning correct_streak into v_streak;

    if coalesce(v_streak, 0) >= 3 then
      perform award_item(new.game_id, new.player_id, 'streak', new.game_question_id);
      update game_players
      set correct_streak = 0
      where game_id = new.game_id and player_id = new.player_id;
    elsif random() < 0.30 then
      perform award_item(new.game_id, new.player_id, 'random', new.game_question_id);
    end if;
  else
    update game_players
    set correct_streak = 0
    where game_id = new.game_id and player_id = new.player_id;

    if random() < 0.30 then
      perform award_item(new.game_id, new.player_id, 'random', new.game_question_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists answers_item_award on public.answers;
create trigger answers_item_award
  after insert on public.answers
  for each row execute function public.item_award_after_answer();

create or replace function public.item_reset_streak_on_skip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'skipped' and old.status is distinct from 'skipped' then
    update game_players
    set correct_streak = 0
    where game_id = new.game_id and player_id = new.player_id;
  end if;
  return new;
end;
$$;

drop trigger if exists game_questions_item_skip on public.game_questions;
create trigger game_questions_item_skip
  after update on public.game_questions
  for each row execute function public.item_reset_streak_on_skip();

create or replace function public.item_award_race_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_player uuid;
begin
  if new.status <> 'open' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'open' then
    return new;
  end if;

  select * into v_game from games where id = new.game_id;
  if not found or not v_game.items_enabled then
    return new;
  end if;

  select player_id into v_player
  from game_players
  where game_id = new.game_id and status = 'active'
  order by random()
  limit 1;

  if v_player is not null then
    perform award_item(new.game_id, v_player, 'race', new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists race_question_item_award on public.game_race_questions;
create trigger race_question_item_award
  after insert or update of status on public.game_race_questions
  for each row execute function public.item_award_race_question();

create or replace function public.expire_items_on_game_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    update game_items
    set status = 'expired'
    where game_id = new.id and status in ('held', 'pending', 'active');
  end if;
  return new;
end;
$$;

drop trigger if exists games_expire_items on public.games;
create trigger games_expire_items
  after update of status on public.games
  for each row execute function public.expire_items_on_game_end();

create or replace function public.expire_items_on_player_out()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'active' and old.status = 'active' then
    update game_items
    set status = 'expired'
    where game_id = new.game_id
      and target_player_id = new.player_id
      and status in ('pending', 'active');
    update game_items
    set status = 'expired'
    where game_id = new.game_id
      and owner_player_id = new.player_id
      and status in ('held', 'pending', 'active');
  end if;
  return new;
end;
$$;

drop trigger if exists game_players_expire_items on public.game_players;
create trigger game_players_expire_items
  after update of status on public.game_players
  for each row execute function public.expire_items_on_player_out();

-- Activar pendientes al comienzo de un turno clásico.
create or replace function public.item_activate_on_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending'
     and (tg_op = 'INSERT' or new.served_at is distinct from old.served_at) then
    perform activate_pending_items(new.game_id, new.player_id);
  end if;
  return new;
end;
$$;

drop trigger if exists game_questions_activate_items on public.game_questions;
create trigger game_questions_activate_items
  after insert or update of served_at on public.game_questions
  for each row execute function public.item_activate_on_question();

-- ---------------------------------------------------------------------------
-- Elegir una pregunta de reemplazo para "Ah que dijeron"
-- ---------------------------------------------------------------------------

create or replace function public.pick_replacement_question(
  p_game_id uuid,
  p_mode text,
  p_category text,
  p_difficulty text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from questions
  where is_active
    and category = p_category
    and difficulty = p_difficulty
    and id not in (
      select question_id from game_questions where game_id = p_game_id
      union
      select question_id from game_race_questions where game_id = p_game_id
    )
  order by random()
  limit 1;

  if v_id is null then
    select id into v_id
    from questions
    where is_active
      and category = p_category
      and id not in (
        select question_id from game_questions where game_id = p_game_id
        union
        select question_id from game_race_questions where game_id = p_game_id
      )
    order by random()
    limit 1;
  end if;

  if v_id is null then
    select id into v_id
    from questions
    where is_active
      and id not in (
        select question_id from game_questions where game_id = p_game_id
        union
        select question_id from game_race_questions where game_id = p_game_id
      )
    order by random()
    limit 1;
  end if;

  return v_id;
end;
$$;

create or replace function public.random_option_order()
returns smallint[]
language sql
volatile
set search_path = public
as $$
  select array_agg(i::smallint order by random())
  from generate_series(0, 3) as i;
$$;

create or replace function public.rpc_process_item_ticks(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_item game_items%rowtype;
  v_rq game_race_questions%rowtype;
  v_gq game_questions%rowtype;
  v_q questions%rowtype;
  v_new_question uuid;
  v_new_order smallint[];
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or not v_game.items_enabled or v_game.status <> 'playing' then
    return;
  end if;

  for v_item in
    select * from game_items
    where game_id = p_game_id
      and item_type = 3
      and status = 'active'
      and expires_at is not null
      and expires_at <= now()
    order by activated_at
    for update
  loop
    if v_game.mode = 'race' then
      select * into v_rq
      from game_race_questions
      where game_id = p_game_id and question_number = v_game.current_round
      for update;

      if found and v_rq.status = 'open'
         and v_rq.deadline_at > now()
         and not exists (select 1 from race_answers where race_question_id = v_rq.id)
         and exists (
           select 1 from game_players
           where game_id = p_game_id and player_id = v_item.target_player_id and status = 'active'
         ) then
        select * into v_q from questions where id = v_rq.question_id;
        v_new_question := pick_replacement_question(
          p_game_id, 'race', v_q.category, v_q.difficulty
        );
        if v_new_question is not null then
          v_new_order := random_option_order();
          update game_race_questions
          set question_id = v_new_question,
              option_order = v_new_order,
              revision = revision + 1
          where id = v_rq.id;
          update game_items
          set status = 'consumed',
              metadata = coalesce(metadata, '{}'::jsonb)
                || jsonb_build_object('replacedQuestionId', v_new_question)
          where id = v_item.id;
        else
          update game_items
          set status = 'expired',
              metadata = coalesce(metadata, '{}'::jsonb)
                || jsonb_build_object('reason', 'no_replacement_question')
          where id = v_item.id;
        end if;
      else
        update game_items
        set status = 'consumed',
            metadata = coalesce(metadata, '{}'::jsonb)
              || jsonb_build_object('reason', 'turn_closed')
        where id = v_item.id;
      end if;
    else
      select * into v_gq
      from game_questions
      where game_id = p_game_id
        and round_number = v_game.current_round
        and player_id = v_item.target_player_id
        and status = 'pending'
      order by turn_index
      limit 1
      for update;

      if v_game.phase = 'question'
         and v_game.current_player_id = v_item.target_player_id
         and v_gq.id is not null
         and (v_gq.deadline_at is null or v_gq.deadline_at > now()) then
        select * into v_q from questions where id = v_gq.question_id;
        v_new_question := pick_replacement_question(
          p_game_id, 'classic', v_q.category, v_q.difficulty
        );
        if v_new_question is not null then
          v_new_order := random_option_order();
          update game_questions
          set question_id = v_new_question,
              option_order = v_new_order,
              revision = revision + 1
          where id = v_gq.id;
          update game_items
          set status = 'consumed',
              metadata = coalesce(metadata, '{}'::jsonb)
                || jsonb_build_object('replacedQuestionId', v_new_question)
          where id = v_item.id;
        else
          update game_items
          set status = 'expired',
              metadata = coalesce(metadata, '{}'::jsonb)
                || jsonb_build_object('reason', 'no_replacement_question')
          where id = v_item.id;
        end if;
      else
        update game_items
        set status = 'consumed',
            metadata = coalesce(metadata, '{}'::jsonb)
              || jsonb_build_object('reason', 'turn_closed')
        where id = v_item.id;
      end if;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Uso de ítems
-- ---------------------------------------------------------------------------

create or replace function public.rpc_use_item(
  p_player_id uuid,
  p_game_id uuid,
  p_item_id uuid,
  p_target_player_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_item game_items%rowtype;
  v_gq game_questions%rowtype;
  v_rq game_race_questions%rowtype;
  v_target uuid;
  v_other uuid;
  v_resolved smallint;
  v_bonus boolean := false;
  v_expires timestamptz;
  v_deadline timestamptz;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if not v_game.items_enabled then
    raise exception 'ITEMS_DISABLED';
  end if;
  if v_game.status <> 'playing' or v_game.phase <> 'question' then
    raise exception 'ITEM_WINDOW_CLOSED';
  end if;

  select * into v_item
  from game_items
  where id = p_item_id
    and game_id = p_game_id
    and owner_player_id = p_player_id
    and status = 'held'
  for update;

  if not found then
    raise exception 'ITEM_NOT_OWNED';
  end if;

  if not exists (
    select 1 from game_players
    where game_id = p_game_id and player_id = p_player_id and status = 'active'
  ) then
    raise exception 'NOT_ACTIVE_PLAYER';
  end if;

  if v_game.mode = 'race' then
    select * into v_rq
    from game_race_questions
    where game_id = p_game_id and question_number = v_game.current_round
    for update;

    if not found or v_rq.status <> 'open' or v_rq.deadline_at is null
       or v_rq.deadline_at <= now() then
      raise exception 'ITEM_WINDOW_CLOSED';
    end if;
    v_deadline := v_rq.deadline_at;
  else
    if v_game.current_player_id <> p_player_id then
      raise exception 'NOT_YOUR_TURN';
    end if;

    select * into v_gq
    from game_questions
    where game_id = p_game_id
      and round_number = v_game.current_round
      and player_id = p_player_id
      and status = 'pending'
    order by turn_index
    limit 1
    for update;

    if not found or v_gq.deadline_at is null or v_gq.deadline_at <= now() then
      raise exception 'ITEM_WINDOW_CLOSED';
    end if;
    v_deadline := v_gq.deadline_at;
  end if;

  if v_item.item_type between 1 and 3 then
    if p_target_player_id is null then
      raise exception 'ITEM_TARGET_REQUIRED';
    end if;
    if p_target_player_id = p_player_id or not exists (
      select 1 from game_players
      where game_id = p_game_id
        and player_id = p_target_player_id
        and status = 'active'
    ) then
      raise exception 'ITEM_TARGET_INVALID';
    end if;
    v_target := p_target_player_id;
  elsif v_item.item_type = 4 then
    select player_id into v_target
    from game_players
    where game_id = p_game_id
      and status = 'active'
      and player_id <> p_player_id
    order by random()
    limit 1;

    if v_target is null then
      raise exception 'ITEM_TARGET_INVALID';
    end if;
  elsif v_item.item_type = 5 then
    select player_id into v_target
    from game_players
    where game_id = p_game_id
      and status = 'active'
      and player_id <> p_player_id
    order by random()
    limit 1;

    if v_target is null then
      raise exception 'ITEM_TARGET_INVALID';
    end if;

    v_resolved := random_attack_item_type();
    v_bonus := random() < 0.05;

    update game_items
    set item_type = v_resolved,
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('originalItem', 5, 'bonus300', v_bonus)
    where id = v_item.id;
    v_item.item_type := v_resolved;
  else
    raise exception 'INVALID_ITEM';
  end if;

  if v_bonus then
    update game_players
    set score = score + 300
    where game_id = p_game_id and player_id = p_player_id;
  end if;

  if v_game.mode = 'race' then
    if v_item.item_type = 4 then
      select player_id into v_other
      from game_players
      where game_id = p_game_id
        and status = 'active'
        and player_id <> v_target
      order by random()
      limit 1;

      if v_other is not null then
        perform swap_game_scores(p_game_id, v_target, v_other);
      end if;

      update game_items
      set status = 'consumed',
          target_player_id = v_target,
          used_at = now(),
          activated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('swappedWith', v_other)
      where id = v_item.id;
    else
      v_expires := case v_item.item_type
        when 1 then now() + interval '5 seconds'
        when 2 then v_deadline
        else least(now() + interval '4 seconds', v_deadline)
      end;

      update game_items
      set status = 'active',
          target_player_id = v_target,
          used_at = now(),
          activated_at = now(),
          expires_at = v_expires
      where id = v_item.id;
    end if;
  else
    update game_items
    set status = 'pending',
        target_player_id = v_target,
        used_at = now()
    where id = v_item.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Respuestas con índice canónico y revisión de pregunta
-- ---------------------------------------------------------------------------

create or replace function public.rpc_submit_answer_v2(
  p_player_id uuid,
  p_game_id uuid,
  p_game_question_id uuid,
  p_selected_index integer,
  p_canonical_index integer default null,
  p_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gq game_questions%rowtype;
  v_display integer;
begin
  perform rpc_process_item_ticks(p_game_id);

  select * into v_gq
  from game_questions
  where id = p_game_question_id and game_id = p_game_id;

  if not found then
    raise exception 'QUESTION_NOT_AVAILABLE';
  end if;
  if p_revision is not null and v_gq.revision <> p_revision then
    raise exception 'QUESTION_CHANGED';
  end if;

  if p_canonical_index is not null then
    if p_canonical_index < 0 or p_canonical_index > 3 then
      raise exception 'INVALID_OPTION';
    end if;
    v_display := array_position(v_gq.option_order, p_canonical_index::smallint) - 1;
    if v_display is null then
      raise exception 'INVALID_OPTION';
    end if;
  else
    v_display := p_selected_index;
  end if;

  return rpc_submit_answer(
    p_player_id,
    p_game_id,
    p_game_question_id,
    v_display
  );
end;
$$;

create or replace function public.rpc_race_answer_v2(
  p_player_id uuid,
  p_game_id uuid,
  p_selected_index integer,
  p_canonical_index integer default null,
  p_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_rq game_race_questions%rowtype;
  v_display integer;
begin
  perform rpc_process_item_ticks(p_game_id);

  select * into v_game from games where id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  select * into v_rq
  from game_race_questions
  where game_id = p_game_id and question_number = v_game.current_round;

  if not found then
    raise exception 'RACE_QUESTION_NOT_FOUND';
  end if;
  if p_revision is not null and v_rq.revision <> p_revision then
    raise exception 'QUESTION_CHANGED';
  end if;

  if p_canonical_index is not null then
    if p_canonical_index < 0 or p_canonical_index > 3 then
      raise exception 'INVALID_OPTION';
    end if;
    v_display := array_position(v_rq.option_order, p_canonical_index::smallint) - 1;
    if v_display is null then
      raise exception 'INVALID_OPTION';
    end if;
  else
    v_display := p_selected_index;
  end if;

  return rpc_race_answer(p_player_id, p_game_id, v_display);
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuración de ítems en salas
-- ---------------------------------------------------------------------------

create or replace function public.rpc_create_room(
  p_host_id uuid,
  p_mode text default 'classic',
  p_max_rounds integer default 5,
  p_items_enabled boolean default false,
  p_multiple_items_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
  v_room rooms%rowtype;
  v_code text;
  v_i integer;
  v_items boolean := coalesce(p_items_enabled, false);
  v_multiple boolean := coalesce(p_items_enabled, false) and coalesce(p_multiple_items_enabled, false);
begin
  select nickname into v_nickname from players where id = p_host_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_mode not in ('classic', 'elimination', 'race') then
    raise exception 'INVALID_MODE';
  end if;
  if p_max_rounds < 1 or p_max_rounds > 30 then
    raise exception 'INVALID_ROUNDS';
  end if;

  if exists (
    select 1
    from room_players rp
    join rooms r on r.id = rp.room_id
    where rp.player_id = p_host_id
      and rp.status = 'in_room'
      and r.status = 'playing'
  ) then
    raise exception 'ALREADY_PLAYING';
  end if;

  perform rpc_leave_lobbies(p_host_id);

  for v_i in 1..10 loop
    v_code := generate_room_code();
    begin
      insert into rooms (
        code, host_player_id, status, mode, max_rounds,
        items_enabled, multiple_items_enabled
      ) values (
        v_code, p_host_id, 'lobby', p_mode, p_max_rounds,
        v_items, v_multiple
      ) returning * into v_room;
      exit;
    exception when unique_violation then
      if v_i = 10 then
        raise;
      end if;
    end;
  end loop;

  if v_room.id is null then
    raise exception 'ROOM_CODE_GENERATION_FAILED';
  end if;

  insert into room_players (room_id, player_id, nickname, seat, status)
  values (v_room.id, p_host_id, v_nickname, 0, 'in_room');

  return jsonb_build_object('roomId', v_room.id, 'code', v_room.code);
end;
$$;

create or replace function public.rpc_update_room(
  p_host_id uuid,
  p_room_id uuid,
  p_mode text,
  p_max_rounds integer,
  p_items_enabled boolean default false,
  p_multiple_items_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_items boolean := coalesce(p_items_enabled, false);
  v_multiple boolean := coalesce(p_items_enabled, false) and coalesce(p_multiple_items_enabled, false);
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.host_player_id <> p_host_id then
    raise exception 'NOT_HOST';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;
  if p_mode not in ('classic', 'elimination', 'race') then
    raise exception 'INVALID_MODE';
  end if;
  if p_max_rounds < 1 or p_max_rounds > 30 then
    raise exception 'INVALID_ROUNDS';
  end if;

  update rooms
  set mode = p_mode,
      max_rounds = p_max_rounds,
      items_enabled = v_items,
      multiple_items_enabled = v_multiple
  where id = p_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Estado de ítems para el cliente
-- ---------------------------------------------------------------------------

create or replace function public.rpc_items_state(
  p_game_id uuid,
  p_player_id uuid,
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_game games%rowtype;
  v_has_game boolean := false;
  v_enabled boolean := false;
  v_multiple boolean := false;
  v_can_use boolean := false;
  v_deadline timestamptz;
  v_my_items jsonb := '[]'::jsonb;
  v_effects jsonb := '[]'::jsonb;
  v_ticks jsonb := '[]'::jsonb;
  v_log jsonb := '[]'::jsonb;
  v_gq game_questions%rowtype;
  v_rq game_race_questions%rowtype;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found then
    return jsonb_build_object(
      'enabled', false, 'multiple', false, 'canUse', false,
      'deadlineAt', null, 'myItems', '[]'::jsonb,
      'effects', '[]'::jsonb, 'ticks', '[]'::jsonb, 'log', '[]'::jsonb
    );
  end if;

  if p_game_id is not null then
    select * into v_game from games where id = p_game_id;
    v_has_game := found;
  end if;

  if v_has_game then
    v_enabled := v_game.items_enabled;
    v_multiple := v_game.multiple_items_enabled;

    if v_enabled and v_game.status = 'playing' and v_game.phase = 'question'
       and exists (
         select 1 from game_players
         where game_id = p_game_id and player_id = p_player_id and status = 'active'
       ) then
      if v_game.mode = 'race' then
        select * into v_rq
        from game_race_questions
        where game_id = p_game_id and question_number = v_game.current_round;

        if found and v_rq.status = 'open' and v_rq.deadline_at > now() then
          v_can_use := true;
          v_deadline := v_rq.deadline_at;
        end if;
      else
        if v_game.current_player_id = p_player_id then
          select * into v_gq
          from game_questions
          where game_id = p_game_id
            and round_number = v_game.current_round
            and player_id = p_player_id
            and status = 'pending'
          order by turn_index
          limit 1;

          if found and (v_gq.deadline_at is null or v_gq.deadline_at > now()) then
            v_can_use := true;
            v_deadline := v_gq.deadline_at;
          end if;
        end if;
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'itemType', item_type,
      'createdAt', created_at
    ) order by created_at), '[]'::jsonb)
    into v_my_items
    from game_items
    where game_id = p_game_id
      and owner_player_id = p_player_id
      and status = 'held';

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gi.id,
      'itemType', gi.item_type,
      'sourcePlayerId', gi.owner_player_id,
      'sourceNickname', (
        select nickname from game_players
        where game_id = p_game_id and player_id = gi.owner_player_id
      ),
      'targetPlayerId', gi.target_player_id,
      'targetNickname', (
        select nickname from game_players
        where game_id = p_game_id and player_id = gi.target_player_id
      ),
      'activatedAt', gi.activated_at,
      'expiresAt', gi.expires_at,
      'metadata', gi.metadata
    ) order by gi.activated_at), '[]'::jsonb)
    into v_effects
    from game_items gi
    where gi.game_id = p_game_id
      and gi.target_player_id = p_player_id
      and gi.status = 'active'
      and gi.item_type in (1, 2, 3)
      and (gi.expires_at is null or gi.expires_at > now());

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gi.id,
      'itemType', gi.item_type,
      'targetPlayerId', gi.target_player_id,
      'targetNickname', (
        select nickname from game_players
        where game_id = p_game_id and player_id = gi.target_player_id
      ),
      'expiresAt', gi.expires_at
    ) order by gi.expires_at), '[]'::jsonb)
    into v_ticks
    from game_items gi
    where gi.game_id = p_game_id
      and gi.item_type = 3
      and gi.status = 'active'
      and gi.expires_at is not null
      and gi.expires_at > now() - interval '1 second';

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', gi.id,
      'itemType', gi.item_type,
      'status', gi.status,
      'ownerPlayerId', gi.owner_player_id,
      'ownerNickname', (
        select nickname from game_players
        where game_id = p_game_id and player_id = gi.owner_player_id
      ),
      'targetPlayerId', gi.target_player_id,
      'targetNickname', (
        select nickname from game_players
        where game_id = p_game_id and player_id = gi.target_player_id
      ),
      'createdAt', gi.created_at,
      'usedAt', gi.used_at,
      'activatedAt', gi.activated_at,
      'expiresAt', gi.expires_at,
      'metadata', gi.metadata
    ) order by coalesce(gi.activated_at, gi.used_at, gi.created_at) desc), '[]'::jsonb)
    into v_log
    from (
      select *
      from game_items
      where game_id = p_game_id
        and (status <> 'held' or owner_player_id = p_player_id)
      order by coalesce(activated_at, used_at, created_at) desc
      limit 20
    ) gi;
  else
    v_enabled := v_room.items_enabled;
    v_multiple := v_room.multiple_items_enabled;
  end if;

  return jsonb_build_object(
    'enabled', v_enabled,
    'multiple', v_multiple,
    'canUse', v_can_use,
    'deadlineAt', v_deadline,
    'myItems', v_my_items,
    'effects', v_effects,
    'ticks', v_ticks,
    'log', v_log
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Copiar configuración de la sala a la partida
-- ---------------------------------------------------------------------------

create or replace function public.set_game_items_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
begin
  select * into v_room from rooms where id = new.room_id;
  if found then
    new.items_enabled := v_room.items_enabled;
    new.multiple_items_enabled := v_room.multiple_items_enabled;
  end if;
  return new;
end;
$$;

drop trigger if exists games_set_items_settings on public.games;
create trigger games_set_items_settings
  before insert on public.games
  for each row execute function public.set_game_items_settings();

-- ---------------------------------------------------------------------------
-- Añadir items/optionOrder/revision/configuración al estado existente
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_get_state(uuid,uuid)'::regprocedure) into v_def;

  v_def := replace(
    v_def,
    'perform rpc_advance_due(v_room.current_game_id);',
    'perform rpc_advance_due(v_room.current_game_id); perform rpc_process_item_ticks(v_room.current_game_id);'
  );
  v_def := replace(
    v_def,
    'v_has_game := found;',
    'v_has_game := found; if v_has_game then perform public.activate_pending_items(v_game.id, v_game.current_player_id); end if;'
  );
  v_def := replace(
    v_def,
    '''turnIndex'', v_gq.turn_index,',
    '''turnIndex'', v_gq.turn_index, ''optionOrder'', v_gq.option_order, ''revision'', v_gq.revision,'
  );
  v_def := replace(
    v_def,
    '''maxRounds'', v_room.max_rounds,',
    '''maxRounds'', v_room.max_rounds, ''itemsEnabled'', v_room.items_enabled, ''multipleItemsEnabled'', v_room.multiple_items_enabled,'
  );
  v_def := replace(
    v_def,
    '''serverTime'', now(),',
    '''serverTime'', now(), ''items'', public.rpc_items_state(case when v_has_game then v_game.id else null end, p_player_id, p_room_id),'
  );

  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_get_race_state(uuid,uuid)'::regprocedure) into v_def;

  v_def := replace(
    v_def,
    'perform rpc_advance_race_due(v_room.current_game_id);',
    'perform rpc_advance_race_due(v_room.current_game_id); perform rpc_process_item_ticks(v_room.current_game_id);'
  );
  v_def := replace(
    v_def,
    '''turnIndex'', 0,',
    '''turnIndex'', 0, ''optionOrder'', v_rq.option_order, ''revision'', v_rq.revision,'
  );
  v_def := replace(
    v_def,
    '''maxRounds'', v_room.max_rounds,',
    '''maxRounds'', v_room.max_rounds, ''itemsEnabled'', v_room.items_enabled, ''multipleItemsEnabled'', v_room.multiple_items_enabled,'
  );
  v_def := replace(
    v_def,
    '''serverTime'', now(),',
    '''serverTime'', now(), ''items'', public.rpc_items_state(case when v_has_game then v_game.id else null end, p_player_id, p_room_id),'
  );

  execute v_def;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke execute on function public.random_item_type() from public, anon, authenticated;
revoke execute on function public.random_attack_item_type() from public, anon, authenticated;
revoke execute on function public.swap_game_scores(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.award_item(uuid, uuid, text, uuid, smallint) from public, anon, authenticated;
revoke execute on function public.activate_pending_items(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_process_item_ticks(uuid) from public, anon, authenticated;
revoke execute on function public.rpc_use_item(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_submit_answer_v2(uuid, uuid, uuid, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.rpc_race_answer_v2(uuid, uuid, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.rpc_items_state(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_create_room(uuid, text, integer, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.rpc_update_room(uuid, uuid, text, integer, boolean, boolean) from public, anon, authenticated;

revoke execute on function public.expire_items_on_game_end() from public, anon, authenticated;
revoke execute on function public.expire_items_on_player_out() from public, anon, authenticated;
revoke execute on function public.item_activate_on_question() from public, anon, authenticated;
revoke execute on function public.item_award_after_answer() from public, anon, authenticated;
revoke execute on function public.item_award_race_question() from public, anon, authenticated;
revoke execute on function public.item_reset_streak_on_skip() from public, anon, authenticated;
revoke execute on function public.pick_replacement_question(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.set_game_items_settings() from public, anon, authenticated;

create index if not exists game_items_owner_fk_idx on public.game_items (owner_player_id);
create index if not exists game_items_target_fk_idx on public.game_items (target_player_id);

grant execute on function public.swap_game_scores(uuid, uuid, uuid) to service_role;
grant execute on function public.award_item(uuid, uuid, text, uuid, smallint) to service_role;
grant execute on function public.activate_pending_items(uuid, uuid) to service_role;
grant execute on function public.rpc_process_item_ticks(uuid) to service_role;
grant execute on function public.rpc_use_item(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.rpc_submit_answer_v2(uuid, uuid, uuid, integer, integer, integer) to service_role;
grant execute on function public.rpc_race_answer_v2(uuid, uuid, integer, integer, integer) to service_role;
grant execute on function public.rpc_items_state(uuid, uuid, uuid) to service_role;
grant execute on function public.rpc_create_room(uuid, text, integer, boolean, boolean) to service_role;
grant execute on function public.rpc_update_room(uuid, uuid, text, integer, boolean, boolean) to service_role;

notify pgrst, 'reload schema';
