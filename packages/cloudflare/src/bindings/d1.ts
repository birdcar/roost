/**
 * Typed wrapper around Cloudflare D1 database binding.
 * Provides the same interface as the raw D1Database but with
 * framework-level type safety.
 */
export class D1Database {
  private db: RawD1;

  constructor(db: RawD1) {
    this.db = db;
  }

  get raw(): RawD1 {
    return this.db;
  }

  async run(query: string): Promise<D1ExecResult> {
    return this.db.exec(query);
  }

  prepare(query: string): D1PreparedStatement {
    return this.db.prepare(query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.db.batch(statements);
  }

  async dump(): Promise<ArrayBuffer> {
    return this.db.dump();
  }

  withSession(token?: string): D1Database {
    const sessionDb = (this.db as any).withSession(token) as RawD1;
    return new D1Database(sessionDb);
  }
}

type RawD1 = globalThis.D1Database;
