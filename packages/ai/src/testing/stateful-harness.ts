import type { SessionNode } from '../types.js';
import type { StatefulAgent, StatefulAgentCtx } from '../stateful/agent.js';
import { MockDurableObjectState } from './mock-do-state.js';

type StatefulCtor<A extends StatefulAgent> = new (ctx: StatefulAgentCtx, env: unknown) => A;

/**
 * Builder for constructing a `StatefulAgent` subclass with a mocked DO
 * runtime. Used by unit tests that want the full class behaviour without
 * booting miniflare.
 *
 * ```ts
 * const harness = TestStatefulAgentHarness
 *   .for(Support)
 *   .withMockClock(new Date('2026-04-17T12:00:00Z'))
 *   .withSessions([
 *     { id: 'n1', parentId: null, role: 'user', content: 'hi', createdAt: 0 },
 *   ]);
 * const agent = harness.build();
 * ```
 */
export class TestStatefulAgentHarness<A extends StatefulAgent> {
  private initialState: Record<string, unknown> = {};
  private seededSessions: Array<{ conversationId: string; node: SessionNode }> = [];
  private clockMs: number = Date.now();
  private env: Record<string, unknown> = {};

  private constructor(private readonly AgentClass: StatefulCtor<A>) {}

  static for<A extends StatefulAgent>(AgentClass: StatefulCtor<A>): TestStatefulAgentHarness<A> {
    return new TestStatefulAgentHarness<A>(AgentClass);
  }

  /** Seed arbitrary persisted state before the agent instance is built. */
  withState(entries: Record<string, unknown>): this {
    this.initialState = { ...this.initialState, ...entries };
    return this;
  }

  /** Seed session-shaped state for an existing conversation. */
  withSessions(conversationId: string, nodes: SessionNode[]): this {
    for (const node of nodes) this.seededSessions.push({ conversationId, node });
    return this;
  }

  /** Pin the mock clock to a specific moment. Advance via `advance()` on the harness output. */
  withMockClock(now: Date | number): this {
    this.clockMs = typeof now === 'number' ? now : now.getTime();
    return this;
  }

  /** Attach a partial `env` passed to the agent constructor. */
  withEnv(env: Record<string, unknown>): this {
    this.env = { ...this.env, ...env };
    return this;
  }

  build(): BuiltStatefulAgent<A> {
    const ctx = new MockDurableObjectState('test-agent');

    // Seed raw state first.
    for (const [key, value] of Object.entries(this.initialState)) {
      void ctx.storage.put(key, value);
    }

    // Seed session nodes via the storage layout Sessions expects so tests
    // that pre-load conversations read them via the same paths production does.
    for (const { conversationId, node } of this.seededSessions) {
      void ctx.storage.put(`conv:${conversationId}:node:${node.id}`, node);
      if (!this.initialState[`conv:${conversationId}`]) {
        void ctx.storage.put(`conv:${conversationId}`, {
          id: conversationId,
          createdAt: this.clockMs,
          rootNodeId: node.parentId === null ? node.id : null,
          tipNodeId: node.id,
          messageCount: this.seededSessions.filter((s) => s.conversationId === conversationId).length,
        });
      }
    }

    // Monkey-patch Date.now for the clock semantics without leaking globally —
    // callers use `harness.advance()` to move the clock forward.
    const clock = { now: this.clockMs };
    const originalNow = Date.now;
    const restoreClock = () => {
      Date.now = originalNow;
    };
    Date.now = () => clock.now;

    const agent = new this.AgentClass(ctx as unknown as StatefulAgentCtx, this.env);

    return {
      agent,
      state: ctx,
      advance(seconds: number): void {
        clock.now += seconds * 1000;
      },
      setNow(t: Date | number): void {
        clock.now = typeof t === 'number' ? t : t.getTime();
      },
      now(): number {
        return clock.now;
      },
      cleanup(): void {
        restoreClock();
      },
    };
  }
}

export interface BuiltStatefulAgent<A extends StatefulAgent> {
  readonly agent: A;
  readonly state: MockDurableObjectState;
  /** Advance the mocked clock by `seconds`. */
  advance(seconds: number): void;
  setNow(t: Date | number): void;
  now(): number;
  /** Restore `Date.now` to its original value. Call in `afterEach` / `afterAll`. */
  cleanup(): void;
}