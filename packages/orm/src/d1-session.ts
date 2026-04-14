export class D1SessionHandle {
  private sessionToken: string | undefined = undefined;
  private db: globalThis.D1Database;

  constructor(db: globalThis.D1Database) {
    this.db = db;
  }

  sessionAwareRaw(): globalThis.D1Database {
    if (this.sessionToken !== undefined) {
      try {
        const token = this.sessionToken === '__first_unconditional__' ? undefined : this.sessionToken;
        return (this.db as any).withSession(token) as globalThis.D1Database;
      } catch {
        // withSession() not available (e.g. local dev / Miniflare) — fall back to plain handle
        console.warn('[D1SessionHandle] withSession() not available on this D1 binding; falling back to plain handle.');
        return this.db;
      }
    }
    return this.db;
  }

  markWritten(token?: string): void {
    this.sessionToken = token ?? '__first_unconditional__';
  }
}
