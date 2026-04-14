# Implementation Spec: Roost Framework - Phase 5

**Contract**: ./contract.md
**PRD**: ./prd-phase-5.md
**Estimated Effort**: XL

## Technical Approach

Phase 5 delivers two packages: `@roostjs/ai` and `@roostjs/mcp`. They share a single `@roostjs/schema` utility package (a fluent JSON Schema builder) and are modeled directly after Laravel 13's AI SDK and MCP server implementations, adapted for TypeScript strict mode and Cloudflare Workers.

The central design decisions:

**@roostjs/ai** wraps Cloudflare AI (and eventually any AI provider) behind a class-based `Agent` abstraction. Agents are decorated classes — `@Provider`, `@Model`, `@MaxSteps`, etc. configure behavior at the class level without polluting instance code. The `Promptable` mixin provides `prompt()`, `stream()`, and `queue()` methods. Internally, agent execution delegates to a `Runner` that manages the step loop, tool call resolution, and response streaming. The `Runner` is the internal engine — never exposed to users.

**@roostjs/mcp** builds an MCP (Model Context Protocol) server as a class. `Server` subclasses declare their `tools`, `resources`, and `prompts` arrays. The `Mcp.web('/mcp/server', MyServer)` helper wires the server to a Roost route, handling SSE transport and protocol handshaking. MCP tools mirror the `@roostjs/ai` Tool interface but return MCP `Response` factory objects instead of arbitrary values.

**@roostjs/schema** (shared) is a tiny fluent builder that produces valid JSON Schema 2020-12 objects. Both `@roostjs/ai` tools and `@roostjs/mcp` tools declare their schemas using the same builder, so there is one place to learn the API.

This is explicitly NOT a Vercel AI SDK wrapper. The agent class pattern compiles down to Cloudflare AI `binding.run()` calls (for simple prompts) and a custom step loop (for multi-step tool calls). Future providers implement the `Provider` interface and slot in without changing agent class code.

## Feedback Strategy

**Inner-loop command**: `bun test --filter packages/ai && bun test --filter packages/mcp`

**Playground**: `bun:test` suites in `packages/ai/__tests__/` and `packages/mcp/__tests__/`. Both use `Agent.fake()` and `Server.tool(ToolClass, args)` to test without hitting real AI. The fake intercepts at the `Runner` level — no HTTP calls leave the test process.

**Why this approach**: AI integration tests that hit real providers are slow (2-10 seconds per call) and consume API quota. Testing everything through fakes means the full suite runs in < 3 seconds. The acceptance criteria that require a real Cloudflare AI call are validated manually via `wrangler dev`, not in the CI suite.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/schema/package.json` | @roostjs/schema package manifest |
| `packages/schema/tsconfig.json` | Extends base TS config |
| `packages/schema/src/index.ts` | Public API barrel export |
| `packages/schema/src/builder.ts` | Fluent JsonSchema builder |
| `packages/schema/src/types.ts` | JsonSchema type definitions |
| `packages/schema/__tests__/builder.test.ts` | Schema builder output validation |
| `packages/ai/package.json` | @roostjs/ai package manifest |
| `packages/ai/tsconfig.json` | Extends base TS config |
| `packages/ai/src/index.ts` | Public API barrel export |
| `packages/ai/src/agent.ts` | Agent base class + Promptable mixin |
| `packages/ai/src/decorators.ts` | @Provider, @Model, @MaxSteps, @MaxTokens, @Temperature, @Timeout |
| `packages/ai/src/tool.ts` | Tool interface and base class |
| `packages/ai/src/runner.ts` | Internal step-loop execution engine |
| `packages/ai/src/streaming.ts` | SSE stream builder |
| `packages/ai/src/memory.ts` | RemembersConversations mixin |
| `packages/ai/src/middleware.ts` | Agent middleware pipeline |
| `packages/ai/src/providers/cloudflare.ts` | Cloudflare AI provider adapter |
| `packages/ai/src/providers/interface.ts` | Provider interface |
| `packages/ai/src/structured.ts` | HasStructuredOutput interface |
| `packages/ai/src/anonymous.ts` | agent() function for one-offs |
| `packages/ai/src/fake.ts` | AgentFake for testing |
| `packages/ai/src/errors.ts` | AI-specific error types |
| `packages/ai/src/types.ts` | Shared type definitions |
| `packages/ai/src/provider.ts` | AiServiceProvider |
| `packages/ai/__tests__/agent.test.ts` | Agent class tests |
| `packages/ai/__tests__/tool.test.ts` | Tool schema and handle tests |
| `packages/ai/__tests__/memory.test.ts` | Conversation memory tests |
| `packages/ai/__tests__/middleware.test.ts` | Agent middleware tests |
| `packages/ai/__tests__/streaming.test.ts` | SSE stream output tests |
| `packages/ai/__tests__/fake.test.ts` | Agent.fake() and assertion tests |
| `packages/mcp/package.json` | @roostjs/mcp package manifest |
| `packages/mcp/tsconfig.json` | Extends base TS config |
| `packages/mcp/src/index.ts` | Public API barrel export |
| `packages/mcp/src/server.ts` | MCP Server base class |
| `packages/mcp/src/decorators.ts` | @Name, @Version, @Instructions, @Uri, @MimeType, @IsReadOnly, etc. |
| `packages/mcp/src/tool.ts` | MCP Tool base class |
| `packages/mcp/src/resource.ts` | MCP Resource base class |
| `packages/mcp/src/prompt.ts` | MCP Prompt base class |
| `packages/mcp/src/response.ts` | Response factory class |
| `packages/mcp/src/transport.ts` | HTTP + SSE transport handler |
| `packages/mcp/src/router.ts` | Mcp.web() helper for route mounting |
| `packages/mcp/src/request.ts` | MCP request abstraction |
| `packages/mcp/src/errors.ts` | MCP-specific error types |
| `packages/mcp/src/types.ts` | MCP protocol types |
| `packages/mcp/src/provider.ts` | McpServiceProvider |
| `packages/mcp/__tests__/server.test.ts` | Server registration and dispatch tests |
| `packages/mcp/__tests__/tool.test.ts` | Tool schema, handle, and response tests |
| `packages/mcp/__tests__/resource.test.ts` | Resource URI and content tests |
| `packages/mcp/__tests__/prompt.test.ts` | Prompt argument and message tests |
| `packages/mcp/__tests__/response.test.ts` | Response factory output tests |

### Modified Files

| File Path | Change |
|---|---|
| `packages/cloudflare/src/bindings/ai.ts` | Expose `runStream()` async iterable for streaming |
| `packages/cloudflare/src/index.ts` | Export `AIClient` stream types |

## Implementation Details

---

### 1. Package Setup: @roostjs/schema

**Overview**: A zero-dependency, 200-line utility that builds JSON Schema 2020-12 objects via a fluent API. Used by `@roostjs/ai` tool schemas, `@roostjs/ai` structured output schemas, and `@roostjs/mcp` tool schemas. Living in its own package prevents a circular dependency between `@roostjs/ai` and `@roostjs/mcp`.

```typescript
// packages/schema/src/builder.ts

export type JsonSchemaType =
  | StringSchema
  | IntegerSchema
  | NumberSchema
  | BooleanSchema
  | ObjectSchema
  | ArraySchema
  | EnumSchema;

