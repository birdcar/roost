import type { Agent } from '../agent.js';

type AgentCtor = new (...args: unknown[]) => Agent;

export class AgentClassNotRegisteredError extends Error {
  override readonly name = 'AgentClassNotRegisteredError';
  constructor(className: string) {
    super(
      `Agent class '${className}' is not registered. Call AgentRegistry.get().register(${className}) during app boot or pass an explicit alias.`,
    );
  }
}

/**
 * Singleton registry that maps agent class names (or explicit aliases) to
 * constructors. `PromptAgentJob.handle()` resolves the class at consumer time
 * so a serialized payload carrying `agentClass: 'SupportAgent'` re-materializes
 * the correct class even across worker boundaries.
 */
export class AgentRegistry {
  private static instance: AgentRegistry | null = null;
  private readonly entries = new Map<string, AgentCtor>();

  static get(): AgentRegistry {
    if (!this.instance) this.instance = new AgentRegistry();
    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }

  register(ctor: AgentCtor, alias?: string): void {
    const name = alias ?? (ctor as unknown as { name: string }).name;
    this.entries.set(name, ctor);
  }

  resolve(name: string): AgentCtor {
    const ctor = this.entries.get(name);
    if (!ctor) throw new AgentClassNotRegisteredError(name);
    return ctor;
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  clear(): void {
    this.entries.clear();
  }
}
