import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, cn } from './ui';
import { CountryFlag } from './CountryFlag';
import { ConnectedPlayersPanel } from './ConnectedPlayersPanel';
import { MODE_LABEL, roomLink } from '../lib/format';
import type { GameMode, RoomState } from '../types';

export function LobbyView({
  state,
  busy,
  onUpdate,
  onStart,
  onCopy,
  onNotify,
  onCloseRoom,
  onLeave,
}: {
  state: RoomState;
  busy: boolean;
  onUpdate: (mode: GameMode, rounds: number) => Promise<void>;
  onStart: () => Promise<void>;
  onCopy: (text: string, label: string) => void;
  onNotify: (message: string, tone?: 'error' | 'success' | 'info') => void;
  onCloseRoom: () => void;
  onLeave: () => void;
}) {
  const [mode, setMode] = useState<GameMode>(state.room.mode);
  const [rounds, setRounds] = useState(state.room.maxRounds);
  const isHost = state.me.isHost;
  const playerCount = state.room.playerCount;
  const minPlayers = mode === 'elimination' ? 3 : 2;

  useEffect(() => {
    setMode(state.room.mode);
    setRounds(state.room.maxRounds);
  }, [state.room.mode, state.room.maxRounds]);

  const changeMode = (next: GameMode) => {
    if (!isHost || busy || next === mode) return;
    setMode(next);
    void onUpdate(next, rounds);
  };

  const changeRounds = (next: number) => {
    if (!isHost || busy) return;
    const clamped = Math.min(30, Math.max(1, next));
    if (clamped === rounds) return;
    setRounds(clamped);
    void onUpdate(mode, clamped);
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-2 xl:grid-cols-[1.05fr_0.9fr_0.8fr]">
      <div className="space-y-6">
        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gold-400/10 blur-3xl" />
          <div className="relative">
            <Badge tone="gold">Sala de espera</Badge>
            <h1 className="mt-4 font-display text-5xl tracking-wide text-white sm:text-6xl">
              Comparte el código
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/50">
              Cada jugador entra desde su propio navegador. La partida empieza cuando el
              anfitrión lo decida.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onCopy(state.room.code, 'Código copiado')}
                className="rounded-2xl border border-gold-400/30 bg-gold-400/10 px-5 py-3 font-mono text-3xl font-bold tracking-[0.32em] text-gold-300 transition hover:border-gold-400/60 hover:bg-gold-400/15"
                title="Copiar código"
              >
                {state.room.code}
              </button>
              <Button
                variant="secondary"
                onClick={() => onCopy(roomLink(state.room.code), 'Enlace copiado')}
              >
                Copiar enlace
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge tone="cyan">{MODE_LABEL[state.room.mode]}</Badge>
              <Badge tone="muted">
                {state.room.maxRounds} {state.room.maxRounds === 1 ? 'turno' : 'turnos'} por jugador
              </Badge>
              <Badge tone="muted">
                {playerCount} {playerCount === 1 ? 'jugador' : 'jugadores'}
              </Badge>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
              Jugadores en la sala
            </h2>
            <Badge tone="muted">{playerCount}</Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[...state.players]
              .sort((a, b) => a.seat - b.seat)
              .map((player) => (
                <div
                  key={player.playerId}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3',
                    player.status === 'left' && 'opacity-40',
                  )}
                >
                  <Avatar name={player.nickname} seat={player.seat} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                      <CountryFlag code={player.countryCode} size="sm" />
                      <span className="truncate">{player.nickname}</span>
                      {player.playerId === state.me.playerId && (
                        <span className="text-[10px] font-normal text-cyan-300">tú</span>
                      )}
                    </p>
                    <p className="text-[11px] text-white/35">
                      {player.isHost ? 'Anfitrión' : 'Jugador'}
                    </p>
                  </div>
                  {player.isHost && <Badge tone="gold">Host</Badge>}
                </div>
              ))}

            {playerCount < 2 && (
              <div className="flex min-h-[70px] items-center justify-center rounded-2xl border border-dashed border-white/10 p-3 text-xs text-white/25">
                Comparte el código para que se unan más jugadores
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        {isHost ? (
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl tracking-wide text-white">
                  Configuración
                </h2>
                <p className="mt-1 text-xs text-white/35">
                  Solo tú puedes cambiar el modo y la cantidad de preguntas.
                </p>
              </div>
              <Badge tone="gold">Anfitrión</Badge>
            </div>

            <div className="mt-5">
              <span className="label">Modo de juego</span>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeMode('classic')}
                  className={cn(
                    'w-full rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed',
                    mode === 'classic'
                      ? 'border-gold-400/45 bg-gold-400/[0.08]'
                      : 'border-white/10 bg-white/[0.025] hover:border-white/20',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Clásico</span>
                    {mode === 'classic' && <Badge tone="gold">Elegido</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/40">
                    Todos responden la misma cantidad de preguntas, con 10 segundos por turno,
                    y gana el mayor puntaje. Mínimo 2 jugadores.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeMode('elimination')}
                  className={cn(
                    'w-full rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed',
                    mode === 'elimination'
                      ? 'border-red-400/40 bg-red-500/[0.07]'
                      : 'border-white/10 bg-white/[0.025] hover:border-white/20',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Eliminación</span>
                    {mode === 'elimination' && <Badge tone="red">Elegido</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/40">
                    Cada turno dura 10 segundos. Después de cada ronda, los activos votan y el
                    más votado sale. Mínimo 3 jugadores.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeMode('race')}
                  className={cn(
                    'w-full rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed',
                    mode === 'race'
                      ? 'border-cyan-400/45 bg-cyan-400/[0.08]'
                      : 'border-white/10 bg-white/[0.025] hover:border-white/20',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Relámpago</span>
                    {mode === 'race' && <Badge tone="cyan">Elegido</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/40">
                    Todos responden a la vez durante 10 segundos. El primero se lleva los
                    puntos; si falla, pierde 100. Sin eliminación. Mínimo 2 jugadores.
                  </p>
                </button>
              </div>
            </div>

            <div className="mt-5">
              <span className="label">
                {mode === 'race' ? 'Preguntas de la partida' : 'Turnos por jugador'}
              </span>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => changeRounds(rounds - 1)}
                  disabled={busy || rounds <= 1}
                  aria-label="Quitar un turno"
                >
                  −
                </Button>
                <div className="flex-1 rounded-xl border border-white/10 bg-ink-900/70 py-3 text-center">
                  <span className="font-display text-3xl text-gold-300">{rounds}</span>
                  <span className="ml-2 text-xs text-white/35">
                    {rounds === 1 ? 'pregunta' : 'preguntas'}{' '}
                    {mode === 'race' ? 'en total' : 'por jugador'}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => changeRounds(rounds + 1)}
                  disabled={busy || rounds >= 30}
                  aria-label="Agregar un turno"
                >
                  +
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-white/30">
                {mode === 'race'
                  ? `10 segundos por pregunta · ${rounds} ${rounds === 1 ? 'pregunta' : 'preguntas'} en total.`
                  : `Total estimado: ${rounds * playerCount} preguntas en esta partida.`}
              </p>
            </div>

            <div className="mt-6">
              <Button
                fullWidth
                size="lg"
                onClick={() => void onStart()}
                disabled={playerCount < minPlayers || busy}
                loading={busy}
              >
                Iniciar partida
              </Button>
              {playerCount < minPlayers ? (
                <p className="mt-3 text-center text-xs text-amber-200/70">
                  Faltan {minPlayers - playerCount}{' '}
                  {minPlayers - playerCount === 1 ? 'jugador' : 'jugadores'} para comenzar en
                  modo {MODE_LABEL[mode].toLowerCase()}.
                </p>
              ) : (
                <p className="mt-3 text-center text-xs text-white/30">
                  La partida empezará en cuanto presiones el botón.
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-white/5 pt-5">
              <Button
                fullWidth
                variant="danger"
                onClick={onCloseRoom}
                disabled={busy}
              >
                Cerrar sala
              </Button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-white/30">
                Cierra la sala para todos y elimina su historial. Solo está disponible cuando
                no hay una partida en curso.
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <Badge tone="cyan">Esperando</Badge>
            <h2 className="mt-4 font-display text-3xl tracking-wide text-white">
              El anfitrión decide
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/45">
              Solo el creador de la sala puede cambiar la configuración e iniciar la partida.
              En cuanto lo haga, la pantalla se actualizará automáticamente.
            </p>

            <div className="mt-5 space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Modo</span>
                <span className="font-semibold text-white">{MODE_LABEL[state.room.mode]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">
                  {state.room.mode === 'race' ? 'Preguntas de la partida' : 'Turnos por jugador'}
                </span>
                <span className="font-semibold text-white">{state.room.maxRounds}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Jugadores</span>
                <span className="font-semibold text-white">{playerCount}</span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 text-xs text-white/30">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              Actualizándose en tiempo real
            </div>

            <Button
              variant="secondary"
              fullWidth
              className="mt-5"
              onClick={onLeave}
            >
              Salir de la sala
            </Button>
          </Card>
        )}

        <Card className="p-5">
          <p className="text-[11px] leading-relaxed text-white/30">
            <strong className="text-white/50">Regla de la sala:</strong> el anfitrión controla
            el inicio y puede reiniciar la sala al finalizar. Los puntajes son solo de esta
            sala; no hay ranking global.
          </p>
        </Card>
      </div>

      <ConnectedPlayersPanel roomId={state.room.id} onNotify={onNotify} />
    </div>
  );
}