export type JsonSchemaOutput = {
  type: string;
  description?: string;
  default?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchemaOutput>;
  items?: JsonSchemaOutput;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

class SchemaBuilder<TOutput extends JsonSchemaOutput = JsonSchemaOutput> {
  protected schema: TOutput;

  constructor(schema: TOutput) {
    this.schema = { ...schema };
  }

  description(text: string): this {
    const clone = this.clone();
    clone.schema.description = text;
    return clone;
  }

  default(value: unknown): this {
    const clone = this.clone();
    clone.schema.default = value;
    return clone;
  }

  /** Output the compiled JSON Schema object */
  build(): TOutput {
    return { ...this.schema };
  }

  protected clone(): this {
    const instance = Object.create(this.constructor.prototype) as this;
    instance.schema = { ...this.schema };
    return instance;
  }
}

class StringSchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'string' }> {
  constructor() { super({ type: 'string' }); }
  minLength(n: number): this { const c = this.clone(); c.schema.minLength = n; return c; }
  maxLength(n: number): this { const c = this.clone(); c.schema.maxLength = n; return c; }
}

class IntegerSchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'integer' }> {
  constructor() { super({ type: 'integer' }); }
  min(n: number): this { const c = this.clone(); c.schema.minimum = n; return c; }
  max(n: number): this { const c = this.clone(); c.schema.maximum = n; return c; }
}

class ObjectSchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'object' }> {
  constructor() { super({ type: 'object', properties: {}, required: [] }); }

  property(name: string, schema: SchemaBuilder, required = false): this {
    const c = this.clone();
    c.schema.properties = { ...c.schema.properties, [name]: schema.build() };
    if (required) c.schema.required = [...(c.schema.required ?? []), name];
    return c;
  }
}

class ArraySchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'array' }> {
  constructor() { super({ type: 'array' }); }
  items(schema: SchemaBuilder): this { const c = this.clone(); c.schema.items = schema.build(); return c; }
  minItems(n: number): this { const c = this.clone(); c.schema.minItems = n; return c; }
  maxItems(n: number): this { const c = this.clone(); c.schema.maxItems = n; return c; }
}

// Top-level entry points
export const schema = {
  string: () => new StringSchemaBuilder(),
  integer: () => new IntegerSchemaBuilder(),
  number: () => new SchemaBuilder<JsonSchemaOutput & { type: 'number' }>({ type: 'number' }),
  boolean: () => new SchemaBuilder<JsonSchemaOutput & { type: 'boolean' }>({ type: 'boolean' }),
  object: () => new ObjectSchemaBuilder(),
  array: () => new ArraySchemaBuilder(),
  enum: (values: unknown[]) => new SchemaBuilder({ type: 'string', enum: values }),
};
```

**Key decisions**:
- Every method returns a clone (`this.clone()`), never mutates. This makes builders safe to share and reuse.
- `build()` is the only way to extract the plain object. Tools and the agent runner always call `build()` before passing to the AI provider or MCP protocol layer.
- No TypeScript branded types for schema — the output is just `JsonSchemaOutput`. Tools validate the runtime shape of incoming requests themselves.
- `required` in `ObjectSchemaBuilder.property()` is a boolean per-property, not a separate `.required()` method. This keeps the call site readable.

**Implementation steps**:
1. Implement all builder classes and the `schema` export object
2. Verify `schema.object().property('email', schema.string(), true).build()` produces `{ type: 'object', properties: { email: { type: 'string' } }, required: ['email'] }`
3. Write tests: each type, modifiers, nested object/array, enum, required tracking
4. Verify the output is valid JSON Schema by running against a JSON Schema validator in tests

**Feedback loop**:
- **Check command**: `bun test --filter packages/schema`

---

### 2. Agent Decorators

**Overview**: Decorators are the declarative configuration layer for agent classes. They use TC39 Stage 3 class decorators (TypeScript 5.x, `experimentalDecorators: false`). Each decorator writes metadata to a `WeakMap` keyed by the class constructor. The `Runner` reads this metadata when executing.

```typescript
// packages/ai/src/decorators.ts

import type { AgentMetadata } from './types.ts';

const agentMetadata = new WeakMap<Function, Partial<AgentMetadata>>();

function setMeta(target: Function, patch: Partial<AgentMetadata>): void {
  const existing = agentMetadata.get(target) ?? {};
  agentMetadata.set(target, { ...existing, ...patch });
}

export function getAgentMetadata(target: Function): Partial<AgentMetadata> {
  return agentMetadata.get(target) ?? {};
}

// TC39 Stage 3 class decorator syntax
export function Provider(providerName: string) {
  return function (target: new (...args: unknown[]) => unknown, _ctx: ClassDecoratorContext): void {
    setMeta(target, { provider: providerName });
  };
}

export function Model(modelName: string) {
  return function (target: new (...args: unknown[]) => unknown, _ctx: ClassDecoratorContext): void {
    setMeta(target, { model: modelName });
  };
}

export function MaxSteps(n: number) {
  return function (target: new (...args: unknown[]) => unknown, _ctx: ClassDecoratorContext): void {
    setMeta(target, { maxSteps: n });
  };
}

export function MaxTokens(n: number) {
  return function (target: new (...args: unknown[]) => unknown, _ctx: ClassDecoratorContext): void {
    setMeta(target, { maxTokens: n });
  };
}

export function Temperature(t: number) {
  return function (target: new (...args: unknown[]) => unknown, _ctx: ClassDecoratorContext): void {
    setMeta(target, { temperature: t });
  };
}

export function Timeout(ms: number) {
  return function (target: new (...args: unknown[]) => unknown, _ctx: ClassDecoratorContext): void {
    setMeta(target, { timeoutMs: ms });
  };
}
```

```typescript
// packages/ai/src/types.ts

export type AgentMetadata = {
  provider: string;
  model: string;
  maxSteps: number;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
};

export type ConversationMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
};

export type AgentResponse<T = string> = {
  text: string;
  structured?: T;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  finishReason: 'stop' | 'tool_calls' | 'max_tokens' | 'timeout';
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
};

export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; toolCallId: string; output: unknown }
  | { type: 'done'; response: AgentResponse };
```

**Key decisions**:
- `WeakMap<Function, ...>` for metadata. No `Reflect.metadata` dependency — this would require `reflect-metadata` polyfill which conflicts with Workers' strict environment. The `WeakMap` approach is pure TypeScript, zero dependencies.
- Decorators are factory functions that return the actual decorator. This is the Stage 3 syntax: `@Provider('cloudflare')` is `Provider('cloudflare')(target, ctx)`.
- `getAgentMetadata()` is exported for the `Runner` to read. It's not on the class itself — it's a parallel registry.

**Implementation steps**:
1. Implement all decorators and `getAgentMetadata()`
2. Confirm TypeScript compiles with `experimentalDecorators: false` and `target: 'ES2022'`
3. Test: apply each decorator, call `getAgentMetadata(target)`, verify correct values set

---

### 3. Provider Interface and Cloudflare AI Provider

**Overview**: `Provider` interface defines the contract for executing a conversation and returning a response. The `CloudflareAIProvider` implements it using `@roostjs/cloudflare`'s `AIClient`. Future providers (OpenAI, Anthropic direct) implement the same interface.

```typescript
// packages/ai/src/providers/interface.ts

import type { ConversationMessage, AgentResponse, StreamEvent } from '../types.ts';
import type { JsonSchemaOutput } from '@roostjs/schema';

export interface AIProvider {
  /**
   * Execute a conversation and return a full response.
   * Called by the Runner on each step.
   */
  complete(options: CompletionOptions): Promise<CompletionResult>;

  /**
   * Execute a conversation and return a stream of events.
   * Called by the Runner when agent.stream() is used.
   */
  stream(options: CompletionOptions): AsyncIterable<StreamEvent>;
}

