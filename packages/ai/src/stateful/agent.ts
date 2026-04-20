import type { AgentConfig, AgentMessage, AgentPromptOptions } from '../types.js';
import type { AgentResponse } from '../responses/agent-response.js';
import type { AIProvider } from '../providers/interface.js';
import type { FakeResolver } from '../testing/fakes.js';
import { AgentFake } from '../testing/fakes.js';
import type { AgentWorkflowClient } from '../workflows/workflow-client.js';
import { subAgent as spawnSubAgent, type SubAgentInit } from '../sub-agents/sub-agent.js';
import type { SubAgentHandle } from '../sub-agents/typed-rpc.js';
import {
  SUB_AGENT_DEPTH_HEADER,
  SUB_AGENT_MAX_DEPTH,
  SubAgentDepthExceededError,
  SubAgentRpcError,
  type SubAgentRpcEnvelope,
} from '../sub-agents/typed-rpc.js';
import { McpClient } from '../mcp/client.js';
import type { McpConnectOptions } from '../mcp/types.js';
import { Memory, type MemoryDeps } from '../memory/tiers.js';
import {
  requireApproval as requireApprovalImpl,
  type ApprovalRequest,
  type RequireApprovalOpts,
} from '../hitl/approval.js';
import { runCodeMode as runCodeModeImpl, type CodeModeOpts, type CodeModeResult } from '../code-mode/code-mode.js';
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
import { StreamableAgentResponse } from '../streaming/streamable-response.js';
import { buildAgentStream, StreamingUnsupportedError } from '../streaming/agent-stream.js';
import { AgentStreamed } from '../events.js';

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

