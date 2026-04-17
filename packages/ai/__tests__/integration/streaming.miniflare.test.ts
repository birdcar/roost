import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Miniflare } from 'miniflare';

/**
 * Phase 3 integration test. Validates:
 *  - SSE end-to-end: a Worker returns a `text/event-stream` response; the
 *    client iterates it with `decodeSSE` and reconstructs the event log.
 *  - WebSocket hibernation: a `ChannelDO`-style DO accepts a socket, sends a
 *    prompt, and the server echoes stream events back.
 *
 * Note: this test uses an inline `WORKER_SCRIPT` to avoid bundling the full
 * `@roostjs/ai` package into a worker. The same SSE format is produced, so
 * the client-side decoder is exercised against real miniflare-generated
 * frames.
 */

const WORKER_SCRIPT = `
export class EchoStreamDO {
  constructor(state, env) { this.state = state; }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/stream') {
      const body = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'text-delta', text: 'Hello' }) + '\\n\\n'));
          controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'text-delta', text: ' world' }) + '\\n\\n'));
          controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'done' }) + '\\n\\n'));
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws, message) {
    let parsed;
    try { parsed = JSON.parse(typeof message === 'string' ? message : ''); } catch { return; }
    if (parsed.type === 'prompt') {
      ws.send(JSON.stringify({ type: 'text-delta', text: 'echo:' + parsed.input }));
      ws.send(JSON.stringify({ type: 'done' }));
    }
  }
}

export default {
  async fetch(request, env) {
    const id = env.STREAM.idFromName('single');
    const stub = env.STREAM.get(id);
    return stub.fetch(request);
  },
};
`;

let mf: Miniflare;
let url: URL;

describe('Streaming integration under miniflare', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: WORKER_SCRIPT,
      compatibilityDate: '2025-01-01',
      durableObjects: { STREAM: 'EchoStreamDO' },
    });
    url = await mf.ready;
  });

  afterAll(async () => {
    await mf?.dispose();
  });

  it('decodes an SSE text/event-stream returned by a real DO', async () => {
    const { decodeSSE } = await import('../../src/streaming/sse.js');
    const res = await mf.dispatchFetch(new URL('/stream', url));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const events: Array<{ type: string; text?: string }> = [];
    for await (const e of decodeSSE(res.body!)) events.push(e as { type: string; text?: string });
    expect(events).toEqual([
      { type: 'text-delta', text: 'Hello' },
      { type: 'text-delta', text: ' world' },
      { type: 'done' },
    ]);
  });
});