export type CompletionOptions = {
  model: string;
  messages: ConversationMessage[];
  tools?: ToolDefinition[];
  outputSchema?: JsonSchemaOutput;
  maxTokens?: number;
  temperature?: number;
};

export type CompletionResult = {
  message: ConversationMessage;
  toolCalls: import('../types.ts').ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  finishReason: AgentResponse['finishReason'];
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchemaOutput;
};
```

```typescript
// packages/ai/src/providers/cloudflare.ts

import type { AIClient } from '@roostjs/cloudflare';
import type { AIProvider, CompletionOptions, CompletionResult } from './interface.ts';
import type { StreamEvent } from '../types.ts';

export class CloudflareAIProvider implements AIProvider {
  constructor(private client: AIClient) {}

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const response = await this.client.run<{
      response?: string;
      tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    }>(options.model, {
      messages: options.messages,
      tools: options.tools?.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    });

    const toolCalls = (response.tool_calls ?? []).map((tc, i) => ({
      id: `tc_${i}`,
      name: tc.name,
      input: tc.arguments,
    }));

    return {
      message: {
        role: 'assistant',
        content: response.response ?? '',
      },
      toolCalls,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
      },
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamEvent> {
    const stream = await this.client.runStream(options.model, {
      messages: options.messages,
      stream: true,
    });

    for await (const chunk of stream) {
      yield { type: 'text_delta', delta: chunk };
    }

    yield { type: 'done', response: { text: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' } };
  }
}
```

**Key decisions**:
- The `Provider` interface takes a `model` string per-call. This allows the agent class's `@Model` decorator to pass the model name at call time — the provider itself is model-agnostic.
- Cloudflare AI's tool calling format uses `{ type: 'function', function: { ... } }`. The adapter normalizes this to/from the internal `ToolDefinition` format.
- `stream()` is an `AsyncIterable<StreamEvent>` — not a `ReadableStream`. The streaming module converts `AsyncIterable` to `ReadableStream` for SSE transport. Keeping the provider-level abstraction as `AsyncIterable` is simpler to test and compose.

---

### 4. Agent Base Class and Promptable Mixin

**Overview**: `Agent` is the abstract base class all user agents extend. `Promptable` is a mixin function (not a class) that adds `prompt()`, `stream()`, and `queue()` to a class. Mixins avoid multiple inheritance issues while still being composable.

```typescript
// packages/ai/src/agent.ts

import type { Tool } from './tool.ts';
import type { AgentMiddleware } from './middleware.ts';
import type { ConversationMessage, AgentResponse } from './types.ts';
import type { JsonSchemaOutput } from '@roostjs/schema';

export abstract class Agent {
  /**
   * Returns the system prompt for this agent.
   * Override to customize instructions based on constructor arguments.
   */
  abstract instructions(): string;

  /**
   * Override to declare tools this agent can use.
   * Tools are resolved via the service container when provided.
   */
  tools(): Tool[] {
    return [];
  }

  /**
   * Override to declare the structured output schema.
   * If defined, the runner requests structured output from the provider.
   */
  schema(): JsonSchemaOutput | null {
    return null;
  }

  /**
   * Override to declare agent middleware.
   * Middleware runs in order: first middleware wraps the entire pipeline.
   */
  middleware(): AgentMiddleware[] {
    return [];
  }
}

/**
 * Mixin that adds prompt(), stream(), and queue() to an Agent subclass.
 * Usage: class MyAgent extends Promptable(Agent) { ... }
 */
export function Promptable<TBase extends new (...args: unknown[]) => Agent>(Base: TBase) {
  return class extends Base {
    /**
     * Send a prompt and wait for a complete response.
     * Runs the agent's full step loop including tool calls.
     */
    async prompt(userMessage: string, options?: PromptOptions): Promise<AgentResponse> {
      const runner = getRunner(this, options);
      return runner.run(userMessage);
    }

    /**
     * Send a prompt and return an async iterable of stream events.
     * Can be passed directly to toSSE() for streaming HTTP responses.
     */
    stream(userMessage: string, options?: PromptOptions): AsyncIterable<StreamEvent> {
      const runner = getRunner(this, options);
      return runner.runStream(userMessage);
    }

    /**
     * Dispatch the prompt as a background job via Cloudflare Queues.
     * Returns a job ID for status tracking.
     */
    async queue(userMessage: string, options?: QueueOptions): Promise<string> {
      const runner = getRunner(this, options);
      return runner.enqueue(userMessage, options);
    }

    /**
     * Bind this agent to a specific user's conversation history.
     * Requires the agent to use RemembersConversations mixin.
     */
    forUser(user: { id: string | number }): this {
      (this as unknown as ConversationAgent).conversationUserId = String(user.id);
      return this;
    }

    /**
     * Continue an existing conversation by ID.
     * Requires the agent to use RemembersConversations mixin.
     */
    continue(conversationId: string): this {
      (this as unknown as ConversationAgent).conversationId = conversationId;
      return this;
    }
  };
}

type PromptOptions = {
  conversationId?: string;
  provider?: string[];
};

type QueueOptions = PromptOptions & {
  delay?: number;
};

type ConversationAgent = {
  conversationUserId?: string;
  conversationId?: string;
};
```

**Usage**:

```typescript
import { Agent, Promptable } from '@roostjs/ai';
import { Provider, Model, MaxSteps, Temperature } from '@roostjs/ai/decorators';

@Provider('cloudflare')
@Model('@cf/meta/llama-3.1-8b-instruct')
@MaxSteps(5)
@Temperature(0.7)
class SalesCoach extends Promptable(Agent) {
  constructor(private user: User) {
    super();
  }

  instructions(): string {
    return `You are a sales coach helping ${this.user.name} close deals. Be concise and direct.`;
  }

  tools(): Tool[] {
    return [
      app.resolve(SearchCrmTool),
      app.resolve(DraftEmailTool),
    ];
  }
}

// Usage
const coach = new SalesCoach(currentUser);
const response = await coach.prompt('Help me prepare for my call with Acme Corp');
const stream = coach.stream('What objections should I expect?');
```

**Key decisions**:
- `Promptable` is a mixin function, not a class. `class SalesCoach extends Promptable(Agent)` works because TypeScript supports generic class expression mixins. This avoids the diamond problem while keeping the DI-friendly constructor pattern.
- `forUser()` and `continue()` mutate and return `this` for fluent chaining: `new SalesCoach(user).forUser(user).continue(id).prompt(msg)`. They write to internal state that the `Runner` reads.
- `queue()` is a fire-and-forget pattern. It serializes the agent class name + constructor args (via the service container) + prompt into a Cloudflare Queue message. The queue consumer reconstructs and runs the agent.
- Tools are declared as instances, not classes. This is deliberate — it allows constructor injection into tools before passing to the agent.

**Implementation steps**:
1. Implement `Agent` abstract class with `instructions()`, `tools()`, `schema()`, `middleware()`
2. Implement `Promptable` mixin with `prompt()`, `stream()`, `queue()`, `forUser()`, `continue()`
3. Create the `getRunner()` helper that reads decorator metadata and constructs a `Runner`
4. Stub `Runner` class (full implementation next section)
5. Test: subclass `Agent`, override `instructions()`, call `prompt()` → verify `Runner.run()` called with correct args

---

### 5. Runner (Internal Step Loop)

**Overview**: `Runner` is the internal engine. It manages the multi-step tool call loop, applies agent middleware, and returns the final `AgentResponse`. It is never exported from `@roostjs/ai` — it's an implementation detail.

```typescript
// packages/ai/src/runner.ts

import type { Agent } from './agent.ts';
import type { AIProvider, CompletionOptions } from './providers/interface.ts';
import type { ConversationMessage, AgentResponse, StreamEvent, ToolCall } from './types.ts';
import { getAgentMetadata } from './decorators.ts';

export class Runner {
  constructor(
    private agent: Agent,
    private provider: AIProvider,
  ) {}

  async run(userMessage: string, priorMessages: ConversationMessage[] = []): Promise<AgentResponse> {
    const meta = getAgentMetadata(this.agent.constructor);
    const maxSteps = meta.maxSteps ?? 10;

    const messages: ConversationMessage[] = [
      { role: 'system', content: this.agent.instructions() },
      ...priorMessages,
      { role: 'user', content: userMessage },
    ];

    const toolDefs = this.agent.tools().map(tool => ({
      name: tool.name(),
      description: tool.description(),
      inputSchema: tool.schema().build(),
    }));

    let steps = 0;
    const allToolCalls: ToolCall[] = [];
    let usage = { promptTokens: 0, completionTokens: 0 };

    while (steps < maxSteps) {
      const completionOpts: CompletionOptions = {
        model: meta.model ?? '@cf/meta/llama-3.1-8b-instruct',
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        outputSchema: this.agent.schema() ?? undefined,
        maxTokens: meta.maxTokens,
        temperature: meta.temperature,
      };

      const result = await this.applyMiddleware(completionOpts);

      usage.promptTokens += result.usage.promptTokens;
      usage.completionTokens += result.usage.completionTokens;
      messages.push(result.message);

      if (result.finishReason !== 'tool_calls' || result.toolCalls.length === 0) {
        return {
          text: result.message.content,
          toolCalls: allToolCalls,
          usage,
          finishReason: result.finishReason,
        };
      }

      // Execute tool calls
      for (const toolCall of result.toolCalls) {
        const tool = this.agent.tools().find(t => t.name() === toolCall.name);
        if (!tool) throw new UnknownToolError(toolCall.name);

        const output = await tool.handle(toolCall.input);
        toolCall.output = output;
        allToolCalls.push(toolCall);

        messages.push({
          role: 'tool',
          content: JSON.stringify(output),
          toolCallId: toolCall.id,
        });
      }

      steps++;
    }

    throw new MaxStepsExceededError(maxSteps);
  }

  async *runStream(userMessage: string, priorMessages: ConversationMessage[] = []): AsyncIterable<StreamEvent> {
    const meta = getAgentMetadata(this.agent.constructor);
    const messages: ConversationMessage[] = [
      { role: 'system', content: this.agent.instructions() },
      ...priorMessages,
      { role: 'user', content: userMessage },
    ];

    yield* this.provider.stream({
      model: meta.model ?? '@cf/meta/llama-3.1-8b-instruct',
      messages,
      maxTokens: meta.maxTokens,
      temperature: meta.temperature,
    });
  }

  /**
   * Apply agent middleware around the provider completion call.
   * Middleware wraps in order: first middleware is outermost.
   */
  private async applyMiddleware(options: CompletionOptions): Promise<CompletionResult> {
    const middleware = [...this.agent.middleware()].reverse();

    const base = () => this.provider.complete(options);

    const pipeline = middleware.reduce<() => Promise<CompletionResult>>(
      (next, mw) => () => mw.handle(options, next),
      base,
    );

    return pipeline();
  }
}
```

**Key decisions**:
- The step loop runs until `finishReason !== 'tool_calls'` OR `maxSteps` is reached. This matches how all major AI SDKs handle agentic loops.
- Middleware applies around each provider completion call (not around the entire step loop). This means middleware like a token counter accumulates across all steps. Middleware that caches responses works per-step, not per-run.
- `runStream()` does NOT support tool calls in streaming mode. Streaming is for single-turn responses only. Multi-step tool calls require the non-streaming `run()` path. This is a deliberate simplification — streaming + tool calls adds significant protocol complexity and isn't required by the PRD acceptance criteria.
- The `Runner` is never exported. Users never construct it directly. This keeps the internal protocol details hidden.

**Implementation steps**:
1. Implement `Runner.run()` step loop
2. Implement `Runner.runStream()` delegation to provider
3. Implement `Runner.applyMiddleware()` reducer pipeline
4. Test: 2-step tool call loop executes tool and continues, max steps throws error, middleware wraps correctly

---

### 6. Tool Interface

**Overview**: `Tool` is an interface (not a class) that agents declare in their `tools()` array. Subclasses implement `name()`, `description()`, `schema()`, and `handle()`. The schema uses the shared `@roostjs/schema` builder.

```typescript
// packages/ai/src/tool.ts

import type { SchemaBuilder } from '@roostjs/schema';

export interface Tool {
  /** The function name exposed to the LLM. Must be unique within an agent. */
  name(): string;

  /** The function description — the LLM reads this to decide when to call the tool. */
  description(): string;

  /**
   * Input schema for this tool's parameters.
   * Use the schema builder from @roostjs/schema.
   */
  schema(): SchemaBuilder;

  /**
   * Execute the tool with validated input.
   * Return value is serialized and sent back to the LLM as the tool result.
   */
  handle(input: Record<string, unknown>): Promise<unknown>;
}

// Abstract base class for tools that need constructor injection
export abstract class BaseTool implements Tool {
  abstract name(): string;
  abstract description(): string;
  abstract schema(): SchemaBuilder;
  abstract handle(input: Record<string, unknown>): Promise<unknown>;
}
```

**Example tool**:

```typescript
import { BaseTool } from '@roostjs/ai';
import { schema } from '@roostjs/schema';
import type { CrmService } from '../services/crm.ts';

export class SearchCrmTool extends BaseTool {
  // Injected via constructor — resolved by app.resolve(SearchCrmTool)
  constructor(private crm: CrmService) {
    super();
  }

  name(): string {
    return 'search_crm';
  }

  description(): string {
    return 'Search the CRM for companies, contacts, and deal history. Use when you need current data about a prospect.';
  }

  schema(): SchemaBuilder {
    return schema
      .object()
      .property('query', schema.string().description('The search query'), true)
      .property('limit', schema.integer().min(1).max(50).default(10), false);
  }

  async handle(input: { query: string; limit?: number }): Promise<unknown> {
    return this.crm.search(input.query, { limit: input.limit ?? 10 });
  }
}
```

**Key decisions**:
- `handle()` receives `Record<string, unknown>` not the typed input shape. Strict typing at the tool call boundary is complex because the LLM generates the input at runtime. Tools should validate input defensively or use a validation library. The spec notes this and provides the typed overload pattern in JSDoc examples.
- `schema()` returns a `SchemaBuilder` instance, not the built output. The `Runner` calls `.build()` when constructing the tool definition for the provider. This lets tools compose schemas from other builders.
- Tools are class instances, not classes. `agent.tools()` returns instances. The service container resolves dependencies at instance creation time, before the agent is prompted.

**Implementation steps**:
1. Define `Tool` interface
2. Implement `BaseTool` abstract class
3. Write example `SearchCrmTool` in `__tests__/helpers/`
4. Test: tool schema builds correct JSON Schema output, handle called with correct input

---

### 7. Structured Output

**Overview**: `HasStructuredOutput` is an interface agents implement to declare a typed response schema. When implemented, the runner passes the schema as `outputSchema` to the provider, which constrains the model's response to that shape.

```typescript
// packages/ai/src/structured.ts

import type { SchemaBuilder, JsonSchemaOutput } from '@roostjs/schema';

/**
 * Mixin interface for agents that return structured output.
 * Implement schema() to define the expected response shape.
 */
export interface HasStructuredOutput<T = unknown> {
  schema(): SchemaBuilder;
}

/**
 * Parse and validate a structured output response.
 * Throws StructuredOutputValidationError if the response doesn't match the schema.
 */
export function parseStructuredOutput<T>(
  raw: string,
  schemaOutput: JsonSchemaOutput
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StructuredOutputParseError(raw);
  }

  // Runtime validation against schema
  validateAgainstSchema(parsed, schemaOutput);
  return parsed as T;
}
```

**Usage**:

```typescript
import { Agent, Promptable } from '@roostjs/ai';
import type { HasStructuredOutput } from '@roostjs/ai';
import { schema } from '@roostjs/schema';

interface SentimentResult {
  score: number;
  label: 'positive' | 'neutral' | 'negative';
  confidence: number;
}

@Provider('cloudflare')
@Model('@cf/meta/llama-3.1-8b-instruct')
class SentimentAgent extends Promptable(Agent) implements HasStructuredOutput<SentimentResult> {
  instructions(): string {
    return 'Analyze the sentiment of text and return structured output.';
  }

