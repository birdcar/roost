import type { FlagValue } from './types.js';

export class FeatureFlagFake {
  private flags: Map<string, FlagValue>;
  private checked: Set<string> = new Set();

  constructor(flags: Record<string, FlagValue>) {
    this.flags = new Map(Object.entries(flags));
  }

  async get<T extends FlagValue>(flag: string): Promise<T | null> {
    this.recordCheck(flag);
    const value = this.flags.get(flag);
    return (value ?? null) as T | null;
  }

  async set<T extends FlagValue>(flag: string, value: T): Promise<void> {
    this.flags.set(flag, value);
  }

  recordCheck(flag: string): void {
    this.checked.add(flag);
  }

  wasChecked(flag: string): boolean {
    return this.checked.has(flag);
  }
}
