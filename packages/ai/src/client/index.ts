// Subpath entrypoint for `@roostjs/ai/client` — React hooks + transport.
export { RoostAgentProvider, RoostAgentContext, useRoostAgentContext } from './provider.js';
export type { RoostAgentContextValue, RoostAgentProviderProps } from './provider.js';

export { useAgent } from './use-agent.js';
export type { UseAgentResult, UseAgentState, UseAgentOptions, AgentStatus } from './use-agent.js';

export { useAgentStream } from './use-agent-stream.js';
export type { UseAgentStreamResult, UseAgentStreamOptions } from './use-agent-stream.js';

export { useAgentState } from './use-agent-state.js';

export { SSETransport, WebSocketTransport } from './transport.js';
export type { AgentTransport, AgentTransportOptions } from './transport.js';

export { SSR_AGENT_STATE, serverSnapshot } from './ssr.js';