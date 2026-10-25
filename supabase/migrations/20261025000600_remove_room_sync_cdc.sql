-- La sincronización usa Supabase Realtime Broadcast + polling.
-- Se elimina la tabla room_sync y los triggers de CDC, que ya no son necesarios.

drop trigger if exists rooms_bump_sync on public.rooms;
drop trigger if exists room_players_bump_sync on public.room_players;
drop trigger if exists games_bump_sync on public.games;
drop trigger if exists game_players_bump_sync on public.game_players;
drop trigger if exists game_questions_bump_sync on public.game_questions;
drop trigger if exists answers_bump_sync on public.answers;
drop trigger if exists votes_bump_sync on public.votes;

drop function if exists public.bump_room_sync_from_room();
drop function if exists public.bump_room_sync_from_room_player();
drop function if exists public.bump_room_sync_from_game();
drop function if exists public.bump_room_sync_from_game_row();
drop function if exists public.bump_room_sync(uuid);

drop table if exists public.room_sync cascade;

notify pgrst, 'reload schema';
