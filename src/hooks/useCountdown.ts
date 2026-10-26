import { useEffect, useState } from 'react';

export function useCountdown(
  until: string | null | undefined,
  serverTime?: string | null,
): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!until) {
      setSeconds(0);
      return;
    }

    const serverOffset = serverTime
      ? new Date(serverTime).getTime() - Date.now()
      : 0;

    const tick = () => {
      const remaining = Math.ceil(
        (new Date(until).getTime() - (Date.now() + serverOffset)) / 1000,
      );
      setSeconds(Math.max(0, remaining));
    };

    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [until, serverTime]);

  return seconds;
}
