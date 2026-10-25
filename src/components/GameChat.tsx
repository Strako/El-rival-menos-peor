import { useEffect, useRef, useState } from 'react';
import { Button, Card, cn } from './ui';
import { CountryFlag } from './CountryFlag';
import { useRoomChat } from '../hooks/useRoomChat';
import { useSessionStore } from '../store/session';

export function GameChat({
  roomId,
  enabled,
  className,
}: {
  roomId: string;
  enabled: boolean;
  className?: string;
}) {
  const session = useSessionStore((state) => state.session);
  const { messages, connected, sending, error, send, setError } = useRoomChat(roomId, enabled);
  const [body, setBody] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  if (!enabled) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await send(body);
    if (ok) setBody('');
  };

  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            Chat de la partida
          </p>
          <p className="mt-0.5 text-[10px] text-white/25">Los mensajes no se guardan</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-white/35">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              connected ? 'bg-emerald-400' : 'bg-amber-400',
            )}
          />
          {connected ? 'En vivo' : 'Conectando'}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="min-h-40 max-h-72 flex-1 space-y-2 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center text-center">
            <span className="text-2xl">💬</span>
            <p className="mt-2 text-xs text-white/30">
              La partida comenzó.
              <br />
              Escribe el primer mensaje.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.playerId === session?.playerId;
            return (
              <div
                key={message.id}
                className={cn(
                  'rounded-xl border px-3 py-2',
                  mine
                    ? 'border-cyan-400/15 bg-cyan-400/[0.05]'
                    : 'border-white/[0.05] bg-white/[0.02]',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <CountryFlag code={message.countryCode} size="sm" />
                  <span className="text-[11px] font-semibold text-white/70">
                    {message.nickname}
                  </span>
                  {mine && <span className="text-[9px] text-cyan-300">tú</span>}
                  <span className="ml-auto text-[9px] text-white/20">
                    {new Date(message.createdAt).toLocaleTimeString('es-MX', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 break-words text-xs leading-relaxed text-white/70">
                  {message.body}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="border-t border-white/5 p-3">
        {error && (
          <p className="mb-2 text-[10px] leading-relaxed text-red-300" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              if (error) setError(null);
            }}
            maxLength={280}
            placeholder={connected ? 'Escribe un mensaje…' : 'Chat sin conexión'}
            disabled={!connected || !session}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-900/80 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:border-cyan-400/50 focus:outline-none disabled:opacity-40"
            aria-label="Mensaje de chat"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!connected || !body.trim() || sending || !session}
            loading={sending}
            aria-label="Enviar mensaje"
          >
            →
          </Button>
        </div>
      </form>
    </Card>
  );
}
