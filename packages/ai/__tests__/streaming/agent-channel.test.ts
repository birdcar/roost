import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import type { StreamEvent } from '../../src/types.js';
import { AgentChannel } from '../../src/streaming/agent-channel.js';

class MockWebSocket {
  sentMessages: string[] = [];
  send(data: string) { this.sentMessages.push(data); }
  close() {}
}

class MockDOState {
  private sockets: MockWebSocket[] = [];
  acceptWebSocket(ws: MockWebSocket) { this.sockets.push(ws); }
  getWebSockets() { return this.sockets; }
  getTags() { return []; }
}

class TestAgentChannel extends AgentChannel {}

AgentChannel.registerPromptHandler(TestAgentChannel, async (input) =>
  (async function* (): AsyncIterable<StreamEvent> {
    yield { type: 'text-delta', text: `echo:${input}` };
    yield { type: 'done' };
  })(),
);

beforeAll(() => {
  (globalThis as Record<string, unknown>).WebSocketPair = class {
    0: MockWebSocket; 1: MockWebSocket;
    constructor() { this[0] = new MockWebSocket(); this[1] = new MockWebSocket(); }
  };
});
afterAll(() => {
  delete (globalThis as Record<string, unknown>).WebSocketPair;
});

describe('AgentChannel.webSocketMessage', () => {
  it('pipes the handler\'s stream events back over the socket', async () => {
    const state = new MockDOState();
    const channel = new TestAgentChannel(state as unknown as DurableObjectState, {});
    const ws = new MockWebSocket();
    state.acceptWebSocket(ws);

    await channel.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({ type: 'prompt', input: 'hello' }));

    expect(ws.sentMessages.map((m) => JSON.parse(m))).toEqual([
      { type: 'text-delta', text: 'echo:hello' },
      { type: 'done' },
    ]);
  });

  it('responds with an error frame when no handler is registered', async () => {
    class Unregistered extends AgentChannel {}
    const state = new MockDOState();
    const channel = new Unregistered(state as unknown as DurableObjectState, {});
    const ws = new MockWebSocket();
    state.acceptWebSocket(ws);
    await channel.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({ type: 'prompt', input: 'x' }));
    const parsed = JSON.parse(ws.sentMessages[0]) as { type: string };
    expect(parsed.type).toBe('error');
  });

  it('ignores non-prompt messages (delegates to ChannelDO super-hook)', async () => {
    const state = new MockDOState();
    const channel = new TestAgentChannel(state as unknown as DurableObjectState, {});
    const ws = new MockWebSocket();
    state.acceptWebSocket(ws);
    await channel.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({ type: 'whisper', data: {} }));
    // whisper broadcasts to others; sender gets nothing back (same ChannelDO behavior).
    expect(ws.sentMessages).toHaveLength(0);
  });
});