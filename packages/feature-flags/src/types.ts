export type FlagValue = boolean | number | string | Record<string, unknown>;

export interface FlagStore {
  get<T = FlagValue>(flag: string): Promise<T | null>;
  set<T = FlagValue>(flag: string, value: T): Promise<void>;
}

export const FLAG_CACHE_KEY: unique symbol = Symbol('roost.flagCache');
