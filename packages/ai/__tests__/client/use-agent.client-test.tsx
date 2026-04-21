import { describe, it, expect } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import * as React from 'react';
import { useAgent } from '../../src/client/use-agent.js';
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

describe('useAgent (React hook)', () => {
  it('starts idle and transitions to streaming → done', async () => {
    const transport = new StubTransport([
      { type: 'text-delta', text: 'hello' },
      { type: 'done' },
    ]);
    const { result } = renderHook(() => useAgent('demo'), { wrapper: wrap(transport) });

    expect(result.current.state.status).toBe('idle');
    await act(async () => {
      await result.current.prompt('hi');
    });
    expect(result.current.state.text).toBe('hello');
    expect(result.current.state.status).toBe('done');
  });

  it('surfaces error events via state.error', async () => {
    const transport = new StubTransport([{ type: 'error', message: 'boom' }]);
    const { result } = renderHook(() => useAgent('demo'), { wrapper: wrap(transport) });
    await act(async () => {
      await result.current.prompt('hi');
    });
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error?.message).toBe('boom');
  });

  it('reset() clears state back to idle', async () => {
    const transport = new StubTransport([
      { type: 'text-delta', text: 'x' },
      { type: 'done' },
    ]);
    const { result } = renderHook(() => useAgent('demo'), { wrapper: wrap(transport) });
    await act(async () => {
      await result.current.prompt('hi');
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.text).toBe('');
  });
});
