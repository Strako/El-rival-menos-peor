import { Badge, Button, Logo, cn } from './ui';
import { SoundToggle } from './SoundToggle';
import { MODE_LABEL } from '../lib/format';
import type { RoomState } from '../types';

export function RoomHeader({
  state,
  connected,
  onHome,
  onCopy,
  onLeave,
}: {
  state: RoomState;
  connected: boolean;
  onHome: () => void;
  onCopy: () => void;
  onLeave: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
        <Logo compact onClick={onHome} />
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/30">
            Sala
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 transition hover:border-gold-400/30 hover:bg-gold-400/10"
            title="Copiar código de sala"
          >
            <span className="font-mono text-base font-bold tracking-[0.28em] text-gold-300">
              {state.room.code}
            </span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/30 group-hover:text-gold-300" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="8" y="8" width="11" height="12" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
            </svg>
          </button>
          <Badge tone={state.room.status === 'playing' ? 'cyan' : 'muted'}>
            {state.room.status === 'lobby'
              ? 'Espera'
              : state.room.status === 'playing'
                ? 'En juego'
                : 'Finalizada'}
          </Badge>
          <Badge tone="muted" className="hidden md:inline-flex">
            {MODE_LABEL[state.room.mode]}
          </Badge>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2 text-xs text-white/45 sm:flex">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                connected ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'animate-pulse bg-amber-400',
              )}
            />
            {connected ? 'En vivo' : 'Sincronizando'}
          </span>
          <span className="hidden text-xs text-white/40 md:inline">
            {state.room.playerCount} {state.room.playerCount === 1 ? 'jugador' : 'jugadores'}
          </span>
          <SoundToggle />
          <Button variant="ghost" size="sm" onClick={onLeave}>
            Salir
          </Button>
        </div>
      </div>
    </header>
  );
}
