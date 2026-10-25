import { useState } from 'react';
import { Badge, Button, Card, cn } from './ui';
import { CountryFlag } from './CountryFlag';
import { callApi, errorMessage } from '../lib/api';
import { usePresence } from '../hooks/usePresence';
import { useSessionStore } from '../store/session';
import type { ConnectedPlayer } from '../types';

const STATUS_LABEL: Record<ConnectedPlayer['status'], string> = {
  available: 'Disponible',
  in_lobby: 'En lobby',
  in_game: 'En partida',
};

const STATUS_TONE: Record<ConnectedPlayer['status'], 'cyan' | 'muted' | 'red'> = {
  available: 'cyan',
  in_lobby: 'muted',
  in_game: 'red',
};

export function ConnectedPlayersPanel({
  roomId,
  onNotify,
}: {
  roomId: string;
  onNotify: (message: string, tone?: 'error' | 'success' | 'info') => void;
}) {
  const session = useSessionStore((state) => state.session);
  const { players, loading, error, refetch } = usePresence(roomId, true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  const invite = async (player: ConnectedPlayer) => {
    if (!session || inviting) return;
    setInviting(player.playerId);
    try {
      await callApi(
        'invite.create',
        { roomId, invitedPlayerId: player.playerId },
        session,
      );
      setInvited((current) => new Set(current).add(player.playerId));
      onNotify(`Invitación enviada a ${player.nickname}.`, 'success');
      void refetch();
    } catch (err) {
      onNotify(errorMessage(err), 'error');
    } finally {
      setInviting(null);
    }
  };

  return (
    <Card className="flex min-w-0 flex-col p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
            Conectados
          </h2>
          <p className="mt-1 text-[10px] text-white/25">
            Jugadores en línea en toda la app
          </p>
        </div>
        <Badge tone="muted">{players.length}</Badge>
      </div>

      <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {loading && players.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/25">Buscando jugadores…</p>
        ) : players.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-2xl">📡</p>
            <p className="mt-2 text-xs leading-relaxed text-white/25">
              No hay otros jugadores conectados ahora mismo.
            </p>
          </div>
        ) : (
          players.map((player) => {
            const isInvited = player.invited || invited.has(player.playerId);
            const disabled = player.status === 'in_game' || isInvited || Boolean(inviting);
            return (
              <div
                key={player.playerId}
                className={cn(
                  'rounded-xl border border-white/[0.06] bg-white/[0.025] p-3',
                  player.status === 'in_game' && 'opacity-55',
                )}
              >
                <div className="flex items-center gap-2">
                  <CountryFlag code={player.countryCode} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/80">
                      {player.nickname}
                    </p>
                    <Badge tone={STATUS_TONE[player.status]} className="mt-1">
                      {STATUS_LABEL[player.status]}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isInvited ? 'secondary' : 'primary'}
                  fullWidth
                  className="mt-2"
                  disabled={disabled}
                  loading={inviting === player.playerId}
                  onClick={() => void invite(player)}
                >
                  {isInvited
                    ? 'Invitado'
                    : player.status === 'in_game'
                      ? 'En partida'
                      : 'Invitar'}
                </Button>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <p className="mt-3 text-[10px] leading-relaxed text-red-300">{error}</p>
      )}

      <p className="mt-4 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-white/20">
        La invitación dura 60 segundos. Si el jugador está en otro lobby, al aceptar saldrá de
        ese lobby.
      </p>
    </Card>
  );
}
