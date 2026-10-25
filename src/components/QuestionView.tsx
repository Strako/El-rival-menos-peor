import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, Modal, Spinner, cn } from './ui';
import { Confetti } from './Confetti';
import { CountryFlag } from './CountryFlag';
import { useCountdown } from '../hooks/useCountdown';
import { useShuffledOptions } from '../hooks/useShuffledOptions';
import { useTurnCountdown } from '../hooks/useTurnCountdown';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  DIFFICULTY_LABEL,
  DIFFICULTY_POINTS,
} from '../lib/format';
import type { RoomState } from '../types';

const LETTERS = ['A', 'B', 'C', 'D'];

const DIFFICULTY_TONE: Record<string, string> = {
  easy: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  medium: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  hard: 'border-red-400/30 bg-red-500/10 text-red-200',
};

export function QuestionView({
  state,
  busy,
  onAnswer,
  onSkip,
  onExpire,
}: {
  state: RoomState;
  busy: boolean;
  onAnswer: (canonicalIndex: number) => Promise<void>;
  onSkip: () => Promise<void>;
  onExpire?: () => void;
}) {
  const game = state.game;
  const question = state.question;
  const lastAnswer = state.lastAnswer;
  const [selected, setSelected] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const countdown = useCountdown(game?.revealUntil);
  const turnCountdown = useTurnCountdown(
    question?.deadlineAt,
    state.serverTime,
    game?.phase === 'question',
    onExpire,
    question?.gameQuestionId,
  );
  const { display, shuffleTick, shuffleActive } = useShuffledOptions(
    question,
    state.items.effects,
    game?.phase === 'question',
  );

  const currentPlayer = state.players.find((p) => p.playerId === game?.currentPlayerId);
  const isMyTurn =
    Boolean(question?.isMine) &&
    game?.phase === 'question' &&
    state.me.isActive &&
    game?.currentPlayerId === state.me.playerId;
  const isReveal = game?.phase === 'reveal' && Boolean(lastAnswer);

  useEffect(() => {
    setSelected(null);
    setCelebrate(false);
  }, [question?.gameQuestionId]);

  useEffect(() => {
    if (game?.phase === 'reveal' && lastAnswer?.isCorrect) {
      setCelebrate(true);
      const timer = window.setTimeout(() => setCelebrate(false), 4600);
      return () => window.clearTimeout(timer);
    }
    setCelebrate(false);
  }, [game?.phase, lastAnswer?.answeredAt, lastAnswer?.isCorrect]);

  useEffect(() => {
    if (selected === null || busy || game?.phase !== 'question') return;
    const timer = window.setTimeout(() => setSelected(null), 2000);
    return () => window.clearTimeout(timer);
  }, [selected, busy, game?.phase]);

  const answer = async (canonicalIndex: number) => {
    if (!isMyTurn || busy) return;
    setSelected(canonicalIndex);
    await onAnswer(canonicalIndex);
  };

  if (!question) {
    return (
      <Card className="flex min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
        <Spinner className="h-8 w-8 text-gold-300" />
        <div>
          <h2 className="font-display text-3xl tracking-wide text-white">
            Preparando la siguiente pregunta
          </h2>
          <p className="mt-2 text-sm text-white/35">
            La sala se está sincronizando. Esto toma solo un momento.
          </p>
        </div>
      </Card>
    );
  }

  const totalRounds = game?.maxRounds ?? 1;
  const round = game?.currentRound ?? question.round;

  return (
    <>
      <Confetti active={celebrate} />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="muted">
              Ronda {round} / {totalRounds}
            </Badge>
            <span className="text-[11px] text-white/30">
              {DIFFICULTY_POINTS[question.difficulty]} pts en juego
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-muted">
              {CATEGORY_ICON[question.category]} {CATEGORY_LABEL[question.category]}
            </span>
            <span className={cn('badge', DIFFICULTY_TONE[question.difficulty])}>
              {DIFFICULTY_LABEL[question.difficulty]}
            </span>
          </div>
        </div>

        <Card
          className={cn(
            'relative overflow-hidden p-5 transition sm:p-7',
            isMyTurn && 'border-gold-400/30 shadow-[0_0_60px_-30px_rgba(255,201,77,0.9)]',
          )}
        >
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-gold-400/[0.07] blur-3xl" />

          <div
            className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4"
            aria-live="polite"
          >
            <div className="flex items-center gap-3">
              {isMyTurn ? (
                <span className="flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gold-200">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-gold-300" />
                  Es tu turno
                </span>
              ) : (
                <div className="flex items-center gap-2.5">
                  {currentPlayer && (
                    <Avatar name={currentPlayer.nickname} seat={currentPlayer.seat} size="sm" />
                  )}
                  <div>
                    <p className="text-xs text-white/35">Turno de</p>
                    <p className="text-sm font-semibold text-white">
                      {currentPlayer?.nickname ?? '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {game?.phase === 'question' && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums',
                    turnCountdown <= 3
                      ? 'border-red-400/40 bg-red-500/10 text-red-200'
                      : 'border-gold-400/30 bg-gold-400/10 text-gold-200',
                  )}
                  aria-live="polite"
                >
                  ⏱ {turnCountdown}s
                </span>
              )}
              {state.me.isHost && game?.phase === 'question' && (
                <Button variant="ghost" size="sm" onClick={() => setSkipOpen(true)} disabled={busy}>
                  Saltar turno
                </Button>
              )}
            </div>
          </div>

          {!state.me.isActive && (
            <div className="relative mt-4 rounded-xl border border-red-400/20 bg-red-500/[0.06] px-4 py-2.5 text-xs text-red-200/80">
              Estás eliminado. Puedes seguir viendo la partida, pero no responder ni votar.
            </div>
          )}

          <h2 className="relative mt-5 text-xl font-semibold leading-snug text-white sm:text-2xl">
            {question.prompt}
          </h2>

          <div className={cn('relative mt-6 grid gap-3 sm:grid-cols-2', shuffleActive && 'item-shuffling')}>
            {display.map((option, displayIndex) => {
              const correctCanonical =
                lastAnswer?.correctDisplayIndex !== undefined && lastAnswer.correctDisplayIndex !== null
                  ? question.optionOrder?.[lastAnswer.correctDisplayIndex] ?? null
                  : null;
              const selectedCanonical =
                lastAnswer?.selectedIndex !== null && lastAnswer?.selectedIndex !== undefined
                  ? question.optionOrder?.[lastAnswer.selectedIndex] ?? null
                  : null;
              const isCorrectOption = isReveal && option.canonical === correctCanonical;
              const isWrongChoice =
                isReveal &&
                option.canonical === selectedCanonical &&
                lastAnswer?.isCorrect === false;
              const isChosen = !isReveal && selected === option.canonical;
              const dimmed = isReveal && !isCorrectOption && !isWrongChoice;

              return (
                <button
                  key={`${question.gameQuestionId}-${option.canonical}-${shuffleTick}`}
                  type="button"
                  disabled={!isMyTurn || busy}
                  onClick={() => void answer(option.canonical)}
                  className={cn(
                    'option-btn group',
                    shuffleActive && 'animate-option-shuffle',
                    isChosen && 'border-gold-400/50 bg-gold-400/10',
                    isCorrectOption && 'border-emerald-400/50 bg-emerald-400/10',
                    isWrongChoice && 'border-red-400/50 bg-red-500/10',
                    dimmed && 'opacity-45',
                    !isMyTurn && !isReveal && 'opacity-70',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold transition',
                      isCorrectOption
                        ? 'bg-emerald-400 text-ink-950'
                        : isWrongChoice
                          ? 'bg-red-400 text-ink-950'
                          : isChosen
                            ? 'bg-gold-400 text-ink-950'
                            : 'bg-white/10 text-white/60',
                    )}
                  >
                    {isCorrectOption ? '✓' : isWrongChoice ? '✕' : LETTERS[displayIndex]}
                  </span>
                  <span className="pt-1 text-sm font-medium leading-snug text-white/85">
                    {option.text}
                  </span>
                  {isChosen && busy && (
                    <span className="ml-auto pt-1">
                      <Spinner className="h-4 w-4 text-gold-300" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {game?.phase === 'question' && !isMyTurn && (
            <p className="relative mt-5 text-center text-xs text-white/25">
              {currentPlayer?.playerId === state.me.playerId
                ? 'Preparando tu turno…'
                : `Esperando la respuesta de ${currentPlayer?.nickname ?? 'otro jugador'}…`}
            </p>
          )}
        </Card>

        {isReveal && lastAnswer && (
          <Card
            className={cn(
              'animate-fade-up p-5 sm:p-6',
              lastAnswer.isCorrect
                ? 'border-emerald-400/25 bg-emerald-500/[0.05]'
                : 'border-red-400/20 bg-red-500/[0.04]',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar
                  name={lastAnswer.nickname}
                  seat={state.players.find((p) => p.playerId === lastAnswer.playerId)?.seat ?? 0}
                />
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <CountryFlag
                      code={
                        state.players.find((p) => p.playerId === lastAnswer.playerId)?.countryCode
                      }
                      size="sm"
                    />
                    <span>{lastAnswer.nickname}</span>
                  </p>
                  <p
                    className={cn(
                      'text-xs font-bold uppercase tracking-wider',
                      lastAnswer.isCorrect ? 'text-emerald-300' : 'text-red-300',
                    )}
                  >
                    {lastAnswer.skipped
                      ? lastAnswer.skippedByHost
                        ? 'Turno saltado por el anfitrión'
                        : 'Tiempo agotado'
                      : lastAnswer.isCorrect
                        ? 'Respuesta correcta'
                        : 'Respuesta incorrecta'}
                  </p>
                </div>
              </div>

              {lastAnswer.isCorrect && (
                <div className="animate-score rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-right">
                  <p className="font-display text-3xl leading-none text-emerald-300">
                    +{lastAnswer.points}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-200/60">
                    puntos
                  </p>
                </div>
              )}

              {countdown > 0 && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">
                    Siguiente en
                  </p>
                  <p className="font-display text-2xl leading-none text-white/70">
                    {countdown}s
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
              <p className="text-xs uppercase tracking-wider text-white/30">Respuesta correcta</p>
              <p className="mt-1 text-sm font-semibold text-emerald-200">
                {lastAnswer.correctText}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/45">
                {lastAnswer.explanation}
              </p>
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={skipOpen}
        title="¿Saltar este turno?"
        description="La pregunta se marcará como no respondida y se pasará al siguiente jugador. Úsalo solo si el jugador se desconectó."
        confirmLabel="Saltar turno"
        onConfirm={async () => {
          await onSkip();
          setSkipOpen(false);
        }}
        onClose={() => setSkipOpen(false)}
        loading={busy}
        tone="danger"
      />
    </>
  );
}
