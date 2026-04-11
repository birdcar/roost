import type { JobMessage } from './types.js';
import type { JobRegistry } from './registry.js';
import { Job } from './job.js';
import { getJobConfig } from './decorators.js';
import { Dispatcher } from './dispatcher.js';

export class JobConsumer {
  constructor(private registry: JobRegistry) {}

  async processMessage(message: { body: JobMessage; ack: () => void; retry: (opts?: { delaySeconds?: number }) => void }): Promise<void> {
    const { body, ack, retry } = message;
    const jobClass = this.registry.resolve(body.jobName);

    if (!jobClass) {
      ack();
      return;
    }

    const config = getJobConfig(jobClass);
    const instance = new (jobClass as any)(body.payload, body.attempt) as Job;

    try {
      await instance.handle();
      await instance.onSuccess?.();

      if (body.chainedJobs && body.chainedJobs.length > 0) {
        const [next, ...remaining] = body.chainedJobs;
        const nextJobClass = this.registry.resolve(next.jobName);
        if (nextJobClass) {
          const nextConfig = getJobConfig(nextJobClass);
          try {
            const dispatcher = Dispatcher.get();
            await dispatcher.chain([
              { jobClass: nextJobClass, payload: next.payload },
              ...remaining.map((j) => ({
                jobClass: this.registry.resolve(j.jobName)!,
                payload: j.payload,
              })),
            ]);
          } catch {
            // Dispatcher not available in consumer context — chain continues via direct dispatch
          }
        }
      }

      ack();
    } catch (error) {
      await instance.onFailure?.(error instanceof Error ? error : new Error(String(error)));

      if (body.attempt >= config.maxRetries) {
        ack();
        return;
      }

      const delay = this.calculateDelay(config, body.attempt);
      retry({ delaySeconds: delay });
    }
  }

  async processBatch(messages: Array<{ body: JobMessage; ack: () => void; retry: (opts?: { delaySeconds?: number }) => void }>): Promise<void> {
    for (const message of messages) {
      await this.processMessage(message);
    }
  }

  private calculateDelay(config: typeof import('./types.js').DEFAULT_JOB_CONFIG, attempt: number): number {
    if (config.backoff === 'exponential') {
      return config.retryAfter * Math.pow(2, attempt - 1);
    }
    return config.retryAfter;
  }
}
