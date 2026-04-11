import type { QueueSender } from '@roost/cloudflare';
import type { JobMessage, SerializedJob } from './types.js';
import { getJobConfig } from './decorators.js';

let dispatcher: Dispatcher | null = null;

export class Dispatcher {
  constructor(private senders: Map<string, QueueSender>) {}

  async dispatch(jobClass: any, payload: unknown): Promise<void> {
    const config = getJobConfig(jobClass);
    const sender = this.senders.get(config.queue);
    if (!sender) {
      throw new Error(`No queue sender registered for queue "${config.queue}". Check QueueServiceProvider configuration.`);
    }

    const message: JobMessage = {
      jobName: jobClass.name,
      payload,
      attempt: 1,
      dispatchedAt: new Date().toISOString(),
    };

    const options = config.delay > 0 ? { delaySeconds: config.delay } : undefined;
    await sender.send(message, options);
  }

  async dispatchAfter(jobClass: any, seconds: number, payload: unknown): Promise<void> {
    const config = getJobConfig(jobClass);
    const sender = this.senders.get(config.queue);
    if (!sender) {
      throw new Error(`No queue sender registered for queue "${config.queue}".`);
    }

    const message: JobMessage = {
      jobName: jobClass.name,
      payload,
      attempt: 1,
      dispatchedAt: new Date().toISOString(),
    };

    await sender.send(message, { delaySeconds: seconds });
  }

  async chain(jobs: Array<{ jobClass: any; payload: unknown }>): Promise<void> {
    if (jobs.length === 0) return;

    const [first, ...rest] = jobs;
    const chainedJobs: SerializedJob[] = rest.map((j) => ({
      jobName: j.jobClass.name,
      payload: j.payload,
    }));

    const config = getJobConfig(first.jobClass);
    const sender = this.senders.get(config.queue);
    if (!sender) {
      throw new Error(`No queue sender registered for queue "${config.queue}".`);
    }

    const message: JobMessage = {
      jobName: first.jobClass.name,
      payload: first.payload,
      attempt: 1,
      dispatchedAt: new Date().toISOString(),
      chainedJobs,
    };

    await sender.send(message);
  }

  async batch(jobs: Array<{ jobClass: any; payload: unknown }>, batchId?: string): Promise<string> {
    const id = batchId ?? crypto.randomUUID();

    for (const { jobClass, payload } of jobs) {
      const config = getJobConfig(jobClass);
      const sender = this.senders.get(config.queue);
      if (!sender) {
        throw new Error(`No queue sender registered for queue "${config.queue}".`);
      }

      const message: JobMessage = {
        jobName: jobClass.name,
        payload,
        attempt: 1,
        dispatchedAt: new Date().toISOString(),
        batchId: id,
      };

      await sender.send(message);
    }

    return id;
  }

  static set(d: Dispatcher): void {
    dispatcher = d;
  }

  static get(): Dispatcher {
    if (!dispatcher) {
      throw new Error('Queue dispatcher not initialized. Register QueueServiceProvider before dispatching jobs.');
    }
    return dispatcher;
  }

  static reset(): void {
    dispatcher = null;
  }
}
