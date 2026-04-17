import * as React from 'react';
import { SSETransport, WebSocketTransport, type AgentTransport } from './transport.js';

/**
 * Configuration consumed by `useAgent`, `useAgentState`, `useAgentStream`.
 * Supplied once at the app root via `<RoostAgentProvider>`.
 */
export interface RoostAgentContextValue {
  endpoint: string;
  auth?: { token: string; refresh?: () => Promise<string> };
  transports: {
    sse: AgentTransport;
    websocket: AgentTransport;
  };
}

export const RoostAgentContext = React.createContext<RoostAgentContextValue | null>(null);

export interface RoostAgentProviderProps {
  endpoint: string;
  auth?: RoostAgentContextValue['auth'];
  children: React.ReactNode;
}

export function RoostAgentProvider(props: RoostAgentProviderProps): React.ReactElement {
  const value = React.useMemo<RoostAgentContextValue>(
    () => ({
      endpoint: props.endpoint,
      auth: props.auth,
      transports: {
        sse: new SSETransport(props.endpoint),
        websocket: new WebSocketTransport(props.endpoint),
      },
    }),
    [props.endpoint, props.auth],
  );
  return React.createElement(RoostAgentContext.Provider, { value }, props.children);
}

export function useRoostAgentContext(): RoostAgentContextValue {
  const ctx = React.useContext(RoostAgentContext);
  if (!ctx) {
    throw new Error('useAgent/useAgentState/useAgentStream must be used inside <RoostAgentProvider>.');
  }
  return ctx;
}