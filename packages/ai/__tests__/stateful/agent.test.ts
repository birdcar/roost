import { describe, it, expect, afterEach } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';
import type { AIProvider, ProviderCapabilities } from '../../src/providers/interface.js';
import { Scheduled } from '../../src/decorators.js';
import { NoProviderRegisteredError } from '../../src/agent.js';
import { MissingScheduledMethodError } from '../../src/stateful/schedule.js';

class FakeProvider implements AIProvider {
  readonly name = 'fake';
  capabilities(): ProviderCapabilities { return { smartestChat: 'fake-smart', cheapestChat: 'fake-cheap' }; }
  async chat() {
    return { text: 'hi from fake', toolCalls: [] };
  }
}

class DemoAgent extends StatefulAgent {
  instructions(): string {
    return 'You are a demo agent.';
  }
}

afterEach(() => {
  DemoAgent.restore();
  DemoAgent.clearProvider();
});

describe('StatefulAgent.prompt — fake path', () => {
  it('returns fake responses and records prompts for later assertion', async () => {
    DemoAgent.fake(['canned response']);
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const r = await agent.prompt('hello?');
      expect(r.text).toBe('canned response');
      DemoAgent.assertPrompted('hello?');
    } finally {
      cleanup();
    }
  });
});

describe('StatefulAgent.prompt — live path', () => {
  it('throws NoProviderRegisteredError when no provider is configured', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      await expect(agent.prompt('hi')).rejects.toThrow(NoProviderRegisteredError);
    } finally {
      cleanup();
    }
  });

  it('uses the provider set via setProvider', async () => {
    DemoAgent.setProvider(new FakeProvider());
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const r = await agent.prompt('hi');
      expect(r.text).toBe('hi from fake');
    } finally {
      cleanup();
    }
  });
});

describe('StatefulAgent.schedule', () => {
  it('persists a delayed schedule whose method exists on the agent', async () => {
    class Tickable extends StatefulAgent {
      instructions() { return 'tickable'; }
      async tick() { /* no-op */ }
    }
    const { agent, cleanup } = TestStatefulAgentHarness.for(Tickable).build();
    try {
      const id = await agent.schedule(60, 'tick', null);
      const record = await agent.getSchedule(id);
      expect(record?.method).toBe('tick');
      expect(record?.type).toBe('delayed');
    } finally {
      cleanup();
    }
  });

  it('throws MissingScheduledMethodError for methods that do not exist', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      await expect(
        agent.schedule(1, 'missing' as keyof DemoAgent, null),
      ).rejects.toThrow(MissingScheduledMethodError);
    } finally {
      cleanup();
    }
  });
});

describe('StatefulAgent alarm fires scheduled methods', () => {
  it('invokes the method and removes one-shot schedules', async () => {
    const fired: string[] = [];
    class RunnerAgent extends StatefulAgent {
      instructions() { return 'runner'; }
      async tick(payload: unknown) { fired.push(String(payload)); }
    }
    const built = TestStatefulAgentHarness.for(RunnerAgent).build();
    const { agent, cleanup } = built;
    try {
      await agent.schedule(10, 'tick', 'payload-value');
      built.advance(11);
      await agent.alarm();
      expect(fired).toEqual(['payload-value']);
      expect(await agent.getSchedules()).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe('@Scheduled decorator registers cron schedules on construction', () => {
  it('creates a cron schedule for each decorated method when the agent is built', async () => {
    class DigestAgent extends StatefulAgent {
      instructions() { return 'digest'; }
      @Scheduled('0 9 * * *')
      async sendDigest() { /* no-op */ }
    }
    const { agent, cleanup } = TestStatefulAgentHarness.for(DigestAgent).build();
    try {
      // The registration runs via waitUntil; flush by awaiting a tick.
      await new Promise((resolve) => setTimeout(resolve, 10));
      const schedules = await agent.getSchedules();
      expect(schedules.length).toBeGreaterThan(0);
      expect(schedules[0].method).toBe('sendDigest');
      expect(schedules[0].type).toBe('cron');
    } finally {
      cleanup();
    }
  });
});