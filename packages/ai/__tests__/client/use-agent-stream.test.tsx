import { describe, it, expect } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { useAgentStream } from '../../src/client/use-agent-stream.js';
import { RoostAgentContext } from '../../src/client/provider.js';
import type { AgentTransport } from '../../src/client/transport.js';
import type { StreamEvent } from '../../src/types.js';

class StubTransport implements AgentTransport {
  constructor(private events: StreamEvent[]) {}
  async *open(_agent: string, _input: string): AsyncIterable<StreamEvent> {
    for (const e of this.events) yield e;
  }
  close(): void {}
}

function wrap(transport: AgentTransport) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      RoostAgentContext.Provider,
      {
        value: {
          endpoint: 'http://test/',
          transports: { sse: transport, websocket: transport },
          auth: undefined,
        },
      },
      children,
    );
}

describe('useAgentStream (React hook)', () => {
  it('returns EMPTY when input is null', () => {
    const transport = new StubTransport([]);
    const { result } = renderHook(() => useAgentStream('demo', null), { wrapper: wrap(transport) });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.events).toEqual([]);
  });

  it('streams events and accumulates text', async () => {
    const transport = new StubTransport([
      { type: 'text-delta', text: 'Hi, ' },
      { type: 'text-delta', text: 'world' },
      { type: 'done' },
    ]);
    const { result } = renderHook(() => useAgentStream('demo', 'greet'), { wrapper: wrap(transport) });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.text).toBe('Hi, world');
    expect(result.current.events.map((e) => e.type)).toEqual(['text-delta', 'text-delta', 'done']);
  });

  it('surfaces error events as state.error', async () => {
    const transport = new StubTransport([{ type: 'error', message: 'nope' }]);
    const { result } = renderHook(() => useAgentStream('demo', 'x'), { wrapper: wrap(transport) });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('nope');
  });
});
