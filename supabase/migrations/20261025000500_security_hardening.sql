-- Endurecimiento de seguridad y rendimiento.
-- Corrige el permiso heredado de PUBLIC en las funciones RPC.

alter function public.set_updated_at() set search_path = public;
alter function public.generate_room_code() set search_path = public;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;
grant execute on all functions in schema public to service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'players', 'rooms', 'room_players', 'games', 'game_players',
    'questions', 'game_questions', 'answers', 'votes'
  ] loop
    execute format('drop policy if exists deny_all on public.%I', t);
    execute format(
      'create policy deny_all on public.%I for all to anon, authenticated using (false) with check (false)',
      t
    );
  end loop;
end;
$$;

create index if not exists answers_player_idx on public.answers (player_id);
create index if not exists game_players_player_idx on public.game_players (player_id);
create index if not exists game_questions_player_idx on public.game_questions (player_id);
create index if not exists game_questions_question_idx on public.game_questions (question_id);
create index if not exists games_current_player_idx on public.games (current_player_id);
create index if not exists games_winner_player_idx on public.games (winner_player_id);
create index if not exists games_last_eliminated_idx on public.games (last_eliminated_player_id);
create index if not exists rooms_current_game_idx on public.rooms (current_game_id);
create index if not exists rooms_host_player_idx on public.rooms (host_player_id);
create index if not exists votes_target_player_idx on public.votes (target_player_id);
create index if not exists votes_voter_player_idx on public.votes (voter_player_id);

notify pgrst, 'reload schema';
