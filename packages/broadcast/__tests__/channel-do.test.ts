import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { ChannelDO } from '../src/channel-do';

// Polyfill WebSocketPair for Bun test environment (Cloudflare Workers runtime API)
class MockWebSocketPairSocket {
  readyState = 1;
  sentMessages: string[] = [];
  private _attachment: unknown = undefined;
  send(data: string) { this.sentMessages.push(data); }
  close(code?: number, reason?: string) { void code; void reason; }
  serializeAttachment(): unknown { return this._attachment; }
  deserializeAttachment(data: unknown) { this._attachment = data; }
}

let origWebSocketPair: unknown;
beforeAll(() => {
  origWebSocketPair = (globalThis as Record<string, unknown>).WebSocketPair;
  (globalThis as Record<string, unknown>).WebSocketPair = class {
    0: MockWebSocketPairSocket;
    1: MockWebSocketPairSocket;
    constructor() {
      this[0] = new MockWebSocketPairSocket();
      this[1] = new MockWebSocketPairSocket();
      Object.assign(this, { 0: this[0], 1: this[1] });
    }
  };
});
afterAll(() => {
  (globalThis as Record<string, unknown>).WebSocketPair = origWebSocketPair;
});

// Mock WebSocket for testing (mirrors browser WebSocket interface)
class MockWebSocket {
  readyState = 1; // OPEN
  sentMessages: string[] = [];
  closedWith?: { code: number; reason: string };
  private _attachment: unknown = undefined;

  send(data: string) { this.sentMessages.push(data); }
  close(code?: number, reason?: string) {
    this.closedWith = { code: code ?? 1000, reason: reason ?? '' };
  }
  serializeAttachment(): unknown { return this._attachment; }
  deserializeAttachment(data: unknown) { this._attachment = data; }
}

// Mock DurableObjectState with WebSocket hibernation support
class MockDOState {
  private sockets: MockWebSocket[] = [];
  private socketTags: Map<MockWebSocket, string[]> = new Map();

  acceptWebSocket(ws: MockWebSocket, tags: string[]) {
    this.sockets.push(ws);
    this.socketTags.set(ws, tags);
  }

  getWebSockets(): MockWebSocket[] {
    return [...this.sockets];
  }

  getTags(ws: MockWebSocket): string[] {
    return this.socketTags.get(ws) ?? [];
  }
}

function makeChannelDO(state?: MockDOState) {
  const s = state ?? new MockDOState();
  const do_ = new ChannelDO(s as unknown as DurableObjectState, {});
  return { do: do_, state: s };
}

