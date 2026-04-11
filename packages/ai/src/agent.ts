import type { Tool } from './tool.js';
import type { AgentConfig, AgentMessage, AgentResponse } from './types.js';
import type { AIProvider } from './providers/interface.js';
import { getAgentConfig } from './decorators.js';
import { createToolRequest, toolToProviderTool } from './tool.js';

const fakes = new WeakMap<Function, AgentFake>();
const providers = new WeakMap<Function, AIProvider>();

export interface AgentInterface {
  instructions(): string;
}

export interface HasTools {
  tools(): Tool[];
}

export interface HasStructuredOutput {
  schema(s: typeof import('@roost/schema').schema): Record<string, import('@roost/schema').SchemaBuilder>;
}

export abstract class Agent implements AgentInterface {
  private _messages: AgentMessage[] = [];

  abstract instructions(): string;

  static setProvider(provider: AIProvider): void {
    providers.set(this, provider);
  }

  static clearProvider(): void {
    providers.delete(this);
  }

  async prompt(input: string, options?: Partial<AgentConfig>): Promise<AgentResponse> {
    const ctor = this.constructor as typeof Agent;

    const fake = fakes.get(ctor);
    if (fake) {
      fake.recordPrompt(input);
      return fake.nextResponse();
    }

    const config = { ...getAgentConfig(ctor), ...options };
    const provider = providers.get(ctor);
    if (!provider) {
      throw new Error(`No AI provider set for ${ctor.name}. Call ${ctor.name}.setProvider() or register AiServiceProvider.`);
    }

    const messages: AgentMessage[] = [
      { role: 'system', content: this.instructions() },
      ...this._messages,
      { role: 'user', content: input },
    ];

    const tools = (this as unknown as HasTools).tools?.()
      ?.map(toolToProviderTool) ?? [];

    const maxSteps = config.maxSteps ?? 5;
    let currentMessages = [...messages];
    let lastResponse = '';

    for (let step = 0; step < maxSteps; step++) {
      const response = await provider.chat({
        model: config.model ?? '@cf/meta/llama-3.1-8b-instruct',
        messages: currentMessages,
        tools: tools.length > 0 ? tools : undefined,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      });

      lastResponse = response.text;

      if (response.toolCalls.length === 0) break;

      currentMessages.push({ role: 'assistant', content: response.text });

      for (const toolCall of response.toolCalls) {
        const toolInstance = (this as unknown as HasTools).tools?.()
          .find((t) => t.constructor.name === toolCall.name);

        if (toolInstance) {
          const request = createToolRequest(toolCall.arguments);
          const result = await toolInstance.handle(request);
          currentMessages.push({
            role: 'tool',
            content: typeof result === 'string' ? result : JSON.stringify(result),
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          });
        }
      }
    }

    this._messages.push(
      { role: 'user', content: input },
      { role: 'assistant', content: lastResponse }
    );

    return {
      text: lastResponse,
      messages: currentMessages,
      toolCalls: [],
    };
  }

  async stream(input: string): Promise<ReadableStream<Uint8Array>> {
    const response = await this.prompt(input);
    const encoder = new TextEncoder();

    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', text: response.text })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      },
    });
  }

  static fake(responses?: string[]): void {
    fakes.set(this, new AgentFake(responses));
  }

  static restore(): void {
    fakes.delete(this);
  }

  static assertPrompted(textOrFn: string | ((prompt: string) => boolean)): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);
    fake.assertPrompted(textOrFn);
  }

  static assertNeverPrompted(): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);
    if (fake.prompts.length > 0) {
      throw new Error(`Expected ${this.name} to never be prompted, but was prompted ${fake.prompts.length} times`);
    }
  }
}

class AgentFake {
  public prompts: string[] = [];
  private responses: string[];
  private responseIndex = 0;

  constructor(responses?: string[]) {
    this.responses = responses ?? ['Fake response'];
  }

  recordPrompt(input: string): void {
    this.prompts.push(input);
  }

  nextResponse(): AgentResponse {
    const text = this.responses[this.responseIndex] ?? this.responses[this.responses.length - 1] ?? '';
    this.responseIndex++;
    return { text, messages: [], toolCalls: [] };
  }

  assertPrompted(textOrFn: string | ((prompt: string) => boolean)): void {
    const found = typeof textOrFn === 'string'
      ? this.prompts.some((p) => p.includes(textOrFn))
      : this.prompts.some(textOrFn);

    if (!found) {
      throw new Error(
        `Expected prompt matching ${typeof textOrFn === 'string' ? `"${textOrFn}"` : 'predicate'}, ` +
        `but received: ${JSON.stringify(this.prompts)}`
      );
    }
  }
}

export function agent(options: {
  instructions: string;
  tools?: Tool[];
  provider?: AIProvider;
}): { prompt: (input: string) => Promise<AgentResponse> } {
  const anon = new (class extends Agent {
    instructions() { return options.instructions; }
    tools() { return options.tools ?? []; }
  })();

  if (options.provider) {
    (anon.constructor as typeof Agent).setProvider(options.provider);
  }

  return {
    prompt: (input: string) => anon.prompt(input),
  };
}
