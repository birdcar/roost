import type { AgentConfig, AgentMessage, AgentPromptOptions } from '../types.js';
import type { AgentResponse } from '../responses/agent-response.js';
import type { AIProvider } from '../providers/interface.js';
import type { FakeResolver } from '../testing/fakes.js';
import { AgentFake } from '../testing/fakes.js';
import {
  assertPrompted as assertPromptedImpl,
  assertNotPrompted as assertNotPromptedImpl,
  assertNeverPrompted as assertNeverPromptedImpl,
} from '../testing/assertions.js';
import { AgentPrompt } from '../prompt.js';
import { runPipeline, type AgentMiddleware } from '../middleware.js';
import { dispatchEvent, PromptingAgent, AgentPrompted } from '../events.js';
import { hasMiddleware, isConversational } from '../contracts.js';
import { runAgentCore } from '../agent-core.js';
import { getStatefulConfig } from '../decorators.js';
import { getScheduledMethods } from './scheduled-registry.js';
import { Sessions, type SessionsStateLike } from './sessions.js';
import {
  Scheduler,
  MissingScheduledMethodError,
  dispatchScheduledMethodMissing,
  type ScheduleWhen,
} from './schedule.js';
import { NoProviderRegisteredError } from '../agent.js';
import { runInAgentContext } from './context.js';

/**
 * Minimal subset of `DurableObjectState` used by `StatefulAgent`. Real CF
 * runtime and the test harness `MockDurableObjectState` both satisfy it.
 */
export interface StatefulAgentCtx extends SessionsStateLike {
  readonly storage: SessionsStateLike['storage'] & {
    list<T = unknown>(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, T>>;
    deleteAll?(): Promise<void>;
  };
  readonly id: { toString(): string };
  setAlarm(when: number | Date): Promise<void>;
  getAlarm(): Promise<number | null>;
  deleteAlarm(): Promise<void>;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
  waitUntil(promise: Promise<unknown>): void;
}

const fakes = new WeakMap<Function, AgentFake>();
const providers = new WeakMap<Function, AIProvider>();

/**
 * `StatefulAgent` — base class for agents that run on a Durable Object and
 * persist conversation state. Follows the Roost DO convention established by
 * `ChannelDO` in `@roostjs/broadcast`: implement the `DurableObject`
 * interface directly, keep a thin `fetch()` router, and expose durable
 * behaviour via typed members.
 *
 * Subclasses extend `StatefulAgent<Env>` and implement `instructions()`.
 * Apply `RemembersConversations(StatefulAgent)` for auto-persisting chat
 * history via the `Sessions` store.
 */
export abstract class StatefulAgent<Env = unknown> {
  /** @internal — public for the `readonly` connection module. */
  readonly _ctx: StatefulAgentCtx;
  readonly env: Env;

  private _sessions?: Sessions;
  private _scheduler?: Scheduler;

  constructor(ctx: StatefulAgentCtx, env: Env) {
    this._ctx = ctx;
    this.env = env;
    this.registerCronSchedules();
  }

  abstract instructions(): string;

  /* ------------------------------ Sessions ------------------------------ */

  get sessions(): Sessions {
    if (!this._sessions) this._sessions = new Sessions(this._ctx);
    return this._sessions;
  }

  /* ------------------------------ Scheduler ----------------------------- */

  protected get scheduler(): Scheduler {
    if (!this._scheduler) this._scheduler = new Scheduler(this._ctx);
    return this._scheduler;
  }

  /** Schedule `method` to fire at the given time. Matches the spec's shape. */
  async schedule<K extends keyof this>(
    when: ScheduleWhen,
    method: K,
    payload?: unknown,
  ): Promise<string> {
    const methodName = String(method);
    if (typeof (this as Record<string, unknown>)[methodName] !== 'function') {
      throw new MissingScheduledMethodError(methodName);
    }
    return this.scheduler.schedule(when, methodName, payload);
  }

  async cancelSchedule(scheduleId: string): Promise<boolean> {
    return this.scheduler.cancel(scheduleId);
  }

  async getSchedule(id: string) {
    return this.scheduler.get(id);
  }

  async getSchedules() {
    return this.scheduler.list();
  }

  /* -------------------------- DO alarm plumbing ------------------------- */

  async alarm(): Promise<void> {
    await this.scheduler.runDue(
      async (record) => {
        const method = (this as Record<string, unknown>)[record.method];
        if (typeof method !== 'function') throw new MissingScheduledMethodError(record.method);
        await (method as (payload: unknown) => unknown).call(this, record.payload);
      },
      async (record) => {
        await dispatchScheduledMethodMissing(this.constructor.name, record);
      },
    );
  }

  /* ------------------------------ Prompting ----------------------------- */

