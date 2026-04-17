import { describe, it, expect, beforeEach } from 'bun:test';
import { Agent } from '../src/agent';
import type { AIProvider, ProviderCapabilities } from '../src/providers/interface';
import type { ProviderRequest, ProviderResponse } from '../src/types';
import type { AgentMessage } from '../src/types';
import type { AgentPrompt } from '../src/prompt';
import type { AgentResponse } from '../src/responses/agent-response';
import type { AgentMiddleware, NextFn } from '../src/middleware';
import type { Tool, ToolRequest } from '../src/tool';
import { schema } from '@roostjs/schema';
import type { SchemaBuilder } from '@roostjs/schema';
import type { Lab } from '../src/enums';

function mockProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: 'mock',
    capabilities: (): ProviderCapabilities => ({
      name: 'mock',
      supported: new Set(['chat', 'tools']),
      cheapestChat: 'cheap-model',
      smartestChat: 'smart-model',
    }),
    chat: async (_req: ProviderRequest): Promise<ProviderResponse> => ({
      text: 'ok',
      toolCalls: [],
    }),
    ...overrides,
  };
}

class FoundationAgent extends Agent {
  instructions() { return 'You are a test agent.'; }
}

describe('Agent foundation', () => {
  beforeEach(() => {
    FoundationAgent.restore();
    FoundationAgent.clearProvider();
  });

  describe('non-conversational agents', () => {
    it('keeps an internal rolling message window between prompts on the same instance', async () => {
      let lastMessages: AgentMessage[] = [];
      FoundationAgent.setProvider(
        mockProvider({
          chat: async (req) => {
            lastMessages = req.messages;
            return { text: 'pong', toolCalls: [] };
          },
        }),
      );

      const a = new FoundationAgent();
      await a.prompt('first');
      await a.prompt('second');

      // Second call should see: system + first user + first assistant + second user
      expect(lastMessages.length).toBe(4);
      expect(lastMessages[1].content).toBe('first');
      expect(lastMessages[2].content).toBe('pong');
      expect(lastMessages[3].content).toBe('second');
    });
  });

  describe('Conversational contract', () => {
    it('reads messages() from the agent when implementing the contract', async () => {
      let lastMessages: AgentMessage[] = [];
      FoundationAgent.setProvider(
        mockProvider({
          chat: async (req) => {
            lastMessages = req.messages;
            return { text: 'ok', toolCalls: [] };
          },
        }),
      );

      class ConversationalAgent extends FoundationAgent {
        messages(): AgentMessage[] {
          return [
            { role: 'user', content: 'loaded-1' },
            { role: 'assistant', content: 'loaded-2' },
          ];
        }
      }

      const a = new ConversationalAgent();
      await a.prompt('new');

      // system + 2 loaded + 1 new
      expect(lastMessages).toHaveLength(4);
      expect(lastMessages[1].content).toBe('loaded-1');
      expect(lastMessages[2].content).toBe('loaded-2');
      expect(lastMessages[3].content).toBe('new');
    });
  });

  describe('HasTools contract', () => {
    it('invokes tool.handle() and loops when provider returns tool calls', async () => {
      const toolInvocations: Array<Record<string, unknown>> = [];

      class Calculator implements Tool {
        description() { return 'math'; }
        schema(s: typeof schema): Record<string, SchemaBuilder> {
          return { a: s.integer(), b: s.integer() };
        }
        async handle(req: ToolRequest): Promise<string> {
          toolInvocations.push({ a: req.get<number>('a'), b: req.get<number>('b') });
          return '5';
        }
      }

      let call = 0;
      FoundationAgent.setProvider(
        mockProvider({
          chat: async () => {
            call++;
            if (call === 1) {
              return {
                text: '',
                toolCalls: [{ id: 'c1', name: 'Calculator', arguments: { a: 2, b: 3 } }],
              };
            }
            return { text: 'final', toolCalls: [] };
          },
        }),
      );

      class ToolAgent extends FoundationAgent {
        tools(): Tool[] { return [new Calculator()]; }
      }

      const a = new ToolAgent();
      const r = await a.prompt('add 2 and 3');
      expect(r.queued).toBe(false);
      if (r.queued === false) {
        expect(r.text).toBe('final');
      }
      expect(toolInvocations).toEqual([{ a: 2, b: 3 }]);
      expect(call).toBe(2);
    });
  });

  describe('HasStructuredOutput contract', () => {
    it('parses provider text as JSON and exposes it via response proxy + .data', async () => {
      FoundationAgent.setProvider(
        mockProvider({
          chat: async () => ({ text: JSON.stringify({ score: 9, summary: 'great' }), toolCalls: [] }),
        }),
      );

      class ScoringAgent extends FoundationAgent {
        schema(s: typeof schema): Record<string, SchemaBuilder> {
          return { score: s.integer(), summary: s.string() };
        }
      }

      const a = new ScoringAgent();
      const r = await a.prompt('rate');
      if (r.queued === false) {
        expect(r.text).toContain('score');
      }
      // Proxy access via `.data` exposed on the AgentResponse wrapper; test the wrapper directly
      const { StructuredAgentResponse } = await import('../src/responses/agent-response');
      const wrapped = new StructuredAgentResponse(
        { text: JSON.stringify({ score: 9 }), messages: [], toolCalls: [] },
        { score: 9 } as Record<string, unknown>,
      );
      expect((wrapped as unknown as { score: number }).score).toBe(9);
    });
  });

  describe('HasMiddleware contract', () => {
    it('runs middleware before provider call in nested order', async () => {
      const trace: string[] = [];

      FoundationAgent.setProvider(
        mockProvider({
          chat: async () => {
            trace.push('provider');
            return { text: 'ok', toolCalls: [] };
          },
        }),
      );

      class Middleware1 implements AgentMiddleware {
        async handle(prompt: AgentPrompt, next: NextFn): Promise<AgentResponse> {
          trace.push('mw1-in');
          const result = await next(prompt);
          trace.push('mw1-out');
          return result;
        }
      }

      class Middleware2 implements AgentMiddleware {
        async handle(prompt: AgentPrompt, next: NextFn): Promise<AgentResponse> {
          trace.push('mw2-in');
          const result = await next(prompt);
          trace.push('mw2-out');
          return result;
        }
      }

      class MiddlewareAgent extends FoundationAgent {
        middleware() { return [new Middleware1(), new Middleware2()]; }
      }

      const a = new MiddlewareAgent();
      await a.prompt('x');
      expect(trace).toEqual(['mw1-in', 'mw2-in', 'provider', 'mw2-out', 'mw1-out']);
    });
  });

  describe('HasProviderOptions contract', () => {
    it('passes provider-specific options into the request body', async () => {
      let received: ProviderRequest | undefined;
      FoundationAgent.setProvider(
        mockProvider({
          chat: async (req) => {
            received = req;
            return { text: 'ok', toolCalls: [] };
          },
        }),
      );

      class OptsAgent extends FoundationAgent {
        providerOptions(_provider: Lab | string) {
          return { custom_flag: true, reasoning: { effort: 'low' } };
        }
      }

      const a = new OptsAgent();
      await a.prompt('x');
      expect(received?.providerOptions).toEqual({ custom_flag: true, reasoning: { effort: 'low' } });
    });
  });
});
