-- Evitar repeticiones recientes entre partidas de los mismos jugadores.
-- La dificultad objetivo mantiene prioridad; si el pool se agota, se reutiliza.

create index if not exists game_players_player_game_idx
  on public.game_players (player_id, game_id);

create or replace function public.pick_game_question(
  p_game_id uuid,
  p_category text,
  p_difficulty text,
  p_selected uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent uuid[];
  v_id uuid;
begin
  -- Preguntas usadas por cualquiera de los jugadores actuales en sus últimos 10 juegos.
  select array_agg(distinct recent.question_id) into v_recent
  from (
    select gq.question_id
    from public.game_questions gq
    where gq.game_id in (
      select g.id
      from public.games g
      where g.id <> p_game_id
        and exists (
          select 1
          from public.game_players gp
          join public.game_players cp
            on cp.game_id = p_game_id and cp.player_id = gp.player_id
          where gp.game_id = g.id
        )
      order by g.started_at desc
      limit 10
    )
    union
    select rq.question_id
    from public.game_race_questions rq
    where rq.game_id in (
      select g.id
      from public.games g
      where g.id <> p_game_id
        and exists (
          select 1
          from public.game_players gp
          join public.game_players cp
            on cp.game_id = p_game_id and cp.player_id = gp.player_id
          where gp.game_id = g.id
        )
      order by g.started_at desc
      limit 10
    )
  ) recent;

  -- 1. Categoría y dificultad exactas, sin recientes.
  select id into v_id
  from public.questions
  where is_active
    and category = p_category
    and difficulty = p_difficulty
    and id <> all(coalesce(p_selected, '{}'::uuid[]))
    and id <> all(coalesce(v_recent, '{}'::uuid[]))
  order by random()
  limit 1;

  -- 2. Categoría y dificultad exactas, permitiendo recientes.
  if v_id is null then
    select id into v_id
    from public.questions
    where is_active
      and category = p_category
      and difficulty = p_difficulty
      and id <> all(coalesce(p_selected, '{}'::uuid[]))
    order by random()
    limit 1;
  end if;

  -- 3. Dificultad exacta en cualquier categoría, sin recientes.
  if v_id is null then
    select id into v_id
    from public.questions
    where is_active
      and difficulty = p_difficulty
      and id <> all(coalesce(p_selected, '{}'::uuid[]))
      and id <> all(coalesce(v_recent, '{}'::uuid[]))
    order by random()
    limit 1;
  end if;

  -- 4. Dificultad exacta en cualquier categoría, permitiendo recientes.
  if v_id is null then
    select id into v_id
    from public.questions
    where is_active
      and difficulty = p_difficulty
      and id <> all(coalesce(p_selected, '{}'::uuid[]))
    order by random()
    limit 1;
  end if;

  -- 5. Categoría exacta, cualquier dificultad.
  if v_id is null then
    select id into v_id
    from public.questions
    where is_active
      and category = p_category
      and id <> all(coalesce(p_selected, '{}'::uuid[]))
    order by random()
    limit 1;
  end if;

  -- 6. Último recurso.
  if v_id is null then
    select id into v_id
    from public.questions
    where is_active
      and id <> all(coalesce(p_selected, '{}'::uuid[]))
    order by random()
    limit 1;
  end if;

  return v_id;
end;
$$;

do $$
declare
  v_def text;
  v_pattern text := 'v_question_id := null;.*?raise exception ''NOT_ENOUGH_QUESTIONS'';\s*end if;';
  v_replacement text := 'v_question_id := public.pick_game_question(v_game_id, v_category, v_target_diff, v_selected);
      if v_question_id is null then
        raise exception ''NOT_ENOUGH_QUESTIONS'';
      end if;';
begin
  select pg_get_functiondef('public.rpc_start_game(uuid,uuid)'::regprocedure) into v_def;
  v_def := regexp_replace(v_def, v_pattern, v_replacement, 'g');
  execute v_def;

  select pg_get_functiondef('public.rpc_start_race_game(uuid,uuid)'::regprocedure) into v_def;
  v_def := regexp_replace(v_def, v_pattern, v_replacement, 'g');
  execute v_def;
end;
$$;

revoke execute on function public.pick_game_question(uuid, text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.pick_game_question(uuid, text, text, uuid[])
  to service_role;

notify pgrst, 'reload schema';
