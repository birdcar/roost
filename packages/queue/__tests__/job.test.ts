import { describe, test, expect, beforeEach } from 'bun:test';
import { Job } from '../src/job';
import { getJobConfig } from '../src/decorators';
import { DEFAULT_JOB_CONFIG } from '../src/types';

class SendEmail extends Job<{ to: string; subject: string }> {
  static _jobConfig = { ...DEFAULT_JOB_CONFIG, queue: 'email', maxRetries: 5 };

  async handle() {
    // Would send email
  }
}

class ProcessReport extends Job<{ reportId: string }> {
  async handle() {
    // Would process report
  }
}

describe('Job', () => {
  beforeEach(() => {
    SendEmail.restore();
    ProcessReport.restore();
  });

  test('job receives typed payload', () => {
    const job = new SendEmail({ to: 'alice@test.com', subject: 'Hello' });
    expect(job.payload.to).toBe('alice@test.com');
    expect(job.payload.subject).toBe('Hello');
    expect(job.attempt).toBe(1);
  });

  test('job receives attempt number', () => {
    const job = new SendEmail({ to: 'a@b.com', subject: 'Hi' }, 3);
    expect(job.attempt).toBe(3);
  });

  test('getJobConfig returns decorator config', () => {
    const config = getJobConfig(SendEmail);
    expect(config.queue).toBe('email');
    expect(config.maxRetries).toBe(5);
  });

  test('getJobConfig returns defaults for unconfigured job', () => {
    const config = getJobConfig(ProcessReport);
    expect(config.queue).toBe('default');
    expect(config.maxRetries).toBe(3);
  });
});

describe('Job.fake()', () => {
  beforeEach(() => {
    SendEmail.restore();
  });

  test('fake intercepts dispatch', async () => {
    SendEmail.fake();
    await SendEmail.dispatch({ to: 'a@b.com', subject: 'Test' });

    SendEmail.assertDispatched();
  });

  test('assertDispatched with job name', async () => {
    SendEmail.fake();
    await SendEmail.dispatch({ to: 'a@b.com', subject: 'Test' });

    SendEmail.assertDispatched('SendEmail');
  });

  test('assertNotDispatched passes when none dispatched', () => {
    SendEmail.fake();
    SendEmail.assertNotDispatched();
  });

  test('assertNotDispatched fails when dispatched', async () => {
    SendEmail.fake();
    await SendEmail.dispatch({ to: 'a@b.com', subject: 'Test' });

    expect(() => SendEmail.assertNotDispatched()).toThrow('Expected no jobs dispatched');
  });

  test('restore removes fake', () => {
    SendEmail.fake();
    SendEmail.restore();

    // Without fake, dispatch requires a real Dispatcher
    expect(SendEmail.dispatch({ to: 'a@b.com', subject: 'Test' })).rejects.toThrow('Queue dispatcher not initialized');
  });
});
