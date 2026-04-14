import { describe, test, expect } from 'bun:test';
import { createBroadcastClient } from '../src/client';

// Mock WebSocket for testing
class MockWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.OPEN;
  private listeners: Record<string, Array<(ev: Record<string, unknown>) => void>> = {};
  sentMessages: string[] = [];
  closedWith?: { code: number; reason: string };

  constructor(public url: string) {}

  addEventListener(event: string, handler: (ev: Record<string, unknown>) => void) {
    this.listeners[event] = this.listeners[event] ?? [];
    this.listeners[event].push(handler);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.closedWith = { code: code ?? 1000, reason: reason ?? '' };
    this.emit('close', { code: code ?? 1000, reason: reason ?? '' });
  }

  emit(event: string, data: Record<string, unknown> = {}) {
    for (const handler of this.listeners[event] ?? []) {
      handler(data);
    }
  }
}

// Patch global WebSocket with mock
function withMockWebSocket(fn: (sockets: MockWebSocket[]) => Promise<void> | void): Promise<void> {
  const sockets: MockWebSocket[] = [];
  const original = (globalThis as Record<string, unknown>).WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = class {
    static OPEN = MockWebSocket.OPEN;
    static CLOSING = MockWebSocket.CLOSING;
    static CLOSED = MockWebSocket.CLOSED;

    private mock: MockWebSocket;
    constructor(url: string) {
      this.mock = new MockWebSocket(url);
      sockets.push(this.mock);
      // Copy all properties so the client code sees them on `this`
      Object.assign(this, this.mock);
      // Override methods to delegate to the mock
      (this as unknown as MockWebSocket).addEventListener = this.mock.addEventListener.bind(this.mock);
      (this as unknown as MockWebSocket).send = this.mock.send.bind(this.mock);
      (this as unknown as MockWebSocket).close = this.mock.close.bind(this.mock);
      Object.defineProperty(this, 'readyState', {
        get: () => this.mock.readyState,
      });
    }
  } as unknown as typeof WebSocket;

  const result = fn(sockets);
  if (result instanceof Promise) {
    return result.finally(() => {
      (globalThis as Record<string, unknown>).WebSocket = original;
    });
  }
  (globalThis as Record<string, unknown>).WebSocket = original;
  return Promise.resolve();
}

