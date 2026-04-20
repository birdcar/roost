import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Dispatcher } from '@roostjs/queue';
import type { QueueSender } from '@roostjs/cloudflare';
import { Agent } from '../../src/agent.js';
import {
  AgentRegistry,
  AgentClassNotRegisteredError,
  PromptAgentJob,
  InMemoryCallbackRegistry,
  setCallbackRegistry,
  resetCallbackRegistry,
} from '../../src/queueing/index.js';

class SupportAgent extends Agent {
  instructions(): string {
    return 'You are helpful';
  }

  override async prompt(input: string) {
    return {
      queued: false as const,
      text: `echo: ${input}`,
      messages: [],
      toolCalls: [],
    };
  }
}

describe('AgentRegistry', () => {
  afterEach(() => AgentRegistry.reset());

  it('resolves a registered class by its name', () => {
    AgentRegistry.get().register(SupportAgent);
    const ctor = AgentRegistry.get().resolve('SupportAgent');
    expect(ctor).toBe(SupportAgent);
  });

  it('supports explicit alias registration', () => {
    AgentRegistry.get().register(SupportAgent, 'support');
    expect(AgentRegistry.get().resolve('support')).toBe(SupportAgent);
  });

  it('throws AgentClassNotRegisteredError for unknown names', () => {
    expect(() => AgentRegistry.get().resolve('UnknownAgent')).toThrow(AgentClassNotRegisteredError);
  });
});

describe('PromptAgentJob', () => {
  let registry: InMemoryCallbackRegistry;

  beforeEach(() => {
    registry = new InMemoryCallbackRegistry();
    setCallbackRegistry(registry);
    AgentRegistry.get().register(SupportAgent);
  });

  afterEach(() => {
    AgentRegistry.reset();
    resetCallbackRegistry();
    Dispatcher.reset();
  });

  it('handle() re-materializes the agent and fulfills the callback registry', async () => {
    const job = new PromptAgentJob({
      agentClass: 'SupportAgent',
      agentArgs: [],
      input: 'hi',
      options: {},
      promptId: 'pid-x',
    });

    let fulfilled: { text?: string } | undefined;
    registry.onFulfilled('pid-x', (r) => {
      fulfilled = r as { text?: string };
    });

    await job.handle();
    expect(fulfilled?.text).toBe('echo: hi');
  });

  it('handle() calls reject() and rethrows when the agent fails', async () => {
    class FailAgent extends Agent {
      instructions(): string {
        return '';
      }
      override async prompt(): Promise<never> {
        throw new Error('boom');
      }
    }
    AgentRegistry.get().register(FailAgent);

    const job = new PromptAgentJob({
      agentClass: 'FailAgent',
      agentArgs: [],
      input: 'x',
      options: {},
      promptId: 'pid-fail',
    });

    let caught: Error | undefined;
    registry.onRejected('pid-fail', (e) => {
      caught = e;
    });

    await expect(job.handle()).rejects.toThrow('boom');
    expect(caught?.message).toBe('boom');
  });

  it('is decorated with @Queue("ai-inference")', () => {
    expect((PromptAgentJob as unknown as { _jobConfig: { queue: string } })._jobConfig.queue).toBe('ai-inference');
  });
});

describe('PromptAgentJob.dispatch via Dispatcher', () => {
  afterEach(() => Dispatcher.reset());

  it('routes to the "ai-inference" queue sender', async () => {
    const received: Array<Record<string, unknown>> = [];
    const sender: QueueSender = {
      async send(message) {
        received.push(message as Record<string, unknown>);
      },
    } as unknown as QueueSender;
    Dispatcher.set(new Dispatcher(new Map([['ai-inference', sender]])));

    await PromptAgentJob.dispatch({
      agentClass: 'SupportAgent',
      agentArgs: [],
      input: 'hi',
      options: {},
      promptId: 'pid-d',
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.jobName).toBe('PromptAgentJob');
  });
});
