import type { ApprovalRequest } from './approval.js';

/**
 * Minimal surface a caller needs to route an HITL request through an MCP
 * elicitation endpoint. Concrete transport is the caller's responsibility —
 * this function returns the envelope that should be POSTed to the remote
 * elicitation server.
 */
export interface McpElicitationEnvelope {
  method: 'elicitation/create';
  params: {
    approvalId: string;
    step: string;
    payload: Record<string, unknown>;
    expiresAt: number;
  };
}

export function toElicitationEnvelope(request: ApprovalRequest): McpElicitationEnvelope {
  return {
    method: 'elicitation/create',
    params: {
      approvalId: request.id,
      step: request.step,
      payload: request.payload,
      expiresAt: request.expiresAt,
    },
  };
}

/**
 * Route an approval request through an MCP elicitation endpoint. The caller
 * provides a `send` function that performs the transport — typically a fetch
 * against an MCP server's JSON-RPC endpoint.
 */
export async function routeViaMcp(
  request: ApprovalRequest,
  send: (envelope: McpElicitationEnvelope) => Promise<void>,
): Promise<void> {
  await send(toElicitationEnvelope(request));
}
