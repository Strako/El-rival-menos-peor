import { unlockAudio } from '../lib/sound';
import { useSoundStore } from '../store/sound';
import { cn } from './ui';

export function SoundToggle({ className }: { className?: string }) {
  const muted = useSoundStore((state) => state.muted);
  const toggle = useSoundStore((state) => state.toggle);

  return (
    <button
      type="button"
      aria-pressed={!muted}
      aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
      title={muted ? 'Activar sonido' : 'Silenciar sonido'}
      onClick={() => {
        unlockAudio();
        toggle();
      }}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/50 transition hover:border-white/20 hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      {muted ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="m16 9 5 6M21 9l-5 6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 6a9 9 0 0 1 0 12" />
        </svg>
      )}
    </button>
  );
}
