import { describe, test, expect, beforeEach } from 'bun:test';
import { SendWelcomeEmail } from '../app/jobs/send-welcome-email';

describe('SendWelcomeEmail job', () => {
  beforeEach(() => {
    SendWelcomeEmail.restore();
  });

  test('job receives typed payload', () => {
    const job = new SendWelcomeEmail(
      { email: 'alice@acme.com', name: 'Alice', orgName: 'Acme' }
    );
    expect(job.payload.email).toBe('alice@acme.com');
    expect(job.payload.name).toBe('Alice');
    expect(job.payload.orgName).toBe('Acme');
  });

  test('fake intercepts dispatch', async () => {
    SendWelcomeEmail.fake();

    await SendWelcomeEmail.dispatch({
      email: 'bob@acme.com',
      name: 'Bob',
      orgName: 'Acme',
    });

    SendWelcomeEmail.assertDispatched();
  });
});
