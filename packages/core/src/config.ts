export class ConfigManager {
  private data: Record<string, unknown>;

  constructor(config?: Record<string, unknown>) {
    this.data = config ?? {};
  }

  get<T>(key: string, defaultValue?: T): T {
    const value = this.resolvePath(key);
    if (value === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      throw new ConfigKeyNotFoundError(key);
    }
    return value as T;
  }

  set(key: string, value: unknown): void {
    const parts = key.split('.');
    let current: Record<string, unknown> = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  has(key: string): boolean {
    return this.resolvePath(key) !== undefined;
  }

  mergeEnv(env: Record<string, string | undefined>): void {
    for (const [envKey, envValue] of Object.entries(env)) {
      if (envValue === undefined) continue;
      const configKey = envKey.toLowerCase().replace(/_/g, '.');
      if (this.has(configKey)) {
        this.set(configKey, envValue);
      }
    }
  }

  private resolvePath(key: string): unknown {
    const parts = key.split('.');
    let current: unknown = this.data;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}

export class ConfigKeyNotFoundError extends Error {
  constructor(key: string) {
    super(`Configuration key "${key}" not found and no default value provided.`);
    this.name = 'ConfigKeyNotFoundError';
  }
}
