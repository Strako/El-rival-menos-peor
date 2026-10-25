-- Funciones del modo Relámpago.

create or replace function public.rpc_start_race_game(p_host_id uuid, p_room_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_count integer;
  v_total integer;
  v_available integer;
  v_game_id uuid;
  v_game_number integer;
  v_i integer;
  v_category text;
  v_target_diff text;
  v_question_id uuid;
  v_order smallint[];
  v_selected uuid[] := array[]::uuid[];
  v_easy_end integer;
  v_medium_end integer;
  v_categories text[] := array['general', 'videogames', 'series_90s'];
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_player_id <> p_host_id then raise exception 'NOT_HOST'; end if;
  if v_room.mode <> 'race' then raise exception 'INVALID_MODE'; end if;
  if v_room.status <> 'lobby' then raise exception 'ROOM_NOT_IN_LOBBY'; end if;

  select count(*) into v_count
  from room_players
  where room_id = p_room_id and status = 'in_room';

  if v_count < 2 then raise exception 'NOT_ENOUGH_PLAYERS'; end if;

  v_total := v_room.max_rounds;

  select count(*) into v_available from questions where is_active;
  if v_available < v_total then raise exception 'NOT_ENOUGH_QUESTIONS'; end if;

  select coalesce(max(game_number), 0) + 1 into v_game_number
  from games where room_id = p_room_id;

  insert into games (
    room_id, game_number, mode, max_rounds, status, phase, current_round, current_player_id
  ) values (
    p_room_id, v_game_number, 'race', v_total, 'playing', 'question', 1, null
  ) returning id into v_game_id;

  insert into game_players (game_id, player_id, nickname, seat, status)
  select v_game_id, rp.player_id, rp.nickname, rp.seat, 'active'
  from room_players rp
  where rp.room_id = p_room_id and rp.status = 'in_room'
  order by rp.seat;

  v_easy_end := greatest(1, round(v_total * 0.4)::integer);
  v_medium_end := least(v_total, greatest(v_easy_end + 1, round(v_total * 0.8)::integer));

  for v_i in 1..v_total loop
    v_category := v_categories[((v_i - 1) % 3) + 1];

    v_target_diff := case
      when v_i <= v_easy_end then 'easy'
      when v_i <= v_medium_end then 'medium'
      else 'hard'
    end;

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
      where is_active and category = v_category and id <> all(v_selected)
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

    if v_question_id is null then raise exception 'NOT_ENOUGH_QUESTIONS'; end if;

    v_selected := array_append(v_selected, v_question_id);

    select array_agg(i::smallint order by random()) into v_order
    from generate_series(0, 3) as i;

    insert into game_race_questions (
      game_id, question_number, question_id, option_order,
      status, opened_at, deadline_at
    ) values (
      v_game_id, v_i, v_question_id, v_order,
      case when v_i = 1 then 'open' else 'pending' end,
      case when v_i = 1 then now() else null end,
      case when v_i = 1 then now() + interval '10 seconds' else null end
    );
  end loop;

  update rooms
  set status = 'playing', current_game_id = v_game_id
  where id = p_room_id;

  return v_game_id;
end;
$$;

create or replace function public.rpc_race_answer(
  p_player_id uuid,
  p_game_id uuid,
  p_selected_index integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_game games%rowtype;
  v_rq game_race_questions%rowtype;
  v_q questions%rowtype;
  v_is_correct boolean;
  v_points integer;
  v_response_ms integer;
  v_display_correct integer;
  v_now timestamptz := now();
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.mode <> 'race' then raise exception 'INVALID_MODE'; end if;
  if v_game.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;
  if v_game.phase <> 'question' then raise exception 'NOT_IN_QUESTION'; end if;
  if p_selected_index < 0 or p_selected_index > 3 then raise exception 'INVALID_OPTION'; end if;

  if not exists (
    select 1 from game_players
    where game_id = p_game_id and player_id = p_player_id and status = 'active'
  ) then
    raise exception 'NOT_ACTIVE_PLAYER';
  end if;

  select * into v_rq
  from game_race_questions
  where game_id = p_game_id and question_number = v_game.current_round
  for update;

  if not found then raise exception 'RACE_QUESTION_NOT_FOUND'; end if;
  if v_rq.status <> 'open' then raise exception 'RACE_ALREADY_ANSWERED'; end if;
  if v_rq.deadline_at is null or v_rq.deadline_at <= v_now then
    raise exception 'RACE_TIME_EXPIRED';
  end if;

  select * into v_q from questions where id = v_rq.question_id;
  if not found then raise exception 'QUESTION_NOT_FOUND'; end if;

  v_is_correct := (v_rq.option_order[p_selected_index + 1] = v_q.correct_index);
  v_display_correct := array_position(v_rq.option_order, v_q.correct_index::smallint) - 1;
  v_points := case v_q.difficulty
    when 'easy' then 100
    when 'medium' then 150
    else 200
  end;

  if not v_is_correct then v_points := -100; end if;

  v_response_ms := least(
    2147483647,
    greatest(0, floor(extract(epoch from (v_now - v_rq.opened_at)) * 1000)::integer)
  );

  begin
    insert into race_answers (
      race_question_id, game_id, player_id, selected_index,
      is_correct, points_delta, response_ms, answered_at
    ) values (
      v_rq.id, p_game_id, p_player_id, p_selected_index,
      v_is_correct, v_points, v_response_ms, v_now
    );
  exception when unique_violation then
    raise exception 'RACE_ALREADY_ANSWERED';
  end;

  update game_race_questions
  set status = 'answered', answered_by = p_player_id, answered_at = v_now
  where id = v_rq.id;

  update game_players
  set score = score + v_points,
      correct_count = correct_count + case when v_is_correct then 1 else 0 end,
      wrong_count = wrong_count + case when v_is_correct then 0 else 1 end,
      total_response_ms = total_response_ms + v_response_ms
  where game_id = p_game_id and player_id = p_player_id;

  update games
  set phase = 'reveal', reveal_until = v_now + interval '3 seconds'
  where id = p_game_id;

  return jsonb_build_object(
    'isCorrect', v_is_correct,
    'selectedIndex', p_selected_index,
    'correctDisplayIndex', v_display_correct,
    'correctText', v_q.options ->> v_q.correct_index::integer,
    'explanation', v_q.explanation,
    'pointsDelta', v_points,
    'responseMs', v_response_ms,
    'answeredBy', p_player_id,
    'answeredAt', v_now,
    'revealUntil', v_now + interval '3 seconds'
  );
end;
$$;

create or replace function public.rpc_advance_race_due(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_game games%rowtype;
  v_active integer;
  v_rq game_race_questions%rowtype;
  v_next integer;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.status <> 'playing' or v_game.mode <> 'race' then
    return;
  end if;

  select count(*) into v_active
  from game_players
  where game_id = p_game_id and status = 'active';

  if v_active <= 1 then
    perform rpc_settle_game(p_game_id);
    return;
  end if;

  if v_game.phase = 'question' then
    select * into v_rq
    from game_race_questions
    where game_id = p_game_id and question_number = v_game.current_round
    for update;

    if not found then
      perform rpc_settle_game(p_game_id);
      return;
    end if;

    if v_rq.status = 'open' and v_rq.deadline_at is not null and v_rq.deadline_at <= now() then
      update game_race_questions
      set status = 'expired'
      where id = v_rq.id;

      update games
      set phase = 'reveal', reveal_until = now() + interval '2.5 seconds'
      where id = p_game_id;
    elsif v_rq.status = 'answered' or v_rq.status = 'expired' then
      update games
      set phase = 'reveal', reveal_until = now() + interval '3 seconds'
      where id = p_game_id;
    end if;

    return;
  end if;

  if v_game.phase = 'reveal'
     and (v_game.reveal_until is null or v_game.reveal_until <= now()) then
    if v_game.current_round >= v_game.max_rounds then
      perform rpc_settle_game(p_game_id);
      return;
    end if;

    v_next := v_game.current_round + 1;

    update game_race_questions
    set status = 'open',
        opened_at = now(),
        deadline_at = now() + interval '10 seconds'
    where game_id = p_game_id
      and question_number = v_next
      and status = 'pending';

    if not found then
      perform rpc_settle_game(p_game_id);
      return;
    end if;

    update games
    set current_round = v_next,
        phase = 'question',
        reveal_until = null,
        current_player_id = null
    where id = p_game_id;
  end if;
end;
$$;

create or replace function public.rpc_skip_race_question(p_host_id uuid, p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_game games%rowtype;
  v_host uuid;
  v_rq game_race_questions%rowtype;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  select host_player_id into v_host from rooms where id = v_game.room_id;
  if v_host <> p_host_id then raise exception 'NOT_HOST'; end if;
  if v_game.status <> 'playing' or v_game.mode <> 'race' or v_game.phase <> 'question' then
    raise exception 'NOT_IN_QUESTION';
  end if;

  select * into v_rq
  from game_race_questions
  where game_id = p_game_id and question_number = v_game.current_round
  for update;

  if found and v_rq.status = 'open' then
    update game_race_questions set status = 'expired' where id = v_rq.id;
  end if;

  update games
  set phase = 'reveal', reveal_until = now() + interval '2.5 seconds'
  where id = p_game_id;
end;
$$;
