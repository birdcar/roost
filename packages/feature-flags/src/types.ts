export type FlagValue = boolean | number | string | Record<string, unknown>;

export interface FlagStore {
  get<T = FlagValue>(flag: string): Promise<T | null>;
  set<T = FlagValue>(flag: string, value: T): Promise<void>;
}

export interface FlagContext {
  userId?: string;
  organizationId?: string;
  [key: string]: unknown;
}

export interface FlagProvider {
  evaluate(key: string, context?: FlagContext): Promise<FlagValue>;
}

export const FLAG_CACHE_KEY: unique symbol = Symbol('roost.flagCache');
