import type { Express } from 'express';
import { AuditLog, ModelVersion, User } from '../../data/models.js';
import type { CoreApiDependencies } from '../api-types.js';
import { cursorCondition, decodeCursor, encodeCursor, pageLimit } from '../cursor.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { bearerRoute } from './auth.js';

export function registerAdminRoutes(app: Express, dependencies: CoreApiDependencies): void {
  const admin = bearerRoute(dependencies.accessTokens, 'admin');
  app.get('/api/v1/admin/users', ...admin, async (request, response, next) => {
    try {
      const limit = pageLimit(request.query['limit']);
      const cursor = decodeCursor(typeof request.query['cursor'] === 'string' ? request.query['cursor'] : undefined);
      const rows = await User.find(cursorCondition('createdAt', cursor)).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).exec();
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      response.json({ items: items.map((user) => ({ userId: user._id.toString(), name: user.name, email: user.email, role: user.role })), nextCursor: hasMore && items.length ? encodeCursor(items.at(-1)!.createdAt, items.at(-1)!._id) : null });
    } catch (error) { next(error); }
  });
  app.patch('/api/v1/admin/users/:userId/role', ...admin, async (request, response, next) => {
    try {
      const input = request.body as { role: 'patient' | 'doctor' | 'admin' };
      const user = await User.findByIdAndUpdate(request.params['userId'], { $set: { role: input.role } }, { new: true, runValidators: true }).exec();
      if (!user) throw new NotFoundError('User not found');
      response.json({ userId: user._id.toString(), name: user.name, email: user.email, role: user.role });
    } catch (error) { next(error); }
  });
  app.get('/api/v1/admin/audit', ...admin, async (request, response, next) => {
    try {
      const filter: Record<string, unknown> = {};
      for (const field of ['patientId', 'actorId', 'action'] as const) if (typeof request.query[field] === 'string') filter[field] = request.query[field];
      const timestamp: Record<string, Date> = {};
      if (typeof request.query['from'] === 'string') timestamp['$gte'] = new Date(request.query['from']);
      if (typeof request.query['to'] === 'string') timestamp['$lte'] = new Date(request.query['to']);
      if (Object.keys(timestamp).length) filter['timestamp'] = timestamp;
      const limit = pageLimit(request.query['limit']);
      const cursor = decodeCursor(typeof request.query['cursor'] === 'string' ? request.query['cursor'] : undefined);
      const rows = await AuditLog.find({ ...filter, ...cursorCondition('timestamp', cursor) }).sort({ timestamp: -1, _id: -1 }).limit(limit + 1).exec();
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      response.json({ items: items.map((entry) => ({ auditLogId: entry._id.toString(), actorId: entry.actorId.toString(), patientId: entry.patientId.toString(), action: entry.action, modelVersion: entry.modelVersion ?? null, timestamp: entry.timestamp.toISOString() })), nextCursor: hasMore && items.length ? encodeCursor(items.at(-1)!.timestamp, items.at(-1)!._id) : null });
    } catch (error) { next(error); }
  });
  app.get('/api/v1/admin/model-versions', ...admin, async (request, response, next) => {
    try {
      const limit = pageLimit(request.query['limit']);
      const cursor = decodeCursor(typeof request.query['cursor'] === 'string' ? request.query['cursor'] : undefined);
      const rows = await ModelVersion.find(cursorCondition('createdAt', cursor)).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).exec();
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      response.json({ items: items.map((row) => ({ version: row.version, status: row.status, canaryTrafficPercent: row.canaryTrafficPercent, artifactUri: row.artifactUri, testResults: row.testResults, promotedAt: row.promotedAt?.toISOString() ?? null })), nextCursor: hasMore && items.length ? encodeCursor(items.at(-1)!.createdAt, items.at(-1)!._id) : null });
    } catch (error) { next(error); }
  });
  app.post('/api/v1/admin/model-versions/:version/promote', ...admin, async (request, response, next) => {
    try {
      const candidate = await ModelVersion.findOne({ version: request.params['version'], status: 'candidate' }).exec();
      if (!candidate || (candidate.testResults as Record<string, unknown>)['promotionEligible'] !== true) throw new ConflictError('Candidate has not passed the model promotion gate');
      await ModelVersion.updateMany({ status: 'stable' }, { $set: { status: 'retired', canaryTrafficPercent: 0 } }).exec();
      candidate.status = 'stable'; candidate.canaryTrafficPercent = 0; candidate.promotedAt = new Date(); await candidate.save();
      response.json({ version: candidate.version, status: candidate.status, canaryTrafficPercent: candidate.canaryTrafficPercent, artifactUri: candidate.artifactUri, testResults: candidate.testResults, promotedAt: candidate.promotedAt.toISOString() });
    } catch (error) { next(error); }
  });
  app.post('/api/v1/admin/model-versions/:version/rollback', ...admin, async (request, response, next) => {
    try {
      const target = await ModelVersion.findOne({ version: request.params['version'], status: { $in: ['retired', 'stable'] } }).exec();
      if (!target) throw new NotFoundError('Rollback model version not found');
      await ModelVersion.updateMany({ status: 'stable' }, { $set: { status: 'retired', canaryTrafficPercent: 0 } }).exec();
      target.status = 'stable'; target.canaryTrafficPercent = 0; target.promotedAt = new Date(); await target.save();
      response.json({ version: target.version, status: target.status, canaryTrafficPercent: target.canaryTrafficPercent, artifactUri: target.artifactUri, testResults: target.testResults, promotedAt: target.promotedAt.toISOString() });
    } catch (error) { next(error); }
  });
}
