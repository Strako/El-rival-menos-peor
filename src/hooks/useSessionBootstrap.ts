import { useEffect, useRef, useState } from 'react';
import { ApiError, callApi } from '../lib/api';
import { useSessionStore } from '../store/session';
import type { ResumeData } from '../types';

export function useSessionBootstrap() {
  const [booting, setBooting] = useState(true);
  const session = useSessionStore((s) => s.session);
  const setActiveRoom = useSessionStore((s) => s.setActiveRoom);
  const setSession = useSessionStore((s) => s.setSession);
  const clear = useSessionStore((s) => s.clear);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!session) {
      setBooting(false);
      return;
    }

    callApi<ResumeData>('resume', {}, session)
      .then((data) => {
        setSession({
          playerId: data.player.id,
          nickname: data.player.nickname,
          token: session.token,
        });
        setActiveRoom(
          data.room
            ? { id: data.room.id, code: data.room.code, status: data.room.status }
            : null,
        );
      })
      .catch((error) => {
        if (error instanceof ApiError && error.code === 'INVALID_SESSION') {
          clear();
        }
      })
      .finally(() => {
        setBooting(false);
      });
  }, [session, setSession, setActiveRoom, clear]);

  return { booting };
}
