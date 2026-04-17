import type { AgentConfig } from './types.js';
import type { Lab } from './enums.js';

const configMap = new WeakMap<Function, AgentConfig>();

function ensureConfig(target: Function): AgentConfig {
  if (!configMap.has(target)) {
    configMap.set(target, {});
  }
  return configMap.get(target)!;
}

export function getAgentConfig(target: Function): AgentConfig {
  return configMap.get(target) ?? {};
}

/**
 * Select one or more providers for an agent. When an array is given,
 * providers are tried in order for failover on transient errors.
 *
 * @example
 *   @Provider(Lab.Anthropic)
 *   class Agent1 extends Agent { ... }
 *
 *   @Provider([Lab.OpenAI, Lab.Anthropic])
 *   class Agent2 extends Agent { ... }
 */
export function Provider(provider: Lab | string | Array<Lab | string>) {
  return (target: Function) => {
    ensureConfig(target).provider = provider;
  };
}

export function Model(model: string) {
  return (target: Function) => {
    ensureConfig(target).model = model;
  };
}

export function MaxSteps(maxSteps: number) {
  return (target: Function) => {
    ensureConfig(target).maxSteps = maxSteps;
  };
}

export function MaxTokens(maxTokens: number) {
  return (target: Function) => {
    ensureConfig(target).maxTokens = maxTokens;
  };
}

export function Temperature(temperature: number) {
  return (target: Function) => {
    ensureConfig(target).temperature = temperature;
  };
}

export function Timeout(timeout: number) {
  return (target: Function) => {
    ensureConfig(target).timeout = timeout;
  };
}

/**
 * Select the provider's cheapest chat model at prompt time. Resolves via
 * the capability table; can be overridden by passing `provider` explicitly.
 */
export function UseCheapestModel(provider?: Lab | string) {
  return (target: Function) => {
    ensureConfig(target).modelResolver = { strategy: 'cheapest', provider: provider as Lab | undefined };
  };
}

/**
 * Select the provider's most capable chat model at prompt time. Resolves
 * via the capability table.
 */
export function UseSmartestModel(provider?: Lab | string) {
  return (target: Function) => {
    ensureConfig(target).modelResolver = { strategy: 'smartest', provider: provider as Lab | undefined };
  };
}
