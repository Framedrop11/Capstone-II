import type { Redis } from 'ioredis';
import type { AuthService } from '../auth/auth-service.js';
import type { AccessTokenService } from '../auth/access-tokens.js';
import type { ScopedReportTokenService } from '../auth/scoped-report-tokens.js';
import type { ScoringQueue } from '../queue/scoring-queue.js';
import type { AuthEnvironment } from '../auth/types.js';
import type { ReportReadCache } from '../cache/report-cache.js';
import type { EmailNotificationAdapter } from '../notifications/email-adapter.js';

export interface CoreApiDependencies {
  environment: AuthEnvironment;
  oidcRedirectUri: string;
  authService: AuthService;
  accessTokens: AccessTokenService;
  scopedReportTokens: ScopedReportTokenService;
  scoringQueue: ScoringQueue;
  queueRedis: Redis;
  rateLimitRedis: Redis;
  reportCache?: ReportReadCache;
  emailNotifications?: EmailNotificationAdapter;
  mlServiceUrl?: string;
  maximumRequestBytes?: number;
}
