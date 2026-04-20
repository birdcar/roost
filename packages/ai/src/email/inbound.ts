import type { StatefulAgent } from '../stateful/agent.js';

export interface ForwardedEmail {
  from: string;
  to: string;
  subject: string;
  raw: ReadableStream<Uint8Array> | string;
  headers?: Record<string, string>;
}

export interface InboundEmailContract {
  onEmail(message: ForwardedEmail): Promise<void> | void;
}

export interface AgentFactory<A extends StatefulAgent> {
  (): A | Promise<A>;
}

/**
 * Create a Workers-compatible inbound email handler that routes a
 * `ForwardedEmail` to the agent's `onEmail()` method. Agents that do not
 * implement `onEmail` are rejected at construction time.
 */
export function createEmailHandler<A extends StatefulAgent>(
  factory: AgentFactory<A>,
): (message: ForwardedEmail) => Promise<void> {
  return async (message: ForwardedEmail) => {
    const agent = await factory();
    if (!('onEmail' in agent) || typeof (agent as unknown as InboundEmailContract).onEmail !== 'function') {
      throw new Error(`Agent '${agent.constructor.name}' does not implement onEmail().`);
    }
    await (agent as unknown as InboundEmailContract).onEmail(message);
  };
}

export function hasEmailInbound(agent: unknown): agent is InboundEmailContract {
  return (
    !!agent &&
    typeof agent === 'object' &&
    typeof (agent as InboundEmailContract).onEmail === 'function'
  );
}
