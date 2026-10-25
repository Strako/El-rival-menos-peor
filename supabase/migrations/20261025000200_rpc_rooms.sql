-- RPCs de sala: creación, unión, configuración e inicio.

-- ---------------------------------------------------------------------------
-- Helpers de anfitrión y salida de salas
-- ---------------------------------------------------------------------------
create or replace function public.promote_host(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
begin
  select player_id into v_next
  from room_players
  where room_id = p_room_id and status = 'in_room'
  order by seat
  limit 1;

  if v_next is null then
    delete from rooms where id = p_room_id;
    return null;
  end if;

  update rooms
  set host_player_id = v_next
  where id = p_room_id and host_player_id is distinct from v_next;

  return v_next;
end;
$$;

create or replace function public.rpc_leave_lobbies(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
begin
  for v_rec in
    select rp.room_id, rm.host_player_id
    from room_players rp
    join rooms rm on rm.id = rp.room_id
    where rp.player_id = p_player_id
      and rm.status in ('lobby', 'finished')
  loop
    delete from room_players
    where room_id = v_rec.room_id and player_id = p_player_id;

    if v_rec.host_player_id = p_player_id then
      perform promote_host(v_rec.room_id);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Crear sala
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_room(
  p_host_id uuid,
  p_mode text default 'classic',
  p_max_rounds integer default 5
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
begin
  select nickname into v_nickname from players where id = p_host_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_mode not in ('classic', 'elimination') then
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
      insert into rooms (code, host_player_id, status, mode, max_rounds)
      values (v_code, p_host_id, 'lobby', p_mode, p_max_rounds)
      returning * into v_room;
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

-- ---------------------------------------------------------------------------
-- Unirse a una sala
-- ---------------------------------------------------------------------------
create or replace function public.rpc_join_room(
  p_player_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
  v_room rooms%rowtype;
  v_seat integer;
begin
  select nickname into v_nickname from players where id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  select * into v_room
  from rooms
  where code = upper(btrim(p_code))
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if exists (
    select 1 from room_players
    where room_id = v_room.id and player_id = p_player_id and status = 'in_room'
  ) then
    return jsonb_build_object(
      'roomId', v_room.id,
      'code', v_room.code,
      'alreadyMember', true
    );
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'ROOM_NOT_JOINABLE';
  end if;

  if exists (
    select 1
    from room_players rp
    join rooms r on r.id = rp.room_id
    where rp.player_id = p_player_id
      and rp.status = 'in_room'
      and r.status = 'playing'
      and r.id <> v_room.id
  ) then
    raise exception 'ALREADY_PLAYING';
  end if;

  perform rpc_leave_lobbies(p_player_id);

  select coalesce(max(seat) + 1, 0) into v_seat
  from room_players
  where room_id = v_room.id;

  begin
    insert into room_players (room_id, player_id, nickname, seat, status)
    values (v_room.id, p_player_id, v_nickname, v_seat, 'in_room');
  exception when unique_violation then
    raise exception 'NICKNAME_TAKEN';
  end;

  return jsonb_build_object(
    'roomId', v_room.id,
    'code', v_room.code,
    'alreadyMember', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Actualizar configuración (solo anfitrión, solo lobby)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_update_room(
  p_host_id uuid,
  p_room_id uuid,
  p_mode text,
  p_max_rounds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
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
  if p_mode not in ('classic', 'elimination') then
    raise exception 'INVALID_MODE';
  end if;
  if p_max_rounds < 1 or p_max_rounds > 30 then
    raise exception 'INVALID_ROUNDS';
  end if;

  update rooms
  set mode = p_mode, max_rounds = p_max_rounds
  where id = p_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Iniciar partida (solo anfitrión)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_start_game(
  p_host_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_count integer;
  v_min integer;
  v_needed integer;
  v_available integer;
  v_game_id uuid;
  v_game_number integer;
  v_round integer;
  v_turn integer;
  v_player_id uuid;
  v_category text;
  v_target_diff text;
  v_question_id uuid;
  v_order smallint[];
  v_idx integer;
  v_players uuid[];
  v_selected uuid[] := array[]::uuid[];
  v_offset integer;
  v_first_player uuid;
  v_categories text[] := array['general', 'videogames', 'series_90s'];
  v_max_rounds integer;
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

  select count(*) into v_count
  from room_players
  where room_id = p_room_id and status = 'in_room';

  v_min := case when v_room.mode = 'elimination' then 3 else 2 end;
  if v_count < v_min then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  v_max_rounds := v_room.max_rounds;
  v_needed := v_count * v_max_rounds;

  select count(*) into v_available from questions where is_active;
  if v_available < v_needed then
    raise exception 'NOT_ENOUGH_QUESTIONS';
  end if;

  select coalesce(max(game_number), 0) + 1 into v_game_number
  from games
  where room_id = p_room_id;

  insert into games (room_id, game_number, mode, max_rounds, status, phase, current_round)
  values (p_room_id, v_game_number, v_room.mode, v_max_rounds, 'playing', 'question', 1)
  returning id into v_game_id;

  insert into game_players (game_id, player_id, nickname, seat, status)
  select v_game_id, rp.player_id, rp.nickname, rp.seat, 'active'
  from room_players rp
  where rp.room_id = p_room_id and rp.status = 'in_room'
  order by rp.seat;

  select array_agg(player_id order by seat) into v_players
  from game_players
  where game_id = v_game_id;

  for v_round in 1..v_max_rounds loop
    v_offset := (v_round - 1) % v_count;

    v_target_diff := case
      when v_round <= ceil(v_max_rounds * 0.4) then 'easy'
      when v_round <= ceil(v_max_rounds * 0.8) then 'medium'
      else 'hard'
    end;

    for v_turn in 0..(v_count - 1) loop
      v_idx := ((v_offset + v_turn) % v_count) + 1;
      v_player_id := v_players[v_idx];
      v_category := v_categories[(((v_round - 1) * v_count + v_turn) % 3) + 1];

      v_question_id := null;

      select id into v_question_id
      from questions
      where is_active
        and category = v_category
        and difficulty = v_target_diff
        and id <> all(v_selected)
      order by random()
      limit 1;

      if v_question_id is null then
        select id into v_question_id
        from questions
        where is_active
          and category = v_category
          and id <> all(v_selected)
        order by random()
        limit 1;
      end if;

      if v_question_id is null then
        select id into v_question_id
        from questions
        where is_active and id <> all(v_selected)
        order by random()
        limit 1;
      end if;

      if v_question_id is null then
        raise exception 'NOT_ENOUGH_QUESTIONS';
      end if;

      v_selected := array_append(v_selected, v_question_id);

      select array_agg(i::smallint order by random()) into v_order
      from generate_series(0, 3) as i;

      insert into game_questions (
        game_id, round_number, turn_index, player_id, question_id, option_order
      )
      values (
        v_game_id, v_round, v_turn, v_player_id, v_question_id, v_order
      );
    end loop;
  end loop;

  select player_id into v_first_player
  from game_questions
  where game_id = v_game_id and round_number = 1 and turn_index = 0;

  update games
  set current_player_id = v_first_player
  where id = v_game_id;

  update rooms
  set status = 'playing', current_game_id = v_game_id
  where id = p_room_id;

  return v_game_id;
end;
$$;
