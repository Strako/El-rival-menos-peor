import { useCountdown } from '../hooks/useCountdown';
import type { RoomState } from '../types';

export function ItemOverlay({ state }: { state: RoomState }) {
  const apagon = state.items.effects.find((effect) => effect.itemType === 1);
  const seconds = useCountdown(apagon?.expiresAt);

  if (!apagon || seconds <= 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] animate-apagon bg-black">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
        <p className="text-5xl">🌑</p>
        <p className="mt-3 font-display text-4xl tracking-[0.2em] text-white/35">APAGÓN</p>
      </div>
    </div>
  );
}
