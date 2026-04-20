import { Lab } from './enums.js';

/**
 * Per-provider "cheapest" / "smartest" model hints used by
 * `@UseCheapestModel` / `@UseSmartestModel`.
 *
 * Ship as a seed with pinned IDs. Consumers can override via
 * `AiServiceProvider` config (`ai.capabilities.{provider}`).
 */
export interface ModelHints {
  cheapestChat?: string;
  smartestChat?: string;
  cheapestEmbed?: string;
  defaultEmbed?: string;
}

const seed: Record<Lab, ModelHints> = {
  [Lab.WorkersAI]: {
    cheapestChat: '@cf/meta/llama-3.2-3b-instruct',
    smartestChat: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cheapestEmbed: '@cf/baai/bge-small-en-v1.5',
    defaultEmbed: '@cf/baai/bge-base-en-v1.5',
  },
  [Lab.Anthropic]: {
    cheapestChat: 'claude-haiku-4-5-20251001',
    smartestChat: 'claude-opus-4-7',
  },
  [Lab.OpenAI]: {
    cheapestChat: 'gpt-4o-mini',
    smartestChat: 'gpt-4o',
    cheapestEmbed: 'text-embedding-3-small',
    defaultEmbed: 'text-embedding-3-small',
  },
  [Lab.Gemini]: {
    cheapestChat: 'gemini-2.0-flash',
    smartestChat: 'gemini-2.5-pro',
    defaultEmbed: 'gemini-embedding-001',
  },
  [Lab.Gateway]: {
    // Gateway inherits the selected provider's hints at resolve time.
  },
  [Lab.Cohere]: {
    // Cohere is reranker-only in v0.3 — no chat/embed hints.
  },
  [Lab.Jina]: {
    // Jina is reranker-only in v0.3 — no chat/embed hints.
  },
};

export type ModelResolverStrategy = 'cheapest' | 'smartest';

export interface ModelResolver {
  strategy: ModelResolverStrategy;
  provider?: Lab;
}

/**
 * Resolve a concrete model name given a provider + strategy.
 * Returns `undefined` if no hint exists — callers should fall back to a default.
 */
export function resolveModel(
  provider: Lab,
  resolver: ModelResolver,
  overrides?: Partial<Record<Lab, ModelHints>>,
): string | undefined {
  const hints: ModelHints = {
    ...(seed[provider] ?? {}),
    ...(overrides?.[provider] ?? {}),
  };
  return resolver.strategy === 'cheapest' ? hints.cheapestChat : hints.smartestChat;
}

export function getCapabilityTable(overrides?: Partial<Record<Lab, ModelHints>>): Record<Lab, ModelHints> {
  const merged = { ...seed };
  if (overrides) {
    for (const [lab, hints] of Object.entries(overrides) as Array<[Lab, ModelHints]>) {
      merged[lab] = { ...seed[lab], ...hints };
    }
  }
  return merged;
}
