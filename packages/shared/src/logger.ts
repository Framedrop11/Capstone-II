export type LogLevel = 'info' | 'warn' | 'error';

export function writeLog(level: LogLevel, event: string, fields: Record<string, string | number | boolean | null | undefined> = {}): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env['SERVICE_NAME'] ?? 'carelens',
    event,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
}
