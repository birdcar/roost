import { describe, it, expect, afterEach } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';
import { Email, EmailSendError, createEmailHandler, hasEmailInbound } from '../../src/email/index.js';

afterEach(() => {
  Email.restore();
});

describe('Email.send', () => {
  it('throws EmailSendError when no transport is configured and not faked', async () => {
    await expect(
      Email.send({ to: 'a@b', from: 'c@d', subject: 's', text: 'hi' }),
    ).rejects.toThrow(EmailSendError);
  });

  it('records messages in fake mode', async () => {
    Email.fake();
    await Email.send({ to: 'a@b', from: 'c@d', subject: 'hello', text: 'x' });
    Email.assertSent((m) => m.subject === 'hello');
  });

  it('assertNothingSent passes when the fake is empty', () => {
    Email.fake();
    Email.assertNothingSent();
  });

  it('delegates to a configured transport', async () => {
    const seen: string[] = [];
    Email.configure({
      async send(msg) {
        seen.push(msg.subject);
      },
    });
    await Email.send({ to: 'a@b', from: 'c@d', subject: 'real', text: 'x' });
    expect(seen).toEqual(['real']);
  });
});

describe('createEmailHandler', () => {
  class ReceivingAgent extends StatefulAgent {
    instructions() {
      return 'mail';
    }
    received: string[] = [];
    async onEmail(msg: { subject: string }) {
      this.received.push(msg.subject);
    }
  }

  class MuteAgent extends StatefulAgent {
    instructions() {
      return 'mute';
    }
  }

  it('routes the forwarded email to the agent onEmail method', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(ReceivingAgent).build();
    try {
      const handler = createEmailHandler(() => agent);
      await handler({ from: 'a@b', to: 'c@d', subject: 'hi', raw: 'raw' });
      expect(agent.received).toEqual(['hi']);
    } finally {
      cleanup();
    }
  });

  it('throws when the agent does not implement onEmail', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(MuteAgent).build();
    try {
      const handler = createEmailHandler(() => agent);
      await expect(
        handler({ from: 'a@b', to: 'c@d', subject: 'x', raw: 'raw' }),
      ).rejects.toThrow('does not implement onEmail');
    } finally {
      cleanup();
    }
  });
});

describe('hasEmailInbound', () => {
  it('detects agents that define onEmail', () => {
    const a = { onEmail() {} };
    const b = {};
    expect(hasEmailInbound(a)).toBe(true);
    expect(hasEmailInbound(b)).toBe(false);
  });
});
