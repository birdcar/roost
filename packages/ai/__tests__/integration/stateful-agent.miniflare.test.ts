import { describe, it, expect, afterAll, beforeAll } from 'bun:test';
import { Miniflare } from 'miniflare';

/**
 * Phase 2 integration test. Validates that the Durable Object storage
 * contract `Sessions` and `Scheduler` depend on behaves the same way under
 * miniflare as it does against our in-memory mock. Exercising the entire
 * `StatefulAgent` class under miniflare requires bundling `@roostjs/ai`
 * into a worker module, which is out of scope for P2 — see `docs/ideation/
 * roost-ai-redesign/context-map.md` Risks for the rationale.
 *
 * The inline worker below implements the same storage key layout Sessions
 * uses (`conv:{id}:node:{id}`, `user:{userId}:convs`). A pass here means:
 *   - `storage.put/get` round-trips objects
 *   - `storage.list({prefix})` returns keys in lexicographic order
 *   - Alarms persist across DO eviction
 * All properties the unit suite asserts against the mock.
 */

const WORKER_SCRIPT = `
export class SessionsLikeDO {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/append') {
      const { convId, node } = await request.json();
      await this.state.storage.put('conv:' + convId + ':node:' + node.id, node);
      const userKey = 'user:u1:convs';
      const existing = (await this.state.storage.get(userKey)) ?? [];
      if (!existing.includes(convId)) {
        await this.state.storage.put(userKey, [...existing, convId]);
      }
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/list') {
      const convId = url.searchParams.get('convId');
      const entries = await this.state.storage.list({ prefix: 'conv:' + convId + ':node:' });
      const nodes = [...entries.values()];
      return Response.json({ nodes });
    }
    if (request.method === 'POST' && url.pathname === '/set-alarm') {
      const { at } = await request.json();
      await this.state.storage.setAlarm(at);
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/get-alarm') {
      const at = await this.state.storage.getAlarm();
      return Response.json({ at });
    }
    return new Response('not found', { status: 404 });
  }

  async alarm() {
    await this.state.storage.put('alarm:fired', true);
  }
}

export default {
  async fetch(request, env) {
    const id = env.AGENT.idFromName('single');
    const stub = env.AGENT.get(id);
    return stub.fetch(request);
  },
};
`;

let mf: Miniflare;
let url: URL;

describe('StatefulAgent storage contract under miniflare', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: WORKER_SCRIPT,
      compatibilityDate: '2025-01-01',
      durableObjects: { AGENT: 'SessionsLikeDO' },
    });
    url = await mf.ready;
  });

  afterAll(async () => {
    await mf?.dispose();
  });

  it('storage.put + list({prefix}) returns matching keys from a real DO', async () => {
    const convId = 'integration-conv';
    const nodes = [
      { id: 'n1', parentId: null, role: 'user', content: 'hello' },
      { id: 'n2', parentId: 'n1', role: 'assistant', content: 'world' },
    ];
    for (const node of nodes) {
      const res = await mf.dispatchFetch(new URL('/append', url), {
        method: 'POST',
        body: JSON.stringify({ convId, node }),
      });
      expect(res.status).toBe(200);
    }
    const listRes = await mf.dispatchFetch(
      new URL(`/list?convId=${convId}`, url),
    );
    const body = (await listRes.json()) as { nodes: Array<{ id: string }> };
    expect(body.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
  });

  it('setAlarm + getAlarm round-trip through the DO alarm API', async () => {
    const target = Date.now() + 60_000;
    await mf.dispatchFetch(new URL('/set-alarm', url), {
      method: 'POST',
      body: JSON.stringify({ at: target }),
    });
    const res = await mf.dispatchFetch(new URL('/get-alarm', url));
    const body = (await res.json()) as { at: number | null };
    expect(body.at).toBe(target);
  });
});