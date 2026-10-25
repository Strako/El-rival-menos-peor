import { useMemo } from 'react';

const COLORS = ['#ffc94d', '#33e0ff', '#2ee6a8', '#ff5d7a', '#ffffff', '#c084fc', '#fb923c'];

export function Confetti({ active, pieces = 90 }: { active: boolean; pieces?: number }) {
  const confetti = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: pieces }, (_, index) => {
      const color = COLORS[index % COLORS.length];
      return {
        id: index,
        left: Math.random() * 100,
        width: 6 + Math.random() * 7,
        height: 10 + Math.random() * 12,
        color,
        delay: Math.random() * 0.6,
        duration: 2.4 + Math.random() * 2.4,
        drift: (Math.random() - 0.5) * 360,
        spin: 360 + Math.random() * 1080,
        radius: Math.random() > 0.65 ? '999px' : '2px',
      };
    });
  }, [active, pieces]);

  if (!active || confetti.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70] overflow-hidden"
    >
      {confetti.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            width: `${piece.width}px`,
            height: `${piece.height}px`,
            backgroundColor: piece.color,
            borderRadius: piece.radius,
            ['--delay' as string]: `${piece.delay}s`,
            ['--duration' as string]: `${piece.duration}s`,
            ['--drift' as string]: `${piece.drift}px`,
            ['--spin' as string]: `${piece.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
