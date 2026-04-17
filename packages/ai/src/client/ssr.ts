/**
 * SSR compatibility helpers for TanStack Start and other SSR frameworks. The
 * React hooks themselves are SSR-safe (they defer all network calls to
 * effects), but deterministic initial-render snapshots require a known
 * server-side shape. Consumers pass these defaults to their loader.
 */
import type { UseAgentState } from './use-agent.js';

export const SSR_AGENT_STATE: UseAgentState = {
  status: 'idle',
  text: '',
  events: [],
  error: null,
};

/** Default snapshot for `useAgentState<T>` on the server. */
export function serverSnapshot<T>(initial?: T): T | undefined {
  return initial;
}