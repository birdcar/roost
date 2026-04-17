import type { schema, SchemaBuilder } from '@roostjs/schema';
import type { Tool } from './tool.js';
import type {
  AgentConfig,
  AgentMessage,
  AgentPromptOptions,
  PromptResult,
  ProviderOptions,
  ToolCall,
  ToolResult,
} from './types.js';
import type { AgentResponse } from './responses/agent-response.js';
import type { AIProvider } from './providers/interface.js';
import type { Lab } from './enums.js';
import { getAgentConfig } from './decorators.js';
import { resolveModel } from './capability-table.js';
import { createToolRequest, toolToProviderTool, resolveToolName } from './tool.js';
import { AgentPrompt } from './prompt.js';
import { runPipeline, type AgentMiddleware } from './middleware.js';
import { AgentFake, type FakeResolver } from './testing/fakes.js';
import {
  assertPrompted as assertPromptedImpl,
  assertNotPrompted as assertNotPromptedImpl,
  assertNeverPrompted as assertNeverPromptedImpl,
  assertQueued as assertQueuedImpl,
  assertNotQueued as assertNotQueuedImpl,
  assertNeverQueued as assertNeverQueuedImpl,
} from './testing/assertions.js';
import { StructuredAgentResponse } from './responses/agent-response.js';
import {
  PromptingAgent,
  AgentPrompted,
  InvokingTool,
  ToolInvoked,
  MaxStepsExhausted,
  dispatchEvent,
} from './events.js';
import {
  hasTools,
  hasStructuredOutput,
  hasMiddleware,
  hasProviderOptions,
  isConversational,
} from './contracts.js';

export type { HasTools, HasStructuredOutput, Conversational, HasMiddleware, HasProviderOptions } from './contracts.js';

export interface AgentInterface {
  instructions(): string;
}

export class NoProviderRegisteredError extends Error {
  override readonly name = 'NoProviderRegisteredError';
  constructor(agentName: string) {
    super(
      `No AI provider set for ${agentName}. Call ${agentName}.setProvider(provider) or register AiServiceProvider in your application.`,
    );
  }
}

const fakes = new WeakMap<Function, AgentFake>();
const providers = new WeakMap<Function, AIProvider>();

type PromptMatcher = string | ((prompt: AgentPrompt) => boolean);

export abstract class Agent implements AgentInterface {
  private _messages: AgentMessage[] = [];

  abstract instructions(): string;

  static setProvider(provider: AIProvider): void {
    providers.set(this, provider);
  }

  static clearProvider(): void {
    providers.delete(this);
  }

  /** Resolve the effective provider for this agent class or its ancestors. */
  protected static resolveProvider<T extends typeof Agent>(this: T): AIProvider | undefined {
    let ctor: Function | null = this;
    while (ctor) {
      const p = providers.get(ctor);
      if (p) return p;
      ctor = Object.getPrototypeOf(ctor);
      if (!ctor || ctor === Function.prototype) break;
    }
    return undefined;
  }

  async prompt(input: string, options: AgentPromptOptions = {}): Promise<PromptResult> {
    const ctor = this.constructor as typeof Agent;
    const agentName = ctor.name;

    const fake = fakes.get(ctor);
    if (fake) {
      const prompt = new AgentPrompt(input, options, agentName);
      fake.recordPrompt(prompt);
      const response = await fake.nextResponse(prompt);
      return toPromptResult(response);
    }

    const config: AgentConfig = { ...getAgentConfig(ctor), ...options };
    const provider = ctor.resolveProvider();
    if (!provider) throw new NoProviderRegisteredError(agentName);

    const prompt = new AgentPrompt(input, options, agentName);
    await dispatchEvent(PromptingAgent, new PromptingAgent(agentName, prompt));

    const middleware: AgentMiddleware[] = hasMiddleware(this) ? this.middleware() : [];

    const response = await runPipeline(middleware, prompt, async (p) => {
      return this.execute(p, config, provider);
    });

    await dispatchEvent(AgentPrompted, new AgentPrompted(agentName, prompt, response));
    return toPromptResult(response);
  }

