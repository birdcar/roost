import type { HookName, HookFn } from './types.js';

const hooks = new WeakMap<Function, Map<HookName, HookFn[]>>();

export function registerHook(modelClass: Function, event: HookName, fn: HookFn): void {
  if (!hooks.has(modelClass)) {
    hooks.set(modelClass, new Map());
  }
  const map = hooks.get(modelClass)!;
  if (!map.has(event)) {
    map.set(event, []);
  }
  map.get(event)!.push(fn);
}

export async function fireHook(modelClass: Function, event: HookName, model: unknown): Promise<boolean> {
  const map = hooks.get(modelClass);
  if (!map) return true;

  const fns = map.get(event);
  if (!fns) return true;

  for (const fn of fns) {
    const result = await fn(model);
    if (result === false) return false;
  }
  return true;
}

export function clearHooks(modelClass: Function): void {
  hooks.delete(modelClass);
}
