import type { schema, SchemaBuilder } from '@roostjs/schema';
import { Agent } from './agent.js';
import type { Tool, ProviderTool } from './tool.js';
import type { AgentMessage, AgentPromptOptions, PromptResult, ProviderOptions } from './types.js';
import type { AIProvider } from './providers/interface.js';
import type { Lab } from './enums.js';
import type { AgentMiddleware } from './middleware.js';
import type { Conversational, HasTools, HasStructuredOutput, HasMiddleware, HasProviderOptions } from './contracts.js';
import type { BackoffStrategy } from '@roostjs/queue';

export interface AgentOptions {
  instructions: string | (() => string);
  name?: string;
  messages?: Iterable<AgentMessage> | (() => Iterable<AgentMessage> | Promise<Iterable<AgentMessage>>);
  tools?: Array<Tool | ProviderTool> | (() => Array<Tool | ProviderTool>);
  schema?: (s: typeof schema) => Record<string, SchemaBuilder>;
  middleware?: AgentMiddleware[] | (() => AgentMiddleware[]);
  providerOptions?: (provider: Lab | string) => Record<string, unknown>;
  provider?: AIProvider | Lab | Lab[] | string | string[];
  /** Queue the anonymous agent's prompts get dispatched to (bypasses the @Queue decorator path). */
  queue?: string;
  maxRetries?: number;
  backoff?: BackoffStrategy;
}

export interface AnonymousAgent {
  prompt(input: string, options?: AgentPromptOptions): Promise<PromptResult>;
}

/**
 * Create an ad-hoc agent without defining a class. Unlike class-based agents,
 * anonymous agents bypass the decorator config path entirely — everything
 * flows through the `options` argument.
 */
export function agent(options: AgentOptions): AnonymousAgent {
  class AnonAgent extends Agent implements Conversational, HasTools, HasStructuredOutput, HasMiddleware, HasProviderOptions {
    instructions(): string {
      return typeof options.instructions === 'function' ? options.instructions() : options.instructions;
    }

    messages() {
      if (options.messages === undefined) return [];
      return typeof options.messages === 'function' ? options.messages() : options.messages;
    }

    tools(): Array<Tool | ProviderTool> {
      if (options.tools === undefined) return [];
      return typeof options.tools === 'function' ? options.tools() : options.tools;
    }

    schema(s: typeof schema): Record<string, SchemaBuilder> {
      return options.schema ? options.schema(s) : {};
    }

    middleware(): AgentMiddleware[] {
      if (options.middleware === undefined) return [];
      return typeof options.middleware === 'function' ? options.middleware() : options.middleware;
    }

    providerOptions(provider: Lab | string): ProviderOptions {
      return options.providerOptions ? options.providerOptions(provider) : {};
    }
  }

  // Optional: assign a friendly name (improves error messages + event telemetry)
  if (options.name) Object.defineProperty(AnonAgent, 'name', { value: options.name });

  // Anonymous agents cannot use decorators, so carry queue config via options.
  if (options.queue || options.maxRetries !== undefined || options.backoff) {
    const cfg = ((AnonAgent as unknown as { _jobConfig?: Record<string, unknown> })._jobConfig ??= {
      queue: 'default',
      maxRetries: 3,
      retryAfter: 60,
      delay: 0,
      backoff: 'fixed',
      timeout: 0,
    });
    if (options.queue) cfg.queue = options.queue;
    if (options.maxRetries !== undefined) cfg.maxRetries = options.maxRetries;
    if (options.backoff) cfg.backoff = options.backoff;
  }

  const instance = new AnonAgent();

  // Attach a provider instance directly (bypassing @Provider decorator).
  if (options.provider && typeof options.provider === 'object' && 'chat' in options.provider) {
    (AnonAgent as typeof Agent).setProvider(options.provider as AIProvider);
  }

  return {
    async prompt(input: string, opts: AgentPromptOptions = {}): Promise<PromptResult> {
      // Merge the options.provider (if it's a string/array) into the per-call options.
      const mergedOpts: AgentPromptOptions = { ...opts };
      if (options.provider && !(typeof options.provider === 'object' && 'chat' in options.provider)) {
        if (mergedOpts.provider === undefined) {
          mergedOpts.provider = options.provider as Lab | Lab[] | string | string[];
        }
      }
      return instance.prompt(input, mergedOpts);
    },
  };
}
