import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The "current agent" context accessible from tool handlers, middleware, and
 * subroutines invoked inside `StatefulAgent.prompt()` / `onRequest()`. Shape
 * mirrors the CF Agents SDK's `getCurrentAgent()` return so future migration
 * to direct re-export stays a rename.
 */
export interface AgentContextSlot<A = unknown> {
  agent: A | undefined;
  connection: unknown | undefined;
  request: Request | undefined;
  email: unknown | undefined;
}

const als = new AsyncLocalStorage<AgentContextSlot<unknown>>();

/**
 * Run `fn` with `slot` as the current agent context. Returns the result of
 * `fn`. Nested calls see the innermost slot.
 */
export function runInAgentContext<A, T>(
  slot: Partial<AgentContextSlot<A>>,
  fn: () => Promise<T>,
): Promise<T> {
  const full: AgentContextSlot<A> = {
    agent: slot.agent,
    connection: slot.connection,
    request: slot.request,
    email: slot.email,
  };
  return als.run(full as AgentContextSlot<unknown>, fn);
}

/**
 * Access the agent instance + request/connection/email associated with the
 * currently running task. Returns empty slots when called outside an agent
 * context (e.g. during service-provider boot).
 */
export function getCurrentAgent<A = unknown>(): AgentContextSlot<A> {
  const slot = als.getStore();
  if (!slot) return { agent: undefined, connection: undefined, request: undefined, email: undefined };
  return slot as AgentContextSlot<A>;
}