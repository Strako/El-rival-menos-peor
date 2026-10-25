import { useEffect, useState } from 'react';
import { cn } from './ui';

const SIZES = {
  sm: 'h-3.5 w-5',
  md: 'h-4 w-6',
  lg: 'h-5 w-7',
};

function countryName(code: string): string {
  try {
    const display = new Intl.DisplayNames(['es'], { type: 'region' });
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}

export function CountryFlag({
  code,
  size = 'md',
  className,
}: {
  code?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const normalized = (code ?? 'UN').toUpperCase();
  const valid = /^[A-Z]{2}$/.test(normalized) && normalized !== 'UN';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [normalized]);

  if (!valid || failed) {
    return (
      <span
        role="img"
        aria-label="País desconocido"
        title="País desconocido"
        className={cn(
          'inline-grid shrink-0 place-items-center rounded-[2px] bg-white/10 text-[10px]',
          SIZES[size],
          className,
        )}
      >
        🌐
      </span>
    );
  }

  const name = countryName(normalized);

  return (
    <img
      src={`https://flagcdn.com/w40/${normalized.toLowerCase()}.png`}
      alt={`Bandera de ${name}`}
      title={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(
        'inline-block shrink-0 rounded-[2px] object-cover ring-1 ring-white/10',
        SIZES[size],
        className,
      )}
    />
  );
}
