import { AuditLog } from '../data/models.js';
import type { Types } from 'mongoose';

export interface AuditWrite {
  actorId: Types.ObjectId | string;
  patientId: Types.ObjectId | string;
  action: string;
  modelVersion?: string | null;
  timestamp?: Date;
}

export async function writeAudit(entry: AuditWrite): Promise<void> {
  await AuditLog.create({
    actorId: entry.actorId,
    patientId: entry.patientId,
    action: entry.action,
    modelVersion: entry.modelVersion ?? null,
    timestamp: entry.timestamp ?? new Date(),
  });
}
