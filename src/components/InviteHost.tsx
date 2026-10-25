import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from './ui';
import { CountryFlag } from './CountryFlag';
import { useCountdown } from '../hooks/useCountdown';
import { useInvites } from '../hooks/useInvites';
import { useSessionStore } from '../store/session';

export function InviteHost() {
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const activeRoom = useSessionStore((state) => state.activeRoom);
  const setActiveRoom = useSessionStore((state) => state.setActiveRoom);
  const { invites, busy, error, respond, refetch } = useInvites();
  const invite = invites[0] ?? null;
  const seconds = useCountdown(invite?.expiresAt);
  const [localError, setLocalError] = useState<string | null>(null);
  const [expiredHandled, setExpiredHandled] = useState(false);

  useEffect(() => {
    setLocalError(null);
    setExpiredHandled(false);
  }, [invite?.id]);

  useEffect(() => {
    if (!invite || seconds > 0 || expiredHandled) return;
    setExpiredHandled(true);
    void refetch();
  }, [invite, seconds, expiredHandled, refetch]);

  if (!session || !invite) return null;

  const inGame = activeRoom?.status === 'playing';
  const expired = seconds <= 0;
  const acceptDisabled = busy || inGame || expired;

  const accept = async () => {
    setLocalError(null);
    const result = await respond(invite, true);
    if (result?.accepted && result.roomId && result.code) {
      setActiveRoom({ id: result.roomId, code: result.code, status: 'lobby' });
      navigate(`/room/${result.code}`);
    } else if (!result) {
      void refetch();
    }
  };

  const decline = async () => {
    setLocalError(null);
    await respond(invite, false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) void decline();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        className="card max-h-[calc(100dvh-2rem)] w-full max-w-md animate-pop overflow-y-auto p-6"
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/60">
            Invitación a sala
          </p>
          <span
            className={`text-xs font-bold tabular-nums ${
              seconds <= 10 ? 'text-red-300' : 'text-white/40'
            }`}
          >
            {expired ? 'Expirada' : `${seconds}s`}
          </span>
        </div>

        <h2
          id="invite-title"
          className="mt-3 break-words font-display text-3xl tracking-wide text-white [overflow-wrap:anywhere] sm:text-4xl"
        >
          {invite.inviterNickname} te invita
        </h2>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <CountryFlag code={invite.inviterCountryCode} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {invite.inviterNickname}
            </p>
            <p className="text-xs text-white/35">Sala</p>
            <p className="font-mono text-lg font-bold tracking-[0.25em] text-gold-300">
              {invite.roomCode}
            </p>
          </div>
        </div>

        {inGame && (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-100/80">
            Estás en una partida en curso. Termínala o rechaza la invitación.
          </div>
        )}

        {!inGame && activeRoom?.status === 'lobby' && (
          <p className="mt-4 text-xs leading-relaxed text-white/35">
            Si aceptas, saldrás de tu sala actual y entrarás a esta.
          </p>
        )}

        {(error || localError) && (
          <p className="mt-4 text-xs leading-relaxed text-red-300" role="alert">
            {localError ?? error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => void decline()} disabled={busy}>
            Rechazar
          </Button>
          <Button
            onClick={() => void accept()}
            loading={busy}
            disabled={acceptDisabled}
          >
            Entrar
          </Button>
        </div>
      </div>
    </div>
  );
}
