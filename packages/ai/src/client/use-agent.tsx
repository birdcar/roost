import * as React from 'react';
import type { StreamEvent } from '../types.js';
import { useRoostAgentContext } from './provider.js';

export type AgentStatus = 'idle' | 'streaming' | 'error' | 'done';

export interface UseAgentState {
  status: AgentStatus;
  text: string;
  events: StreamEvent[];
  error: Error | null;
}

export interface UseAgentResult {
  state: UseAgentState;
  prompt: (input: string) => Promise<void>;
  reset: () => void;
  connected: boolean;
}

const IDLE_STATE: UseAgentState = { status: 'idle', text: '', events: [], error: null };

export interface UseAgentOptions {
  transport?: 'sse' | 'websocket';
  auth?: { token: string };
}

export function useAgent(agentName: string, opts: UseAgentOptions = {}): UseAgentResult {
  const ctx = useRoostAgentContext();
  const [state, setState] = React.useState<UseAgentState>(IDLE_STATE);
  const abortRef = React.useRef<AbortController | null>(null);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE_STATE);
  }, []);

  const prompt = React.useCallback(
    async (input: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ status: 'streaming', text: '', events: [], error: null });

      const transport = opts.transport === 'websocket' ? ctx.transports.websocket : ctx.transports.sse;
      try {
        for await (const event of transport.open(agentName, input, {
          signal: controller.signal,
          auth: opts.auth ?? ctx.auth,
        })) {
          if (controller.signal.aborted) return;
          setState((prev) => {
            const events = [...prev.events, event];
            if (event.type === 'text-delta') return { ...prev, events, text: prev.text + event.text };
            if (event.type === 'error') return { ...prev, events, status: 'error', error: new Error(event.message) };
            if (event.type === 'done') return { ...prev, events, status: 'done' };
            return { ...prev, events };
          });
        }
        setState((prev) => (prev.status === 'streaming' ? { ...prev, status: 'done' } : prev));
      } catch (err) {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, status: 'error', error }));
      }
    },
    [agentName, ctx, opts.transport, opts.auth],
  );

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return {
    state,
    prompt,
    reset,
    connected: state.status === 'streaming' || state.status === 'done',
  };
}