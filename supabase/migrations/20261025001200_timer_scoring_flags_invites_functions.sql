-- Timer de 10 s en todos los modos, decaimiento de Relámpago,
-- penalización por timeout, banderas, presencia e invitaciones.

create or replace function public.rpc_advance_due(p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_game games%rowtype;
  v_active_count integer;
  v_round_total integer;
  v_round_done integer;
  v_next_player uuid;
  v_next_round integer;
  v_votes_cast integer;
  v_gq game_questions%rowtype;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found or v_game.status <> 'playing' then return; end if;

  select count(*) into v_active_count from game_players
  where game_id = p_game_id and status = 'active';

  if v_active_count <= 1 and v_game.phase <> 'vote_result' then
    perform rpc_settle_game(p_game_id); return;
  end if;

  if v_game.phase = 'reveal'
     and (v_game.reveal_until is null or v_game.reveal_until <= now()) then
    select count(*) into v_round_total
    from game_questions gq
    join game_players gp on gp.game_id = gq.game_id and gp.player_id = gq.player_id
    where gq.game_id = p_game_id and gq.round_number = v_game.current_round
      and gp.status = 'active';

    select count(*) into v_round_done
    from game_questions gq
    join game_players gp on gp.game_id = gq.game_id and gp.player_id = gq.player_id
    where gq.game_id = p_game_id and gq.round_number = v_game.current_round
      and gp.status = 'active' and gq.status in ('answered', 'skipped');

    if v_round_done >= v_round_total then
      if v_game.mode = 'elimination' then
        update games set phase = 'voting', reveal_until = null, current_player_id = null
        where id = p_game_id;

        select count(*) into v_votes_cast from votes
        where game_id = p_game_id and round_number = v_game.current_round;
        if v_votes_cast >= v_active_count then perform rpc_resolve_votes(p_game_id); end if;
      else
        if v_game.current_round >= v_game.max_rounds then
          perform rpc_settle_game(p_game_id);
        else
          v_next_round := v_game.current_round + 1;
          select gq.player_id into v_next_player
          from game_questions gq
          join game_players gp on gp.game_id = gq.game_id and gp.player_id = gq.player_id
          where gq.game_id = p_game_id and gq.round_number = v_next_round
            and gq.status = 'pending' and gp.status = 'active'
          order by gq.turn_index limit 1;

          if v_next_player is null then
            perform rpc_settle_game(p_game_id);
          else
            update game_questions
            set served_at = now(), deadline_at = now() + interval '10 seconds'
            where game_id = p_game_id and round_number = v_next_round
              and player_id = v_next_player and status = 'pending';

            update games set current_round = v_next_round, phase = 'question',
              current_player_id = v_next_player, reveal_until = null where id = p_game_id;
          end if;
        end if;
      end if;
    else
      select gq.player_id into v_next_player
      from game_questions gq
      join game_players gp on gp.game_id = gq.game_id and gp.player_id = gq.player_id
      where gq.game_id = p_game_id and gq.round_number = v_game.current_round
        and gq.status = 'pending' and gp.status = 'active'
      order by gq.turn_index limit 1;

      if v_next_player is null then
        update games set phase = 'reveal', reveal_until = now() where id = p_game_id;
        perform rpc_advance_due(p_game_id);
      else
        update game_questions
        set served_at = now(), deadline_at = now() + interval '10 seconds'
        where game_id = p_game_id and round_number = v_game.current_round
          and player_id = v_next_player and status = 'pending';

        update games set phase = 'question', current_player_id = v_next_player,
          reveal_until = null where id = p_game_id;
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
      join game_players gp on gp.game_id = gq.game_id and gp.player_id = gq.player_id
      where gq.game_id = p_game_id and gq.round_number = v_next_round
        and gq.status = 'pending' and gp.status = 'active'
      order by gq.turn_index limit 1;

      if v_next_player is null then
        perform rpc_settle_game(p_game_id);
      else
        update game_questions
        set served_at = now(), deadline_at = now() + interval '10 seconds'
        where game_id = p_game_id and round_number = v_next_round
          and player_id = v_next_player and status = 'pending';

        update games set current_round = v_next_round, phase = 'question',
          current_player_id = v_next_player, reveal_until = null where id = p_game_id;
      end if;
    end if;
    return;
  end if;

  if v_game.phase = 'voting' then
    select count(*) into v_votes_cast from votes
    where game_id = p_game_id and round_number = v_game.current_round;
    if v_votes_cast >= v_active_count then perform rpc_resolve_votes(p_game_id); end if;
    return;
  end if;

  if v_game.phase = 'question' then
    if v_game.current_player_id is not null then
      select * into v_gq
      from game_questions
      where game_id = p_game_id
        and player_id = v_game.current_player_id
        and round_number = v_game.current_round
        and status = 'pending'
      order by turn_index
      limit 1
      for update;

      if found then
        if v_gq.deadline_at is null then
          update game_questions
          set served_at = now(), deadline_at = now() + interval '10 seconds'
          where id = v_gq.id;
          return;
        elsif v_gq.deadline_at <= now() then
          insert into answers (
            game_question_id, game_id, player_id, round_number,
            selected_index, is_correct, points, response_ms
          ) values (
            v_gq.id, p_game_id, v_gq.player_id, v_game.current_round,
            null, false, 0, 0
          ) on conflict (game_question_id) do nothing;

          update game_questions
          set status = 'skipped', answered_at = now(), skipped_by_host = false
          where id = v_gq.id;

          update game_players
          set wrong_count = wrong_count + 1
          where game_id = p_game_id and player_id = v_gq.player_id;

          update games
          set phase = 'reveal', reveal_until = now() + interval '2.5 seconds'
          where id = p_game_id;
          return;
        end if;
      end if;
    end if;

    if v_game.current_player_id is null or not exists (
      select 1 from game_players
      where game_id = p_game_id
        and player_id = v_game.current_player_id
        and status = 'active'
    ) then
      select gq.player_id into v_next_player
      from game_questions gq
      join game_players gp on gp.game_id = gq.game_id and gp.player_id = gq.player_id
      where gq.game_id = p_game_id
        and gq.round_number = v_game.current_round
        and gq.status = 'pending'
        and gp.status = 'active'
      order by gq.turn_index limit 1;

      if v_next_player is null then
        update games set phase = 'reveal', reveal_until = now() where id = p_game_id;
        perform rpc_advance_due(p_game_id);
      else
        update game_questions
        set served_at = now(), deadline_at = now() + interval '10 seconds'
        where game_id = p_game_id and round_number = v_game.current_round
          and player_id = v_next_player and status = 'pending';

        update games set current_player_id = v_next_player where id = p_game_id;
      end if;
    end if;
    return;
  end if;
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.rpc_start_game(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'update games set current_player_id = v_first_player where id = v_game_id;',
    'update game_questions set served_at = now(), deadline_at = now() + interval ''10 seconds''
       where game_id = v_game_id and round_number = 1 and turn_index = 0;
     update games set current_player_id = v_first_player where id = v_game_id;'
  );
  execute v_def;
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.rpc_submit_answer(uuid,uuid,uuid,integer)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'if not found then raise exception ''QUESTION_NOT_AVAILABLE''; end if;',
    'if not found then raise exception ''QUESTION_NOT_AVAILABLE''; end if;

     if v_gq.deadline_at is not null and v_gq.deadline_at <= now() then
       raise exception ''TIME_EXPIRED'';
     end if;'
  );
  execute v_def;
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.rpc_skip_turn(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'update game_questions set status = ''skipped'', answered_at = now() where id = v_gq.id;',
    'update game_questions set status = ''skipped'', answered_at = now(), skipped_by_host = true where id = v_gq.id;'
  );
  execute v_def;
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.rpc_race_answer(uuid,uuid,integer)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'v_display_correct integer;',
    'v_display_correct integer;
  v_remaining numeric;
  v_base integer;'
  );
  v_def := replace(
    v_def,
    'v_points := case v_q.difficulty
    when ''easy'' then 100
    when ''medium'' then 150
    else 200
  end;

  if not v_is_correct then v_points := -100; end if;',
    'v_base := case v_q.difficulty
    when ''easy'' then 100
    when ''medium'' then 150
    else 200
  end;
  v_remaining := greatest(0, least(10, extract(epoch from (v_rq.deadline_at - v_now))));
  v_points := greatest(10, (round(v_base * v_remaining / 10 / 5) * 5)::integer);

  if not v_is_correct then v_points := -100; end if;'
  );
  execute v_def;
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.rpc_advance_race_due(uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'update game_race_questions
      set status = ''expired''
      where id = v_rq.id;',
    'update game_race_questions
      set status = ''expired'', skipped_by_host = false
      where id = v_rq.id and status = ''open'';

      if found then
        update game_players
        set score = score - 10
        where game_id = p_game_id and status = ''active'';
      end if;'
  );
  execute v_def;
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.rpc_skip_race_question(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'update game_race_questions set status = ''expired'' where id = v_rq.id;',
    'update game_race_questions set status = ''expired'', skipped_by_host = true where id = v_rq.id;'
  );
  execute v_def;
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.rpc_get_state(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, '''nickname'', rp.nickname,', '''nickname'', rp.nickname, ''countryCode'', coalesce(p.country_code, ''UN''),');
  v_def := replace(v_def, 'from room_players rp', 'from room_players rp left join players p on p.id = rp.player_id');
  v_def := replace(v_def, '''servedAt'', v_gq.served_at,', '''servedAt'', v_gq.served_at, ''deadlineAt'', v_gq.deadline_at,');
  v_def := replace(v_def, '''skipped'', v_answer.selected_index is null,', '''skipped'', v_answer.selected_index is null, ''skippedByHost'', v_gq.skipped_by_host,');
  execute v_def;
end;
$$;

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.rpc_get_race_state(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, '''nickname'', rp.nickname,', '''nickname'', rp.nickname, ''countryCode'', coalesce(p.country_code, ''UN''),');
  v_def := replace(v_def, 'from room_players rp', 'from room_players rp left join players p on p.id = rp.player_id');
  v_def := replace(
    v_def,
    '''timedOut'', v_rq.status = ''expired'',',
    '''timedOut'', v_rq.status = ''expired'',
          ''skippedByHost'', v_rq.skipped_by_host,
          ''timeoutPenalty'', case when v_rq.status = ''expired'' and not v_rq.skipped_by_host then 10 else 0 end,'
  );
  execute v_def;
end;
$$;

create or replace function public.rpc_presence_list(p_player_id uuid, p_room_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from room_players
    where room_id = p_room_id and player_id = p_player_id and status = 'in_room'
  ) then
    raise exception 'NOT_IN_ROOM';
  end if;

  if not exists (
    select 1 from rooms where id = p_room_id and status = 'lobby'
  ) then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', t.player_id,
    'nickname', t.nickname,
    'countryCode', t.country_code,
    'status', t.status,
    'invited', t.invited
  ) order by t.status_order, t.nickname), '[]'::jsonb)
  into v_result
  from (
    select
      p.id as player_id,
      p.nickname,
      coalesce(p.country_code, 'UN') as country_code,
      case
        when exists (
          select 1 from room_players rp join rooms r on r.id = rp.room_id
          where rp.player_id = p.id and rp.status = 'in_room' and r.status = 'playing'
        ) then 'in_game'
        when exists (
          select 1 from room_players rp join rooms r on r.id = rp.room_id
          where rp.player_id = p.id and rp.status = 'in_room' and r.status = 'lobby'
        ) then 'in_lobby'
        else 'available'
      end as status,
      case
        when exists (
          select 1 from room_players rp join rooms r on r.id = rp.room_id
          where rp.player_id = p.id and rp.status = 'in_room' and r.status = 'playing'
        ) then 2
        when exists (
          select 1 from room_players rp join rooms r on r.id = rp.room_id
          where rp.player_id = p.id and rp.status = 'in_room' and r.status = 'lobby'
        ) then 1
        else 0
      end as status_order,
      exists (
        select 1 from room_invites ri
        where ri.room_id = p_room_id
          and ri.invited_player_id = p.id
          and ri.status = 'pending'
          and ri.expires_at > now()
      ) as invited
    from players p
    where p.id <> p_player_id
      and p.last_seen_at > now() - interval '90 seconds'
      and not exists (
        select 1 from room_players rp
        where rp.room_id = p_room_id and rp.player_id = p.id
      )
  ) t;

  return v_result;
end;
$$;

create or replace function public.rpc_invite_create(
  p_inviter_id uuid,
  p_room_id uuid,
  p_invited_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_invite room_invites%rowtype;
begin
  if p_inviter_id = p_invited_id then raise exception 'INVALID_TARGET'; end if;

  select * into v_room from rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'lobby' then raise exception 'ROOM_NOT_IN_LOBBY'; end if;

  if not exists (
    select 1 from room_players
    where room_id = p_room_id and player_id = p_inviter_id and status = 'in_room'
  ) then
    raise exception 'NOT_IN_ROOM';
  end if;

  if not exists (
    select 1 from players
    where id = p_invited_id and last_seen_at > now() - interval '90 seconds'
  ) then
    raise exception 'INVITED_OFFLINE';
  end if;

  if exists (
    select 1 from room_players
    where room_id = p_room_id and player_id = p_invited_id
  ) then
    raise exception 'INVITED_ALREADY_IN_ROOM';
  end if;

  if exists (
    select 1 from room_players rp join rooms r on r.id = rp.room_id
    where rp.player_id = p_invited_id and rp.status = 'in_room' and r.status = 'playing'
  ) then
    raise exception 'INVITED_IN_GAME';
  end if;

  if (
    select count(*) from room_invites
    where inviter_player_id = p_inviter_id and created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'INVITE_RATE_LIMIT';
  end if;

  insert into room_invites (room_id, inviter_player_id, invited_player_id)
  values (p_room_id, p_inviter_id, p_invited_id)
  on conflict (room_id, invited_player_id) where status = 'pending'
  do update set
    inviter_player_id = excluded.inviter_player_id,
    created_at = now(),
    expires_at = now() + interval '60 seconds'
  returning * into v_invite;

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'expiresAt', v_invite.expires_at
  );
end;
$$;

create or replace function public.rpc_invite_list(p_player_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  update room_invites ri
  set status = 'expired', responded_at = now()
  where ri.invited_player_id = p_player_id
    and ri.status = 'pending'
    and (
      ri.expires_at <= now()
      or exists (
        select 1 from rooms r
        where r.id = ri.room_id and r.status <> 'lobby'
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ri.id,
    'roomId', r.id,
    'roomCode', r.code,
    'inviterNickname', p.nickname,
    'inviterCountryCode', coalesce(p.country_code, 'UN'),
    'createdAt', ri.created_at,
    'expiresAt', ri.expires_at
  ) order by ri.created_at), '[]'::jsonb)
  into v_result
  from room_invites ri
  join rooms r on r.id = ri.room_id
  join players p on p.id = ri.inviter_player_id
  where ri.invited_player_id = p_player_id
    and ri.status = 'pending'
    and ri.expires_at > now()
    and r.status = 'lobby';

  return v_result;
end;
$$;

create or replace function public.rpc_invite_respond(
  p_player_id uuid,
  p_invite_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_invite room_invites%rowtype;
  v_room rooms%rowtype;
  v_join jsonb;
begin
  select * into v_invite
  from room_invites
  where id = p_invite_id
  for update;

  if not found or v_invite.invited_player_id <> p_player_id then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'INVITE_NOT_PENDING';
  end if;

  if v_invite.expires_at <= now() then
    update room_invites set status = 'expired', responded_at = now() where id = v_invite.id;
    raise exception 'INVITE_EXPIRED';
  end if;

  select * into v_room from rooms where id = v_invite.room_id for update;
  if not found or v_room.status <> 'lobby' then
    update room_invites set status = 'expired', responded_at = now() where id = v_invite.id;
    raise exception 'ROOM_NOT_JOINABLE';
  end if;

  if not p_accept then
    update room_invites set status = 'declined', responded_at = now() where id = v_invite.id;
    return jsonb_build_object('accepted', false);
  end if;

  v_join := rpc_join_room(p_player_id, v_room.code);

  update room_invites
  set status = 'accepted', responded_at = now()
  where id = v_invite.id;

  update room_invites
  set status = 'cancelled', responded_at = now()
  where invited_player_id = p_player_id
    and status = 'pending'
    and id <> v_invite.id;

  return jsonb_build_object(
    'accepted', true,
    'roomId', v_join ->> 'roomId',
    'code', v_join ->> 'code'
  );
end;
$$;

revoke execute on function public.rpc_advance_due(uuid) from public, anon, authenticated;
revoke execute on function public.rpc_start_game(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_submit_answer(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.rpc_skip_turn(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_race_answer(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.rpc_advance_race_due(uuid) from public, anon, authenticated;
revoke execute on function public.rpc_skip_race_question(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_get_state(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_get_race_state(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_presence_list(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_invite_create(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_invite_list(uuid) from public, anon, authenticated;
revoke execute on function public.rpc_invite_respond(uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function public.rpc_advance_due(uuid) to service_role;
grant execute on function public.rpc_start_game(uuid, uuid) to service_role;
grant execute on function public.rpc_submit_answer(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.rpc_skip_turn(uuid, uuid) to service_role;
grant execute on function public.rpc_race_answer(uuid, uuid, integer) to service_role;
grant execute on function public.rpc_advance_race_due(uuid) to service_role;
grant execute on function public.rpc_skip_race_question(uuid, uuid) to service_role;
grant execute on function public.rpc_get_state(uuid, uuid) to service_role;
grant execute on function public.rpc_get_race_state(uuid, uuid) to service_role;
grant execute on function public.rpc_presence_list(uuid, uuid) to service_role;
grant execute on function public.rpc_invite_create(uuid, uuid, uuid) to service_role;
grant execute on function public.rpc_invite_list(uuid) to service_role;
grant execute on function public.rpc_invite_respond(uuid, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
