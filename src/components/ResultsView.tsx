import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, Modal, cn } from './ui';
import { Confetti } from './Confetti';
import { CountryFlag } from './CountryFlag';
import { rankBadge } from '../lib/rank';
import { MODE_LABEL, formatScore } from '../lib/format';
import type { RankingEntry, RoomState } from '../types';

const PODIUM_STYLES = [
  'border-gold-400/40 bg-gold-400/[0.08]',
  'border-white/20 bg-white/[0.04]',
  'border-orange-400/25 bg-orange-400/[0.05]',
];

export function ResultsView({
  state,
  busy,
  onRestart,
  onCloseRoom,
  onLeave,
}: {
  state: RoomState;
  busy: boolean;
  onRestart: () => Promise<void>;
  onCloseRoom: () => void;
  onLeave: () => void;
}) {
  const [celebrate, setCelebrate] = useState(true);
  const [restartOpen, setRestartOpen] = useState(false);
  const winner =
    state.results?.winner ??
    (() => {
      const player = state.players.find((entry) => entry.isWinner);
      return player
        ? { playerId: player.playerId, nickname: player.nickname, score: player.score }
        : null;
    })();

  const ranking: RankingEntry[] = state.results?.ranking?.length
    ? state.results.ranking
    : [...state.players]
        .filter((player) => player.status !== 'left')
        .sort(
          (a, b) =>
            (a.finalRank ?? 999) - (b.finalRank ?? 999) ||
            b.score - a.score ||
            a.seat - b.seat,
        )
        .map((player) => ({
          playerId: player.playerId,
          nickname: player.nickname,
          score: player.score,
          correctCount: player.correctCount,
          status: player.status,
          eliminatedRound: player.eliminatedRound,
          finalRank: player.finalRank,
          isWinner: player.isWinner,
          seat: player.seat,
        }));

  useEffect(() => {
    setCelebrate(true);
    const timer = window.setTimeout(() => setCelebrate(false), 6500);
    return () => window.clearTimeout(timer);
  }, [state.game?.id]);

  const topThree = [...ranking]
    .sort((a, b) => b.score - a.score || a.seat - b.seat)
    .slice(0, 3);

  const countryFor = (playerId: string) =>
    state.players.find((player) => player.playerId === playerId)?.countryCode ?? 'UN';

  return (
    <>
      <Confetti active={celebrate} pieces={130} />

      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div className="text-center">
          <Badge tone="gold">Partida finalizada</Badge>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.35em] text-white/35">
            {winner ? 'Ganador de la sala' : 'Fin de la partida'}
          </p>

          {winner ? (
            <>
              <h1 className="text-glow mt-2 font-display text-6xl tracking-wide text-gold-300 sm:text-8xl">
                {winner.nickname}
              </h1>
              <p className="mt-2 font-display text-4xl text-white sm:text-5xl">
                {formatScore(winner.score)}{' '}
                <span className="text-lg text-white/40 sm:text-2xl">puntos</span>
              </p>
            </>
          ) : (
            <h1 className="mt-2 font-display text-6xl tracking-wide text-white/70 sm:text-7xl">
              Sin ganador
            </h1>
          )}

          <p className="mt-4 text-sm text-white/35">
            {MODE_LABEL[state.room.mode]} · {state.room.maxRounds}{' '}
            {state.room.maxRounds === 1 ? 'turno' : 'turnos'} por jugador · Sala{' '}
            <span className="font-mono tracking-widest text-white/60">{state.room.code}</span>
          </p>
        </div>

        {topThree.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {topThree.map((entry, index) => (
              <Card
                key={entry.playerId}
                className={cn(
                  'relative overflow-hidden p-5 text-center',
                  PODIUM_STYLES[index] ?? PODIUM_STYLES[2],
                  index === 0 && 'sm:-mt-3 sm:pb-7',
                )}
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <p
                  role="img"
                  aria-label={rankBadge(index + 1).label}
                  title={rankBadge(index + 1).label}
                  className="font-display text-4xl"
                >
                  {rankBadge(index + 1).emoji}
                </p>
                <Avatar
                  name={entry.nickname}
                  seat={entry.seat}
                  size="lg"
                  className="mx-auto mt-2"
                />
                <p className="mt-3 flex items-center justify-center gap-1.5 truncate text-sm font-bold text-white">
                  <CountryFlag code={countryFor(entry.playerId)} size="sm" />
                  <span className="truncate">{entry.nickname}</span>
                </p>
                <p
                  className={cn(
                    'mt-1 font-display text-3xl',
                    entry.score < 0 ? 'text-red-300' : 'text-gold-300',
                  )}
                >
                  {formatScore(entry.score)}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-white/30">
                  {entry.correctCount} aciertos
                </p>
              </Card>
            ))}
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
              Tabla final de la sala
            </h2>
            <Badge tone="muted">{ranking.length} jugadores</Badge>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {ranking.map((entry, index) => (
              <div
                key={entry.playerId}
                className={cn(
                  'flex items-center gap-3 px-5 py-3',
                  entry.playerId === state.me.playerId && 'bg-cyan-400/[0.04]',
                  entry.status === 'eliminated' && 'opacity-60',
                )}
              >
                <span
                  role="img"
                  aria-label={rankBadge(index + 1).label}
                  title={rankBadge(index + 1).label}
                  className={cn(
                    'grid h-7 min-w-7 place-items-center rounded-lg px-1 text-sm font-bold',
                    entry.isWinner
                      ? 'bg-gold-400/20'
                      : index < 3
                        ? 'bg-white/15 text-white'
                        : 'bg-white/5 text-white/40',
                  )}
                >
                  {rankBadge(index + 1).emoji}
                </span>
                <Avatar name={entry.nickname} seat={entry.seat} size="sm" muted={entry.status === 'eliminated'} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white/85">
                    <CountryFlag code={countryFor(entry.playerId)} size="sm" />
                    <span className="truncate">{entry.nickname}</span>
                    {entry.playerId === state.me.playerId && (
                      <span className="text-[10px] text-cyan-300">tú</span>
                    )}
                  </p>
                  <p className="text-[11px] text-white/30">
                    {entry.correctCount} aciertos
                    {entry.eliminatedRound !== null
                      ? ` · eliminado en ronda ${entry.eliminatedRound}`
                      : entry.status === 'left'
                        ? ' · abandonó'
                        : ''}
                  </p>
                </div>
                {entry.isWinner && <Badge tone="gold">Ganador</Badge>}
                <span
                  className={cn(
                    'font-display text-2xl',
                    entry.score < 0 ? 'text-red-300' : 'text-white',
                  )}
                >
                  {formatScore(entry.score)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 text-center">
          {state.me.isHost ? (
            <>
              <p className="text-sm text-white/50">
                La sala sigue abierta. Puedes cambiar el modo y los turnos antes de volver a
                empezar, o cerrarla para todos.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  size="lg"
                  onClick={() => setRestartOpen(true)}
                  disabled={busy}
                >
                  Volver a jugar
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  onClick={onCloseRoom}
                  disabled={busy}
                >
                  Cerrar sala
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              <p className="text-sm text-white/45">
                Esperando al anfitrión para configurar la siguiente partida.
              </p>
              <Button variant="secondary" onClick={onLeave}>
                Salir de la sala
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={restartOpen}
        title="¿Volver a jugar?"
        description="La sala volverá a la pantalla de configuración. Se conservarán los jugadores y el resultado de esta partida."
        confirmLabel="Volver a jugar"
        onConfirm={async () => {
          await onRestart();
          setRestartOpen(false);
        }}
        onClose={() => setRestartOpen(false)}
        loading={busy}
      />
    </>
  );
}
