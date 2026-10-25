import { useCallback, useEffect, useRef, useState } from 'react';
import { callApi, errorMessage } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useSessionStore } from '../store/session';
import type { ChatMessage } from '../types';

const MAX_MESSAGES = 200;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'string' &&
    typeof message.playerId === 'string' &&
    typeof message.nickname === 'string' &&
    typeof message.body === 'string' &&
    typeof message.createdAt === 'string'
  );
}

export function useRoomChat(roomId: string | null, enabled: boolean) {
  const session = useSessionStore((state) => state.session);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const addMessage = useCallback((message: ChatMessage) => {
    if (!isChatMessage(message) || seen.current.has(message.id)) return;
    seen.current.add(message.id);
    setMessages((current) => [...current, message].slice(-MAX_MESSAGES));
  }, []);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      seen.current.clear();
      return;
    }

    setMessages([]);
    seen.current.clear();
    setConnected(false);

    if (!enabled) return;

    const channel = supabase
      .channel(`chat:${roomId}`)
      .on('broadcast', { event: 'message' }, (payload) => {
        if (isChatMessage(payload.payload)) addMessage(payload.payload);
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, enabled, addMessage]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      if (!roomId || !session || !enabled) return false;
      const text = body.trim();
      if (!text) return false;
      if (text.length > 280) {
        setError('El mensaje no puede superar los 280 caracteres.');
        return false;
      }

      setSending(true);
      setError(null);
      try {
        const message = await callApi<ChatMessage>(
          'chat.send',
          { roomId, body: text },
          session,
        );
        addMessage(message);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setSending(false);
      }
    },
    [roomId, session, enabled, addMessage],
  );

  return { messages, connected, sending, error, send, setError };
}
