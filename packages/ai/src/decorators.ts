import type { AgentConfig } from './types.js';
import type { Lab } from './enums.js';
import { registerScheduledMethod } from './stateful/scheduled-registry.js';

const configMap = new WeakMap<Function, AgentConfig>();

/** Decorator-registered `@Stateful({binding})` metadata, keyed by class. */
export interface StatefulConfig {
  binding: string;
  scriptName?: string;
  className?: string;
}

const statefulMap = new WeakMap<Function, StatefulConfig>();

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

/* ------------------------------ Phase 2: @Stateful / @Scheduled ----------------------------- */

const statefulClasses = new Set<Function>();

/**
 * Mark an agent class as requiring a Durable Object binding. Validated by
 * `AiServiceProvider.boot()` against the application config.
 *
 * @example
 *   @Stateful({ binding: 'SUPPORT_AGENT' })
 *   class SupportAgent extends StatefulAgent { ... }
 */
export function Stateful(config: StatefulConfig) {
  return (target: Function) => {
    statefulMap.set(target, config);
    statefulClasses.add(target);
  };
}

export function getStatefulConfig(target: Function): StatefulConfig | undefined {
  let current: Function | null = target;
  while (current) {
    const cfg = statefulMap.get(current);
    if (cfg) return cfg;
    current = Object.getPrototypeOf(current);
    if (!current || current === Function.prototype) break;
  }
  return undefined;
}

/** @internal — iterable view over every class decorated with `@Stateful`. */
export function _iterateStatefulClasses(): IterableIterator<Function> {
  return statefulClasses.values();
}

/**
 * Method decorator: register `method` to run on the given cron schedule. The
 * decorated method must exist on a `StatefulAgent` subclass; registration
 * is idempotent across DO restarts (the `Scheduler` dedupes by method +
 * payload + cron).
 *
 * @example
 *   class DailyDigest extends StatefulAgent {
 *     @Scheduled('0 9 * * *')
 *     async sendDigest() { ... }
 *   }
 */
export function Scheduled(cron: string) {
  return (target: object, propertyKey: string, _descriptor: PropertyDescriptor) => {
    const ctor = (target as { constructor: Function }).constructor;
    registerScheduledMethod(ctor, propertyKey, cron);
  };
}
