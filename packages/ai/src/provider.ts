import { ServiceProvider } from '@roostjs/core';
import { AIClient } from '@roostjs/cloudflare';
import type { AIProvider } from './providers/interface.js';
import { WorkersAIProvider } from './providers/workers-ai.js';
import { GatewayAIProvider } from './providers/gateway.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { FailoverProvider } from './providers/failover.js';
import { ProviderRegistry } from './providers/registry.js';
import { Agent } from './agent.js';
import { Lab } from './enums.js';
import { _iterateStatefulClasses, getStatefulConfig } from './decorators.js';
import { AgentWorkflowClient } from './workflows/workflow-client.js';
import { getWorkflowRegistrations } from './workflows/workflow-method.js';
import type { McpConnectOptions } from './mcp/types.js';

export class MissingDurableObjectBindingError extends Error {
  override readonly name = 'MissingDurableObjectBindingError';
  constructor(agentName: string, binding: string) {
    super(
      `@Stateful agent '${agentName}' requires a Durable Object binding named '${binding}' — add it under 'do.bindings.${binding}' in your config or remove the @Stateful decorator.`,
    );
  }
}

/**
 * Registers every provider backend and wires the default failover chain
 * onto the base `Agent` class. Consumers override by calling
 * `SomeAgent.setProvider(provider)` or by providing an explicit
 * `@Provider([Lab.X, Lab.Y])` decorator on their agent class.
 */
export class AiServiceProvider extends ServiceProvider {
  register(): void {
    this.app.container.singleton(ProviderRegistry, () => new ProviderRegistry());

    this.app.container.singleton(WorkersAIProvider, (c) => {
      const aiBindingName = this.app.config.get('ai.binding', 'AI');
      const client = c.resolve<AIClient>(aiBindingName);
      return new WorkersAIProvider(client);
    });
  }

  boot(): void {
    const registry = this.app.container.resolve(ProviderRegistry) as ProviderRegistry;
    const workersAi = this.app.container.resolve(WorkersAIProvider) as WorkersAIProvider;
    registry.register(Lab.WorkersAI, workersAi);

    this.bootGateway(registry, workersAi);
    this.bootNativeProviders(registry);

    const chain = this.resolveDefaultChain(registry);
    Agent.setProvider(chain);

    this.validateStatefulBindings();
    this.registerWorkflowClients();
    this.registerMcpPortals();
    this.probeQueueBridge();
  }

  /**
   * Register a `WorkflowClient` factory for every `@Workflow`-decorated method
   * discovered in the registry. Each factory resolves the declared Workflow
   * binding from the app config and wraps it in `AgentWorkflowClient`.
   */
  private registerWorkflowClients(): void {
    const container = this.app.container as { has?: (key: string) => boolean; singleton: (key: string, f: (c: unknown) => unknown) => void };
    for (const [bindingName] of getWorkflowRegistrations()) {
      const key = `workflow:${bindingName}`;
      if (container.has?.(key)) continue;
      container.singleton(key, (c) => {
        const binding = (c as { resolve<T>(token: string): T }).resolve<unknown>(bindingName);
        return AgentWorkflowClient.fromBinding(binding as Workflow<unknown>);
      });
    }
  }

  /**
   * Pre-register MCP portal configuration. Users declare portals under
   * `ai.mcp.portals` in their application config; this method wires the config
   * through the container so handlers resolve it without re-reading.
   */
  private registerMcpPortals(): void {
    const portals = this.configOrNull<Array<{ prefix: string; connect: McpConnectOptions }>>('ai.mcp.portals');
    if (!portals || portals.length === 0) return;
    this.app.container.singleton('ai.mcp.portals', () => portals);
  }

  private probeQueueBridge(): void {
    // Queueing is optional. If `QueueServiceProvider` hasn't booted yet, log
    // once and continue — consumer apps that never call `agent.queue()` don't
    // need a dispatcher.
    void (async () => {
      try {
        const { Dispatcher } = await import('@roostjs/queue');
        Dispatcher.get();
      } catch {
        // Silent: consumers opting into queueing must register QueueServiceProvider first.
      }
    })();
  }

  private validateStatefulBindings(): void {
    for (const ctor of _iterateStatefulClasses()) {
      const cfg = getStatefulConfig(ctor);
      if (!cfg) continue;
      if (!this.app.config.has(`do.bindings.${cfg.binding}`)) {
        throw new MissingDurableObjectBindingError((ctor as { name: string }).name, cfg.binding);
      }
    }
  }

  private bootGateway(registry: ProviderRegistry, fallback: WorkersAIProvider): void {
    const accountId = this.configOrNull<string>('ai.gateway.accountId');
    const gatewayId = this.configOrNull<string>('ai.gateway.gatewayId');
    if (accountId && gatewayId) {
      registry.register(
        Lab.Gateway,
        new GatewayAIProvider({ accountId, gatewayId }, fallback),
      );
    } else if (accountId || gatewayId) {
      console.warn(
        '[AiServiceProvider] Both ai.gateway.accountId and ai.gateway.gatewayId are required — using direct Workers AI',
      );
    }
  }

  private bootNativeProviders(registry: ProviderRegistry): void {
    const anthropicKey = this.configOrNull<string>('ai.providers.anthropic.apiKey');
    if (anthropicKey) registry.register(Lab.Anthropic, new AnthropicProvider({ apiKey: anthropicKey }));

    const openaiKey = this.configOrNull<string>('ai.providers.openai.apiKey');
    if (openaiKey) {
      registry.register(
        Lab.OpenAI,
        new OpenAIProvider({
          apiKey: openaiKey,
          organization: this.configOrNull<string>('ai.providers.openai.organization') ?? undefined,
        }),
      );
    }

    const geminiKey = this.configOrNull<string>('ai.providers.gemini.apiKey');
    if (geminiKey) registry.register(Lab.Gemini, new GeminiProvider({ apiKey: geminiKey }));
  }

  private resolveDefaultChain(registry: ProviderRegistry): AIProvider {
    const configured = this.configOrNull<Lab | string | Array<Lab | string>>('ai.default');
    if (configured) return registry.resolveFailover(configured);
    if (registry.has(Lab.Gateway)) {
      const gateway = registry.resolve(Lab.Gateway);
      const direct = registry.resolve(Lab.WorkersAI);
      return new FailoverProvider([gateway, direct]);
    }
    return registry.resolve(Lab.WorkersAI);
  }

  private configOrNull<T>(key: string): T | null {
    return this.app.config.has(key) ? this.app.config.get<T>(key) : null;
  }
}
