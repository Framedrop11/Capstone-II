import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export interface ScoringJob {
  questionnaireId: string;
  patientId: string;
  correlationId: string;
}

export interface ScoringQueue {
  enqueue(job: ScoringJob): Promise<void>;
  getStatus?(questionnaireId: string): Promise<'pending' | 'complete' | 'failed' | 'missing'>;
  isReady(): Promise<boolean>;
  close(): Promise<void>;
}

export class BullMqScoringQueue implements ScoringQueue {
  private readonly queue: Queue<ScoringJob>;

  constructor(connection: Redis) {
    this.queue = new Queue<ScoringJob>('scoring', {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    });
  }

  async enqueue(job: ScoringJob): Promise<void> {
    await this.queue.add('score-questionnaire', job, { jobId: job.questionnaireId });
  }

  async getStatus(questionnaireId: string): Promise<'pending' | 'complete' | 'failed' | 'missing'> {
    const job = await this.queue.getJob(questionnaireId);
    if (!job) return 'missing';
    const state = await job.getState();
    if (state === 'completed') return 'complete';
    if (state === 'failed') return 'failed';
    return 'pending';
  }

  async isReady(): Promise<boolean> {
    try {
      await this.queue.waitUntilReady();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
