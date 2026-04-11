import { describe, test, expect, beforeEach } from 'bun:test';
import { Job } from '../src/job';
import { JobRegistry } from '../src/registry';
import { JobConsumer } from '../src/consumer';
import { DEFAULT_JOB_CONFIG } from '../src/types';
import type { JobMessage } from '../src/types';

let handled: unknown[] = [];
let failureErrors: Error[] = [];

class SuccessJob extends Job<{ value: number }> {
  async handle() {
    handled.push(this.payload);
  }
}

class FailingJob extends Job<{ value: number }> {
  static _jobConfig = { ...DEFAULT_JOB_CONFIG, maxRetries: 3, retryAfter: 10 };

  async handle() {
    throw new Error('Job failed');
  }

  onFailure(error: Error) {
    failureErrors.push(error);
  }
}

function createMessage(body: JobMessage): { body: JobMessage; ack: () => void; retry: (opts?: { delaySeconds?: number }) => void } {
  const acked: boolean[] = [];
  const retried: Array<{ delaySeconds?: number }> = [];
  return {
    body,
    ack: () => acked.push(true),
    retry: (opts) => retried.push(opts ?? {}),
  };
}

describe('JobConsumer', () => {
  let registry: JobRegistry;
  let consumer: JobConsumer;

  beforeEach(() => {
    handled = [];
    failureErrors = [];
    registry = new JobRegistry();
    registry.register(SuccessJob as any);
    registry.register(FailingJob as any);
    consumer = new JobConsumer(registry);
  });

  test('processes a successful job and acks', async () => {
    const acked: boolean[] = [];
    const msg = {
      body: { jobName: 'SuccessJob', payload: { value: 42 }, attempt: 1, dispatchedAt: new Date().toISOString() },
      ack: () => acked.push(true),
      retry: () => {},
    };

    await consumer.processMessage(msg);

    expect(handled).toEqual([{ value: 42 }]);
    expect(acked).toHaveLength(1);
  });

  test('retries a failing job when under max retries', async () => {
    const retried: Array<{ delaySeconds?: number }> = [];
    const msg = {
      body: { jobName: 'FailingJob', payload: { value: 1 }, attempt: 1, dispatchedAt: new Date().toISOString() } as JobMessage,
      ack: () => {},
      retry: (opts?: { delaySeconds?: number }) => retried.push(opts ?? {}),
    };

    await consumer.processMessage(msg);

    expect(retried).toHaveLength(1);
    expect(retried[0].delaySeconds).toBe(10);
    expect(failureErrors).toHaveLength(1);
    expect(failureErrors[0].message).toBe('Job failed');
  });

  test('acks a failing job when at max retries (dead letter)', async () => {
    const acked: boolean[] = [];
    const retried: unknown[] = [];
    const msg = {
      body: { jobName: 'FailingJob', payload: { value: 1 }, attempt: 3, dispatchedAt: new Date().toISOString() } as JobMessage,
      ack: () => acked.push(true),
      retry: () => retried.push(true),
    };

    await consumer.processMessage(msg);

    expect(acked).toHaveLength(1);
    expect(retried).toHaveLength(0);
  });

  test('acks unknown job name without error', async () => {
    const acked: boolean[] = [];
    const msg = {
      body: { jobName: 'UnknownJob', payload: {}, attempt: 1, dispatchedAt: new Date().toISOString() },
      ack: () => acked.push(true),
      retry: () => {},
    };

    await consumer.processMessage(msg);
    expect(acked).toHaveLength(1);
  });

  test('processBatch handles multiple messages', async () => {
    const acked: boolean[] = [];
    const messages = [
      {
        body: { jobName: 'SuccessJob', payload: { value: 1 }, attempt: 1, dispatchedAt: new Date().toISOString() },
        ack: () => acked.push(true),
        retry: () => {},
      },
      {
        body: { jobName: 'SuccessJob', payload: { value: 2 }, attempt: 1, dispatchedAt: new Date().toISOString() },
        ack: () => acked.push(true),
        retry: () => {},
      },
    ];

    await consumer.processBatch(messages);

    expect(handled).toEqual([{ value: 1 }, { value: 2 }]);
    expect(acked).toHaveLength(2);
  });
});
