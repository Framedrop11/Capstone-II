import { Types } from 'mongoose';

interface CursorValue {
  timestamp: string;
  id: string;
}

export function encodeCursor(timestamp: Date, id: Types.ObjectId): string {
  return Buffer.from(JSON.stringify({ timestamp: timestamp.toISOString(), id: id.toString() } satisfies CursorValue)).toString('base64url');
}

export function decodeCursor(value: string | undefined): CursorValue | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CursorValue>;
    if (typeof parsed.timestamp !== 'string' || typeof parsed.id !== 'string' || !Types.ObjectId.isValid(parsed.id)
      || Number.isNaN(Date.parse(parsed.timestamp))) return undefined;
    return { timestamp: new Date(parsed.timestamp).toISOString(), id: parsed.id };
  } catch {
    return undefined;
  }
}

export function cursorCondition(field: string, cursor: CursorValue | undefined): Record<string, unknown> {
  if (!cursor) return {};
  const timestamp = new Date(cursor.timestamp);
  return { $or: [{ [field]: { $lt: timestamp } }, { [field]: timestamp, _id: { $lt: new Types.ObjectId(cursor.id) } }] };
}

export function pageLimit(value: unknown): number {
  const limit = Number(value ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return 25;
  return limit;
}
