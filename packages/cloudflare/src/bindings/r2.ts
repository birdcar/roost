export class R2Storage {
  constructor(private bucket: R2Bucket) {}

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: R2PutOptions
  ): Promise<R2Object | null> {
    return this.bucket.put(key, value, options);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key);
  }

  async delete(keys: string | string[]): Promise<void> {
    await this.bucket.delete(keys);
  }

  async list(options?: R2ListOptions): Promise<R2Objects> {
    return this.bucket.list(options);
  }

  async head(key: string): Promise<R2Object | null> {
    return this.bucket.head(key);
  }
}
