const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Avisa a los demás clientes de la sala que vuelvan a pedir el estado.
 * Es un ping sin datos sensibles; el estado autoritativo siempre viene de la Edge Function.
 * Si falla, el polling de respaldo mantiene la partida sincronizada.
 */
export async function broadcastRoomSync(roomId: string): Promise<void> {
  if (!roomId) return;

  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `room:${roomId}`,
            event: 'sync',
            payload: { roomId },
          },
        ],
      }),
      keepalive: true,
    });
  } catch {
    // El polling de respaldo se encarga si Realtime no está disponible.
  }
}