describe('ChannelDO', () => {
  test('WebSocket upgrade with type=public succeeds without Authorization header', async () => {
    const { do: channelDO } = makeChannelDO();
    const req = new Request('https://example.com/?type=public', {
      headers: { Upgrade: 'websocket' },
    });
    const resp = await channelDO.fetch(req);
    expect(resp.status).toBe(101);
  });

  test('WebSocket upgrade with type=private without Authorization returns 403', async () => {
    const { do: channelDO } = makeChannelDO();
    const req = new Request('https://example.com/?type=private', {
      headers: { Upgrade: 'websocket' },
    });
    const resp = await channelDO.fetch(req);
    expect(resp.status).toBe(403);
  });

  test('WebSocket upgrade with type=private with a valid bearer token returns 101', async () => {
    const { do: channelDO } = makeChannelDO();
    const req = new Request('https://example.com/?type=private', {
      headers: { Upgrade: 'websocket', Authorization: 'Bearer validtoken' },
    });
    const resp = await channelDO.fetch(req);
    expect(resp.status).toBe(101);
  });

  test('POST /broadcast sends the message to all connected WebSocket clients', async () => {
    const state = new MockDOState();
    const { do: channelDO } = makeChannelDO(state);

    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    state.acceptWebSocket(ws1 as unknown as WebSocket, [JSON.stringify({ userId: 'u1', joinedAt: Date.now(), channelType: 'public' })]);
    state.acceptWebSocket(ws2 as unknown as WebSocket, [JSON.stringify({ userId: 'u2', joinedAt: Date.now(), channelType: 'public' })]);

    const req = new Request('https://example.com/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'OrderCreated', data: { orderId: '1' }, type: 'public' }),
    });
    const resp = await channelDO.fetch(req);

    expect(resp.status).toBe(204);
    expect(ws1.sentMessages).toHaveLength(1);
    expect(ws2.sentMessages).toHaveLength(1);
    expect(JSON.parse(ws1.sentMessages[0])).toMatchObject({ event: 'OrderCreated', data: { orderId: '1' } });
  });

  test('POST /broadcast with zero connected clients returns 204 without error', async () => {
    const { do: channelDO } = makeChannelDO();
    const req = new Request('https://example.com/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'Ping', data: {}, type: 'public' }),
    });
    const resp = await channelDO.fetch(req);
    expect(resp.status).toBe(204);
  });

  test('webSocketMessage with event: "whisper" relays message to all clients except sender', async () => {
    const state = new MockDOState();
    const { do: channelDO } = makeChannelDO(state);

    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    state.acceptWebSocket(ws1 as unknown as WebSocket, [JSON.stringify({ userId: 'u1', joinedAt: 0, channelType: 'public' })]);
    state.acceptWebSocket(ws2 as unknown as WebSocket, [JSON.stringify({ userId: 'u2', joinedAt: 0, channelType: 'public' })]);

    await (channelDO as unknown as { webSocketMessage(ws: unknown, msg: string): Promise<void> })
      .webSocketMessage(ws1, JSON.stringify({ event: 'whisper', data: { text: 'hello' } }));

    // ws1 (sender) should NOT receive the message; ws2 should
    expect(ws1.sentMessages).toHaveLength(0);
    expect(ws2.sentMessages).toHaveLength(1);
    expect(JSON.parse(ws2.sentMessages[0])).toMatchObject({ event: 'whisper' });
  });

  test('webSocketClose on a presence channel broadcasts presence:leave to remaining clients', async () => {
    const state = new MockDOState();
    const { do: channelDO } = makeChannelDO(state);

    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    state.acceptWebSocket(ws1 as unknown as WebSocket, [JSON.stringify({ userId: 'u1', joinedAt: 0, channelType: 'presence' })]);
    state.acceptWebSocket(ws2 as unknown as WebSocket, [JSON.stringify({ userId: 'u2', joinedAt: 0, channelType: 'presence' })]);

    await (channelDO as unknown as { webSocketClose(ws: unknown, code: number, reason: string): Promise<void> })
      .webSocketClose(ws1, 1000, '');

    // ws2 should get presence:leave; ws1 (disconnecting) should not
    expect(ws2.sentMessages).toHaveLength(1);
    const msg = JSON.parse(ws2.sentMessages[0]);
    expect(msg.event).toBe('presence:leave');
    expect(msg.data.member.id).toBe('u1');
  });

  test('GET /presence returns the current member list for presence channels', async () => {
    const state = new MockDOState();
    const { do: channelDO } = makeChannelDO(state);

    const ws = new MockWebSocket();
    state.acceptWebSocket(ws as unknown as WebSocket, [JSON.stringify({ userId: 'user-1', joinedAt: 1000, channelType: 'presence' })]);

    const req = new Request('https://example.com/presence');
    const resp = await channelDO.fetch(req);
    const body = await resp.json<{ members: Array<{ id: string; joinedAt: number }> }>();

    expect(body.members).toHaveLength(1);
    expect(body.members[0].id).toBe('user-1');
    expect(body.members[0].joinedAt).toBe(1000);
  });

  test('GET /presence excludes connections without a userId in their attachment', async () => {
    const state = new MockDOState();
    const { do: channelDO } = makeChannelDO(state);

    const ws = new MockWebSocket();
    // No userId
    state.acceptWebSocket(ws as unknown as WebSocket, [JSON.stringify({ joinedAt: 0, channelType: 'public' })]);

    const req = new Request('https://example.com/presence');
    const resp = await channelDO.fetch(req);
    const body = await resp.json<{ members: unknown[] }>();

    expect(body.members).toHaveLength(0);
  });

  test('multiple clients can connect to the same DO and all receive broadcast messages', async () => {
    const state = new MockDOState();
    const { do: channelDO } = makeChannelDO(state);

    const clients = [new MockWebSocket(), new MockWebSocket(), new MockWebSocket()];
    for (const ws of clients) {
      state.acceptWebSocket(ws as unknown as WebSocket, [JSON.stringify({ joinedAt: 0, channelType: 'public' })]);
    }

    const req = new Request('https://example.com/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'TestEvent', data: { x: 1 }, type: 'public' }),
    });
    await channelDO.fetch(req);

    for (const ws of clients) {
      expect(ws.sentMessages).toHaveLength(1);
    }
  });

  test('connection metadata survives a hibernation cycle (attachment round-trip)', async () => {
    const state = new MockDOState();
    const { do: channelDO } = makeChannelDO(state);

    const req = new Request('https://example.com/?type=public&userId=user-42', {
      headers: { Upgrade: 'websocket' },
    });
    await channelDO.fetch(req);

    // After acceptWebSocket, the tags stored via state.getTags(ws) contain the serialized meta
    const sockets = state.getWebSockets() as unknown as MockWebSocket[];
    expect(sockets).toHaveLength(1);
    const tags = state.getTags(sockets[0]);
    expect(Array.isArray(tags)).toBe(true);
    const meta = JSON.parse(tags[0]);
    expect(meta.userId).toBe('user-42');
    expect(meta.channelType).toBe('public');
  });

  test('unknown route returns 404', async () => {
    const { do: channelDO } = makeChannelDO();
    const req = new Request('https://example.com/unknown');
    const resp = await channelDO.fetch(req);
    expect(resp.status).toBe(404);
  });
});