  async prompt(input: string, options: AgentPromptOptions = {}): Promise<AgentResponse> {
    const ctor = this.constructor as typeof StatefulAgent & { name: string };
    const agentName = ctor.name;

    const fake = fakes.get(ctor);
    if (fake) {
      const prompt = new AgentPrompt(input, options, agentName);
      fake.recordPrompt(prompt);
      return fake.nextResponse(prompt);
    }

    const provider = resolveProviderForClass(ctor);
    if (!provider) throw new NoProviderRegisteredError(agentName);

    const config: AgentConfig = { ...options };
    const prompt = new AgentPrompt(input, options, agentName);
    await dispatchEvent(PromptingAgent, new PromptingAgent(agentName, prompt));

    const middleware: AgentMiddleware[] = hasMiddleware(this) ? this.middleware() : [];

    return runInAgentContext({ agent: this }, async () => {
      const response = await runPipeline(middleware, prompt, async (p) => {
        const messages = await this.resolveMessages();
        return runAgentCore({
          agent: this,
          agentName,
          prompt: p,
          config,
          provider,
          priorMessages: messages,
        });
      });
      await dispatchEvent(AgentPrompted, new AgentPrompted(agentName, prompt, response));
      return response;
    });
  }

  /* ---------------------------- DO entrypoints ---------------------------- */

  async fetch(request: Request): Promise<Response> {
    return runInAgentContext({ agent: this, request }, async () => this.onRequest(request));
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/prompt') {
      const body = (await request.json()) as { input: string; options?: AgentPromptOptions };
      const response = await this.prompt(body.input, body.options);
      return Response.json(response);
    }
    return new Response('Not Found', { status: 404 });
  }

  /** WebSocket lifecycle stubs — fleshed out in Phase 3 (Streaming + Realtime). */
  async onConnect(_connection: unknown): Promise<void> {
    // Overridden by subclasses in Phase 3.
  }

  async onMessage(_connection: unknown, _message: unknown): Promise<void> {
    // Overridden by subclasses in Phase 3.
  }

  /* ----------------------------- Internals ----------------------------- */

  private async resolveMessages(): Promise<AgentMessage[]> {
    if (isConversational(this)) {
      const iter = await this.messages();
      return Array.from(iter);
    }
    return [];
  }

  private registerCronSchedules(): void {
    const ctor = this.constructor;
    const scheduled = getScheduledMethods(ctor);
    if (scheduled.size === 0) return;
    const enqueue = async () => {
      for (const [method, cron] of scheduled) {
        if (typeof (this as Record<string, unknown>)[method] !== 'function') continue;
        await this.scheduler.schedule(cron, method, undefined);
      }
    };
    this._ctx.waitUntil(enqueue());
  }

  /* ------------------------------ Provider wiring ------------------------------ */

  static setProvider<T extends typeof StatefulAgent>(this: T, provider: AIProvider): void {
    providers.set(this, provider);
  }

  static clearProvider<T extends typeof StatefulAgent>(this: T): void {
    providers.delete(this);
  }

  /** Decorator-registered `@Stateful({binding})` metadata, if any. */
  static getStatefulConfig(): { binding?: string } | undefined {
    return getStatefulConfig(this);
  }

  /* ------------------------------ Testing API ------------------------------ */

  static fake<T extends typeof StatefulAgent>(this: T, responses?: FakeResolver): AgentFake {
    const fake = new AgentFake(responses);
    fakes.set(this, fake);
    return fake;
  }

  static restore<T extends typeof StatefulAgent>(this: T): void {
    fakes.delete(this);
  }

  static assertPrompted<T extends typeof StatefulAgent>(
    this: T,
    matcher?: string | ((prompt: AgentPrompt) => boolean),
  ): void {
    const fake = requireFake(this);
    assertPromptedImpl(fake, this.name, matcher);
  }

  static assertNotPrompted<T extends typeof StatefulAgent>(
    this: T,
    matcher?: string | ((prompt: AgentPrompt) => boolean),
  ): void {
    const fake = requireFake(this);
    assertNotPromptedImpl(fake, this.name, matcher);
  }

  static assertNeverPrompted<T extends typeof StatefulAgent>(this: T): void {
    const fake = requireFake(this);
    assertNeverPromptedImpl(fake, this.name);
  }
}

function resolveProviderForClass(ctor: Function): AIProvider | undefined {
  let current: Function | null = ctor;
  while (current) {
    const p = providers.get(current);
    if (p) return p;
    current = Object.getPrototypeOf(current);
    if (!current || current === Function.prototype) break;
  }
  return undefined;
}

function requireFake(ctor: Function): AgentFake {
  const fake = fakes.get(ctor);
  if (!fake) throw new Error(`${(ctor as { name: string }).name}.fake() was not called`);
  return fake;
}