  private async execute(
    prompt: AgentPrompt,
    config: AgentConfig,
    provider: AIProvider,
  ): Promise<AgentResponse> {
    const ctor = this.constructor as typeof Agent;
    const agentName = ctor.name;
    const model = this.resolveModelName(config, provider);

    const priorMessages = await this.resolveMessages();
    const messages: AgentMessage[] = [
      { role: 'system', content: this.instructions() },
      ...priorMessages,
      { role: 'user', content: prompt.prompt },
    ];

    const tools: Tool[] = hasTools(this) ? this.tools() : [];
    const providerTools = tools.map(toolToProviderTool);
    const providerOptions = this.collectProviderOptions(provider, prompt.options);

    // Queued inference (legacy v0.2 path; v0.3 consumers should use .queue()).
    if (config.queued) {
      const response = await provider.chat({
        model,
        messages,
        tools: providerTools.length > 0 ? providerTools : undefined,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        queueRequest: true,
        providerOptions,
        attachments: prompt.options.attachments,
      });

      if (response.taskId) {
        return {
          text: '',
          messages,
          toolCalls: [],
          usage: response.usage,
          // Bridge: marker on response picked up by `toPromptResult`.
          ...({ __taskId: response.taskId } as Record<string, unknown>),
        } as AgentResponse;
      }
    }

    const maxSteps = config.maxSteps ?? 5;
    let currentMessages: AgentMessage[] = [...messages];
    let lastResponse = '';
    let lastUsage: AgentResponse['usage'];
    let step = 0;

    for (step = 0; step < maxSteps; step++) {
      const response = await provider.chat({
        model,
        messages: currentMessages,
        tools: providerTools.length > 0 ? providerTools : undefined,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        providerOptions,
        attachments: step === 0 ? prompt.options.attachments : undefined,
      });

      lastResponse = response.text;
      if (response.usage) lastUsage = response.usage;

      if (response.toolCalls.length === 0) break;

      currentMessages.push({ role: 'assistant', content: response.text });
      await this.runToolCalls(tools, response.toolCalls, currentMessages);
    }

    if (step >= maxSteps) {
      await dispatchEvent(MaxStepsExhausted, new MaxStepsExhausted(agentName, maxSteps));
    }

    // Non-conversational agents keep an in-memory rolling window for prompt() callers
    // that re-use the same instance. Conversational agents own their own history.
    if (!isConversational(this)) {
      this._messages.push(
        { role: 'user', content: prompt.prompt },
        { role: 'assistant', content: lastResponse },
      );
    }

    const base: AgentResponse = {
      text: lastResponse,
      messages: currentMessages,
      toolCalls: [],
      usage: lastUsage,
    };

    if (hasStructuredOutput(this)) {
      return this.wrapStructured(base);
    }
    return base;
  }

  private async runToolCalls(
    tools: Tool[],
    toolCalls: ToolCall[],
    messages: AgentMessage[],
  ): Promise<void> {
    for (const call of toolCalls) {
      const instance = tools.find((t) => resolveToolName(t) === call.name);
      if (!instance) continue;
      await dispatchEvent(InvokingTool, new InvokingTool(instance, call));
      const request = createToolRequest(call.arguments);
      const raw = await instance.handle(request);
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const result: ToolResult = { toolCallId: call.id, content };
      await dispatchEvent(ToolInvoked, new ToolInvoked(instance, call, result));
      messages.push({
        role: 'tool',
        content,
        toolCallId: call.id,
        toolName: call.name,
      });
    }
  }

  private async resolveMessages(): Promise<AgentMessage[]> {
    if (isConversational(this)) {
      const iter = await this.messages();
      return Array.from(iter);
    }
    return this._messages;
  }

  private collectProviderOptions(provider: AIProvider, options: AgentPromptOptions): ProviderOptions {
    const contractOptions = hasProviderOptions(this) ? this.providerOptions(provider.name) : {};
    return { ...contractOptions, ...(options.providerOptions ?? {}) };
  }

