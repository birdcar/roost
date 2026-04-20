import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Dispatcher, JobConsumer, JobRegistry } from '@roostjs/queue';
import type { QueueSender } from '@roostjs/cloudflare';
import { Agent } from '../../src/agent.js';
import {
  AgentRegistry,
  PromptAgentJob,
  InMemoryCallbackRegistry,
  setCallbackRegistry,
  resetCallbackRegistry,
} from '../../src/queueing/index.js';

/**
 * Full end-to-end queue bridge integration. Instead of spinning up miniflare
 * (which adds a slow process boundary), we exercise the same code path by:
 *   1. Registering an in-memory QueueSender that captures JobMessages.
 *   2. Running `agent.queue(input)` — dispatches a PromptAgentJob.
 *   3. Feeding the captured JobMessage through `JobConsumer.processMessage`.
 *   4. Verifying the `.then()` callback fires with the re-materialized agent's result.
 *
 * This validates the full serialize → enqueue → consume → re-materialize →
 * fulfill chain that runs across worker boundaries in production.
 */

class ReportAgent extends Agent {
  instructions(): string {
    return 'You write reports.';
  }

  override async prompt(input: string) {
    return {
      queued: false as const,
      text: `report for: ${input}`,
      messages: [],
      toolCalls: [],
    };
  }
}

describe('queueing integration: dispatch → consume → fulfill', () => {
  let registry: InMemoryCallbackRegistry;
  let captured: Array<{ body: unknown }>;

  beforeEach(() => {
    registry = new InMemoryCallbackRegistry();
    setCallbackRegistry(registry);
    AgentRegistry.get().register(ReportAgent);
    captured = [];

    const sender: QueueSender = {
      async send(message: unknown) {
        captured.push({ body: message });
      },
    } as unknown as QueueSender;
    Dispatcher.set(new Dispatcher(new Map([['ai-inference', sender]])));
  });

  afterEach(() => {
    AgentRegistry.reset();
    resetCallbackRegistry();
    Dispatcher.reset();
    ReportAgent.restore();
  });

  it('dispatches PromptAgentJob to the ai-inference queue and returns a handle', async () => {
    const agent = new ReportAgent();
    const handle = agent.queue('Q3 revenue');
    await new Promise((resolve) => setTimeout(resolve, 10)); // flush background dispatch

    expect(handle.promptId).toMatch(/^ai_prompt_/);
    expect(captured).toHaveLength(1);
    const body = captured[0]!.body as { jobName: string; payload: { agentClass: string; input: string } };
    expect(body.jobName).toBe('PromptAgentJob');
    expect(body.payload.agentClass).toBe('ReportAgent');
    expect(body.payload.input).toBe('Q3 revenue');
  });

  it('consumer re-materializes the agent and fires the .then() callback', async () => {
    const agent = new ReportAgent();
    const handle = agent.queue('monthly health');
    await new Promise((resolve) => setTimeout(resolve, 10));

    let fulfilled: { text?: string } | undefined;
    handle.then((result) => {
      fulfilled = result as { text?: string };
    });

    // Wire a JobConsumer and replay the captured message through it.
    const jobRegistry = new JobRegistry();
    jobRegistry.register(PromptAgentJob);
    const consumer = new JobConsumer(jobRegistry);

    let acked = false;
    await consumer.processMessage({
      body: captured[0]!.body as never,
      ack: () => {
        acked = true;
      },
      retry: () => {
        throw new Error('should not retry');
      },
    });

    expect(acked).toBe(true);
    expect(fulfilled?.text).toBe('report for: monthly health');
  });

  it('consumer surfaces agent failure via the .catch() callback and retries', async () => {
    class FlakyAgent extends Agent {
      instructions(): string {
        return '';
      }
      override async prompt(): Promise<never> {
        throw new Error('transient');
      }
    }
    AgentRegistry.get().register(FlakyAgent);

    const agent = new FlakyAgent();
    const handle = agent.queue('x');
    await new Promise((resolve) => setTimeout(resolve, 10));

    let caught: Error | undefined;
    handle.catch((err) => {
      caught = err;
    });

    const jobRegistry = new JobRegistry();
    jobRegistry.register(PromptAgentJob);
    const consumer = new JobConsumer(jobRegistry);

    let retried = false;
    await consumer.processMessage({
      body: captured[0]!.body as never,
      ack: () => {},
      retry: () => {
        retried = true;
      },
    });

    expect(retried).toBe(true);
    expect(caught?.message).toBe('transient');
  });
});
