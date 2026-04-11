import type { AgentConfig } from './types.js';

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

export function Provider(provider: string) {
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
