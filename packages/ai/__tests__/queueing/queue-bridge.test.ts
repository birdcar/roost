import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Agent } from '../../src/agent.js';
import {
  InMemoryCallbackRegistry,
  setCallbackRegistry,
  resetCallbackRegistry,
  getCallbackRegistry,
  QueuedPromptHandle,
} from '../../src/queueing/index.js';

class QueueTestAgent extends Agent {
  instructions(): string {
    return 'test';
  }
}

describe('Agent.queue via fake', () => {
  afterEach(() => {
    QueueTestAgent.restore();
    resetCallbackRegistry();
  });

  it('queue() records a queued prompt via AgentFake.recordQueued', async () => {
    const fake = QueueTestAgent.fake();
    const agent = new QueueTestAgent();
    const handle = agent.queue('hello');

    expect(handle).toBeInstanceOf(QueuedPromptHandle);
    expect(handle.promptId).toMatch(/^ai_prompt_/);
    expect(fake.queuedPrompts).toHaveLength(1);
    expect(fake.queuedPrompts[0]!.prompt).toBe('hello');
  });

  it('Agent.assertQueued passes after a queue() call', async () => {
    QueueTestAgent.fake();
    const agent = new QueueTestAgent();
    agent.queue('generate report');
    expect(() => QueueTestAgent.assertQueued('report')).not.toThrow();
    expect(() => QueueTestAgent.assertQueued('missing')).toThrow();
  });
});

describe('QueuedPromptHandle + InMemoryCallbackRegistry', () => {
  let registry: InMemoryCallbackRegistry;

  beforeEach(() => {
    registry = new InMemoryCallbackRegistry();
    setCallbackRegistry(registry);
  });

  afterEach(() => resetCallbackRegistry());

  it('invokes .then() with the fulfilled result', async () => {
    const handle = new QueuedPromptHandle('pid-1');
    let received: unknown;
    handle.then((r) => {
      received = r;
    });
    await registry.fulfill('pid-1', {
      text: 'ok',
      messages: [],
      toolCalls: [],
    });
    expect(received).toMatchObject({ queued: false, text: 'ok' });
  });

  it('invokes .catch() with the rejected error', async () => {
    const handle = new QueuedPromptHandle('pid-2');
    let err: unknown;
    handle.catch((e) => {
      err = e;
    });
    await registry.reject('pid-2', new Error('boom'));
    expect((err as Error).message).toBe('boom');
  });

  it('supports fulfill-then-register race (result available before then())', async () => {
    await registry.fulfill('pid-3', { text: 'buffered', messages: [], toolCalls: [] });
    const handle = new QueuedPromptHandle('pid-3');
    let received: { text?: string } | undefined;
    handle.then((r) => {
      received = r;
    });
    // Let the microtask drain
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received?.text).toBe('buffered');
  });

  it('supports reject-then-register race', async () => {
    await registry.reject('pid-4', new Error('early'));
    const handle = new QueuedPromptHandle('pid-4');
    let err: Error | undefined;
    handle.catch((e) => {
      err = e;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(err?.message).toBe('early');
  });

  it('getCallbackRegistry returns the injected instance', () => {
    expect(getCallbackRegistry()).toBe(registry);
  });
});
