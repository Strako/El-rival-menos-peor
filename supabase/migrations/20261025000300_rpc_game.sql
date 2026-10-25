-- RPCs de partida: respuestas, votos, avance de fases, resultados y estado.

-- ---------------------------------------------------------------------------
-- Liquidar partida
-- ---------------------------------------------------------------------------
create or replace function public.rpc_settle_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_winner uuid;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.status = 'finished' then
    return;
  end if;

  with ranked as (
    select
      player_id,
      row_number() over (
        order by score desc, correct_count desc, total_response_ms asc, seat asc
      ) as rnk
    from game_players
    where game_id = p_game_id and status = 'active'
  )
  update game_players gp
  set final_rank = r.rnk::integer,
      is_winner = (r.rnk = 1)
  from ranked r
  where gp.game_id = p_game_id and gp.player_id = r.player_id;

  select player_id into v_winner
  from game_players
  where game_id = p_game_id and is_winner = true
  limit 1;

  update games
  set status = 'finished',
      phase = 'results',
      winner_player_id = v_winner,
      finished_at = now(),
      reveal_until = null,
      current_player_id = null
  where id = p_game_id;

  update rooms
  set status = 'finished'
  where id = v_game.room_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resolver votación de eliminación
-- ---------------------------------------------------------------------------
create or replace function public.rpc_resolve_votes(
  p_game_id uuid,
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_active_count integer;
  v_votes_cast integer;
  v_eliminated uuid;
  v_tally jsonb;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.status <> 'playing' or v_game.phase <> 'voting' then
    return;
  end if;

  select count(*) into v_active_count
  from game_players
  where game_id = p_game_id and status = 'active';

  if v_active_count <= 1 then
    perform rpc_settle_game(p_game_id);
    return;
  end if;

  select count(*) into v_votes_cast
  from votes
  where game_id = p_game_id and round_number = v_game.current_round;

  if not p_force and v_votes_cast < v_active_count then
    return;
  end if;

  select jsonb_agg(
    jsonb_build_object('playerId', t.player_id, 'votes', t.votes)
    order by t.votes desc, t.seat
  )
  into v_tally
  from (
    select gp.player_id, gp.seat, count(v.id)::integer as votes
    from game_players gp
    left join votes v
      on v.game_id = gp.game_id
      and v.round_number = v_game.current_round
      and v.target_player_id = gp.player_id
    where gp.game_id = p_game_id and gp.status = 'active'
    group by gp.player_id, gp.seat
  ) t;

  select gp.player_id into v_eliminated
  from game_players gp
  left join (
    select target_player_id, count(*)::integer as votes
    from votes
    where game_id = p_game_id and round_number = v_game.current_round
    group by target_player_id
  ) vc on vc.target_player_id = gp.player_id
  where gp.game_id = p_game_id and gp.status = 'active'
  order by
    coalesce(vc.votes, 0) desc,
    gp.score asc,
    gp.correct_count asc,
    gp.seat asc
  limit 1;

  if v_eliminated is not null then
    update game_players
    set status = 'eliminated',
        eliminated_round = v_game.current_round
    where game_id = p_game_id and player_id = v_eliminated;
  end if;

  update games
  set phase = 'vote_result',
      reveal_until = now() + interval '5 seconds',
      current_player_id = null,
      last_eliminated_player_id = v_eliminated,
      last_vote_result = v_tally
  where id = p_game_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Avance automático de fases
-- ---------------------------------------------------------------------------
create or replace function public.rpc_advance_due(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_active_count integer;
  v_round_total integer;
  v_round_done integer;
  v_next_player uuid;
  v_next_round integer;
  v_votes_cast integer;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.status <> 'playing' then
    return;
  end if;

  select count(*) into v_active_count
  from game_players
  where game_id = p_game_id and status = 'active';

  if v_active_count <= 1 and v_game.phase <> 'vote_result' then
    perform rpc_settle_game(p_game_id);
    return;
  end if;

  if v_game.phase = 'reveal'
     and (v_game.reveal_until is null or v_game.reveal_until <= now()) then
    select count(*) into v_round_total
    from game_questions gq
    join game_players gp
      on gp.game_id = gq.game_id and gp.player_id = gq.player_id
    where gq.game_id = p_game_id
      and gq.round_number = v_game.current_round
      and gp.status = 'active';

    select count(*) into v_round_done
    from game_questions gq
    join game_players gp
      on gp.game_id = gq.game_id and gp.player_id = gq.player_id
    where gq.game_id = p_game_id
      and gq.round_number = v_game.current_round
      and gp.status = 'active'
      and gq.status in ('answered', 'skipped');

    if v_round_done >= v_round_total then
      if v_game.mode = 'elimination' then
        update games
        set phase = 'voting',
            reveal_until = null,
            current_player_id = null
        where id = p_game_id;

        select count(*) into v_votes_cast
        from votes
        where game_id = p_game_id and round_number = v_game.current_round;

        if v_votes_cast >= v_active_count then
          perform rpc_resolve_votes(p_game_id);
        end if;
      else
        if v_game.current_round >= v_game.max_rounds then
          perform rpc_settle_game(p_game_id);
        else
          v_next_round := v_game.current_round + 1;

          select gq.player_id into v_next_player
          from game_questions gq
          join game_players gp
            on gp.game_id = gq.game_id and gp.player_id = gq.player_id
          where gq.game_id = p_game_id
            and gq.round_number = v_next_round
            and gq.status = 'pending'
            and gp.status = 'active'
          order by gq.turn_index
          limit 1;

          if v_next_player is null then
            perform rpc_settle_game(p_game_id);
          else
            update games
            set current_round = v_next_round,
                phase = 'question',
                current_player_id = v_next_player,
                reveal_until = null
            where id = p_game_id;
          end if;
        end if;
      end if;
    else
      select gq.player_id into v_next_player
      from game_questions gq
      join game_players gp
        on gp.game_id = gq.game_id and gp.player_id = gq.player_id
      where gq.game_id = p_game_id
        and gq.round_number = v_game.current_round
        and gq.status = 'pending'
        and gp.status = 'active'
      order by gq.turn_index
      limit 1;

      if v_next_player is null then
        update games set phase = 'reveal', reveal_until = now() where id = p_game_id;
        perform rpc_advance_due(p_game_id);
      else
        update games
        set phase = 'question',
            current_player_id = v_next_player,
            reveal_until = null
        where id = p_game_id;
      end if;
    end if;
    return;
  end if;

  if v_game.phase = 'vote_result'
     and (v_game.reveal_until is null or v_game.reveal_until <= now()) then
    if v_active_count <= 1 or v_game.current_round >= v_game.max_rounds then
      perform rpc_settle_game(p_game_id);
    else
      v_next_round := v_game.current_round + 1;

      select gq.player_id into v_next_player
      from game_questions gq
      join game_players gp
        on gp.game_id = gq.game_id and gp.player_id = gq.player_id
      where gq.game_id = p_game_id
        and gq.round_number = v_next_round
        and gq.status = 'pending'
        and gp.status = 'active'
      order by gq.turn_index
      limit 1;

      if v_next_player is null then
        perform rpc_settle_game(p_game_id);
      else
        update games
        set current_round = v_next_round,
            phase = 'question',
            current_player_id = v_next_player,
            reveal_until = null
        where id = p_game_id;
      end if;
    end if;
    return;
  end if;

  if v_game.phase = 'voting' then
    select count(*) into v_votes_cast
    from votes
    where game_id = p_game_id and round_number = v_game.current_round;

    if v_votes_cast >= v_active_count then
      perform rpc_resolve_votes(p_game_id);
    end if;
    return;
  end if;

  if v_game.phase = 'question' then
    if v_game.current_player_id is null or not exists (
      select 1 from game_players
      where game_id = p_game_id
        and player_id = v_game.current_player_id
        and status = 'active'
    ) then
      select gq.player_id into v_next_player
      from game_questions gq
      join game_players gp
        on gp.game_id = gq.game_id and gp.player_id = gq.player_id
      where gq.game_id = p_game_id
        and gq.round_number = v_game.current_round
        and gq.status = 'pending'
        and gp.status = 'active'
      order by gq.turn_index
      limit 1;

      if v_next_player is null then
        update games set phase = 'reveal', reveal_until = now() where id = p_game_id;
        perform rpc_advance_due(p_game_id);
      else
        update games set current_player_id = v_next_player where id = p_game_id;
      end if;
    end if;
    return;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enviar respuesta
-- ---------------------------------------------------------------------------
create or replace function public.rpc_submit_answer(
  p_player_id uuid,
  p_game_id uuid,
  p_game_question_id uuid,
  p_selected_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_gq game_questions%rowtype;
  v_q questions%rowtype;
  v_is_correct boolean;
  v_points integer;
  v_response_ms integer;
  v_display_correct integer;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if v_game.status <> 'playing' then
    raise exception 'GAME_NOT_PLAYING';
  end if;
  if v_game.phase <> 'question' then
    raise exception 'NOT_IN_QUESTION';
  end if;
  if v_game.current_player_id <> p_player_id then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if p_selected_index < 0 or p_selected_index > 3 then
    raise exception 'INVALID_OPTION';
  end if;

  select * into v_gq
  from game_questions
  where id = p_game_question_id
    and game_id = p_game_id
    and player_id = p_player_id
    and round_number = v_game.current_round
    and status = 'pending'
  for update;

  if not found then
    raise exception 'QUESTION_NOT_AVAILABLE';
  end if;

  select * into v_q from questions where id = v_gq.question_id;
  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  v_is_correct := (v_gq.option_order[p_selected_index + 1] = v_q.correct_index);
  v_display_correct := array_position(v_gq.option_order, v_q.correct_index::smallint) - 1;
  v_points := case v_q.difficulty
    when 'easy' then 100
    when 'medium' then 150
    else 200
  end;

  if not v_is_correct then
    v_points := 0;
  end if;

  v_response_ms := least(
    2147483647,
    greatest(0, floor(extract(epoch from (now() - v_gq.served_at)) * 1000)::integer)
  );

  insert into answers (
    game_question_id, game_id, player_id, round_number,
    selected_index, is_correct, points, response_ms
  )
  values (
    v_gq.id, p_game_id, p_player_id, v_game.current_round,
    p_selected_index, v_is_correct, v_points, v_response_ms
  );

  update game_questions
  set status = 'answered', answered_at = now()
  where id = v_gq.id;

  update game_players
  set score = score + v_points,
      correct_count = correct_count + case when v_is_correct then 1 else 0 end,
      wrong_count = wrong_count + case when v_is_correct then 0 else 1 end,
      total_response_ms = total_response_ms + v_response_ms
  where game_id = p_game_id and player_id = p_player_id;

  update games
  set phase = 'reveal',
      reveal_until = now() + interval '4 seconds'
  where id = p_game_id;

  return jsonb_build_object(
    'isCorrect', v_is_correct,
    'selectedIndex', p_selected_index,
    'correctDisplayIndex', v_display_correct,
    'correctText', v_q.options ->> v_q.correct_index::integer,
    'explanation', v_q.explanation,
    'points', v_points,
    'responseMs', v_response_ms,
    'phase', 'reveal',
    'revealUntil', now() + interval '4 seconds'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Enviar voto
-- ---------------------------------------------------------------------------
create or replace function public.rpc_submit_vote(
  p_player_id uuid,
  p_game_id uuid,
  p_target_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_active_count integer;
  v_votes_cast integer;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.status <> 'playing' then
    raise exception 'GAME_NOT_PLAYING';
  end if;
  if v_game.phase <> 'voting' then
    raise exception 'NOT_IN_VOTING';
  end if;

  if not exists (
    select 1 from game_players
    where game_id = p_game_id and player_id = p_player_id and status = 'active'
  ) then
    raise exception 'NOT_ACTIVE_PLAYER';
  end if;

  if p_player_id = p_target_player_id then
    raise exception 'CANNOT_VOTE_SELF';
  end if;

  if not exists (
    select 1 from game_players
    where game_id = p_game_id and player_id = p_target_player_id and status = 'active'
  ) then
    raise exception 'INVALID_TARGET';
  end if;

  begin
    insert into votes (game_id, round_number, voter_player_id, target_player_id)
    values (p_game_id, v_game.current_round, p_player_id, p_target_player_id);
  exception when unique_violation then
    raise exception 'ALREADY_VOTED';
  end;

  select count(*) into v_active_count
  from game_players
  where game_id = p_game_id and status = 'active';

  select count(*) into v_votes_cast
  from votes
  where game_id = p_game_id and round_number = v_game.current_round;

  if v_votes_cast >= v_active_count then
    perform rpc_resolve_votes(p_game_id);
  end if;

  return jsonb_build_object(
    'votesCast', v_votes_cast,
    'votersTotal', v_active_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Forzar cierre de votación (solo anfitrión)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_force_vote_close(
  p_host_id uuid,
  p_game_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_game games%rowtype;
begin
  select g.* into v_game
  from games g
  where g.id = p_game_id
  for update;

  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  select host_player_id into v_host from rooms where id = v_game.room_id;
  if v_host <> p_host_id then
    raise exception 'NOT_HOST';
  end if;
  if v_game.status <> 'playing' or v_game.phase <> 'voting' then
    raise exception 'NOT_IN_VOTING';
  end if;

  perform rpc_resolve_votes(p_game_id, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Saltar turno (solo anfitrión)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_skip_turn(
  p_host_id uuid,
  p_game_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games%rowtype;
  v_host uuid;
  v_gq game_questions%rowtype;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;

  select host_player_id into v_host from rooms where id = v_game.room_id;
  if v_host <> p_host_id then
    raise exception 'NOT_HOST';
  end if;
  if v_game.status <> 'playing' or v_game.phase <> 'question' then
    raise exception 'NOT_IN_QUESTION';
  end if;

  select * into v_gq
  from game_questions
  where game_id = p_game_id
    and player_id = v_game.current_player_id
    and round_number = v_game.current_round
    and status = 'pending'
  order by turn_index
  limit 1
  for update;

  if not found then
    perform rpc_advance_due(p_game_id);
    return;
  end if;

  insert into answers (
    game_question_id, game_id, player_id, round_number,
    selected_index, is_correct, points, response_ms
  )
  values (
    v_gq.id, p_game_id, v_gq.player_id, v_game.current_round,
    null, false, 0, 0
  )
  on conflict (game_question_id) do nothing;

  update game_questions
  set status = 'skipped', answered_at = now()
  where id = v_gq.id;

  update game_players
  set wrong_count = wrong_count + 1
  where game_id = p_game_id and player_id = v_gq.player_id;

  update games
  set phase = 'reveal',
      reveal_until = now() + interval '2 seconds'
  where id = p_game_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Salir de una sala
-- ---------------------------------------------------------------------------
create or replace function public.rpc_leave_room(
  p_player_id uuid,
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    return;
  end if;

  if not exists (
    select 1 from room_players
    where room_id = p_room_id and player_id = p_player_id
  ) then
    return;
  end if;

  if v_room.status = 'lobby' then
    delete from room_players
    where room_id = p_room_id and player_id = p_player_id;

    if v_room.host_player_id = p_player_id then
      perform promote_host(p_room_id);
    end if;
    return;
  end if;

  update room_players
  set status = 'left'
  where room_id = p_room_id and player_id = p_player_id;

  if v_room.status = 'playing' and v_room.current_game_id is not null then
    update game_players
    set status = 'left'
    where game_id = v_room.current_game_id and player_id = p_player_id;

    perform rpc_advance_due(v_room.current_game_id);
  end if;

  if v_room.host_player_id = p_player_id then
    perform promote_host(p_room_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reiniciar sala (solo anfitrión, tras finalizar)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_restart_room(
  p_host_id uuid,
  p_room_id uuid
)
returns void
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
  if v_room.status <> 'finished' then
    raise exception 'ROOM_NOT_FINISHED';
  end if;

  delete from room_players
  where room_id = p_room_id and status = 'left';

  update room_players
  set status = 'in_room'
  where room_id = p_room_id;

  update rooms
  set status = 'lobby',
      current_game_id = null
  where id = p_room_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estado saneado de la sala / partida
-- ---------------------------------------------------------------------------
create or replace function public.rpc_get_state(
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
  v_me game_players%rowtype;
  v_players jsonb;
  v_question jsonb;
  v_question_options jsonb;
  v_gq game_questions%rowtype;
  v_q questions%rowtype;
  v_answer answers%rowtype;
  v_last_answer jsonb;
  v_voting jsonb;
  v_results jsonb;
  v_ranking jsonb;
  v_winner jsonb;
  v_candidates jsonb;
  v_votes_cast integer;
  v_voters_total integer;
  v_my_vote uuid;
  v_display_correct integer;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if not exists (
    select 1 from room_players
    where room_id = p_room_id and player_id = p_player_id
  ) then
    raise exception 'NOT_IN_ROOM';
  end if;

  if v_room.current_game_id is not null then
    perform rpc_advance_due(v_room.current_game_id);

    select * into v_room from rooms where id = p_room_id;
    select * into v_game from games where id = v_room.current_game_id;
    v_has_game := found;

    if v_has_game then
      select * into v_me
      from game_players
      where game_id = v_game.id and player_id = p_player_id;
    end if;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'playerId', rp.player_id,
      'nickname', rp.nickname,
      'seat', rp.seat,
      'status', case when v_has_game then coalesce(gp.status, rp.status) else rp.status end,
      'score', coalesce(gp.score, 0),
      'correctCount', coalesce(gp.correct_count, 0),
      'wrongCount', coalesce(gp.wrong_count, 0),
      'eliminatedRound', gp.eliminated_round,
      'finalRank', gp.final_rank,
      'isWinner', coalesce(gp.is_winner, false),
      'isHost', rp.player_id = v_room.host_player_id
    )
    order by rp.seat
  )
  into v_players
  from room_players rp
  left join game_players gp
    on v_has_game
    and gp.game_id = v_game.id
    and gp.player_id = rp.player_id
  where rp.room_id = p_room_id
    and (rp.status = 'in_room' or v_has_game);

  if v_has_game then
    if v_game.phase in ('question', 'reveal') then
      select gq.* into v_gq
      from game_questions gq
      where gq.game_id = v_game.id
        and gq.round_number = v_game.current_round
        and gq.player_id = coalesce(v_game.current_player_id, gq.player_id)
        and gq.status in ('pending', 'answered', 'skipped')
      order by gq.turn_index
      limit 1;

      if v_gq.id is not null then
        select * into v_q from questions where id = v_gq.question_id;

        select jsonb_agg(
          v_q.options ->> (v_gq.option_order[i] - 1)
          order by i
        )
        into v_question_options
        from generate_series(1, 4) as i;

        v_question := jsonb_build_object(
          'gameQuestionId', v_gq.id,
          'prompt', v_q.question,
          'options', v_question_options,
          'category', v_q.category,
          'difficulty', v_q.difficulty,
          'round', v_gq.round_number,
          'turnIndex', v_gq.turn_index,
          'servedAt', v_gq.served_at,
          'isMine', v_gq.player_id = p_player_id
        );

        if v_game.phase = 'reveal' then
          select * into v_answer
          from answers
          where game_question_id = v_gq.id;

          if found then
            v_display_correct := array_position(
              v_gq.option_order,
              v_q.correct_index::smallint
            ) - 1;

            v_last_answer := jsonb_build_object(
              'playerId', v_gq.player_id,
              'nickname', (
                select nickname from game_players
                where game_id = v_game.id and player_id = v_gq.player_id
              ),
              'selectedIndex', v_answer.selected_index,
              'correctDisplayIndex', v_display_correct,
              'correctText', v_q.options ->> v_q.correct_index::integer,
              'explanation', v_q.explanation,
              'isCorrect', v_answer.is_correct,
              'points', v_answer.points,
              'skipped', v_answer.selected_index is null,
              'answeredAt', v_answer.answered_at
            );
          end if;
        end if;
      end if;
    end if;

    if v_game.phase = 'voting' then
      select count(*) into v_voters_total
      from game_players
      where game_id = v_game.id and status = 'active';

      select count(*) into v_votes_cast
      from votes
      where game_id = v_game.id and round_number = v_game.current_round;

      select target_player_id into v_my_vote
      from votes
      where game_id = v_game.id
        and round_number = v_game.current_round
        and voter_player_id = p_player_id;

      select jsonb_agg(
        jsonb_build_object(
          'playerId', gp.player_id,
          'nickname', gp.nickname,
          'seat', gp.seat
        )
        order by gp.seat
      )
      into v_candidates
      from game_players gp
      where gp.game_id = v_game.id
        and gp.status = 'active'
        and gp.player_id <> p_player_id;

      v_voting := jsonb_build_object(
        'votesCast', v_votes_cast,
        'votersTotal', v_voters_total,
        'myVoteTargetId', v_my_vote,
        'candidates', coalesce(v_candidates, '[]'::jsonb)
      );
    end if;

    if v_game.status = 'finished' then
      select jsonb_agg(
        jsonb_build_object(
          'playerId', gp.player_id,
          'nickname', gp.nickname,
          'score', gp.score,
          'correctCount', gp.correct_count,
          'status', gp.status,
          'eliminatedRound', gp.eliminated_round,
          'finalRank', gp.final_rank,
          'isWinner', gp.is_winner,
          'seat', gp.seat
        )
        order by (gp.final_rank is null), gp.final_rank, gp.score desc, gp.seat
      )
      into v_ranking
      from game_players gp
      where gp.game_id = v_game.id;

      select jsonb_build_object(
        'playerId', gp.player_id,
        'nickname', gp.nickname,
        'score', gp.score
      )
      into v_winner
      from game_players gp
      where gp.game_id = v_game.id and gp.is_winner = true
      limit 1;

      v_results := jsonb_build_object(
        'winner', v_winner,
        'ranking', coalesce(v_ranking, '[]'::jsonb)
      );
    end if;
  end if;

  return jsonb_build_object(
    'serverTime', now(),
    'room', jsonb_build_object(
      'id', v_room.id,
      'code', v_room.code,
      'status', v_room.status,
      'mode', v_room.mode,
      'maxRounds', v_room.max_rounds,
      'hostPlayerId', v_room.host_player_id,
      'playerCount', (
        select count(*) from room_players
        where room_id = p_room_id and status = 'in_room'
      )
    ),
    'me', jsonb_build_object(
      'playerId', p_player_id,
      'nickname', (
        select nickname from room_players
        where room_id = p_room_id and player_id = p_player_id
      ),
      'isHost', v_room.host_player_id = p_player_id,
      'isActive', coalesce(v_me.status = 'active', v_room.status = 'lobby')
    ),
    'players', coalesce(v_players, '[]'::jsonb),
    'game', case when v_has_game then jsonb_build_object(
      'id', v_game.id,
      'number', v_game.game_number,
      'mode', v_game.mode,
      'status', v_game.status,
      'phase', v_game.phase,
      'currentRound', v_game.current_round,
      'maxRounds', v_game.max_rounds,
      'currentPlayerId', v_game.current_player_id,
      'revealUntil', v_game.reveal_until,
      'winnerPlayerId', v_game.winner_player_id,
      'lastEliminatedPlayerId', case
        when v_game.phase in ('vote_result', 'results') then v_game.last_eliminated_player_id
        else null
      end,
      'lastVoteResult', case
        when v_game.phase in ('vote_result', 'results') then v_game.last_vote_result
        else null
      end
    ) else null end,
    'question', v_question,
    'lastAnswer', v_last_answer,
    'voting', v_voting,
    'results', v_results
  );
end;
$$;
