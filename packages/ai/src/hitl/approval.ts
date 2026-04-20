import type { StatefulAgent } from '../stateful/agent.js';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalDecision {
  by: string;
  decidedAt: number;
  notes?: string;
}

export interface ApprovalRequest {
  id: string;
  step: string;
  payload: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
  status: ApprovalStatus;
  decision?: ApprovalDecision;
}

export type ApprovalRoute = 'mcp' | 'email' | 'webhook' | 'channel';

export interface RequireApprovalOpts {
  timeout?: number;
  via?: ApprovalRoute;
  router?: (request: ApprovalRequest) => Promise<void> | void;
}

export class ApprovalNotFoundError extends Error {
  override readonly name = 'ApprovalNotFoundError';
  constructor(id: string) {
    super(`No approval request found for id '${id}'.`);
  }
}

export class ApprovalAlreadyDecidedError extends Error {
  override readonly name = 'ApprovalAlreadyDecidedError';
  constructor(id: string, status: ApprovalStatus) {
    super(`Approval '${id}' was already ${status}.`);
  }
}

const STORAGE_PREFIX = 'hitl:';
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

interface HitlAgentCtx {
  readonly _ctx: { storage: { put(k: string, v: unknown): Promise<void>; get<T>(k: string): Promise<T | undefined>; delete(k: string): Promise<boolean | number> | Promise<boolean>; list<T>(opts?: { prefix?: string }): Promise<Map<string, T>> } };
}

interface Waiter {
  resolve(request: ApprovalRequest): void;
  timer?: ReturnType<typeof setTimeout>;
}

const waiters = new WeakMap<StatefulAgent, Map<string, Waiter>>();

function waitersFor(agent: StatefulAgent): Map<string, Waiter> {
  let map = waiters.get(agent);
  if (!map) {
    map = new Map<string, Waiter>();
    waiters.set(agent, map);
  }
  return map;
}

/**
 * Persist an approval request, route it via the configured channel, and
 * suspend the caller until `approve()` lands or the timeout elapses. Matches
 * the CF Workflows `step.waitForSignal` shape but lives entirely in
 * StatefulAgent state so non-workflow code can use it.
 */
export async function requireApproval(
  agent: StatefulAgent,
  step: string,
  payload: Record<string, unknown>,
  opts: RequireApprovalOpts = {},
): Promise<ApprovalRequest> {
  const id = generateId();
  const createdAt = Date.now();
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
  const request: ApprovalRequest = {
    id,
    step,
    payload,
    createdAt,
    expiresAt: createdAt + timeout,
    status: 'pending',
  };
  const ctx = asHitlCtx(agent)._ctx;
  return new Promise<ApprovalRequest>((resolve) => {
    const map = waitersFor(agent);
    const timer = setTimeout(async () => {
      const stored = await ctx.storage.get<ApprovalRequest>(storageKey(id));
      if (!stored) {
        map.delete(id);
        return;
      }
      if (stored.status === 'pending') {
        stored.status = 'expired';
        await ctx.storage.put(storageKey(id), stored);
      }
      map.delete(id);
      resolve(stored);
    }, timeout);
    map.set(id, { resolve, timer });

    void (async () => {
      await ctx.storage.put(storageKey(id), request);
      if (opts.router) await opts.router(request);
    })();
  });
}

/**
 * External systems call this to resolve a pending approval. Looks up the
 * pending waiter, updates storage, and resumes the suspended `requireApproval`
 * caller.
 */
export async function approve(
  agent: StatefulAgent,
  approvalId: string,
  decision: 'approved' | 'rejected',
  by: string,
  notes?: string,
): Promise<ApprovalRequest> {
  const ctx = asHitlCtx(agent)._ctx;
  const stored = await ctx.storage.get<ApprovalRequest>(storageKey(approvalId));
  if (!stored) throw new ApprovalNotFoundError(approvalId);
  if (stored.status !== 'pending') throw new ApprovalAlreadyDecidedError(approvalId, stored.status);
  stored.status = decision;
  stored.decision = { by, decidedAt: Date.now(), notes };
  await ctx.storage.put(storageKey(approvalId), stored);
  const map = waitersFor(agent);
  const waiter = map.get(approvalId);
  if (waiter) {
    if (waiter.timer) clearTimeout(waiter.timer);
    map.delete(approvalId);
    waiter.resolve(stored);
  }
  return stored;
}

export async function getApproval(
  agent: StatefulAgent,
  approvalId: string,
): Promise<ApprovalRequest | undefined> {
  const ctx = asHitlCtx(agent)._ctx;
  return ctx.storage.get<ApprovalRequest>(storageKey(approvalId));
}

export async function listPendingApprovals(agent: StatefulAgent): Promise<ApprovalRequest[]> {
  const ctx = asHitlCtx(agent)._ctx;
  const map = await ctx.storage.list<ApprovalRequest>({ prefix: STORAGE_PREFIX });
  return Array.from(map.values()).filter((r) => r.status === 'pending');
}

function storageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `approval-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function asHitlCtx(agent: StatefulAgent): HitlAgentCtx {
  return agent as unknown as HitlAgentCtx;
}
