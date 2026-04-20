import type { StatefulAgent } from '../stateful/agent.js';

/**
 * Extract the public methods of an agent class for typed sub-agent RPC. Filters
 * out internal/protected fields (starting with `_`), non-function members, and
 * the base-class housekeeping the DO surface exposes.
 */
export type PublicMethodsOf<A> = {
  [K in keyof A]: K extends string
    ? K extends `_${string}`
      ? never
      : A[K] extends (...args: unknown[]) => unknown
        ? K
        : never
    : never;
}[keyof A];

/**
 * Envelope carried by sub-agent RPC requests.  Versioned so future schema
 * changes can coexist with older peers without hard breaks.
 */
export interface SubAgentRpcEnvelope<TMethod extends string = string> {
  v: 1;
  method: TMethod;
  args: unknown[];
}

export interface SubAgentHandleMeta {
  readonly id: string;
  abort(): Promise<void>;
  delete(): Promise<void>;
}

export type SubAgentHandle<A extends StatefulAgent> = SubAgentHandleMeta & {
  [K in PublicMethodsOf<A>]: A[K] extends (...args: infer P) => infer R
    ? (...args: P) => R extends Promise<unknown> ? R : Promise<Awaited<R>>
    : never;
};

export class SubAgentRpcError extends Error {
  override readonly name = 'SubAgentRpcError';
  constructor(status: number, body: string, methodName?: string) {
    super(
      methodName
        ? `Sub-agent RPC '${methodName}' failed (${status}): ${body}`
        : `Sub-agent RPC failed (${status}): ${body}`,
    );
  }
}

export class SubAgentMethodNotFoundError extends Error {
  override readonly name = 'SubAgentMethodNotFoundError';
  constructor(agentName: string, methodName: string) {
    super(`Sub-agent '${agentName}' has no method '${methodName}' (or it is not public).`);
  }
}

export class SubAgentDepthExceededError extends Error {
  override readonly name = 'SubAgentDepthExceededError';
  constructor(depth: number, max: number) {
    super(`Sub-agent spawn depth (${depth}) exceeded configured maximum (${max}).`);
  }
}

export const SUB_AGENT_DEPTH_HEADER = 'x-roost-sub-agent-depth';
export const SUB_AGENT_MAX_DEPTH = 5;
