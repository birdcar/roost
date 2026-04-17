import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Agent } from './agent.js';
import type { AIProvider } from './providers/interface.js';
import type { ProviderRequest, ProviderResponse } from './types.js';

class TestAgent extends Agent {
  instructions() {
    return 'You are a test agent.';
  }
}

function makeProvider(overrides?: Partial<AIProvider>): AIProvider {
  return {
    name: 'test',
    capabilities: () => ({ name: 'test', supported: new Set(['chat']) }),
    chat: async (_req: ProviderRequest): Promise<ProviderResponse> => ({
      text: 'response text',
      toolCalls: [],
    }),
    ...overrides,
  };
}

function makeQueuedProvider(): AIProvider {
  return {
    name: 'test-queued',
    capabilities: () => ({ name: 'test-queued', supported: new Set(['chat']) }),
    chat: async (_req: ProviderRequest): Promise<ProviderResponse> => ({
      text: '',
      toolCalls: [],
      taskId: 'task-abc-123',
    }),
  };
}

describe('Agent queued inference', () => {
  beforeEach(() => {
    TestAgent.clearProvider();
  });

  afterEach(() => {
    TestAgent.clearProvider();
  });

  it('prompt({ queued: true }) returns { queued: true; taskId }', async () => {
    TestAgent.setProvider(makeQueuedProvider());
    const a = new TestAgent();
    const result = await a.prompt('Hello', { queued: true });

    expect(result.queued).toBe(true);
    if (result.queued) {
      expect(result.taskId).toBe('task-abc-123');
    }
  });

  it('prompt() without option returns { queued: false; text; ... }', async () => {
    TestAgent.setProvider(makeProvider());
    const a = new TestAgent();
    const result = await a.prompt('Hello');

    expect(result.queued).toBe(false);
    if (!result.queued) {
      expect(result.text).toBe('response text');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(Array.isArray(result.toolCalls)).toBe(true);
    }
  });

  it('stream() throws when called with queued: true option', async () => {
    TestAgent.setProvider(makeProvider());
    const a = new TestAgent();

    await expect(a.stream('Hello', { queued: true })).rejects.toThrow(
      'Cannot stream a queued request',
    );
  });
});
