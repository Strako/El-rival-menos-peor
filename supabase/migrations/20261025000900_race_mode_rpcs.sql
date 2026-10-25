-- Estado del modo Relámpago, ruteo de modos y permisos.

create or replace function public.rpc_get_race_state(p_player_id uuid, p_room_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_game games%rowtype;
  v_has_game boolean := false;
  v_me game_players%rowtype;
  v_players jsonb;
  v_question jsonb;
  v_options jsonb;
  v_rq game_race_questions%rowtype;
  v_q questions%rowtype;
  v_answer race_answers%rowtype;
  v_has_answer boolean := false;
  v_last_answer jsonb;
  v_race jsonb;
  v_results jsonb;
  v_ranking jsonb;
  v_winner jsonb;
  v_display_correct integer;
begin
  select * into v_room from rooms where id = p_room_id;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  if not exists (
    select 1 from room_players where room_id = p_room_id and player_id = p_player_id
  ) then
    raise exception 'NOT_IN_ROOM';
  end if;

  if v_room.current_game_id is not null then
    perform rpc_advance_race_due(v_room.current_game_id);

    select * into v_room from rooms where id = p_room_id;
    select * into v_game from games where id = v_room.current_game_id;
    v_has_game := found;

    if v_has_game then
      select * into v_me from game_players
      where game_id = v_game.id and player_id = p_player_id;
    end if;
  end if;

  select jsonb_agg(jsonb_build_object(
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
  ) order by rp.seat)
  into v_players
  from room_players rp
  left join game_players gp
    on v_has_game and gp.game_id = v_game.id and gp.player_id = rp.player_id
  where rp.room_id = p_room_id
    and (rp.status = 'in_room' or v_has_game);

  if v_has_game then
    if v_game.phase in ('question', 'reveal') then
      select * into v_rq
      from game_race_questions
      where game_id = v_game.id and question_number = v_game.current_round;

      if found then
        select * into v_q from questions where id = v_rq.question_id;

        select jsonb_agg(v_q.options ->> v_rq.option_order[i] order by i)
        into v_options
        from generate_series(1, 4) as i;

        v_display_correct := array_position(v_rq.option_order, v_q.correct_index::smallint) - 1;

        v_question := jsonb_build_object(
          'gameQuestionId', v_rq.id,
          'prompt', v_q.question,
          'options', v_options,
          'category', v_q.category,
          'difficulty', v_q.difficulty,
          'round', v_rq.question_number,
          'turnIndex', 0,
          'servedAt', coalesce(v_rq.opened_at, v_rq.answered_at, now()),
          'isMine', coalesce(v_me.status = 'active', false)
        );

        if v_game.phase = 'reveal' then
          select * into v_answer
          from race_answers
          where race_question_id = v_rq.id;

          v_has_answer := found;

          if v_has_answer then
            v_last_answer := jsonb_build_object(
              'playerId', v_answer.player_id,
              'nickname', (
                select nickname from game_players
                where game_id = v_game.id and player_id = v_answer.player_id
              ),
              'selectedIndex', v_answer.selected_index,
              'correctDisplayIndex', v_display_correct,
              'correctText', v_q.options ->> v_q.correct_index::integer,
              'explanation', v_q.explanation,
              'isCorrect', v_answer.is_correct,
              'points', v_answer.points_delta,
              'skipped', false,
              'answeredAt', v_answer.answered_at
            );
          end if;
        end if;

        v_race := jsonb_build_object(
          'status', v_rq.status,
          'deadlineAt', v_rq.deadline_at,
          'answeredBy', v_rq.answered_by,
          'answeredByNickname', (
            select nickname from game_players
            where game_id = v_game.id and player_id = v_rq.answered_by
          ),
          'timedOut', v_rq.status = 'expired',
          'correctDisplayIndex', case
            when v_game.phase = 'reveal' then v_display_correct else null end,
          'correctText', case
            when v_game.phase = 'reveal'
              then v_q.options ->> v_q.correct_index::integer
            else null end,
          'explanation', case
            when v_game.phase = 'reveal' then v_q.explanation else null end,
          'myAnswer', case
            when v_has_answer then
              case when v_answer.player_id = p_player_id then
                jsonb_build_object(
                  'selectedIndex', v_answer.selected_index,
                  'isCorrect', v_answer.is_correct,
                  'pointsDelta', v_answer.points_delta
                )
              else null end
            else null end
        );
      end if;
    end if;

    if v_game.status = 'finished' then
      select jsonb_agg(jsonb_build_object(
        'playerId', gp.player_id,
        'nickname', gp.nickname,
        'score', gp.score,
        'correctCount', gp.correct_count,
        'status', gp.status,
        'eliminatedRound', gp.eliminated_round,
        'finalRank', gp.final_rank,
        'isWinner', gp.is_winner,
        'seat', gp.seat
      ) order by (gp.final_rank is null), gp.final_rank, gp.score desc, gp.seat)
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
      'currentPlayerId', null,
      'revealUntil', v_game.reveal_until,
      'winnerPlayerId', v_game.winner_player_id,
      'lastEliminatedPlayerId', null,
      'lastVoteResult', null
    ) else null end,
    'question', v_question,
    'lastAnswer', v_last_answer,
    'race', v_race,
    'voting', null,
    'results', v_results
  );
end;
$$;

-- Permitir mode=race en creación y actualización de salas.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_create_room(uuid,text,integer)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'p_mode not in (''classic'', ''elimination'')',
    'p_mode not in (''classic'', ''elimination'', ''race'')'
  );
  execute v_def;

  select pg_get_functiondef('public.rpc_update_room(uuid,uuid,text,integer)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'p_mode not in (''classic'', ''elimination'')',
    'p_mode not in (''classic'', ''elimination'', ''race'')'
  );
  execute v_def;
end;
$$;

-- Orden de turnos fijo por índice de asiento (solo partidas nuevas).
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_start_game(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, 'v_offset := (v_round - 1) % v_count;', 'v_offset := 0;');
  v_def := replace(v_def, 'v_idx := ((v_offset + v_turn) % v_count) + 1;', 'v_idx := v_turn + 1;');
  execute v_def;
end;
$$;

-- Al salir de una partida race, usar el avance correcto.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_leave_room(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'perform rpc_advance_due(v_room.current_game_id);',
    'if exists (select 1 from games where id = v_room.current_game_id and mode = ''race'') then
       perform rpc_advance_race_due(v_room.current_game_id);
     else
       perform rpc_advance_due(v_room.current_game_id);
     end if;'
  );
  execute v_def;
end;
$$;

revoke execute on function public.rpc_create_room(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.rpc_update_room(uuid, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.rpc_start_game(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_leave_room(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_start_race_game(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_race_answer(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.rpc_advance_race_due(uuid) from public, anon, authenticated;
revoke execute on function public.rpc_skip_race_question(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_get_race_state(uuid, uuid) from public, anon, authenticated;

grant execute on function public.rpc_create_room(uuid, text, integer) to service_role;
grant execute on function public.rpc_update_room(uuid, uuid, text, integer) to service_role;
grant execute on function public.rpc_start_game(uuid, uuid) to service_role;
grant execute on function public.rpc_leave_room(uuid, uuid) to service_role;
grant execute on function public.rpc_start_race_game(uuid, uuid) to service_role;
grant execute on function public.rpc_race_answer(uuid, uuid, integer) to service_role;
grant execute on function public.rpc_advance_race_due(uuid) to service_role;
grant execute on function public.rpc_skip_race_question(uuid, uuid) to service_role;
grant execute on function public.rpc_get_race_state(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
