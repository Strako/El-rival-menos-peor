import { useEffect, useRef, useState } from 'react';

/**
 * Cuenta regresiva sincronizada con el reloj del servidor.
 * Se reinicia con cada pregunta/deadline y avisa una sola vez al llegar a 0.
 */
export function useTurnCountdown(
  deadlineAt: string | null | undefined,
  serverTime: string,
  active: boolean,
  onExpire?: () => void,
  resetKey?: string | number,
): number {
  const [seconds, setSeconds] = useState(0);
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    fired.current = false;
  }, [deadlineAt, resetKey]);

  useEffect(() => {
    if (!deadlineAt || !active) {
      setSeconds(0);
      return;
    }

    const deadline = new Date(deadlineAt).getTime();
    const serverNow = new Date(serverTime).getTime();
    const initial = Math.max(0, Math.ceil((deadline - serverNow) / 1000));
    setSeconds(initial);

    const started = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.max(0, initial - Math.floor((Date.now() - started) / 1000));
      setSeconds(next);

      if (next <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current?.();
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [deadlineAt, serverTime, active]);

  return seconds;
}