  private resolveModelName(config: AgentConfig, provider: AIProvider): string {
    if (config.model) return config.model;
    if (config.modelResolver) {
      const resolved = resolveModel(provider.name as Lab, config.modelResolver);
      if (resolved) return resolved;
    }
    const caps = provider.capabilities();
    return caps.smartestChat ?? caps.cheapestChat ?? '@cf/meta/llama-3.1-8b-instruct';
  }

  private wrapStructured(base: AgentResponse): AgentResponse {
    try {
      const data = JSON.parse(base.text || '{}') as Record<string, unknown>;
      return new StructuredAgentResponse(base, data);
    } catch {
      return base;
    }
  }

  async stream(_input: string, options?: AgentPromptOptions): Promise<ReadableStream<Uint8Array>> {
    if (options?.queued) {
      throw new Error(
        'Cannot stream a queued request — use `agent.prompt(input, { queued: true })` and poll for results, or call `.queue()` in v0.3+.',
      );
    }
    throw new Error(
      'Agent.stream() arrives in Phase 3 (Streaming). Call `.prompt()` for a synchronous response for now.',
    );
  }

  /* ----------------------------- Testing API ----------------------------- */

  static fake<T extends typeof Agent>(this: T, responses?: FakeResolver): AgentFake {
    const fake = new AgentFake(responses);
    fakes.set(this, fake);
    return fake;
  }

  static restore<T extends typeof Agent>(this: T): void {
    fakes.delete(this);
  }

  static preventStrayPrompts<T extends typeof Agent>(this: T): AgentFake {
    let fake = fakes.get(this);
    if (!fake) {
      fake = new AgentFake();
      fakes.set(this, fake);
    }
    return fake.preventStrayPrompts();
  }

  static assertPrompted<T extends typeof Agent>(
    this: T,
    matcher?: string | ((prompt: AgentPrompt) => boolean),
  ): void {
    const fake = requireFake(this, fakes);
    assertPromptedImpl(fake, this.name, normalizeMatcher(matcher));
  }

  static assertNotPrompted<T extends typeof Agent>(
    this: T,
    matcher?: string | ((prompt: AgentPrompt) => boolean),
  ): void {
    const fake = requireFake(this, fakes);
    assertNotPromptedImpl(fake, this.name, normalizeMatcher(matcher));
  }

  static assertNeverPrompted<T extends typeof Agent>(this: T): void {
    const fake = requireFake(this, fakes);
    assertNeverPromptedImpl(fake, this.name);
  }

  static assertQueued<T extends typeof Agent>(
    this: T,
    matcher?: string | ((prompt: AgentPrompt) => boolean),
  ): void {
    const fake = requireFake(this, fakes);
    assertQueuedImpl(fake, this.name, normalizeMatcher(matcher));
  }

  static assertNotQueued<T extends typeof Agent>(
    this: T,
    matcher?: string | ((prompt: AgentPrompt) => boolean),
  ): void {
    const fake = requireFake(this, fakes);
    assertNotQueuedImpl(fake, this.name, normalizeMatcher(matcher));
  }

  static assertNeverQueued<T extends typeof Agent>(this: T): void {
    const fake = requireFake(this, fakes);
    assertNeverQueuedImpl(fake, this.name);
  }
}

function requireFake(ctor: Function, map: WeakMap<Function, AgentFake>): AgentFake {
  const fake = map.get(ctor);
  if (!fake) throw new Error(`${(ctor as { name: string }).name}.fake() was not called`);
  return fake;
}

function normalizeMatcher(
  m: string | ((p: AgentPrompt) => boolean) | undefined,
): PromptMatcher | undefined {
  return m;
}

function toPromptResult(response: AgentResponse): PromptResult {
  const maybeTaskId = (response as unknown as { __taskId?: string }).__taskId;
  if (maybeTaskId) return { queued: true, taskId: maybeTaskId };
  return {
    queued: false,
    text: response.text,
    messages: response.messages,
    toolCalls: response.toolCalls,
    usage: response.usage,
    conversationId: response.conversationId,
  };
}

// Re-export the anonymous agent helper from its own module.
export { agent } from './anonymous.js';
