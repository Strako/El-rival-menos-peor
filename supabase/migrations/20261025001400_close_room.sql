-- Cierre de sala por parte del anfitrión.
-- Solo se permite si la partida no está en curso, salvo que no queden jugadores dentro.

create or replace function public.rpc_close_room(p_host_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_players integer;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.host_player_id <> p_host_id then
    raise exception 'NOT_HOST';
  end if;

  select count(*) into v_players
  from room_players
  where room_id = p_room_id and status = 'in_room';

  if (
    v_room.status = 'playing'
    or exists (
      select 1 from games
      where games.room_id = p_room_id and games.status = 'playing'
    )
  ) and v_players > 0 then
    raise exception 'ROOM_IN_PROGRESS';
  end if;

  delete from rooms where id = p_room_id;

  return jsonb_build_object('closed', true);
end;
$$;

revoke execute on function public.rpc_close_room(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_close_room(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
