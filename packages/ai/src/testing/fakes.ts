import { schema, type SchemaBuilder } from '@roostjs/schema';
import type { AgentPrompt } from '../prompt.js';
import type { AgentResponse } from '../responses/agent-response.js';
import { StructuredAgentResponse } from '../responses/agent-response.js';

export type FakeResponse =
  | string
  | AgentResponse
  | Record<string, unknown>;

export type FakeResolver =
  | string[]
  | FakeResponse[]
  | ((prompt: AgentPrompt) => FakeResponse | Promise<FakeResponse>)
  | undefined;

export class StrayPromptError extends Error {
  override readonly name = 'StrayPromptError';
  constructor(agentName: string, prompt: string) {
    super(`Stray prompt to '${agentName}' (no matching fake): ${JSON.stringify(prompt).slice(0, 200)}`);
  }
}

/**
 * In-process fake used by `Agent.fake()`. Records prompts, returns
 * successive fake responses, and (optionally) throws on any prompt that
 * has no matching fake.
 */
export class AgentFake {
  readonly prompts: AgentPrompt[] = [];
  readonly queuedPrompts: AgentPrompt[] = [];
  private index = 0;
  private preventStray = false;
  private structuredSchema?: (s: typeof schema) => Record<string, SchemaBuilder>;

  constructor(private resolver: FakeResolver = undefined) {}

  preventStrayPrompts(): this {
    this.preventStray = true;
    return this;
  }

  /** Attach a structured-output schema for auto-fake generation. */
  withStructuredSchema(fn: (s: typeof schema) => Record<string, SchemaBuilder>): this {
    this.structuredSchema = fn;
    return this;
  }

  recordPrompt(prompt: AgentPrompt): void {
    this.prompts.push(prompt);
  }

  recordQueued(prompt: AgentPrompt): void {
    this.queuedPrompts.push(prompt);
  }

  async nextResponse(prompt: AgentPrompt): Promise<AgentResponse> {
    if (typeof this.resolver === 'function') {
      const result = await this.resolver(prompt);
      return this.toResponse(result);
    }
    if (Array.isArray(this.resolver) && this.resolver.length > 0) {
      const response = this.resolver[Math.min(this.index, this.resolver.length - 1)];
      this.index++;
      return this.toResponse(response);
    }
    if (this.preventStray) {
      throw new StrayPromptError(prompt.agentName, prompt.prompt);
    }
    // No resolver + no stray guard: auto-fake
    if (this.structuredSchema) {
      return this.autoStructuredResponse();
    }
    return emptyResponse('Fake response');
  }

  private toResponse(value: FakeResponse): AgentResponse {
    if (typeof value === 'string') return emptyResponse(value);
    if (isAgentResponseLike(value)) return value as AgentResponse;
    // Record-like value: treat as structured output data
    if (this.structuredSchema) {
      return new StructuredAgentResponse(emptyResponse(JSON.stringify(value)), value as Record<string, unknown>);
    }
    return emptyResponse(JSON.stringify(value));
  }

  private autoStructuredResponse(): AgentResponse {
    if (!this.structuredSchema) return emptyResponse('');
    const data = buildFakeFromSchema(this.structuredSchema);
    return new StructuredAgentResponse(emptyResponse(JSON.stringify(data)), data);
  }
}

function emptyResponse(text: string): AgentResponse {
  return { text, messages: [], toolCalls: [] };
}

function isAgentResponseLike(x: unknown): boolean {
  return (
    !!x &&
    typeof x === 'object' &&
    'text' in x &&
    'messages' in x &&
    'toolCalls' in x
  );
}

/**
 * Walk the structured-output schema and generate a minimal valid object.
 * Strings → empty string, numbers → 0, booleans → false, arrays → [],
 * objects → recurse. Enum fields → first value.
 */
export function buildFakeFromSchema(
  schemaFn: (s: typeof schema) => Record<string, SchemaBuilder>,
): Record<string, unknown> {
  const built = schemaFn(schema);
  const result: Record<string, unknown> = {};
  for (const [key, builder] of Object.entries(built)) {
    result[key] = buildFakeValue(builder);
  }
  return result;
}

function buildFakeValue(builder: SchemaBuilder): unknown {
  const spec = builder.build();
  return fakeFromJsonSchema(spec);
}

function fakeFromJsonSchema(spec: unknown): unknown {
  if (!spec || typeof spec !== 'object') return null;
  const typed = spec as { type?: string; enum?: unknown[]; items?: unknown; properties?: Record<string, unknown> };
  if (Array.isArray(typed.enum) && typed.enum.length > 0) return typed.enum[0];
  switch (typed.type) {
    case 'string':
      return '';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(typed.properties ?? {})) {
        out[k] = fakeFromJsonSchema(v);
      }
      return out;
    }
    default:
      return null;
  }
}
