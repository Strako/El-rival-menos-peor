import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, callApi, errorMessage } from '../lib/api';
import { broadcastRoomSync } from '../lib/realtime';
import { itemEventMessage } from '../lib/items';
import { RoomHeader } from '../components/RoomHeader';
import { ItemOverlay } from '../components/ItemOverlay';
import { ItemTray } from '../components/ItemTray';
import { LobbyView } from '../components/LobbyView';
import { QuestionView } from '../components/QuestionView';
import { VotingView } from '../components/VotingView';
import { RaceQuestionView } from '../components/RaceQuestionView';
import { ResultsView } from '../components/ResultsView';
import { PlayerRail } from '../components/PlayerRail';
import { Scoreboard } from '../components/Scoreboard';
import { GameChat } from '../components/GameChat';
import { Button, Card, Logo, Modal, Spinner, Toast } from '../components/ui';
import { useGameSounds } from '../hooks/useGameSounds';
import { useRoomState } from '../hooks/useRoomState';
import { useSessionStore } from '../store/session';
import type { GameMode, RoomState } from '../types';

export function RoomPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = (rawCode ?? '').trim().toUpperCase();
  const navigate = useNavigate();
  const session = useSessionStore((s) => s.session);
  const activeRoom = useSessionStore((s) => s.activeRoom);
  const setActiveRoom = useSessionStore((s) => s.setActiveRoom);
  const clear = useSessionStore((s) => s.clear);

  const [roomId, setRoomId] = useState<string | null>(() =>
    activeRoom?.code === code ? activeRoom.id : null,
  );
  const [seed, setSeed] = useState<RoomState | null>(null);
  const [resolving, setResolving] = useState(!roomId);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [closeRoomOpen, setCloseRoomOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'error' | 'success' | 'info' } | null>(
    null,
  );
  const seenItemEvents = useRef<Set<string> | null>(null);

  const room = useRoomState(roomId, session, seed);
  const state = room.state;
  useGameSounds(state);

  useEffect(() => {
    if (!session) {
      const target = code ? `/?code=${code}` : '/';
      navigate(target, { replace: true });
    }
  }, [session, code, navigate]);

  useEffect(() => {
    if (!session) return;
    if (!code || !/^[A-Z2-9]{6}$/.test(code)) {
      setResolveError('El código de sala no es válido.');
      setResolving(false);
      return;
    }
    if (roomId) {
      setResolving(false);
      return;
    }

    let cancelled = false;
    setResolving(true);
    setResolveError(null);

    callApi<RoomState>('room.join', { code }, session)
      .then((next) => {
        if (cancelled) return;
        setSeed(next);
        setRoomId(next.room.id);
        setActiveRoom({
          id: next.room.id,
          code: next.room.code,
          status: next.room.status,
        });
        void broadcastRoomSync(next.room.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setResolveError(errorMessage(err));
        if (err instanceof ApiError && err.code === 'INVALID_SESSION') clear();
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, code, roomId, setActiveRoom, clear]);

  const notify = (message: string, tone: 'error' | 'success' | 'info' = 'error') => {
    setToast({ message, tone });
  };

  const run = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (!session || !roomId) return;
      setBusy(action);
      try {
        const next = await callApi<RoomState>(action, { roomId, ...payload }, session);
        room.setState(next);
        void broadcastRoomSync(roomId);
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.code === 'RACE_ALREADY_ANSWERED' || err.code === 'RACE_TIME_EXPIRED')
        ) {
          notify(
            err.code === 'RACE_ALREADY_ANSWERED'
              ? 'Otro jugador respondió primero.'
              : 'Se acabó el tiempo para responder.',
            'info',
          );
          await room.refetch(true);
          return;
        }

        notify(errorMessage(err));
        if (err instanceof ApiError && err.code === 'INVALID_SESSION') clear();
        void room.refetch(true);
      } finally {
        setBusy(null);
      }
    },
    [session, roomId, room, clear],
  );

  useEffect(() => {
    if (!session || !roomId) return;
    const events = state?.items?.log ?? [];
    if (seenItemEvents.current === null) {
      seenItemEvents.current = new Set(
        events.map((event) => `${event.id}:${event.status}`),
      );
      return;
    }

    const fresh = events.filter(
      (event) => !seenItemEvents.current?.has(`${event.id}:${event.status}`),
    );
    for (const event of fresh) {
      seenItemEvents.current?.add(`${event.id}:${event.status}`);
      const message = itemEventMessage(event, state?.me.playerId ?? null);
      if (message) notify(message, 'info');
    }
  }, [state?.items?.log, state?.me.playerId, session, roomId]);

  useEffect(() => {
    if (!session || !roomId) return;
    const ticks = state?.items?.ticks ?? [];
    if (ticks.length === 0) return;
    const nextExpiry = Math.min(
      ...ticks.map((tick) => new Date(tick.expiresAt).getTime()),
    );
    const delay = Math.max(0, nextExpiry - Date.now() + 80);
    const timer = window.setTimeout(() => {
      void callApi<RoomState>('game.itemTick', { roomId }, session)
        .then((next) => {
          room.setState(next);
          void broadcastRoomSync(roomId);
        })
        .catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state?.items?.ticks, session, roomId]);

  const syncAfterTimeout = () => {
    void room.refetch(true).then(() => {
      if (roomId) void broadcastRoomSync(roomId);
    });
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(label, 'success');
      return;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
        notify(label, 'success');
      } catch {
        notify('No se pudo copiar al portapapeles.', 'error');
      }
    }
  };

  const leave = async () => {
    if (!session || !roomId) {
      navigate('/home');
      return;
    }
    setBusy('leave');
    try {
      await callApi('room.leave', { roomId }, session);
      void broadcastRoomSync(roomId);
      setActiveRoom(null);
      navigate('/home');
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'ROOM_NOT_FOUND' || err.code === 'NOT_IN_ROOM')
      ) {
        setActiveRoom(null);
        navigate('/home');
        return;
      }
      notify(errorMessage(err));
    } finally {
      setBusy(null);
      setLeaveOpen(false);
    }
  };

  const closeRoom = async () => {
    if (!session || !roomId) {
      navigate('/home');
      return;
    }
    setBusy('room.close');
    try {
      await callApi('room.close', { roomId }, session);
      setActiveRoom(null);
      navigate('/home');
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'ROOM_NOT_FOUND' || err.code === 'NOT_IN_ROOM')
      ) {
        setActiveRoom(null);
        navigate('/home');
        return;
      }
      notify(errorMessage(err));
      void room.refetch(true);
    } finally {
      setBusy(null);
      setCloseRoomOpen(false);
    }
  };

  const retry = () => {
    if (roomId) {
      void room.refetch(false);
    } else {
      setResolveError(null);
      setResolving(true);
      window.location.reload();
    }
  };

  if (!session) return null;

  if (resolving || (room.loading && !state)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
        <Logo />
        <div className="flex items-center gap-3 text-sm text-white/40">
          <Spinner className="h-5 w-5 text-gold-300" />
          Entrando a la sala {code || ''}…
        </div>
      </div>
    );
  }

  if (resolveError || (!state && room.error)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <Card className="w-full max-w-lg p-8 text-center">
          <p className="text-4xl">🚪</p>
          <h1 className="mt-4 font-display text-4xl tracking-wide text-white">
            No se pudo entrar
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/45">
            {resolveError ?? room.error}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="secondary" onClick={() => navigate('/home')}>
              Volver al inicio
            </Button>
            <Button onClick={retry}>Reintentar</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-gold-300" />
      </div>
    );
  }

  const phase = state.game?.phase;
  const isVoting = phase === 'voting' || phase === 'vote_result';
  const isResults = state.room.status === 'finished' || phase === 'results';
  const busyBool = Boolean(busy);

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none fixed inset-0 opacity-25" />

      <div className="relative z-10">
        <RoomHeader
          state={state}
          connected={room.connected}
          onHome={() => navigate('/home')}
          onCopy={() => void copy(state.room.code, 'Código copiado')}
          onLeave={() => setLeaveOpen(true)}
        />

        {state.room.status === 'lobby' && (
          <LobbyView
            state={state}
            busy={busyBool}
            onUpdate={(
              mode: GameMode,
              rounds: number,
              itemsEnabled: boolean,
              multipleItemsEnabled: boolean,
            ) =>
              run('room.update', {
                mode,
                maxRounds: rounds,
                itemsEnabled,
                multipleItemsEnabled,
              })
            }
            onStart={() => run('room.start')}
            onCopy={(text, label) => void copy(text, label)}
            onNotify={(message, tone) => notify(message, tone)}
            onCloseRoom={() => setCloseRoomOpen(true)}
            onLeave={() => setLeaveOpen(true)}
          />
        )}

        {isResults && (
          <ResultsView
            state={state}
            busy={busyBool}
            onRestart={() => run('room.restart')}
            onCloseRoom={() => setCloseRoomOpen(true)}
            onLeave={() => setLeaveOpen(true)}
          />
        )}

        {!isResults && state.room.status === 'playing' && (
          <main className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)_310px] lg:gap-5 lg:py-6">
            <PlayerRail state={state} />
            <section className="order-1 min-w-0 lg:order-2">
              {state.room.mode === 'race' ? (
                <RaceQuestionView
                  state={state}
                  busy={busyBool}
                  onAnswer={(canonicalIndex) =>
                    run('game.raceAnswer', {
                      selectedIndex: canonicalIndex,
                      canonicalIndex,
                      revision: state.question?.revision,
                    })
                  }
                  onSkip={() => run('game.skipRaceQuestion')}
                  onExpire={syncAfterTimeout}
                />
              ) : isVoting ? (
                <VotingView
                  state={state}
                  busy={busyBool}
                  onVote={(targetPlayerId) => run('game.vote', { targetPlayerId })}
                  onForceVote={() => run('game.forceVote')}
                />
              ) : (
                <QuestionView
                  state={state}
                  busy={busyBool}
                  onAnswer={(canonicalIndex) =>
                    run('game.answer', {
                      gameQuestionId: state.question?.gameQuestionId,
                      selectedIndex: canonicalIndex,
                      canonicalIndex,
                      revision: state.question?.revision,
                    })
                  }
                  onSkip={() => run('game.skip')}
                  onExpire={syncAfterTimeout}
                />
              )}
              <div className="mt-4">
                <ItemTray
                  state={state}
                  busy={busyBool}
                  onUse={(itemId, targetPlayerId) =>
                    run('game.useItem', { itemId, targetPlayerId })
                  }
                />
              </div>
            </section>
            <div className="order-3 min-w-0 space-y-4">
              <Scoreboard state={state} />
              {state.room.status === 'playing' && (
                <GameChat roomId={state.room.id} enabled />
              )}
            </div>
          </main>
        )}

        {!isResults && state.room.status !== 'playing' && state.room.status !== 'lobby' && (
          <div className="mx-auto max-w-lg px-5 py-20 text-center text-white/40">
            Estado de sala desconocido.
          </div>
        )}
      </div>

      <Modal
        open={leaveOpen}
        title="¿Salir de la sala?"
        description={
          state.room.status === 'playing'
            ? 'La partida sigue en curso. Tu turno se omitirá y no podrás volver a esta partida, aunque podrás unirte a otra sala.'
            : 'Podrás volver a entrar con el código mientras la sala siga abierta.'
        }
        confirmLabel="Salir de la sala"
        onConfirm={() => void leave()}
        onClose={() => setLeaveOpen(false)}
        loading={busy === 'leave'}
        tone="danger"
      />

      <Modal
        open={closeRoomOpen && state.me.isHost}
        title="¿Cerrar la sala?"
        description="Se eliminarán la sala, sus miembros y el historial de partidas. Los demás perderán el acceso y no podrán volver a entrar con este código. Solo puedes cerrarla si no hay una partida en curso."
        confirmLabel="Cerrar sala"
        onConfirm={() => void closeRoom()}
        onClose={() => setCloseRoomOpen(false)}
        loading={busy === 'room.close'}
        tone="danger"
      />

      <ItemOverlay state={state} />

      <Toast
        message={toast?.message ?? null}
        tone={toast?.tone ?? 'error'}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
