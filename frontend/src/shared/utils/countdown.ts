export function secondsUntil(expiresAt: string | number | Date, now = Date.now()): number {
  const expiry =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === 'number'
        ? expiresAt
        : Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return 0;
  return Math.max(0, Math.ceil((expiry - now) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
