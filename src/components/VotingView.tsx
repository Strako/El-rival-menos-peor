import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, Modal, Spinner, cn } from './ui';
import { useCountdown } from '../hooks/useCountdown';
import type { RoomState } from '../types';

export function VotingView({
  state,
  busy,
  onVote,
  onForceVote,
}: {
  state: RoomState;
  busy: boolean;
  onVote: (targetPlayerId: string) => Promise<void>;
  onForceVote: () => Promise<void>;
}) {
  const game = state.game;
  const voting = state.voting;
  const [selected, setSelected] = useState<string | null>(null);
  const [forceOpen, setForceOpen] = useState(false);
  const countdown = useCountdown(game?.revealUntil);
  const isVoteResult = game?.phase === 'vote_result';
  const tally = game?.lastVoteResult ?? [];
  const eliminatedId = game?.lastEliminatedPlayerId ?? null;
  const maxVotes = Math.max(1, ...tally.map((entry) => entry.votes));

  useEffect(() => {
    setSelected(null);
  }, [game?.currentRound, game?.phase]);

  if (isVoteResult) {
    const eliminated = state.players.find((player) => player.playerId === eliminatedId);
    const activeCount = state.players.filter((player) => player.status === 'active').length;
    const ordered = [...tally].sort((a, b) => b.votes - a.votes);

    return (
      <div className="space-y-4">
        <Card className="animate-pop overflow-hidden p-6 text-center sm:p-8">
          <Badge tone="red">Resultado de la votación</Badge>
          <div className="animate-stamp mx-auto mt-5 w-fit max-w-full rounded-2xl border-2 border-red-400/60 bg-red-500/10 px-5 py-4 sm:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-red-200/70">
              El rival menos peor
            </p>
            <p className="mt-1 max-w-full break-words font-display text-4xl tracking-wide text-red-200 [overflow-wrap:anywhere] sm:text-5xl lg:text-6xl">
              {eliminated?.nickname ?? 'Sin eliminado'}
            </p>
          </div>
          <p className="mt-4 text-sm text-white/45">
            {eliminated
              ? `${eliminated.nickname} queda fuera de la partida y pasa a espectador.`
              : 'No se pudo determinar un eliminado.'}
          </p>
          {activeCount <= 1 && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-gold-200">
              La partida está por terminar…
            </p>
          )}
          {countdown > 0 && (
            <p className="mt-4 text-xs text-white/30">
              Continúa en <span className="font-bold text-white/70">{countdown}s</span>
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
            Votos de la ronda {game?.currentRound}
          </h3>
          <div className="mt-4 space-y-3">
            {ordered.map((entry) => {
              const player = state.players.find((p) => p.playerId === entry.playerId);
              const isEliminated = entry.playerId === eliminatedId;
              return (
                <div key={entry.playerId}>
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className={cn(
                        'font-medium',
                        isEliminated ? 'text-red-200' : 'text-white/70',
                      )}
                    >
                      {player?.nickname ?? 'Jugador'}
                      {isEliminated && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-red-300">
                          eliminado
                        </span>
                      )}
                    </span>
                    <span className="font-display text-xl text-white/80">{entry.votes}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={cn(
                        'animate-bar h-full rounded-full',
                        isEliminated
                          ? 'bg-gradient-to-r from-red-500 to-red-300'
                          : 'bg-gradient-to-r from-cyan-500/60 to-cyan-300/50',
                      )}
                      style={{ width: `${Math.max(4, (entry.votes / maxVotes) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  }

  if (!voting) {
    return (
      <Card className="flex min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
        <Spinner className="h-8 w-8 text-cyan-300" />
        <div>
          <h2 className="font-display text-3xl tracking-wide text-white">Preparando votación</h2>
          <p className="mt-2 text-sm text-white/35">
            La ronda terminó. En unos segundos se abrirá la votación.
          </p>
        </div>
      </Card>
    );
  }

  const alreadyVoted = Boolean(voting.myVoteTargetId);
  const progress =
    voting.votersTotal > 0 ? Math.round((voting.votesCast / voting.votersTotal) * 100) : 0;

  return (
    <>
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-red-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone="red">Votación secreta</Badge>
            <h1 className="mt-3 font-display text-4xl tracking-wide text-white sm:text-5xl">
              ¿Quién es El rival menos peor?
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/45">
              Elige a un jugador activo. El más votado queda eliminado al cerrar la ronda.
              Nadie verá tu voto hasta el final.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-900/60 px-5 py-3 text-center">
            <p className="font-display text-3xl text-white">
              {voting.votesCast}/{voting.votersTotal}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-white/30">votos emitidos</p>
          </div>
        </div>

        <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-500 to-gold-300 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {!state.me.isActive ? (
          <div className="relative mt-6 rounded-2xl border border-red-400/20 bg-red-500/[0.05] p-5 text-center">
            <p className="text-sm font-semibold text-red-200">Estás eliminado</p>
            <p className="mt-1 text-xs text-white/40">
              Observa la votación. Los jugadores activos son quienes deciden.
            </p>
          </div>
        ) : alreadyVoted ? (
          <div className="relative mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-6 text-center">
            <p className="text-sm font-bold text-emerald-200">Voto registrado</p>
            <p className="mt-1 text-xs text-white/40">
              Esperando a que voten los demás jugadores activos…
            </p>
            <div className="mt-4 flex justify-center">
              <Spinner className="h-5 w-5 text-emerald-300" />
            </div>
          </div>
        ) : (
          <>
            <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
              {voting.candidates.map((candidate) => {
                const isSelected = selected === candidate.playerId;
                return (
                  <button
                    key={candidate.playerId}
                    type="button"
                    onClick={() => setSelected(candidate.playerId)}
                    disabled={busy}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed',
                      isSelected
                        ? 'border-gold-400/50 bg-gold-400/[0.09]'
                        : 'border-white/10 bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.05]',
                    )}
                  >
                    <Avatar name={candidate.nickname} seat={candidate.seat} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {candidate.nickname}
                      </p>
                      <p className="text-[11px] text-white/35">Jugador activo</p>
                    </div>
                    <span
                      className={cn(
                        'grid h-6 w-6 place-items-center rounded-full border text-[10px] font-bold',
                        isSelected
                          ? 'border-gold-300 bg-gold-400 text-ink-950'
                          : 'border-white/20 text-transparent',
                      )}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-white/30">
                Puedes cambiar tu selección antes de confirmar.
              </p>
              <Button
                onClick={() => selected && void onVote(selected)}
                disabled={!selected || busy}
                loading={busy}
              >
                Confirmar voto
              </Button>
            </div>
          </>
        )}

        {state.me.isHost && voting.votesCast < voting.votersTotal && (
          <div className="relative mt-6 border-t border-white/5 pt-4">
            <Button variant="ghost" size="sm" onClick={() => setForceOpen(true)} disabled={busy}>
              Forzar cierre de votación
            </Button>
            <p className="mt-1 text-[10px] text-white/25">
              Úsalo solo si un jugador se desconectó. Los votos faltantes cuentan como
              abstención.
            </p>
          </div>
        )}
      </Card>

      <Modal
        open={forceOpen}
        title="¿Cerrar la votación ahora?"
        description="Se eliminará al jugador con más votos usando los votos emitidos hasta ahora. Los jugadores que no votaron se consideran abstenciones."
        confirmLabel="Cerrar votación"
        onConfirm={async () => {
          await onForceVote();
          setForceOpen(false);
        }}
        onClose={() => setForceOpen(false)}
        loading={busy}
        tone="danger"
      />
    </>
  );
}
