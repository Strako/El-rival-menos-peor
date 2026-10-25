import { Badge, cn } from './ui';
import { CountryFlag } from './CountryFlag';
import { rankBadge } from '../lib/rank';
import type { RoomState } from '../types';

export function Scoreboard({ state }: { state: RoomState }) {
  const players = [...state.players]
    .filter((player) => player.status !== 'left')
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.correctCount - a.correctCount ||
        a.seat - b.seat,
    );
  const maxScore = Math.max(1, ...players.map((player) => player.score));

  return (
    <aside className="card order-3 min-w-0 p-4 lg:sticky lg:top-24 lg:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
            Tabla de la sala
          </h2>
        </div>
        <Badge tone="muted">En vivo</Badge>
      </div>

      <div className="mt-4 space-y-3">
        {players.map((player, index) => (
          <div key={player.playerId} className={cn(player.status === 'eliminated' && 'opacity-45')}>
            <div className="flex items-center gap-2">
              <span
                role="img"
                aria-label={rankBadge(index + 1).label}
                title={rankBadge(index + 1).label}
                className={cn(
                  'grid h-6 min-w-6 place-items-center rounded-md px-1 text-sm font-bold',
                  index === 0
                    ? 'bg-gold-400/20'
                    : index === 1
                      ? 'bg-white/10'
                      : index === 2
                        ? 'bg-orange-400/10'
                        : 'bg-white/5',
                )}
              >
                {rankBadge(index + 1).emoji}
              </span>
              <CountryFlag code={player.countryCode} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/80">
                {player.nickname}
                {player.playerId === state.me.playerId && (
                  <span className="ml-1 text-[10px] text-cyan-300">tú</span>
                )}
              </span>
              <span
                className={cn(
                  'font-display text-lg leading-none',
                  player.score < 0 ? 'text-red-300' : 'text-white',
                )}
              >
                {player.score}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  index === 0
                    ? 'bg-gradient-to-r from-gold-500 to-gold-300'
                    : 'bg-gradient-to-r from-cyan-500/60 to-cyan-300/50',
                )}
                style={{
                  width: `${player.score > 0 ? Math.max(3, (player.score / maxScore) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-white/30">
              <span>{player.correctCount} aciertos</span>
              {player.status === 'eliminated' && (
                <span className="text-red-300">Eliminado ronda {player.eliminatedRound}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-white/25">
        Esta tabla se ordena por puntos. El orden de turno es fijo por asiento y no cambia con
        el puntaje. No hay ranking global.
      </p>
    </aside>
  );
}