const RESERVED_RPC_METHODS = new Set([
  'constructor',
  'fetch',
  'onRequest',
  'onConnect',
  'onMessage',
  'alarm',
  'webSocketMessage',
  'webSocketClose',
  'webSocketError',
  'handleControlPlaneRoute',
]);

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

  /** Workflow clients keyed by binding name. Populated via `registerWorkflowClient()`. */
  readonly workflows = new Map<string, AgentWorkflowClient<unknown>>();

  /** @internal — set by sub-agent dispatch so nested spawns know their depth. */
  _subAgentDepth = 0;

  private _sessions?: Sessions;
  private _scheduler?: Scheduler;
  private _abortController?: AbortController;
  private _memory?: Memory;

  constructor(ctx: StatefulAgentCtx, env: Env) {
    this._ctx = ctx;
    this.env = env;
    this.registerCronSchedules();
  }

  /* ------------------------------- Phase 8: Advanced primitive accessors ------------------------------- */

  /** Aggregated memory tiers (context, short-form, knowledge, skills). */
  get memory(): Memory {
    if (!this._memory) this._memory = new Memory(this, this.memoryDeps());
    return this._memory;
  }

  /**
   * Override in subclasses to seed context data or wire a knowledge backend.
   * Default returns empty deps.
   */
  protected memoryDeps(): MemoryDeps {
    return {};
  }

  /**
   * Request human approval for `step`. Persists the request in DO storage and
   * suspends until `approve()` lands or the timeout elapses.
   */
  requireApproval(
    step: string,
    payload: Record<string, unknown> = {},
    opts: RequireApprovalOpts = {},
  ): Promise<ApprovalRequest> {
    return requireApprovalImpl(this, step, payload, opts);
  }

  /**
   * Execute `intent` as generated code inside a sandbox. Bindings and
   * configuration follow `CodeModeOpts`.
   */
  codeMode(intent: string, opts: CodeModeOpts = {}): Promise<CodeModeResult> {
    return runCodeModeImpl(this, intent, opts);
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

  /* ------------------------------- Streaming ------------------------------- */

  stream(input: string, options: AgentPromptOptions = {}): StreamableAgentResponse {
    const ctor = this.constructor as typeof StatefulAgent & { name: string };
    const agentName = ctor.name;
    const provider = resolveProviderForClass(ctor);
    if (!provider) throw new NoProviderRegisteredError(agentName);
    if (typeof provider.stream !== 'function') throw new StreamingUnsupportedError(provider.name);

    const prompt = new AgentPrompt(input, options, agentName);
    const config: AgentConfig = { ...options };

    const source = buildAgentStream({
      agent: this,
      agentName,
      prompt,
      config,
      provider,
    });

    return new StreamableAgentResponse(source, agentName, []).then(async (collected) => {
      await dispatchEvent(AgentStreamed, new AgentStreamed(agentName, prompt, collected));
    });
  }

  /* ---------------------------- DO entrypoints ---------------------------- */

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/_/')) {
      return runInAgentContext({ agent: this, request }, async () =>
        this.handleControlPlaneRoute(url.pathname, request),
      );
    }
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

  /**
   * Handle control-plane routes consumed by sub-agent RPC. Runs from `fetch()`
   * before any subclass `onRequest()` override so callers cannot shadow these
   * endpoints.
   */
  private async handleControlPlaneRoute(pathname: string, request: Request): Promise<Response> {
    const depthHeader = request.headers.get(SUB_AGENT_DEPTH_HEADER);
    const depth = depthHeader === null ? 0 : Number(depthHeader);
    if (!Number.isFinite(depth) || depth < 0) {
      return new Response(`Invalid ${SUB_AGENT_DEPTH_HEADER} header`, { status: 400 });
    }
    if (depth > SUB_AGENT_MAX_DEPTH) {
      return new Response(new SubAgentDepthExceededError(depth, SUB_AGENT_MAX_DEPTH).message, { status: 429 });
    }
    this._subAgentDepth = depth;

    if (pathname === '/_/abort') {
      this._abortController?.abort();
      return new Response(null, { status: 204 });
    }
    if (pathname === '/_/delete') {
      this._abortController?.abort();
      await this._ctx.storage.deleteAll?.();
      return new Response(null, { status: 204 });
    }
    if (pathname === '/_/rpc') {
      let envelope: SubAgentRpcEnvelope;
      try {
        envelope = (await request.json()) as SubAgentRpcEnvelope;
      } catch {
        return new Response('Invalid JSON body', { status: 400 });
      }
      if (envelope.v !== 1 || typeof envelope.method !== 'string') {
        return new Response('Unsupported RPC envelope', { status: 400 });
      }
      if (envelope.method.startsWith('_') || RESERVED_RPC_METHODS.has(envelope.method)) {
        return new Response(
          new SubAgentRpcError(404, `Method '${envelope.method}' is not callable`).message,
          { status: 404 },
        );
      }
      const fn = (this as unknown as Record<string, unknown>)[envelope.method];
      if (typeof fn !== 'function') {
        return new Response(`Method '${envelope.method}' not found`, { status: 404 });
      }
      const args = Array.isArray(envelope.args) ? envelope.args : [];
      const result = await (fn as (...p: unknown[]) => unknown).apply(this, args);
      return new Response(JSON.stringify(result ?? null), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  }

  /* --------------------------- Sub-agent helpers --------------------------- */

  /**
   * Spawn a typed sub-agent handle. Method calls on the handle proxy over
   * `fetch` to the child DO's control-plane RPC route.
   */
  subAgent<A extends StatefulAgent>(
    AgentClass: new (...args: unknown[]) => A,
    init?: SubAgentInit,
  ): SubAgentHandle<A> {
    return spawnSubAgent(this, AgentClass, init);
  }

  /**
   * Connect to a remote MCP server, discovering tools/resources/prompts for
   * injection into this agent's tool set.
   */
  mcpClient(opts: McpConnectOptions): Promise<McpClient> {
    return McpClient.connect(opts);
  }

  /**
   * Register a workflow client under `bindingName`. Wire this at provider-boot
   * time — see `AiServiceProvider.registerAgentWorkflow`.
   */
  registerWorkflowClient(bindingName: string, client: AgentWorkflowClient<unknown>): void {
    this.workflows.set(bindingName, client);
  }

  /** `AbortController` signalled when a sub-agent `/_/abort` lands. */
  get abortSignal(): AbortSignal {
    if (!this._abortController) this._abortController = new AbortController();
    return this._abortController.signal;
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