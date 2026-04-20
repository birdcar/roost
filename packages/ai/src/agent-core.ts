import type { Tool, ProviderTool } from './tool.js';
import type {
  AgentConfig,
  AgentMessage,
  AgentPromptOptions,
  ProviderOptions,
  ToolCall,
  ToolResult,
} from './types.js';
import type { AgentResponse } from './responses/agent-response.js';
import type { AIProvider } from './providers/interface.js';
import type { Lab } from './enums.js';
import type { AgentPrompt } from './prompt.js';
import { resolveModel } from './capability-table.js';
import { createToolRequest, toolToProviderTool, resolveToolName, partitionTools } from './tool.js';
import { StructuredAgentResponse } from './responses/agent-response.js';
import { dispatchEvent, InvokingTool, ToolInvoked, MaxStepsExhausted } from './events.js';
import { hasTools, hasStructuredOutput, hasProviderOptions } from './contracts.js';

/**
 * Core execution path shared by `Agent` and `StatefulAgent`. Runs the tool
 * loop, wraps structured output, and dispatches `MaxStepsExhausted`. The
 * callers supply the agent instance (for contract detection), name, and
 * resolved messages — everything else is computed here.
 */
export interface AgentCoreInput {
  agent: unknown;
  agentName: string;
  prompt: AgentPrompt;
  config: AgentConfig;
  provider: AIProvider;
  priorMessages: AgentMessage[];
}

export async function runAgentCore(input: AgentCoreInput): Promise<AgentResponse> {
  const { agent, agentName, prompt, config, provider, priorMessages } = input;
  const model = resolveModelName(config, provider);

  const instructions = typeof (agent as { instructions?: () => string }).instructions === 'function'
    ? (agent as { instructions: () => string }).instructions()
    : '';

  const messages: AgentMessage[] = [
    { role: 'system', content: instructions },
    ...priorMessages,
    { role: 'user', content: prompt.prompt },
  ];

  const allTools: Array<Tool | ProviderTool> = hasTools(agent) ? agent.tools() : [];
  const { userTools, providerTools: nativeProviderTools } = partitionTools(allTools);
  const encodedTools = userTools.map(toolToProviderTool);
  const providerOptions = collectProviderOptions(agent, provider, prompt.options);

  const maxSteps = config.maxSteps ?? 5;
  let currentMessages: AgentMessage[] = [...messages];
  let lastResponse = '';
  let lastUsage: AgentResponse['usage'];
  let step = 0;

  for (step = 0; step < maxSteps; step++) {
    const response = await provider.chat({
      model,
      messages: currentMessages,
      tools: encodedTools.length > 0 ? encodedTools : undefined,
      providerTools: nativeProviderTools.length > 0 ? nativeProviderTools : undefined,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      providerOptions,
      attachments: step === 0 ? prompt.options.attachments : undefined,
    });

    lastResponse = response.text;
    if (response.usage) lastUsage = response.usage;

    if (response.toolCalls.length === 0) break;

    currentMessages.push({ role: 'assistant', content: response.text });
    await runToolCalls(userTools, response.toolCalls, currentMessages);
  }

  if (step >= maxSteps) {
    await dispatchEvent(MaxStepsExhausted, new MaxStepsExhausted(agentName, maxSteps));
  }

  const base: AgentResponse = {
    text: lastResponse,
    messages: currentMessages,
    toolCalls: [],
    usage: lastUsage,
  };

  if (hasStructuredOutput(agent)) {
    try {
      const data = JSON.parse(base.text || '{}') as Record<string, unknown>;
      return new StructuredAgentResponse(base, data);
    } catch {
      return base;
    }
  }
  return base;
}

async function runToolCalls(
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