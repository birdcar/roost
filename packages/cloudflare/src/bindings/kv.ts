export interface KVPutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: unknown;
}

export interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export class KVStore<TMetadata = unknown> {
  constructor(private kv: KVNamespace) {}

  async get<T = string>(key: string, type: 'json'): Promise<T | null>;
  async get(key: string, type?: 'text'): Promise<string | null>;
  async get(key: string, type: 'text' | 'json' = 'text'): Promise<unknown> {
    if (type === 'json') {
      return this.kv.get(key, 'json');
    }
    return this.kv.get(key, 'text');
  }

  async getWithMetadata<T = string>(
    key: string,
    type: 'json'
  ): Promise<{ value: T | null; metadata: TMetadata | null }>;
  async getWithMetadata(
    key: string,
    type?: 'text'
  ): Promise<{ value: string | null; metadata: TMetadata | null }>;
  async getWithMetadata(
    key: string,
    type: 'text' | 'json' = 'text'
  ): Promise<{ value: unknown; metadata: TMetadata | null }> {
    const result = await this.kv.getWithMetadata(key, type as any);
    return { value: result.value, metadata: result.metadata as TMetadata | null };
  }

  async put(key: string, value: string | ArrayBuffer | ReadableStream, options?: KVPutOptions): Promise<void> {
    await this.kv.put(key, value as any, options);
  }

  async putJson<T>(key: string, value: T, options?: KVPutOptions): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(options?: KVListOptions): Promise<KVNamespaceListResult<TMetadata>> {
    return this.kv.list(options) as Promise<KVNamespaceListResult<TMetadata>>;
  }
}
