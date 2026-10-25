import { useEffect, useRef, useState } from 'react';
import { Avatar, Badge, Button, Card, Modal, Spinner, cn } from './ui';
import { Confetti } from './Confetti';
import { CountryFlag } from './CountryFlag';
import { useCountdown } from '../hooks/useCountdown';
import { racePointsFor } from '../lib/race';
import { CATEGORY_ICON, CATEGORY_LABEL, DIFFICULTY_LABEL } from '../lib/format';
import type { RoomState } from '../types';

const LETTERS = ['A', 'B', 'C', 'D'];

const DIFFICULTY_TONE: Record<string, string> = {
  easy: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  medium: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  hard: 'border-red-400/30 bg-red-500/10 text-red-200',
};

function useRaceCountdown(
  deadlineAt: string | null,
  serverTime: string,
  active: boolean,
  onExpire?: () => void,
  resetKey?: string | number,
) {
  const [seconds, setSeconds] = useState(0);
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    fired.current = false;
  }, [resetKey, deadlineAt]);

  useEffect(() => {
    if (!deadlineAt || !active) {
      setSeconds(0);
      return;
    }

    const deadline = new Date(deadlineAt).getTime();
    const serverNow = new Date(serverTime).getTime();
    const initial = Math.max(0, Math.ceil((deadline - serverNow) / 1000));
    setSeconds(initial);

    const started = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.max(0, initial - Math.floor((Date.now() - started) / 1000));
      setSeconds(next);

      if (next <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current?.();
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [deadlineAt, serverTime, active]);

  return seconds;
}

export function RaceQuestionView({
  state,
  busy,
  onAnswer,
  onSkip,
  onExpire,
}: {
  state: RoomState;
  busy: boolean;
  onAnswer: (selectedIndex: number) => Promise<void>;
  onSkip: () => Promise<void>;
  onExpire?: () => void;
}) {
  const game = state.game;
  const race = state.race;
  const question = state.question;
  const lastAnswer = state.lastAnswer;
  const [selected, setSelected] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);

  const isOpen = game?.phase === 'question' && race?.status === 'open' && !race.timedOut;
  const isReveal = game?.phase === 'reveal';
  const isActive = state.me.isActive;
  const canAnswer = isOpen && isActive && !busy && selected === null;

  const remaining = useRaceCountdown(
    race?.deadlineAt ?? null,
    state.serverTime,
    Boolean(isOpen),
    onExpire,
    game?.currentRound,
  );
  const revealCountdown = useCountdown(game?.revealUntil);

  useEffect(() => {
    setSelected(null);
    setCelebrate(false);
  }, [game?.currentRound]);

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

  const answer = async (index: number) => {
    if (!canAnswer) return;
    setSelected(index);
    await onAnswer(index);
  };

  if (!question || !race) {
    return (
      <Card className="flex min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
        <Spinner className="h-8 w-8 text-cyan-300" />
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

  const total = game?.maxRounds ?? 1;
  const round = game?.currentRound ?? question.round;
  const correctIndex = isReveal
    ? lastAnswer?.correctDisplayIndex ?? race.correctDisplayIndex
    : null;
  const answeredByMe = lastAnswer?.playerId === state.me.playerId;
  const points = lastAnswer?.points ?? 0;
  const skippedByHost = isReveal && race.skippedByHost;
  const timedOut = isReveal && !skippedByHost && (race.timedOut || !lastAnswer);
  const potentialPoints = racePointsFor(question.difficulty, remaining);

  const ringRadius = 34;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = Math.max(0, Math.min(1, remaining / 10));
  const urgent = remaining <= 3;

  return (
    <>
      <Confetti active={celebrate} pieces={100} />

      <div className="space-y-4">
        <Card className="relative overflow-hidden p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/[0.06] blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div>
              <Badge tone="cyan">⚡ Relámpago</Badge>
              <p className="mt-2 text-xs text-white/35">
                Ronda {round} de {total} · todos responden a la vez
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="badge badge-muted">
                {CATEGORY_ICON[question.category]} {CATEGORY_LABEL[question.category]}
              </span>
              <span className={cn('badge', DIFFICULTY_TONE[question.difficulty])}>
                {DIFFICULTY_LABEL[question.difficulty]}
              </span>
              {state.me.isHost && isOpen && (
                <Button variant="ghost" size="sm" onClick={() => setSkipOpen(true)} disabled={busy}>
                  Saltar pregunta
                </Button>
              )}
            </div>
          </div>

          <div className="relative mt-5 flex items-start gap-5">
            <div className="relative grid h-24 w-24 shrink-0 place-items-center">
              <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="6"
                />
                <circle
                  cx="40"
                  cy="40"
                  r={ringRadius}
                  fill="none"
                  stroke={urgent ? '#ff5d7a' : '#ffc94d'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference * (1 - ringProgress)}
                  className="transition-[stroke-dashoffset] duration-200"
                />
              </svg>
              <div className="absolute text-center">
                <p
                  className={cn(
                    'font-display text-4xl leading-none',
                    urgent ? 'text-red-300' : 'text-gold-300',
                  )}
                >
                  {isOpen ? remaining : '—'}
                </p>
                <p className="text-[9px] uppercase tracking-wider text-white/30">
                  {isOpen ? 'segundos' : 'tiempo'}
                </p>
              </div>
              {isOpen && (
                <p className="mt-1 whitespace-nowrap text-center text-[10px] font-bold uppercase tracking-wider text-gold-200/80">
                  Vale {potentialPoints} pts
                </p>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {isOpen ? (
                <>
                  <h2 className="text-xl font-semibold leading-snug text-white sm:text-2xl">
                    {question.prompt}
                  </h2>
                  <p className="mt-2 text-sm text-white/40">
                    El primero en responder cierra la pregunta. Si falla, pierde 100 puntos.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold leading-snug text-white sm:text-2xl">
                    {question.prompt}
                  </h2>
                  <p className="mt-2 text-sm text-white/40">
                    {skippedByHost
                      ? 'El anfitrión saltó esta pregunta.'
                      : timedOut
                        ? 'Nadie respondió dentro de los 10 segundos.'
                        : `${lastAnswer?.nickname ?? 'Un jugador'} respondió primero.`}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
            {question.options.map((option, index) => {
              const isCorrectOption = isReveal && index === correctIndex;
              const isWrongChoice =
                isReveal &&
                lastAnswer?.selectedIndex === index &&
                lastAnswer.isCorrect === false;
              const isChosen = isOpen && selected === index;
              const dimmed = isReveal && !isCorrectOption && !isWrongChoice;

              return (
                <button
                  key={`${question.gameQuestionId}-${index}`}
                  type="button"
                  disabled={!canAnswer}
                  onClick={() => void answer(index)}
                  className={cn(
                    'option-btn group',
                    isChosen && 'border-gold-400/50 bg-gold-400/10',
                    isCorrectOption && 'border-emerald-400/50 bg-emerald-400/10',
                    isWrongChoice && 'border-red-400/50 bg-red-500/10',
                    dimmed && 'opacity-45',
                    !isActive && 'opacity-50',
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
                    {isCorrectOption ? '✓' : isWrongChoice ? '✕' : LETTERS[index]}
                  </span>
                  <span className="pt-1 text-sm font-medium leading-snug text-white/85">
                    {option}
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

          {isOpen && (
            <p className="relative mt-5 text-center text-xs text-white/25">
              {isActive
                ? 'Pulsa una opción antes de que termine el tiempo.'
                : 'No estás activo en esta partida. Puedes seguir mirando.'}
            </p>
          )}
        </Card>

        {isReveal && (
          <Card
            className={cn(
              'animate-fade-up p-5 sm:p-6',
              timedOut || skippedByHost
                ? 'border-amber-400/20 bg-amber-400/[0.04]'
                : lastAnswer?.isCorrect
                  ? 'border-emerald-400/25 bg-emerald-500/[0.05]'
                  : 'border-red-400/20 bg-red-500/[0.04]',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {lastAnswer ? (
                  <Avatar
                    name={lastAnswer.nickname}
                    seat={
                      state.players.find((player) => player.playerId === lastAnswer.playerId)
                        ?.seat ?? 0
                    }
                  />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-amber-400/30 bg-amber-400/10 text-lg">
                    ⏱
                  </span>
                )}
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    {lastAnswer && (
                      <CountryFlag
                        code={
                          state.players.find((player) => player.playerId === lastAnswer.playerId)
                            ?.countryCode
                        }
                        size="sm"
                      />
                    )}
                    <span>
                      {skippedByHost
                        ? 'Pregunta saltada'
                        : timedOut
                          ? 'Nadie respondió'
                          : lastAnswer?.nickname}
                    </span>
                  </p>
                  <p
                    className={cn(
                      'text-xs font-bold uppercase tracking-wider',
                      timedOut || skippedByHost
                        ? 'text-amber-200'
                        : lastAnswer?.isCorrect
                          ? 'text-emerald-300'
                          : 'text-red-300',
                    )}
                  >
                    {skippedByHost
                      ? 'El anfitrión la saltó · sin penalización'
                      : timedOut
                        ? `Se acabó el tiempo · −${race.timeoutPenalty || 10} para todos`
                        : lastAnswer?.isCorrect
                          ? answeredByMe
                            ? '¡Respondiste primero y acertaste!'
                            : 'Respondió primero y acertó'
                          : answeredByMe
                            ? 'Respondiste primero, pero fallaste'
                            : 'Respondió primero, pero falló'}
                  </p>
                </div>
              </div>

              {!timedOut && lastAnswer && (
                <div
                  className={cn(
                    'animate-score rounded-xl border px-4 py-2 text-right',
                    lastAnswer.isCorrect
                      ? 'border-emerald-400/30 bg-emerald-400/10'
                      : 'border-red-400/30 bg-red-500/10',
                  )}
                >
                  <p
                    className={cn(
                      'font-display text-3xl leading-none',
                      lastAnswer.isCorrect ? 'text-emerald-300' : 'text-red-300',
                    )}
                  >
                    {points > 0 ? `+${points}` : points}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-white/35">puntos</p>
                </div>
              )}

              {revealCountdown > 0 && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">
                    Siguiente en
                  </p>
                  <p className="font-display text-2xl leading-none text-white/70">
                    {revealCountdown}s
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
              <p className="text-xs uppercase tracking-wider text-white/30">
                Respuesta correcta
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-200">
                {lastAnswer?.correctText ?? race.correctText ?? '—'}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/45">
                {lastAnswer?.explanation ?? race.explanation ?? ''}
              </p>
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={skipOpen}
        title="¿Saltar esta pregunta?"
        description="Se cerrará la pregunta sin atribuirla a nadie. La partida continuará con la siguiente ronda."
        confirmLabel="Saltar pregunta"
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
