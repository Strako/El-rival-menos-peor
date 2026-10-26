-- Temporizador global de 20 s y progresión de dificultad por tercios.
-- Se actualizan las funciones ya desplegadas, no solo las migraciones históricas.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_start_game(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, 'interval ''10 seconds''', 'interval ''20 seconds''');
  v_def := replace(v_def, 'ceil(v_max_rounds * 0.4)', 'ceil(v_max_rounds / 3.0)');
  v_def := replace(v_def, 'ceil(v_max_rounds * 0.8)', 'ceil(v_max_rounds * 2.0 / 3.0)');
  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_advance_due(uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, 'interval ''10 seconds''', 'interval ''20 seconds''');
  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_start_race_game(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, 'interval ''10 seconds''', 'interval ''20 seconds''');
  v_def := replace(
    v_def,
    'v_easy_end := greatest(1, round(v_total * 0.4)::integer);',
    'v_easy_end := greatest(1, ceil(v_total / 3.0)::integer);'
  );
  v_def := replace(
    v_def,
    'v_medium_end := least(v_total, greatest(v_easy_end + 1, round(v_total * 0.8)::integer));',
    'v_medium_end := least(v_total, greatest(v_easy_end + 1, ceil(v_total * 2.0 / 3.0)::integer));'
  );
  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_advance_race_due(uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, 'interval ''10 seconds''', 'interval ''20 seconds''');
  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.activate_pending_items(uuid,uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, 'interval ''10 seconds''', 'interval ''20 seconds''');
  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.rpc_race_answer(uuid,uuid,integer)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    'least(10, extract(epoch from (v_rq.deadline_at - v_now)))',
    'least(20, extract(epoch from (v_rq.deadline_at - v_now)))'
  );
  v_def := replace(v_def, 'v_remaining / 10 / 5', 'v_remaining / 20 / 5');
  execute v_def;
end;
$$;

notify pgrst, 'reload schema';
