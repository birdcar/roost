import * as React from 'react';
import { useRoostAgentContext } from './provider.js';

/**
 * Bidirectional state-sync hook. A Phase 3 MVP: establishes a WebSocket to
 * the agent's channel, subscribes to a single JSON-serializable key, and
 * exposes a setter that round-trips through the server. The full CRDT-style
 * merge semantics land in a follow-up; for now, last-write-wins with server
 * echo confirming the new value.
 */
export function useAgentState<T>(
  agentName: string,
  key: string,
  initial?: T,
): [T | undefined, (value: T) => void] {
  const ctx = useRoostAgentContext();
  const [value, setLocal] = React.useState<T | undefined>(initial);
  const socketRef = React.useRef<WebSocket | null>(null);

  React.useEffect(() => {
    if (typeof WebSocket === 'undefined') return;
    const url = `${ctx.endpoint.replace(/\/$/, '')}/${encodeURIComponent(agentName)}/state`;
    const ws = new WebSocket(ctx.auth?.token ? `${url}?token=${encodeURIComponent(ctx.auth.token)}` : url);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', key }));
    };
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as {
          type: string;
          key?: string;
          value?: T;
        };
        if (parsed.type === 'state' && parsed.key === key) {
          setLocal(parsed.value);
        }
      } catch { /* ignore malformed frames */ }
    };

    return () => ws.close();
  }, [agentName, key, ctx]);

  const setValue = React.useCallback(
    (next: T) => {
      setLocal(next);
      socketRef.current?.send(JSON.stringify({ type: 'set-state', key, value: next }));
    },
    [key],
  );

  return [value, setValue];
}