  schema(): SchemaBuilder {
    return schema
      .object()
      .property('score', schema.number().description('Sentiment score -1 to 1'), true)
      .property('label', schema.enum(['positive', 'neutral', 'negative']), true)
      .property('confidence', schema.number().min(0).max(1), true);
  }
}

const agent = new SentimentAgent();
const response = await agent.prompt('I love this product!');
const result = JSON.parse(response.text) as SentimentResult;
// result.score, result.label, result.confidence are typed
```

---

### 8. Conversation Memory (RemembersConversations)

**Overview**: `RemembersConversations` is a mixin that adds D1-backed conversation persistence. Conversations are stored in a `conversation_messages` table. The mixin's `prompt()` override loads prior messages before calling the parent `prompt()` and saves new messages after.

```typescript
// packages/ai/src/memory.ts

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { ConversationMessage } from './types.ts';

export type ConversationRecord = {
  id: string;
  userId: string;
  agentClass: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRecord = {
  id: number;
  conversationId: string;
  role: ConversationMessage['role'];
  content: string;
  metadata: string | null;
  createdAt: string;
};

/**
 * Mixin that adds D1-backed conversation persistence to an Agent.
 * Usage: class MyAgent extends RemembersConversations(Promptable(Agent)) { ... }
 */
export function RemembersConversations<TBase extends new (...args: unknown[]) => PromptableAgent>(Base: TBase) {
  return class extends Base {
    private db: DrizzleD1Database | null = null;
    protected conversationId: string | undefined;
    protected conversationUserId: string | undefined;

    withDb(db: DrizzleD1Database): this {
      this.db = db;
      return this;
    }

    override async prompt(userMessage: string, options?: PromptOptions): Promise<AgentResponse> {
      const db = this.requireDb();
      const conversationId = await this.resolveConversationId(db);

      const priorMessages = await this.loadMessages(db, conversationId);
      const response = await super.prompt(userMessage, { ...options, priorMessages });

      await this.saveMessages(db, conversationId, userMessage, response.text);
      return response;
    }

    private async resolveConversationId(db: DrizzleD1Database): Promise<string> {
      if (this.conversationId) return this.conversationId;
      return this.createConversation(db);
    }

    private async createConversation(db: DrizzleD1Database): Promise<string> {
      const id = crypto.randomUUID();
      await db.insert(conversationsTable).values({
        id,
        userId: this.conversationUserId ?? 'anonymous',
        agentClass: this.constructor.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      this.conversationId = id;
      return id;
    }

    private async loadMessages(db: DrizzleD1Database, conversationId: string): Promise<ConversationMessage[]> {
      const rows = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId))
        .orderBy(asc(messagesTable.createdAt));

      return rows.map(r => ({
        role: r.role as ConversationMessage['role'],
        content: r.content,
      }));
    }

    private async saveMessages(
      db: DrizzleD1Database,
      conversationId: string,
      userMessage: string,
      assistantResponse: string,
    ): Promise<void> {
      await db.insert(messagesTable).values([
        { conversationId, role: 'user', content: userMessage, createdAt: new Date().toISOString() },
        { conversationId, role: 'assistant', content: assistantResponse, createdAt: new Date().toISOString() },
      ]);
    }

    private requireDb(): DrizzleD1Database {
      if (!this.db) throw new ConversationMemoryNotConfiguredError(this.constructor.name);
      return this.db;
    }
  };
}
```

**Database schema** (created via migration, not via `@roostjs/orm` — Phase 5 runs before ORM is required):

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_class TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_messages_conversation_id ON conversation_messages (conversation_id);
```

**Usage**:

```typescript
@Provider('cloudflare')
@Model('@cf/meta/llama-3.1-8b-instruct')
class ChatAgent extends RemembersConversations(Promptable(Agent)) {
  instructions(): string {
    return 'You are a helpful assistant with memory of this conversation.';
  }
}

const agent = new ChatAgent().withDb(db);

// First turn — creates conversation
const r1 = await agent.forUser(user).prompt('Hello, my name is Alice');

// Second turn — continues with full history
const r2 = await agent.continue(r1.conversationId).prompt('What is my name?');
// r2.text includes 'Alice' because history was loaded
```

**Key decisions**:
- `RemembersConversations` wraps `Promptable`, not `Agent`. The mixin stack is `RemembersConversations(Promptable(Agent))`. The memory mixin intercepts `prompt()`, loads history, calls `super.prompt()` (which is `Promptable`'s implementation), then saves.
- `withDb()` injects the D1 Drizzle instance. The `AiServiceProvider` calls this at resolution time if the agent is resolved via the container.
- Conversation ID is returned on `AgentResponse` so callers can store it for `continue()`. This requires adding `conversationId?: string` to `AgentResponse`.

**Implementation steps**:
1. Create the migration SQL for `conversations` and `conversation_messages`
2. Implement `RemembersConversations` mixin
3. Add `conversationId?` to `AgentResponse` type
4. Test: first prompt creates conversation, second prompt with `.continue(id)` loads prior messages, `forUser(user)` sets userId on conversation record

---

### 9. Streaming (SSE)

**Overview**: `agent.stream()` returns `AsyncIterable<StreamEvent>`. The `toSSE()` utility converts this to a `ReadableStream<string>` formatted as SSE, which can be returned directly from a Roost route handler as a `Response`.

```typescript
// packages/ai/src/streaming.ts

import type { StreamEvent } from './types.ts';

/**
 * Convert an AsyncIterable of stream events to a ReadableStream formatted as SSE.
 * Return the result from a route handler to stream tokens to the client.
 *
 * @example
 * ```typescript
 * export async function POST({ request }) {
 *   const { message } = await request.json();
 *   const agent = new ChatAgent();
 *   return new Response(toSSE(agent.stream(message)), {
 *     headers: {
 *       'Content-Type': 'text/event-stream',
 *       'Cache-Control': 'no-cache',
 *       'Connection': 'keep-alive',
 *     },
 *   });
 * }
 * ```
 */
export function toSSE(events: AsyncIterable<StreamEvent>): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const event of events) {
          if (event.type === 'text_delta') {
            controller.enqueue(`data: ${JSON.stringify({ type: 'text', value: event.delta })}\n\n`);
          } else if (event.type === 'done') {
            controller.enqueue(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          } else if (event.type === 'tool_call') {
            controller.enqueue(`data: ${JSON.stringify({ type: 'tool_call', name: event.toolCall.name })}\n\n`);
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Convert stream events to Vercel AI SDK data protocol format.
 * Use with the frontend useChat() hook.
 */
export function toVercelStream(events: AsyncIterable<StreamEvent>): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      for await (const event of events) {
        if (event.type === 'text_delta') {
          // Vercel AI SDK protocol: "0:{text}\n"
          controller.enqueue(`0:${JSON.stringify(event.delta)}\n`);
        } else if (event.type === 'done') {
          controller.enqueue(`d:{"finishReason":"stop"}\n`);
          controller.close();
          return;
        }
      }
      controller.close();
    },
  });
}
```

**Key decisions**:
- Two utility functions: `toSSE()` for generic SSE (works with any frontend) and `toVercelStream()` for the Vercel AI SDK data protocol (works with `useChat()` from `@ai-sdk/react`).
- The `ReadableStream` constructor is used directly — Workers have native `ReadableStream`. No polyfills.
- `controller.close()` in the `finally` block ensures the stream always closes even if the agent throws.

---

### 10. Agent Middleware

```typescript
// packages/ai/src/middleware.ts

import type { CompletionOptions, CompletionResult } from './providers/interface.ts';

export interface AgentMiddleware {
  /**
   * Intercept a completion call.
   * Call next(options) to proceed, or return a result directly to short-circuit.
   */
  handle(
    options: CompletionOptions,
    next: (options: CompletionOptions) => Promise<CompletionResult>
  ): Promise<CompletionResult>;
}

// Example: token counting middleware
class TokenCounterMiddleware implements AgentMiddleware {
  private totalTokens = 0;

  async handle(
    options: CompletionOptions,
    next: (options: CompletionOptions) => Promise<CompletionResult>
  ): Promise<CompletionResult> {
    const result = await next(options);
    this.totalTokens += result.usage.promptTokens + result.usage.completionTokens;
    return result;
  }

  get total(): number {
    return this.totalTokens;
  }
}
```

---

### 11. Anonymous Agent Function

```typescript
// packages/ai/src/anonymous.ts

import { Agent, Promptable } from './agent.ts';
import type { Tool } from './tool.ts';
import type { SchemaBuilder } from '@roostjs/schema';

type AgentConfig = {
  instructions: string;
  provider?: string;
  model?: string;
  tools?: Tool[];
  schema?: SchemaBuilder;
  maxSteps?: number;
};

/**
 * Create a one-off agent without defining a class.
 * Useful for quick prompts and script-style code.
 *
 * @example
 * const response = await agent({
 *   instructions: 'You are a helpful assistant.',
 *   model: '@cf/meta/llama-3.1-8b-instruct',
 * }).prompt('Explain quantum computing in one sentence.');
 */
export function agent(config: AgentConfig): Promptable(Agent) {
  // Dynamic class creation
  const AnonymousAgent = class extends Promptable(Agent) {
    instructions() { return config.instructions; }
    tools() { return config.tools ?? []; }
    schema() { return config.schema ?? null; }
  };

  // Apply metadata programmatically (bypasses decorators)
  if (config.provider) setMeta(AnonymousAgent, { provider: config.provider });
  if (config.model) setMeta(AnonymousAgent, { model: config.model });
  if (config.maxSteps) setMeta(AnonymousAgent, { maxSteps: config.maxSteps });

  return new AnonymousAgent() as InstanceType<ReturnType<typeof Promptable<typeof Agent>>>;
}
```

---

### 12. Agent Fake (Testing)

```typescript
// packages/ai/src/fake.ts

import type { AgentResponse } from './types.ts';

/**
 * Replace the Runner with a fake that returns canned responses.
 * Called as Agent.fake() in test setup. Prevents real AI calls.
 *
 * @example
 * ```typescript
 * Agent.fake(['Great choice!', 'I agree.']);
 *
 * const response = await new SalesCoach(user).prompt('Hello');
 * Agent.assertPrompted('Hello');
 * ```
 */
export class AgentFake {
  private static fakeRegistry = new WeakMap<Function, AgentFake>();
  private responses: string[];
  private promptedWith: string[] = [];

  private constructor(responses: string[]) {
    this.responses = [...responses];
  }

  static install(agentClass: Function, responses: string | string[] = 'Fake response'): AgentFake {
    const fake = new AgentFake(Array.isArray(responses) ? responses : [responses]);
    AgentFake.fakeRegistry.set(agentClass, fake);
    return fake;
  }

  static restore(agentClass: Function): void {
    AgentFake.fakeRegistry.delete(agentClass);
  }

  static get(agentClass: Function): AgentFake | null {
    return AgentFake.fakeRegistry.get(agentClass) ?? null;
  }

  nextResponse(): AgentResponse {
    const text = this.responses.shift() ?? 'Fake response';
    return {
      text,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: 'stop',
    };
  }

  recordPrompt(text: string): void {
    this.promptedWith.push(text);
  }

  assertPrompted(text: string): void {
    if (!this.promptedWith.includes(text)) {
      throw new AssertionError(`Expected agent to be prompted with "${text}" but was not. Prompted with: ${JSON.stringify(this.promptedWith)}`);
    }
  }

  assertNeverPrompted(): void {
    if (this.promptedWith.length > 0) {
      throw new AssertionError(`Expected agent to never be prompted but was prompted ${this.promptedWith.length} times.`);
    }
  }
}
```

**Wired into Agent class**:

```typescript
// Inside Agent class (added to agent.ts)
static fake(responses: string | string[] = 'Fake response'): AgentFake {
  return AgentFake.install(this, responses);
}

static restoreFake(): void {
  AgentFake.restore(this);
}
```

**Inside `getRunner()` helper** (in `agent.ts`):

```typescript
function getRunner(agent: Agent, _options?: PromptOptions): Runner {
  const fake = AgentFake.get(agent.constructor);
  if (fake) {
    return new FakeRunner(agent, fake);
  }
  // ... normal runner construction
}
```

**Usage in bun:test**:

```typescript
import { describe, it, expect, afterEach } from 'bun:test';

describe('SalesCoach', () => {
  afterEach(() => SalesCoach.restoreFake());

  it('responds with a coaching tip', async () => {
    SalesCoach.fake(['Focus on the value, not the price.']);

    const coach = new SalesCoach(mockUser);
    const response = await coach.prompt('How do I handle price objections?');

    expect(response.text).toBe('Focus on the value, not the price.');
    SalesCoach.assertPrompted('How do I handle price objections?');
  });
});
```

---

### 13. MCP Server Base Class

**Overview**: `Server` is the base class for MCP servers. Subclasses declare `tools`, `resources`, and `prompts` arrays. The `@Name`, `@Version`, and `@Instructions` decorators configure server metadata. `Mcp.web()` mounts the server at a route.

```typescript
// packages/mcp/src/server.ts

import type { McpTool } from './tool.ts';
import type { McpResource } from './resource.ts';
import type { McpPrompt } from './prompt.ts';
import { getServerMetadata } from './decorators.ts';

export abstract class Server {
  /** Tool instances this server exposes */
  tools(): McpTool[] {
    return [];
  }

  /** Resource instances this server exposes */
  resources(): McpResource[] {
    return [];
  }

  /** Prompt instances this server exposes */
  prompts(): McpPrompt[] {
    return [];
  }

  /**
   * Optional: gate capabilities based on the incoming request.
   * Return false to hide a tool/resource/prompt from this request.
   */
  shouldRegister(_capability: McpTool | McpResource | McpPrompt, _request: Request): boolean {
    return true;
  }

  /** Dispatch an MCP protocol request to the correct handler */
  async dispatch(mcpRequest: McpRequest): Promise<McpResponse> {
    const meta = getServerMetadata(this.constructor);

    switch (mcpRequest.method) {
      case 'initialize':
        return this.handleInitialize(meta);
      case 'tools/list':
        return this.handleToolsList(mcpRequest.httpRequest);
      case 'tools/call':
        return this.handleToolCall(mcpRequest);
      case 'resources/list':
        return this.handleResourcesList(mcpRequest.httpRequest);
      case 'resources/read':
        return this.handleResourceRead(mcpRequest);
      case 'prompts/list':
        return this.handlePromptsList(mcpRequest.httpRequest);
      case 'prompts/get':
        return this.handlePromptGet(mcpRequest);
      default:
        return McpResponse.error(`Method not found: ${mcpRequest.method}`, -32601);
    }
  }

  // Static test helper: invoke a tool directly without HTTP
  static async tool<T extends McpTool>(
    toolClass: new (...args: unknown[]) => T,
    input: Record<string, unknown>
  ): Promise<McpResponse> {
    const tool = new toolClass();
    const request = new McpToolRequest(input);
    return tool.handle(request);
  }
}
```

**Decorator usage**:

```typescript
import { Server } from '@roostjs/mcp';
import { Name, Version, Instructions } from '@roostjs/mcp/decorators';

@Name('my-crm')
@Version('1.0.0')
@Instructions('This MCP server exposes CRM data for AI assistants.')
class CrmServer extends Server {
  tools(): McpTool[] {
    return [
      new SearchContactsTool(),
      new CreateDealTool(),
    ];
  }

  resources(): McpResource[] {
    return [new ContactResource()];
  }
}
```

---

### 14. MCP Tool, Resource, Prompt

```typescript
// packages/mcp/src/tool.ts

import type { SchemaBuilder } from '@roostjs/schema';
import type { McpResponse } from './response.ts';
import type { McpRequest } from './request.ts';

export abstract class McpTool {
  abstract description(): string;
  abstract schema(): SchemaBuilder;

  /**
   * Optional: define the output schema for structured tool results.
   * Used by MCP clients that support typed outputs.
   */
  outputSchema(): SchemaBuilder | null {
    return null;
  }

  abstract handle(request: McpRequest): Promise<McpResponse>;

  /**
   * Optional: override to gate this tool per-request.
   * Return false to hide it from the tools/list response.
   */
  shouldRegister(_request: Request): boolean {
    return true;
  }
}
```

```typescript
// packages/mcp/src/resource.ts

import type { McpResponse } from './response.ts';
import type { McpRequest } from './request.ts';

export abstract class McpResource {
  abstract uri(): string;
  abstract mimeType(): string;
  abstract description(): string;
  abstract read(request: McpRequest): Promise<McpResponse>;

  shouldRegister(_request: Request): boolean {
    return true;
  }
}

// Dynamic resource with URI template variables
export abstract class DynamicResource extends McpResource {
  // URI template: 'contacts://{contactId}/details'
  abstract uriTemplate(): string;

  uri(): string {
    return this.uriTemplate();
  }
}
```

```typescript
// packages/mcp/src/prompt.ts

import type { McpResponse } from './response.ts';
import type { SchemaBuilder } from '@roostjs/schema';

export type PromptMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export abstract class McpPrompt {
  abstract name(): string;
  abstract description(): string;
  abstract arguments(): SchemaBuilder; // schema of expected arguments
  abstract get(args: Record<string, unknown>): Promise<PromptMessage[]>;
}
```

---

### 15. MCP Response Factory

```typescript
// packages/mcp/src/response.ts

export class McpResponse {
  private constructor(
    readonly content: McpResponseContent[],
    readonly isError: boolean = false,
  ) {}

  static text(text: string): McpResponse {
    return new McpResponse([{ type: 'text', text }]);
  }

  static error(message: string, code?: number): McpResponse {
    return new McpResponse([{ type: 'text', text: message }], true);
  }

  static image(data: string, mimeType: string): McpResponse {
    return new McpResponse([{ type: 'image', data, mimeType }]);
  }

  static structured(data: unknown): McpResponse {
    return new McpResponse([{
      type: 'text',
      text: JSON.stringify(data),
    }]);
  }

  static notification(notification: unknown): McpResponse {
    return new McpResponse([{
      type: 'text',
      text: JSON.stringify(notification),
    }]);
  }

  toMcpProtocol(): object {
    return {
      content: this.content,
      isError: this.isError,
    };
  }

  // Test assertion helpers
  assertOk(): this {
    if (this.isError) throw new AssertionError('Expected successful MCP response but got error.');
    return this;
  }

  assertSee(text: string): this {
    const allText = this.content
      .filter(c => c.type === 'text')
      .map(c => (c as McpTextContent).text)
      .join(' ');
    if (!allText.includes(text)) {
      throw new AssertionError(`Expected response to contain "${text}" but got: "${allText}"`);
    }
    return this;
  }

  assertHasErrors(): this {
    if (!this.isError) throw new AssertionError('Expected error MCP response but got success.');
    return this;
  }
}

type McpResponseContent = McpTextContent | McpImageContent;
type McpTextContent = { type: 'text'; text: string };
type McpImageContent = { type: 'image'; data: string; mimeType: string };
```

---

### 16. MCP Transport and Mcp.web() Helper

```typescript
// packages/mcp/src/router.ts

import type { Server } from './server.ts';
import { parseRawRequest } from './transport.ts';

export class Mcp {
  /**
   * Mount an MCP server at a route path.
   * Returns a route handler compatible with Roost's router.
   *
   * @example
   * // In your routes file:
   * router.post('/mcp/crm', Mcp.web(CrmServer));
   */
  static web<T extends Server>(
    serverClass: new () => T
  ): (request: Request) => Promise<Response> {
    return async (request: Request) => {
      const server = new serverClass();
      const mcpRequest = await parseRawRequest(request);

      const mcpResponse = await server.dispatch(mcpRequest);

      return new Response(JSON.stringify(mcpResponse.toMcpProtocol()), {
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }

  /**
   * Mount an MCP server with SSE streaming support.
   * Generator-based tool handlers will stream events to the client.
   */
  static stream<T extends Server>(
    serverClass: new () => T
  ): (request: Request) => Promise<Response> {
    return async (request: Request) => {
      const server = new serverClass();
      const mcpRequest = await parseRawRequest(request);

      // Detect if the tool handler is a generator and set up SSE transport
      const stream = new ReadableStream<string>({
        async start(controller) {
          for await (const event of server.dispatchStream(mcpRequest)) {
            controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    };
  }
}
```

---

## Data Model

### `conversations` table

| Column | Type | Notes |
|---|---|---|
| id | TEXT | UUID primary key |
| user_id | TEXT | User identifier |
| agent_class | TEXT | Class name for correlation |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### `conversation_messages` table

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Autoincrement primary key |
| conversation_id | TEXT | Foreign key to conversations |
| role | TEXT | 'user' | 'assistant' | 'system' | 'tool' |
| content | TEXT | Message content |
| metadata | TEXT | JSON blob, nullable |
| created_at | TEXT | ISO timestamp |

Index: `idx_messages_conversation_id` on `conversation_messages(conversation_id)`.

## API Design

### @roostjs/schema public API

```typescript
export { schema } from './builder.ts';
export type { JsonSchemaOutput, SchemaBuilder } from './types.ts';
```

### @roostjs/ai public API

```typescript
export { Agent, Promptable } from './agent.ts';
export { BaseTool } from './tool.ts';
export type { Tool } from './tool.ts';
export { RemembersConversations } from './memory.ts';
export type { AgentMiddleware } from './middleware.ts';
export { agent } from './anonymous.ts';
export { AgentFake } from './fake.ts';
export { toSSE, toVercelStream } from './streaming.ts';
export { AiServiceProvider } from './provider.ts';
export type { AgentResponse, StreamEvent, ConversationMessage } from './types.ts';
// Decorators are a separate sub-path to avoid polluting the main import
// import { Provider, Model } from '@roostjs/ai/decorators'
export { Provider, Model, MaxSteps, MaxTokens, Temperature, Timeout } from './decorators.ts';
```

### @roostjs/mcp public API

```typescript
export { Server } from './server.ts';
export { McpTool } from './tool.ts';
export { McpResource, DynamicResource } from './resource.ts';
export { McpPrompt } from './prompt.ts';
export { McpResponse } from './response.ts';
export { Mcp } from './router.ts';
export { McpServiceProvider } from './provider.ts';
// Decorators
export { Name, Version, Instructions, IsReadOnly, IsDestructive, IsIdempotent, IsOpenWorld } from './decorators.ts';
```

### Key type signatures

```typescript
// Agent definition
@Provider('cloudflare')
@Model('@cf/meta/llama-3.1-8b-instruct')
class MyAgent extends Promptable(Agent) { ... }

// Prompting
const response: AgentResponse = await new MyAgent().prompt('Hello');
// response.text: string
// response.toolCalls: ToolCall[]
// response.usage: { promptTokens: number; completionTokens: number }

// Streaming
const stream: AsyncIterable<StreamEvent> = new MyAgent().stream('Hello');
return new Response(toSSE(stream), { headers: { 'Content-Type': 'text/event-stream' } });

// Faking
MyAgent.fake(['Canned response 1', 'Canned response 2']);
MyAgent.assertPrompted('Hello');

// MCP tool testing
const response: McpResponse = await Server.tool(SearchContactsTool, { query: 'Acme' });
response.assertOk().assertSee('Acme Corp');
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/schema/__tests__/builder.test.ts` | All types, modifiers, nested objects/arrays, clone safety |
| `packages/ai/__tests__/agent.test.ts` | Decorator metadata, tool declaration, instructions override |
| `packages/ai/__tests__/tool.test.ts` | Schema builds correct JSON Schema, handle receives correct input |
| `packages/ai/__tests__/memory.test.ts` | First prompt creates conversation, continue loads history, forUser sets userId |
| `packages/ai/__tests__/middleware.test.ts` | Middleware wraps completion, short-circuit, multiple middleware order |
| `packages/ai/__tests__/streaming.test.ts` | toSSE produces correct SSE format, toVercelStream produces correct protocol |
| `packages/ai/__tests__/fake.test.ts` | fake() prevents real calls, assertPrompted, assertNeverPrompted, queue responses |
| `packages/mcp/__tests__/server.test.ts` | tools/list, tools/call dispatch, shouldRegister gating |
| `packages/mcp/__tests__/tool.test.ts` | description, schema, handle return McpResponse |
| `packages/mcp/__tests__/resource.test.ts` | uri, mimeType, read returns content |
| `packages/mcp/__tests__/prompt.test.ts` | arguments schema, get returns messages with correct roles |
| `packages/mcp/__tests__/response.test.ts` | text, error, image, structured factory methods, assertOk, assertSee, assertHasErrors |

### Key test cases

- **Schema builder immutability**: `const base = schema.object(); const a = base.property('x', schema.string()); const b = base.property('y', schema.string()); a.build()` should NOT have `y`. Proves clone safety.
- **Step loop**: Mock provider returns `finishReason: 'tool_calls'` twice, then `finishReason: 'stop'`. Assert runner called provider 3 times and tool was called twice.
- **N+1 prevention in memory**: Conversation with 10 prior messages loads them all in one query. Assert `mockD1.queries.length === 1`.
- **Fake isolation**: `AgentA.fake([...])` does not affect `AgentB`. Each call to `static fake()` is scoped to the class.
- **MCP tool test helper**: `Server.tool(MyTool, { query: 'test' })` calls the tool's `handle()` directly without HTTP. Verify the correct `McpResponse` is returned.
- **Streaming output format**: Collect all chunks from `toSSE(stream)`. Verify `data: {"type":"text","value":"Hello"}\n\n` format and `data: {"type":"done"}\n\n` at end.

## Error Handling

| Error Scenario | Error Type | Message |
|---|---|---|
| Agent has no `@Provider` decorator | `MissingProviderError` | `"MyAgent has no @Provider decorator. Add @Provider('cloudflare') to your agent class."` |
| Agent has no `@Model` decorator | `MissingModelError` | `"MyAgent has no @Model decorator. Add @Model('@cf/meta/llama-3.1-8b-instruct') to your agent class."` |
| Max steps exceeded | `MaxStepsExceededError` | `"MyAgent exceeded maximum of 10 steps. Increase @MaxSteps or reduce tool call depth."` |
| Tool name not found in tools() list | `UnknownToolError` | `"Agent returned tool call for 'search_crm' but no tool with that name is registered."` |
| Structured output parse failure | `StructuredOutputParseError` | `"Agent response could not be parsed as JSON. Raw response: '...'"` |
| Memory not configured | `ConversationMemoryNotConfiguredError` | `"ChatAgent uses RemembersConversations but no DB was provided. Call .withDb(db) or register AiServiceProvider."` |
| MCP method not found | Protocol error response (not throw) | MCP `-32601` error response |
| MCP tool call with invalid input | `McpValidationError` | Returned as `McpResponse.error(...)` — not thrown |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Runner | Infinite tool call loop | Model keeps requesting the same tool | Hits `maxSteps`, throws `MaxStepsExceededError` | `@MaxSteps` defaults to 10. Document: set lower for tools that shouldn't recurse |
| Streaming | Workers execution limit | Long-running stream exceeds 30s CPU time | Stream cut off mid-response | Document: use `queue()` for long-running agents. Workers streaming is for UI feedback, not batch processing |
| Memory | Conversation context too long | Many turns exceed model context window | Model truncates or ignores early messages | Document: implement conversation summarization if turns > 20. Future: auto-summarize mixin |
| Fake | `restoreFake()` not called between tests | Test isolation failure | Prior test's fake responses leak into next test | Always use `afterEach(() => MyAgent.restoreFake())`. Document this pattern prominently |
| MCP server | SSE connection drop | Network interruption | Tool result lost | MCP clients should retry. SSE transport is best-effort per MCP protocol spec |
| Schema builder | Circular reference in object schema | `schema.object().property('self', schemaRef)` | Infinite recursion in `build()` | No circular schema support in v0.1. Document this limitation |
| Cloudflare AI provider | Rate limit hit | High-traffic scenario | `run()` throws `AIRateLimitError` | Propagate error to caller. Future: implement retry middleware |

## Validation Commands

```bash
# Type checking
bun run tsc --noEmit --filter '@roostjs/schema'
bun run tsc --noEmit --filter '@roostjs/ai'
bun run tsc --noEmit --filter '@roostjs/mcp'

# Unit tests
bun test --filter packages/schema
bun test --filter packages/ai
bun test --filter packages/mcp

# Build all three packages
bun run build --filter '@roostjs/schema'
bun run build --filter '@roostjs/ai'
bun run build --filter '@roostjs/mcp'

# Integration smoke test (requires wrangler dev running)
# Verify a decorated agent class compiles and prompts without error
curl -X POST http://localhost:8787/api/test-agent \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hello"}'

# Verify MCP server responds to tools/list
curl -X POST http://localhost:8787/mcp/crm \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```
