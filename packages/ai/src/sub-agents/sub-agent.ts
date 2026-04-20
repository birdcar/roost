import { DurableObjectClient } from '@roostjs/cloudflare';
import type { StatefulAgent } from '../stateful/agent.js';
import { getStatefulConfig } from '../decorators.js';
import {
  SUB_AGENT_DEPTH_HEADER,
  SUB_AGENT_MAX_DEPTH,
  SubAgentDepthExceededError,
  SubAgentRpcError,
  type SubAgentHandle,
  type SubAgentHandleMeta,
  type SubAgentRpcEnvelope,
} from './typed-rpc.js';

export interface SubAgentInit {
  namespace?: string;
  bindingName?: string;
  maxDepth?: number;
}

export class SubAgentBindingMissingError extends Error {
  override readonly name = 'SubAgentBindingMissingError';
  constructor(agentName: string, bindingName: string) {
    super(
      `Sub-agent '${agentName}' requires a Durable Object binding '${bindingName}' — add it to your agent's env or pass init.bindingName.`,
    );
  }
}

interface StubLike {
  fetch(req: Request): Promise<Response>;
}

interface SubAgentClient {
  get(id: string): StubLike;
}

/**
 * Resolve a `DurableObjectClient`-shaped handle for the given sub-agent class.
 * Respects the `@Stateful({ binding })` decorator when present and falls back
 * to the class name as the binding key.
 */
export function resolveSubAgentClient(
  parent: StatefulAgent,
  AgentClass: new (...args: unknown[]) => StatefulAgent,
  init?: SubAgentInit,
): SubAgentClient {
  const cfg = getStatefulConfig(AgentClass);
  const bindingName = init?.bindingName ?? cfg?.binding ?? AgentClass.name.toUpperCase();
  const env = (parent as unknown as { env: Record<string, unknown> }).env;
  const binding = env?.[bindingName];
  if (!binding) throw new SubAgentBindingMissingError(AgentClass.name, bindingName);
  return new DurableObjectClient(binding as unknown as DurableObjectNamespace) as unknown as SubAgentClient;
}

/**
 * `subAgent(parent, AgentClass, init)` — spawn or address a typed sub-agent
 * handle. The returned proxy forwards public method calls over `fetch` to the
 * child DO's `/_/rpc` route. Provide `init.namespace` to pin a stable id
 * (survives DO eviction) or omit it for a fresh, uniquely-named instance.
 */
export function subAgent<A extends StatefulAgent>(
  parent: StatefulAgent,
  AgentClass: new (...args: unknown[]) => A,
  init?: SubAgentInit,
): SubAgentHandle<A> {
  const maxDepth = init?.maxDepth ?? SUB_AGENT_MAX_DEPTH;
  const client = resolveSubAgentClient(parent, AgentClass as unknown as new (...args: unknown[]) => StatefulAgent, init);
  const stubId = init?.namespace
    ? `${AgentClass.name}:${init.namespace}`
    : `${AgentClass.name}:${generateStableId()}`;
  const stub = client.get(stubId);

  const parentDepth = getParentDepth(parent);

  const sendControl = async (path: '/_/abort' | '/_/delete') => {
    const headers = new Headers();
    headers.set(SUB_AGENT_DEPTH_HEADER, String(parentDepth + 1));
    const res = await stub.fetch(
      new Request(`https://internal${path}`, { method: 'POST', headers }),
    );
    if (!res.ok) {
      throw new SubAgentRpcError(res.status, await res.text());
    }
  };

  const sendRpc = async (method: string, args: unknown[]) => {
    const depth = parentDepth + 1;
    if (depth > maxDepth) throw new SubAgentDepthExceededError(depth, maxDepth);
    const envelope: SubAgentRpcEnvelope = { v: 1, method, args };
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.set(SUB_AGENT_DEPTH_HEADER, String(depth));
    const res = await stub.fetch(
      new Request('https://internal/_/rpc', {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
      }),
    );
    if (!res.ok) {
      throw new SubAgentRpcError(res.status, await res.text(), method);
    }
    return res.json();
  };

  const meta: SubAgentHandleMeta = {
    id: stubId,
    abort: () => sendControl('/_/abort'),
    delete: () => sendControl('/_/delete'),
  };

  return new Proxy(meta as unknown as SubAgentHandle<A>, {
    get(target, prop) {
      if (prop === 'id') return meta.id;
      if (prop === 'abort') return meta.abort;
      if (prop === 'delete') return meta.delete;
      if (typeof prop !== 'string') return (target as Record<string | symbol, unknown>)[prop];
      return (...args: unknown[]) => sendRpc(prop, args);
    },
  });
}

export async function abortSubAgent<A extends StatefulAgent>(handle: SubAgentHandle<A>): Promise<void> {
  await handle.abort();
}

export async function deleteSubAgent<A extends StatefulAgent>(handle: SubAgentHandle<A>): Promise<void> {
  await handle.delete();
}

function getParentDepth(parent: StatefulAgent): number {
  const stored = (parent as unknown as { _subAgentDepth?: number })._subAgentDepth;
  return typeof stored === 'number' ? stored : 0;
}

function generateStableId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Validate that a method name is safe to call via RPC (public, no underscore). */
export function isRpcCallable(method: string): boolean {
  if (!method || method.startsWith('_')) return false;
  if (RESERVED_METHODS.has(method)) return false;
  return true;
}

const RESERVED_METHODS = new Set([
  'constructor',
  'fetch',
  'onRequest',
  'onConnect',
  'onMessage',
  'alarm',
  'webSocketMessage',
  'webSocketClose',
  'webSocketError',
]);
