import type { AgentPromptOptions } from './types.js';

/**
 * The value object passed through the middleware pipeline. Middleware can
 * inspect (`.prompt`, `.options`) and transform (`.with()`) before passing
 * to `next`.
 *
 * Mirrors Laravel's `AgentPrompt` — immutable, with a mutating builder
 * `with(partial)` returning a new instance.
 */
export class AgentPrompt {
  readonly prompt: string;
  readonly options: AgentPromptOptions;
  readonly agentName: string;

  constructor(prompt: string, options: AgentPromptOptions = {}, agentName = 'anonymous') {
    this.prompt = prompt;
    this.options = options;
    this.agentName = agentName;
  }

  /** Return a new `AgentPrompt` with the given overrides merged in. */
  with(partial: { prompt?: string; options?: Partial<AgentPromptOptions>; agentName?: string }): AgentPrompt {
    return new AgentPrompt(
      partial.prompt ?? this.prompt,
      { ...this.options, ...(partial.options ?? {}) },
      partial.agentName ?? this.agentName,
    );
  }

  /** Case-insensitive substring test — useful for test assertions. */
  contains(needle: string): boolean {
    return this.prompt.toLowerCase().includes(needle.toLowerCase());
  }
}
