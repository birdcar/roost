import { Job, Queue } from '@roostjs/queue';
import type { AgentPromptOptions, PromptResult } from '../types.js';
import { AgentRegistry } from './agent-registry.js';
import { getCallbackRegistry } from './callback-registry.js';

export interface PromptAgentJobPayload {
  agentClass: string;
  agentArgs: unknown[];
  input: string;
  options: AgentPromptOptions;
  promptId: string;
}

/**
 * Queued prompt job. The consumer re-materializes the target agent from the
 * `AgentRegistry`, runs `prompt()`, and routes the result / error into the
 * callback registry keyed by `promptId`.
 */
@Queue('ai-inference')
export class PromptAgentJob extends Job<PromptAgentJobPayload> {
  async handle(): Promise<void> {
    const ctor = AgentRegistry.get().resolve(this.payload.agentClass);
    const agent = new ctor(...this.payload.agentArgs);
    try {
      const result = (await agent.prompt(this.payload.input, this.payload.options)) as PromptResult;
      if (result.queued === false) {
        await getCallbackRegistry().fulfill(this.payload.promptId, {
          text: result.text,
          messages: result.messages,
          toolCalls: result.toolCalls,
          usage: result.usage,
          conversationId: result.conversationId,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await getCallbackRegistry().reject(this.payload.promptId, error);
      throw error;
    }
  }
}
