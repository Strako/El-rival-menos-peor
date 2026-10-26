import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, callApi } from '../lib/api';
import { broadcastRoomSync } from '../lib/realtime';
import { supabase } from '../lib/supabase';
import { useSessionStore } from '../store/session';
import type { PlayerSession, RoomState } from '../types';

export function useRoomState(
  roomId: string | null,
  session: PlayerSession | null,
  initial?: RoomState | null,
) {
  const [state, setState] = useState<RoomState | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const inFlight = useRef(false);
  const queuedRefetch = useRef(false);
  const mounted = useRef(true);
  const initialRef = useRef(initial ?? null);
  const stateRef = useRef<RoomState | null>(initial ?? null);
  const lastBroadcastKey = useRef<string | null>(null);
  const setActiveRoom = useSessionStore((s) => s.setActiveRoom);

  const setStateSafe = useCallback((next: RoomState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const refetch = useCallback(
    async (silent = true) => {
      if (!roomId || !session) return;
      if (inFlight.current) {
        queuedRefetch.current = true;
        return;
      }
      inFlight.current = true;
      if (!silent) setLoading(true);
      try {
        const next = await callApi<RoomState>('game.state', { roomId }, session);
        if (!mounted.current) return;
        const previous = stateRef.current;
        setStateSafe(next);
        setError(null);

        const transitionKey =
          next.game?.phase === 'question'
            ? `${next.game.id}:${next.question?.gameQuestionId ?? ''}:${next.question?.revision ?? ''}:${next.game.currentPlayerId ?? ''}`
            : null;
        if (
          previous &&
          transitionKey &&
          transitionKey !== lastBroadcastKey.current
        ) {
          lastBroadcastKey.current = transitionKey;
          void broadcastRoomSync(roomId);
        }
      } catch (err) {
        if (!mounted.current) return;
        if (err instanceof ApiError && err.code === 'INVALID_SESSION') {
          useSessionStore.getState().clear();
          return;
        }
        if (
          err instanceof ApiError &&
          (err.code === 'NOT_IN_ROOM' || err.code === 'ROOM_NOT_FOUND')
        ) {
          useSessionStore.getState().setActiveRoom(null);
          setStateSafe(null);
        }
        setError(err instanceof Error ? err.message : 'No se pudo actualizar la sala.');
      } finally {
        inFlight.current = false;
        if (!silent && mounted.current) setLoading(false);
        if (queuedRefetch.current && mounted.current) {
          queuedRefetch.current = false;
          void refetch(true);
        }
      }
    },
    [roomId, session, setStateSafe],
  );

  useEffect(() => {
    mounted.current = true;
    if (!roomId || !session) {
      setLoading(false);
      return;
    }

    const hasInitial = Boolean(initialRef.current);
    if (!hasInitial) setLoading(true);
    void refetch(hasInitial);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refetch(true);
    }, 3500);

    const channel = supabase
      .channel(`room:${roomId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'sync' }, () => {
        void refetch(true);
      })
      .on('broadcast', { event: 'closed' }, () => {
        if (!mounted.current) return;
        useSessionStore.getState().setActiveRoom(null);
        setState(null);
        setLoading(false);
        setError('La sala fue cerrada por el anfitrión.');
      })
      .subscribe((status) => {
        if (mounted.current) setConnected(status === 'SUBSCRIBED');
      });

    const onFocus = () => void refetch(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refetch(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [roomId, session?.playerId, refetch]);

  useEffect(() => {
    if (!state?.room) return;
    setActiveRoom({
      id: state.room.id,
      code: state.room.code,
      status: state.room.status,
    });
  }, [state?.room.id, state?.room.code, state?.room.status, setActiveRoom]);

  useEffect(() => {
    if (!state?.game?.revealUntil) return;
    const serverOffset = new Date(state.serverTime).getTime() - Date.now();
    const delay = Math.max(
      250,
      new Date(state.game.revealUntil).getTime() - (Date.now() + serverOffset) + 250,
    );
    const timer = window.setTimeout(() => void refetch(true), Math.min(delay, 8000));
    return () => window.clearTimeout(timer);
  }, [state?.game?.revealUntil, state?.serverTime, refetch]);

  return { state, setState: setStateSafe, loading, error, refetch, connected };
}
