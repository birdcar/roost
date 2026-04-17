import { describe, test, expect, beforeEach } from 'bun:test';
import { Agent } from '../src/agent';
import type { AIProvider, ProviderCapabilities } from '../src/providers/interface';
import type { ProviderRequest, ProviderResponse } from '../src/types';

class MockProvider implements AIProvider {
  name = 'mock';
  public lastRequest: ProviderRequest | null = null;
  private response: string;

  constructor(response = 'Mock response') {
    this.response = response;
  }

  capabilities(): ProviderCapabilities {
    return { name: 'mock', supported: new Set(['chat']) };
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    this.lastRequest = request;
    return { text: this.response, toolCalls: [] };
  }
}

class TestAgent extends Agent {
  instructions() { return 'You are a test agent.'; }
}

describe('Agent', () => {
  beforeEach(() => {
    TestAgent.restore();
    TestAgent.clearProvider();
  });

  test('prompt sends to provider and returns response', async () => {
    const provider = new MockProvider('Hello!');
    TestAgent.setProvider(provider);

    const agent = new TestAgent();
    const response = await agent.prompt('Hi');

    expect(response.text).toBe('Hello!');
    expect(provider.lastRequest!.messages).toHaveLength(2);
    expect(provider.lastRequest!.messages[0].role).toBe('system');
    expect(provider.lastRequest!.messages[1].role).toBe('user');
  });

  test('system message contains instructions', async () => {
    const provider = new MockProvider();
    TestAgent.setProvider(provider);

    const agent = new TestAgent();
    await agent.prompt('test');

    expect(provider.lastRequest!.messages[0].content).toBe('You are a test agent.');
  });

  test('throws without provider', async () => {
    const agent = new TestAgent();
    expect(agent.prompt('test')).rejects.toThrow('No AI provider set');
  });
});

describe('Agent.fake()', () => {
  beforeEach(() => {
    TestAgent.restore();
    TestAgent.clearProvider();
  });

  test('fake intercepts prompt calls', async () => {
    TestAgent.fake(['Fake answer']);

    const agent = new TestAgent();
    const response = await agent.prompt('Hello');

    expect(response.text).toBe('Fake answer');
  });

  test('fake queues multiple responses', async () => {
    TestAgent.fake(['First', 'Second', 'Third']);

    const agent = new TestAgent();
    expect((await agent.prompt('1')).text).toBe('First');
    expect((await agent.prompt('2')).text).toBe('Second');
    expect((await agent.prompt('3')).text).toBe('Third');
  });

  test('assertPrompted with string', async () => {
    TestAgent.fake();
    const agent = new TestAgent();
    await agent.prompt('Tell me about TypeScript');

    TestAgent.assertPrompted('TypeScript');
  });

  test('assertPrompted with predicate', async () => {
    TestAgent.fake();
    const agent = new TestAgent();
    await agent.prompt('Tell me about TypeScript');

    TestAgent.assertPrompted((p) => p.contains('TypeScript'));
  });

  test('assertNeverPrompted passes when not prompted', () => {
    TestAgent.fake();
    TestAgent.assertNeverPrompted();
  });

  test('assertNeverPrompted fails when prompted', async () => {
    TestAgent.fake();
    const agent = new TestAgent();
    await agent.prompt('test');

    expect(() => TestAgent.assertNeverPrompted()).toThrow('never be prompted');
  });

  test('restore removes fake', async () => {
    TestAgent.fake();
    TestAgent.restore();

    const agent = new TestAgent();
    expect(agent.prompt('test')).rejects.toThrow('No AI provider set');
  });
});
