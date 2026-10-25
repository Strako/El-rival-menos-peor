import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: '',
  lg: 'px-6 py-4 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'btn',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'aside' | 'article';
}) {
  return <Tag className={cn('card', className)}>{children}</Tag>;
}

type BadgeTone = 'gold' | 'cyan' | 'red' | 'muted';

const BADGE_TONES: Record<BadgeTone, string> = {
  gold: 'badge-gold',
  cyan: 'badge-cyan',
  red: 'badge-red',
  muted: 'badge-muted',
};

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return <span className={cn('badge', BADGE_TONES[tone], className)}>{children}</span>;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div>
      {label && (
        <label className="label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'input',
          error && 'border-red-400/60 focus:border-red-400',
          className,
        )}
        {...props}
      />
      {error ? (
        <p className="mt-2 text-xs font-medium text-red-300">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-xs text-white/35">{hint}</p>
      ) : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className ?? 'h-5 w-5',
      )}
    />
  );
}

export function Logo({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-gold-400 text-ink-950 shadow-[0_10px_30px_-12px_rgba(255,201,77,0.9)]">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
          <path
            d="M12 2.8 14.7 9l6.7.5-5.1 4.3 1.6 6.5L12 16.7 6.1 20.3l1.6-6.5L2.6 9.5 9.3 9 12 2.8Z"
            fill="currentColor"
          />
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-2xl tracking-[0.08em] text-white">
            EL RIVAL
          </span>
          <span className="block font-display text-2xl tracking-[0.08em] text-gold-400">
            MÁS DÉBIL
          </span>
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-3 text-left transition hover:opacity-85"
      >
        {content}
      </button>
    );
  }

  return <div className="flex items-center gap-3">{content}</div>;
}

const AVATAR_COLORS = [
  'from-gold-400/30 to-gold-600/10 text-gold-200 border-gold-400/30',
  'from-cyan-400/25 to-cyan-600/10 text-cyan-200 border-cyan-400/30',
  'from-emerald-400/25 to-emerald-600/10 text-emerald-200 border-emerald-400/30',
  'from-pink-400/25 to-pink-600/10 text-pink-200 border-pink-400/30',
  'from-violet-400/25 to-violet-600/10 text-violet-200 border-violet-400/30',
  'from-orange-400/25 to-orange-600/10 text-orange-200 border-orange-400/30',
];

export function Avatar({
  name,
  seat = 0,
  size = 'md',
  muted = false,
  className,
}: {
  name: string;
  seat?: number;
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  };
  const color = AVATAR_COLORS[Math.abs(seat) % AVATAR_COLORS.length];
  const label = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full border bg-gradient-to-br font-bold',
        color,
        sizes[size],
        muted && 'opacity-40 grayscale',
        className,
      )}
    >
      {label || '?'}
    </span>
  );
}

export function Modal({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onClose,
  tone = 'primary',
  loading = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  tone?: 'primary' | 'danger';
  loading?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="card w-full max-w-md animate-pop p-6"
      >
        <h2 id="modal-title" className="font-display text-3xl tracking-wide text-white">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm leading-relaxed text-white/55">{description}</p>}
        {children && <div className="mt-5">{children}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onClose && (
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </Button>
          )}
          {onConfirm && (
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onClick={onConfirm}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Toast({
  message,
  tone = 'error',
  onClose,
}: {
  message: string | null;
  tone?: 'error' | 'success' | 'info';
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const tones = {
    error: 'border-red-400/30 bg-red-950/90 text-red-100',
    success: 'border-emerald-400/30 bg-emerald-950/90 text-emerald-100',
    info: 'border-cyan-400/30 bg-cyan-950/90 text-cyan-100',
  };

  return (
    <div className="fixed inset-x-4 bottom-5 z-[90] mx-auto flex max-w-lg items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
      <div className={cn('flex-1', tones[tone])}>{message}</div>
      <button
        type="button"
        onClick={onClose}
        className="text-white/50 transition hover:text-white"
        aria-label="Cerrar aviso"
      >
        ✕
      </button>
    </div>
  );
}
