import * as React from 'react';
import type { StreamEvent } from '../types.js';
import { useRoostAgentContext } from './provider.js';

export interface UseAgentStreamResult {
  events: StreamEvent[];
  isStreaming: boolean;
  error: Error | null;
  text: string;
}

export interface UseAgentStreamOptions {
  transport?: 'sse' | 'websocket';
  auth?: { token: string };
  /** Cap the retained event buffer. Default 10000 — older events drop off the front. */
  maxEvents?: number;
}

const EMPTY: UseAgentStreamResult = { events: [], isStreaming: false, error: null, text: '' };

/**
 * One-shot streaming hook. When `input` transitions from `null` → string, the
 * hook opens the agent stream and appends events as they arrive. Re-fires
 * when `input` changes (identity-based, so memoize if input is computed).
 */
export function useAgentStream(
  agentName: string,
  input: string | null,
  opts: UseAgentStreamOptions = {},
): UseAgentStreamResult {
  const ctx = useRoostAgentContext();
  const [result, setResult] = React.useState<UseAgentStreamResult>(EMPTY);
  const maxEvents = opts.maxEvents ?? 10_000;

  React.useEffect(() => {
    if (input === null) {
      setResult(EMPTY);
      return;
    }
    const controller = new AbortController();
    const transport = opts.transport === 'websocket' ? ctx.transports.websocket : ctx.transports.sse;
    setResult({ events: [], isStreaming: true, error: null, text: '' });

    (async () => {
      try {
        for await (const event of transport.open(agentName, input, {
          signal: controller.signal,
          auth: opts.auth ?? ctx.auth,
        })) {
          if (controller.signal.aborted) return;
          setResult((prev) => {
            const events = prev.events.length >= maxEvents
              ? [...prev.events.slice(-(maxEvents - 1)), event]
              : [...prev.events, event];
            let text = prev.text;
            if (event.type === 'text-delta') text += event.text;
            if (event.type === 'error') {
              return { events, isStreaming: false, error: new Error(event.message), text };
            }
            if (event.type === 'done') {
              return { events, isStreaming: false, error: null, text };
            }
            return { events, isStreaming: true, error: null, text };
          });
        }
        setResult((prev) => (prev.isStreaming ? { ...prev, isStreaming: false } : prev));
      } catch (err) {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setResult((prev) => ({ ...prev, isStreaming: false, error }));
      }
    })();

    return () => controller.abort();
  }, [agentName, input, ctx, opts.transport, opts.auth, maxEvents]);

  return result;
}