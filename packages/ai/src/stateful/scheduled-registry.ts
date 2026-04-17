/**
 * Registry that powers the `@Scheduled(cron)` method decorator. Keyed by
 * constructor, so subclasses inherit their parents' scheduled methods. The
 * `StatefulAgent` base class walks this map during construction to register
 * all cron schedules.
 */
const registry = new WeakMap<Function, Map<string, string>>();

export function registerScheduledMethod(target: Function, method: string, cron: string): void {
  const existing = registry.get(target) ?? new Map<string, string>();
  existing.set(method, cron);
  registry.set(target, existing);
}

export function getScheduledMethods(target: Function): Map<string, string> {
  const result = new Map<string, string>();
  let current: Function | null = target;
  while (current) {
    const entries = registry.get(current);
    if (entries) {
      for (const [method, cron] of entries) {
        if (!result.has(method)) result.set(method, cron);
      }
    }
    current = Object.getPrototypeOf(current);
    if (!current || current === Function.prototype) break;
  }
  return result;
}