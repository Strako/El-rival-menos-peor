import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SoundStore {
  muted: boolean;
  toggle: () => void;
  setMuted: (muted: boolean) => void;
}

export const useSoundStore = create<SoundStore>()(
  persist(
    (set, get) => ({
      muted: false,
      toggle: () => set({ muted: !get().muted }),
      setMuted: (muted) => set({ muted }),
    }),
    { name: 'rival-sound-v1' },
  ),
);
