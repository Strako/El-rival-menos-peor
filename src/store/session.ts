import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActiveRoom, PlayerSession } from '../types';

interface SessionStore {
  session: PlayerSession | null;
  activeRoom: ActiveRoom | null;
  setSession: (session: PlayerSession) => void;
  setActiveRoom: (room: ActiveRoom | null) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      session: null,
      activeRoom: null,
      setSession: (session) => set({ session }),
      setActiveRoom: (activeRoom) => set({ activeRoom }),
      clear: () => set({ session: null, activeRoom: null }),
    }),
    {
      name: 'rival-session-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session }),
    },
  ),
);
