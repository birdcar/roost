export type BackoffStrategy = 'fixed' | 'exponential';

export interface JobConfig {
  queue: string;
  maxRetries: number;
  retryAfter: number;
  delay: number;
  backoff: BackoffStrategy;
  timeout: number;
}

export interface JobMessage<TPayload = unknown> {
  jobName: string;
  payload: TPayload;
  attempt: number;
  dispatchedAt: string;
  chainedJobs?: SerializedJob[];
  batchId?: string;
}

export interface SerializedJob {
  jobName: string;
  payload: unknown;
}

export interface FailedJobRecord {
  id: string;
  jobName: string;
  payload: unknown;
  error: string;
  stack: string | undefined;
  attempt: number;
  failedAt: string;
}

export interface JobMetrics {
  jobName: string;
  processedCount: number;
  failedCount: number;
  avgDurationMs: number;
  lastProcessedAt: string | null;
}

export const DEFAULT_JOB_CONFIG: JobConfig = {
  queue: 'default',
  maxRetries: 3,
  retryAfter: 60,
  delay: 0,
  backoff: 'fixed',
  timeout: 0,
};
