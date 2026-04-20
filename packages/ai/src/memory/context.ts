/**
 * Read-only context tier. Loaded once at agent init (e.g. user profile, org
 * policies) and surfaced as a frozen record. Writes throw so callers don't
 * silently mutate shared state.
 */
export class ReadonlyContextLockedError extends Error {
  override readonly name = 'ReadonlyContextLockedError';
  constructor(key: string) {
    super(`Cannot mutate readonly context key '${key}'.`);
  }
}

export class ReadonlyMemory {
  private readonly data: ReadonlyMap<string, unknown>;

  constructor(entries: Iterable<readonly [string, unknown]> = []) {
    this.data = new Map(entries);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  keys(): IterableIterator<string> {
    return this.data.keys();
  }

  toObject(): Record<string, unknown> {
    return Object.fromEntries(this.data.entries());
  }
}
