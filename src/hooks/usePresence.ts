import { useCallback, useEffect, useRef, useState } from 'react';
import { callApi } from '../lib/api';
import { useSessionStore } from '../store/session';
import type { ConnectedPlayer } from '../types';

export function usePresence(roomId: string | null, enabled: boolean) {
  const session = useSessionStore((state) => state.session);
  const [players, setPlayers] = useState<ConnectedPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    if (!roomId || !session || !enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await callApi<ConnectedPlayer[]>(
        'presence.list',
        { roomId },
        session,
      );
      if (mounted.current) {
        setPlayers(data);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la lista.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [roomId, session, enabled]);

  useEffect(() => {
    mounted.current = true;
    if (!roomId || !session || !enabled) {
      setPlayers([]);
      return;
    }

    setLoading(true);
    void refetch();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refetch();
    }, 5000);
    const onFocus = () => void refetch();
    window.addEventListener('focus', onFocus);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [roomId, session?.playerId, enabled, refetch]);

  return { players, loading, error, refetch };
}
