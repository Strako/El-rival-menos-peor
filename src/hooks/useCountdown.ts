import { useEffect, useState } from 'react';

export function useCountdown(until: string | null | undefined): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!until) {
      setSeconds(0);
      return;
    }

    const tick = () => {
      const remaining = Math.ceil((new Date(until).getTime() - Date.now()) / 1000);
      setSeconds(Math.max(0, remaining));
    };

    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [until]);

  return seconds;
}
