import { Avatar, Badge, cn } from './ui';
import { CountryFlag } from './CountryFlag';
import { PLAYER_STATUS_LABEL } from '../lib/format';
import type { RoomState } from '../types';

export function PlayerRail({ state }: { state: RoomState }) {
  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const currentId = state.game?.currentPlayerId ?? null;

  return (
    <aside className="card order-2 p-4 lg:sticky lg:top-24 lg:order-1 lg:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
          {state.room.mode === 'race' ? 'Jugadores' : 'Orden de turno'}
        </h2>
        <Badge tone="muted">{players.length}</Badge>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:mt-4 lg:flex-col lg:overflow-visible lg:pb-0">
        {players.map((player) => {
          const isCurrent = currentId === player.playerId && state.game?.status === 'playing';
          const isMe = player.playerId === state.me.playerId;
          const isOut = player.status === 'eliminated' || player.status === 'left';

          return (
            <div
              key={player.playerId}
              className={cn(
                'min-w-[190px] rounded-2xl border p-3 transition lg:min-w-0',
                isCurrent
                  ? 'border-gold-400/45 bg-gold-400/[0.09] shadow-[0_0_30px_-16px_rgba(255,201,77,0.8)]'
                  : 'border-white/[0.06] bg-white/[0.025]',
                isOut && 'opacity-45',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.07] text-[10px] font-bold text-white/40">
                  {player.seat + 1}
                </span>
                <Avatar name={player.nickname} seat={player.seat} size="sm" muted={isOut} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white/90">
                    <CountryFlag code={player.countryCode} size="sm" />
                    <span className="truncate">{player.nickname}</span>
                    {isMe && <span className="text-[10px] font-normal text-cyan-300">tú</span>}
                  </p>
                  <p className="truncate text-[11px] text-white/35">
                    {PLAYER_STATUS_LABEL[player.status] ?? player.status}
                    {' · '}
                    {player.correctCount} aciertos
                  </p>
                </div>
                <span
                  className={cn(
                    'font-display text-xl leading-none',
                    player.score < 0 ? 'text-red-300' : 'text-gold-300',
                  )}
                >
                  {player.score}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                {player.isHost && <Badge tone="gold">Anfitrión</Badge>}
                {isCurrent && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gold-200">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-300" />
                    Turno
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
