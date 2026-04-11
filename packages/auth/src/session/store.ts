import type { KVStore } from '@roost/cloudflare';
import type { SessionData } from './types.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_KEY_PREFIX = 'session:';

export class KVSessionStore {
  constructor(private kv: KVStore) {}

  async get(sessionId: string): Promise<SessionData | null> {
    return this.kv.get<SessionData>(SESSION_KEY_PREFIX + sessionId, 'json');
  }

  async put(sessionId: string, data: SessionData): Promise<void> {
    await this.kv.putJson(SESSION_KEY_PREFIX + sessionId, data, {
      expirationTtl: SESSION_TTL_SECONDS,
    });
  }

  async delete(sessionId: string): Promise<void> {
    await this.kv.delete(SESSION_KEY_PREFIX + sessionId);
  }
}
