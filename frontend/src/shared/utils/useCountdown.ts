import { useEffect, useState } from 'react';
import { secondsUntil } from './countdown';

export function useCountdown(expiresAt: string | number | Date): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => setRemaining(secondsUntil(expiresAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return remaining;
}
