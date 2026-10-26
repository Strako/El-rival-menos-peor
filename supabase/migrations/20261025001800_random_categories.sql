-- Categorías aleatorias con reparto equilibrado por partida.

create or replace function public.random_category_bag(p_count integer)
returns text[]
language sql
volatile
set search_path = public
as $$
  select array_agg(category order by random())
  from (
    select (array['general', 'videogames', 'series_90s'])[((i - 1) % 3) + 1] as category
    from generate_series(1, greatest(p_count, 1)) as i
  ) bag;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_start_game(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'v_categories text[] := array[''general'', ''videogames'', ''series_90s''];',
    'v_category_bag text[];'
  );
  v_def := replace(
    v_def,
    'v_needed := v_count * v_max_rounds;',
    'v_needed := v_count * v_max_rounds;
  v_category_bag := public.random_category_bag(v_needed);'
  );
  v_def := replace(
    v_def,
    'v_category := v_categories[(((v_round - 1) * v_count + v_turn) % 3) + 1];',
    'v_category := v_category_bag[((v_round - 1) * v_count + v_turn) + 1];'
  );
  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_start_race_game(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'v_categories text[] := array[''general'', ''videogames'', ''series_90s''];',
    'v_category_bag text[];'
  );
  v_def := replace(
    v_def,
    'v_total := v_room.max_rounds;',
    'v_total := v_room.max_rounds;
  v_category_bag := public.random_category_bag(v_total);'
  );
  v_def := replace(
    v_def,
    'v_category := v_categories[((v_i - 1) % 3) + 1];',
    'v_category := v_category_bag[v_i];'
  );
  execute v_def;
end;
$$;

revoke execute on function public.random_category_bag(integer) from public, anon, authenticated;
grant execute on function public.random_category_bag(integer) to service_role;

notify pgrst, 'reload schema';
