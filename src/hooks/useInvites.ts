import { useCallback, useEffect, useRef, useState } from 'react';
import { callApi, errorMessage } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useSessionStore } from '../store/session';
import type { RoomInvite } from '../types';

interface InviteResponse {
  accepted: boolean;
  roomId?: string;
  code?: string;
}

export function useInvites() {
  const session = useSessionStore((state) => state.session);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    if (!session || inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await callApi<RoomInvite[]>('invite.list', {}, session);
      if (mounted.current) {
        setInvites(data);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      inFlight.current = false;
    }
  }, [session]);

  useEffect(() => {
    mounted.current = true;
    if (!session) {
      setInvites([]);
      return;
    }

    void refetch();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refetch();
    }, 4000);

    const channel = supabase
      .channel(`player:${session.playerId}`)
      .on('broadcast', { event: 'invite' }, () => {
        void refetch();
      })
      .subscribe();

    const onFocus = () => void refetch();
    window.addEventListener('focus', onFocus);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [session?.playerId, refetch]);

  const respond = useCallback(
    async (invite: RoomInvite, accept: boolean): Promise<InviteResponse | null> => {
      if (!session) return null;
      setBusy(true);
      setError(null);
      try {
        const data = await callApi<InviteResponse>(
          'invite.respond',
          { inviteId: invite.id, accept },
          session,
        );
        setInvites((current) => current.filter((item) => item.id !== invite.id));
        return data;
      } catch (err) {
        setError(errorMessage(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  return { invites, busy, error, respond, refetch, setError };
}
