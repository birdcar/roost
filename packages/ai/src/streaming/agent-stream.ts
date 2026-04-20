import type { Tool, ProviderTool } from '../tool.js';
import type {
  AgentConfig,
  AgentMessage,
  AgentPromptOptions,
  ProviderOptions,
  StreamEvent,
} from '../types.js';
import type { AIProvider } from '../providers/interface.js';
import type { Lab } from '../enums.js';
import type { AgentPrompt } from '../prompt.js';
import { resolveModel } from '../capability-table.js';
import { toolToProviderTool, partitionTools } from '../tool.js';
import { hasTools, hasProviderOptions, isConversational } from '../contracts.js';
import { dispatchEvent, StreamingAgent } from '../events.js';

export class StreamingUnsupportedError extends Error {
  override readonly name = 'StreamingUnsupportedError';
  constructor(providerName: string) {
    super(`Provider '${providerName}' does not support streaming.`);
  }
}

export interface AgentStreamInput {
  agent: unknown;
  agentName: string;
  prompt: AgentPrompt;
  config: AgentConfig;
  provider: AIProvider;
  priorMessages?: AgentMessage[];
}

/**
 * Build the async-iterable source of `StreamEvent`s for a single agent
 * prompt. Dispatches `StreamingAgent` before the first event, pumps events
 * through from the provider, and propagates errors as `error` events.
 */
export async function* buildAgentStream(input: AgentStreamInput): AsyncIterable<StreamEvent> {
  const { agent, agentName, prompt, config, provider } = input;
  if (typeof provider.stream !== 'function') {
    yield { type: 'error', message: `Provider '${provider.name}' does not support streaming.` };
    yield { type: 'done' };
    return;
  }

  await dispatchEvent(StreamingAgent, new StreamingAgent(agentName, prompt));

  const model = resolveModelName(config, provider);
  const priorMessages = input.priorMessages ?? (await resolveConversationalMessages(agent));
  const messages: AgentMessage[] = [
    { role: 'system', content: instructionsOf(agent) },
    ...priorMessages,
    { role: 'user', content: prompt.prompt },
  ];

  const allTools: Array<Tool | ProviderTool> = hasTools(agent) ? agent.tools() : [];
  const { userTools, providerTools: nativeProviderTools } = partitionTools(allTools);
  const encodedTools = userTools.map(toolToProviderTool);
  const providerOptions = collectProviderOptions(agent, provider, prompt.options);

  try {
    yield* provider.stream({
      model,
      messages,
      tools: encodedTools.length > 0 ? encodedTools : undefined,
      providerTools: nativeProviderTools.length > 0 ? nativeProviderTools : undefined,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      providerOptions,
      attachments: prompt.options.attachments,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'error', message: msg };
    yield { type: 'done' };
  }
}

function instructionsOf(agent: unknown): string {
  return typeof (agent as { instructions?: () => string }).instructions === 'function'
    ? (agent as { instructions: () => string }).instructions()
    : '';
}

async function resolveConversationalMessages(agent: unknown): Promise<AgentMessage[]> {
  if (!isConversational(agent)) return [];
  const iter = await agent.messages();
  return Array.from(iter);
}

function collectProviderOptions(
  agent: unknown,
  provider: AIProvider,
  options: AgentPromptOptions,
): ProviderOptions {
  const contractOptions = hasProviderOptions(agent) ? agent.providerOptions(provider.name) : {};
  return { ...contractOptions, ...(options.providerOptions ?? {}) };
}

function resolveModelName(config: AgentConfig, provider: AIProvider): string {
  if (config.model) return config.model;
  if (config.modelResolver) {
    const resolved = resolveModel(provider.name as Lab, config.modelResolver);
    if (resolved) return resolved;
  }
  const caps = provider.capabilities();
  return caps.smartestChat ?? caps.cheapestChat ?? '@cf/meta/llama-3.1-8b-instruct';
}