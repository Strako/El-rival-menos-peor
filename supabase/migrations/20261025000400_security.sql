-- Seguridad: RLS, permisos y Realtime.

alter table public.players enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.questions enable row level security;
alter table public.game_questions enable row level security;
alter table public.answers enable row level security;
alter table public.votes enable row level security;
alter table public.room_sync enable row level security;

-- Lo único legible por el cliente es la señal de sincronización.
drop policy if exists room_sync_read on public.room_sync;
create policy room_sync_read
  on public.room_sync
  for select
  to anon, authenticated
  using (true);

-- El cliente no puede leer ni escribir directamente ninguna tabla de juego.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.room_sync to anon, authenticated;

-- Las funciones RPC solo las usa el service_role desde las Edge Functions.
revoke execute on all functions in schema public from anon, authenticated;
grant execute on all functions in schema public to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Realtime: publicar únicamente room_sync.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'room_sync'
    ) then
      alter publication supabase_realtime add table public.room_sync;
    end if;
  end if;
end;
$$;
