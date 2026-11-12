import type { Request } from 'express';

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.get('cookie');
  if (!header) return undefined;
  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() === name) return segment.slice(separator + 1).trim();
  }
  return undefined;
}
