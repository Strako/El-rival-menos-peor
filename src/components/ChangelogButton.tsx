import { useNavigate } from 'react-router-dom';
import { Button, cn } from './ui';

export function ChangelogButton({ className }: { className?: string }) {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('px-2.5 sm:px-3', className)}
      onClick={() => navigate('/changelog')}
      aria-label="Abrir el changelog"
      title="Changelog"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M5 4.5h11a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5Z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
      <span className="hidden sm:inline">Changelog</span>
    </Button>
  );
}
