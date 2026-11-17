import { randomUUID } from 'node:crypto';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { AuditLog, Notification, Patient, Prediction, Questionnaire } from '../../core-api/src/data/models.js';
import type { ScoringJob } from '../../core-api/src/queue/scoring-queue.js';
import { MlClient } from './ml/client.js';
import { ReportReadCache } from '../../core-api/src/cache/report-cache.js';
import { calculateFindrisc } from './scoring/findrisc.js';
import { scoringFallbacks, predictionScores, workerJobDuration, workerJobs, workerQueueDepth } from './observability.js';
import { writeLog } from '../../../packages/shared/src/index.js';

export const scoringQueueName = 'scoring';
export const deadLetterQueueName = 'scoring-dead-letter';
export const findriscModelVersion = 'findrisc-lindstrom-2003-v1';

export async function processScoringJob(data: ScoringJob, mlClient: MlClient, reportCache?: ReportReadCache): Promise<{ predictionId: string; scoreSource: 'basic_only' | 'ml_refined' }> {
  const questionnaire = await Questionnaire.findOne({ _id: data.questionnaireId, patientId: data.patientId }).exec();
  if (!questionnaire) throw new UnrecoverableError('Questionnaire does not exist for the supplied patient');
  let basic;
  try { basic = calculateFindrisc(questionnaire.responses); }
  catch (error) { throw new UnrecoverableError(error instanceof Error ? error.message : 'Questionnaire does not match the supported screening instrument'); }
  let ml: Awaited<ReturnType<MlClient['predict']>> | undefined;
  try { ml = await mlClient.predict(questionnaire.responses as Record<string, unknown>, basic, data.correlationId); }
  catch { /* The validated basic score remains available when ML is absent or unhealthy. */ }
  const scoreSource = ml ? 'ml_refined' : 'basic_only';
  const modelVersion = ml?.modelVersion ?? findriscModelVersion;
  const factors = ml?.factors.length ? ml.factors : basic.factors;
  const prediction = await Prediction.findOneAndUpdate(
    { questionnaireId: questionnaire._id },
    { $set: {
      patientId: questionnaire.patientId,
      basicScore: basic.normalizedScore,
      mlScore: ml?.score ?? null,
      scoreSource,
      riskBand: basic.riskBand,
      modelVersion,
      factors,
      predictionTimestamp: new Date(),
    } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).exec();
  await reportCache?.invalidate(questionnaire.patientId.toString(), prediction._id.toString());
  if (!ml) scoringFallbacks.inc();
  predictionScores.observe({ source: scoreSource }, ml?.score ?? basic.normalizedScore);
  const patient = await Patient.findById(questionnaire.patientId).exec();
  if (patient) {
    await Notification.updateOne(
      { recipientId: patient.userId, kind: 'report_ready', 'payload.questionnaireId': questionnaire._id.toString() },
      { $setOnInsert: { recipientId: patient.userId, patientId: patient._id, kind: 'report_ready', payload: { questionnaireId: questionnaire._id.toString(), predictionId: prediction._id.toString(), scoreSource } } },
      { upsert: true, runValidators: true },
    ).exec();
    // The insert-only unique index makes audit retries idempotent without granting update/delete rights.
    try {
      await AuditLog.create({ actorId: patient.userId, patientId: patient._id, action: 'score_generated', modelVersion, details: { questionnaireId: questionnaire._id.toString(), scoreSource, correlationId: data.correlationId } });
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
    }
  }
  return { predictionId: prediction._id.toString(), scoreSource };
}

export interface WorkerRuntimeConfig {
  mongoUri: string;
  databaseName: string;
  queueRedisUrl: string;
  cacheRedisUrl?: string;
  mlServiceUrl?: string;
  concurrency?: number;
}

export async function startScoringWorker(config: WorkerRuntimeConfig): Promise<{ close(): Promise<void>; worker: Worker }> {
  await mongoose.connect(config.mongoUri, { dbName: config.databaseName, autoIndex: false });
  const connection = new Redis(config.queueRedisUrl, { maxRetriesPerRequest: null });
  const cacheConnection = config.cacheRedisUrl
    ? new Redis(config.cacheRedisUrl, { maxRetriesPerRequest: 1, retryStrategy: (attempt) => attempt > 3 ? null : Math.min(attempt * 100, 1000) })
    : undefined;
  const reportCache = cacheConnection ? new ReportReadCache(cacheConnection) : undefined;
  const queue = new Queue<ScoringJob>(scoringQueueName, { connection });
  const deadLetters = new Queue(deadLetterQueueName, { connection });
  const mlClient = new MlClient(config.mlServiceUrl);
  const worker = new Worker<ScoringJob>(scoringQueueName, async (job: Job<ScoringJob>) => {
    const started = process.hrtime.bigint();
    try {
      let result: unknown;
      if (job.name === 'nightly-rescore-scan') {
      const day = new Date().toISOString().slice(0, 10);
      const cursor = Questionnaire.find().select({ _id: 1, patientId: 1 }).lean().cursor();
      for await (const questionnaire of cursor) {
        const item = questionnaire as { _id: mongoose.Types.ObjectId; patientId: mongoose.Types.ObjectId };
        const data: ScoringJob = { questionnaireId: item._id.toString(), patientId: item.patientId.toString(), correlationId: randomUUID() };
        await queue.add('score-questionnaire', data, { jobId: `nightly-${day}-${data.questionnaireId}`, attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
      }
        result = { rescoredOn: day };
      } else {
        result = await processScoringJob(job.data, mlClient, reportCache);
      }
      workerJobs.inc({ outcome: 'success', job_name: job.name });
      writeLog('info', 'worker_job_completed', {
        service: 'carelens-worker',
        correlationId: job.data.correlationId,
        jobName: job.name,
        durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1_000_000),
        scoreSource: typeof result === 'object' && result !== null && 'scoreSource' in result ? String(result.scoreSource) : undefined,
      });
      return result;
    } catch (error) {
      workerJobs.inc({ outcome: 'failure', job_name: job.name });
      writeLog('error', 'worker_job_failed', {
        service: 'carelens-worker',
        correlationId: job.data.correlationId,
        jobName: job.name,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    } finally {
      workerJobDuration.observe({ job_name: job.name }, Number(process.hrtime.bigint() - started) / 1_000_000_000);
    }
  }, { connection, concurrency: config.concurrency ?? 4 });
  worker.on('failed', (job, error) => {
    if (!job || (!(error instanceof UnrecoverableError) && job.attemptsMade < (job.opts.attempts ?? 1))) return;
    void deadLetters.add('scoring-failed', {
      originalJobId: job.id,
      questionnaireId: job.data.questionnaireId,
      patientId: job.data.patientId,
      correlationId: job.data.correlationId,
      failure: error.message,
      failedAt: new Date().toISOString(),
    }, { jobId: `dead-${job.id}`, removeOnComplete: false });
  });
  await queue.upsertJobScheduler('nightly-rescore', { pattern: '0 2 * * *' }, { name: 'nightly-rescore-scan', data: { questionnaireId: '', patientId: '', correlationId: 'scheduled' } });
  const refreshQueueDepth = async (): Promise<void> => {
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      for (const state of ['waiting', 'active', 'delayed', 'failed', 'completed'] as const) workerQueueDepth.set({ state }, counts[state] ?? 0);
    } catch { /* Metrics collection must not affect queue processing. */ }
  };
  const queueDepthTimer = setInterval(() => { void refreshQueueDepth(); }, 5_000);
  queueDepthTimer.unref();
  await refreshQueueDepth();
  await worker.waitUntilReady();
  return { worker, close: async () => { clearInterval(queueDepthTimer); await worker.close(); await Promise.all([queue.close(), deadLetters.close(), connection.quit(), ...(cacheConnection ? [cacheConnection.quit()] : []), mongoose.disconnect()]); } };
}