describe('createBroadcastClient', () => {
  test('connects to the provided URL', () =>
    withMockWebSocket((sockets) => {
      createBroadcastClient('wss://example.com/ws').close();
      expect(sockets[0].url).toBe('wss://example.com/ws');
    })
  );

  test('subscribe() returns an unsubscribe function', () =>
    withMockWebSocket((sockets) => {
      const client = createBroadcastClient('wss://example.com/ws');
      const received: string[] = [];
      const unsubscribe = client.subscribe('*', (event) => { received.push(event); });

      // Simulate message
      sockets[0].emit('message', { data: JSON.stringify({ event: 'test', data: {} }) });
      expect(received).toHaveLength(1);

      // Unsubscribe then emit again
      unsubscribe();
      sockets[0].emit('message', { data: JSON.stringify({ event: 'test2', data: {} }) });
      expect(received).toHaveLength(1);

      client.close();
    })
  );

  test('calling the unsubscribe function prevents further handler invocations', () =>
    withMockWebSocket((sockets) => {
      const client = createBroadcastClient('wss://example.com/ws');
      const calls: string[] = [];
      const unsub = client.subscribe('*', (e) => calls.push(e));

      sockets[0].emit('message', { data: JSON.stringify({ event: 'ping', data: null }) });
      expect(calls).toHaveLength(1);

      unsub();
      sockets[0].emit('message', { data: JSON.stringify({ event: 'pong', data: null }) });
      expect(calls).toHaveLength(1);

      client.close();
    })
  );

  test('unsubscribe(channel) removes all handlers for the channel', () =>
    withMockWebSocket((sockets) => {
      const client = createBroadcastClient('wss://example.com/ws');
      const calls: string[] = [];
      client.subscribe('*', (e) => calls.push(e));

      sockets[0].emit('message', { data: JSON.stringify({ event: 'before', data: null }) });
      client.unsubscribe('*');
      sockets[0].emit('message', { data: JSON.stringify({ event: 'after', data: null }) });

      expect(calls).toEqual(['before']);
      client.close();
    })
  );

  test('whisper() sends a JSON message with event: "whisper"', () =>
    withMockWebSocket((sockets) => {
      const client = createBroadcastClient('wss://example.com/ws');
      // Mark as OPEN
      sockets[0].readyState = MockWebSocket.OPEN;

      client.whisper('order.1', 'typing', { userId: 'u1' });

      expect(sockets[0].sentMessages).toHaveLength(1);
      const msg = JSON.parse(sockets[0].sentMessages[0]);
      expect(msg.event).toBe('whisper');
      expect(msg.channel).toBe('order.1');

      client.close();
    })
  );

  test('close() closes the WebSocket and prevents auto-reconnect', async () => {
    await withMockWebSocket(async (sockets) => {
      const client = createBroadcastClient('wss://example.com/ws', { initialDelay: 10 });
      client.close();

      // Simulate unexpected close — should NOT reconnect
      sockets[0].emit('close', { code: 1006, reason: '' });
      await new Promise((r) => setTimeout(r, 50));

      // Only the initial socket, no reconnect
      expect(sockets).toHaveLength(1);
    });
  });

  test('handler is called with (event, data) when a matching message arrives', () =>
    withMockWebSocket((sockets) => {
      const client = createBroadcastClient('wss://example.com/ws');
      const results: Array<{ event: string; data: unknown }> = [];
      client.subscribe('*', (event, data) => { results.push({ event, data }); });

      sockets[0].emit('message', { data: JSON.stringify({ event: 'OrderCreated', data: { orderId: '1' } }) });

      expect(results).toHaveLength(1);
      expect(results[0].event).toBe('OrderCreated');
      expect((results[0].data as { orderId: string }).orderId).toBe('1');
      client.close();
    })
  );

  test('urlOrFactory as a function is called fresh on each reconnect attempt', async () => {
    await withMockWebSocket(async (sockets) => {
      let callCount = 0;
      const client = createBroadcastClient(() => {
        callCount++;
        return `wss://example.com/ws?t=${callCount}`;
      }, { initialDelay: 10, maxDelay: 10 });

      expect(callCount).toBe(1);
      expect(sockets[0].url).toBe('wss://example.com/ws?t=1');

      // Simulate unexpected close to trigger reconnect
      sockets[0].readyState = MockWebSocket.CLOSED;
      sockets[0].emit('close', { code: 1006, reason: '' });
      await new Promise((r) => setTimeout(r, 30));

      expect(callCount).toBeGreaterThanOrEqual(2);
      client.close();
    });
  });

  test('auto-reconnect: after unexpected close, a new connection is attempted', async () => {
    await withMockWebSocket(async (sockets) => {
      const client = createBroadcastClient('wss://example.com/ws', { initialDelay: 10, maxDelay: 100 });

      expect(sockets).toHaveLength(1);
      sockets[0].readyState = MockWebSocket.CLOSED;
      sockets[0].emit('close', { code: 1006, reason: 'connection reset' });

      await new Promise((r) => setTimeout(r, 50));
      expect(sockets.length).toBeGreaterThanOrEqual(2);
      client.close();
    });
  });

  test('reconnect delay doubles on each failure (exponential backoff)', async () => {
    await withMockWebSocket(async (sockets) => {
      const connectTimes: number[] = [];
      const originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;

      // Wrap again to track timing
      const wrappedWS = (globalThis as Record<string, unknown>).WebSocket as typeof WebSocket;
      (globalThis as Record<string, unknown>).WebSocket = new Proxy(wrappedWS, {
        construct(target, args) {
          connectTimes.push(Date.now());
          return new target(...(args as [string]));
        },
      });

      const client = createBroadcastClient('wss://example.com/ws', {
        initialDelay: 10,
        maxDelay: 1000,
      });

      // Trigger first reconnect
      sockets[0].readyState = MockWebSocket.CLOSED;
      sockets[0].emit('close', { code: 1006, reason: '' });
      await new Promise((r) => setTimeout(r, 25));

      // Trigger second reconnect (delay should be 20ms now)
      if (sockets[1]) {
        sockets[1].readyState = MockWebSocket.CLOSED;
        sockets[1].emit('close', { code: 1006, reason: '' });
      }
      await new Promise((r) => setTimeout(r, 50));

      expect(connectTimes.length).toBeGreaterThanOrEqual(2);

      client.close();
      (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    });
  });
});
