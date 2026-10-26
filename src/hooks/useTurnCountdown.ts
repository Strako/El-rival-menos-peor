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
    const serverOffset = new Date(serverTime).getTime() - Date.now();

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline - (Date.now() + serverOffset)) / 1000),
      );
      setSeconds(remaining);

      if (remaining <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current?.();
      }
    };

    tick();
    const timer = window.setInterval(tick, 200);

    return () => window.clearInterval(timer);
  }, [deadlineAt, serverTime, active]);

  return seconds;
}
