import type {
  CompactionStrategy,
  ConversationId,
  ConversationSummary,
  SessionBranch,
  SessionNode,
} from '../types.js';
import { dispatchEvent, ConversationCompacted } from '../events.js';

/**
 * Minimal subset of `DurableObjectStorage` that `Sessions` depends on. Both
 * the real CF runtime and `MockDurableObjectStorage` satisfy it.
 */
export interface SessionsStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  put<T = unknown>(entries: Record<string, T>): Promise<void>;
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  list<T = unknown>(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, T>>;
}

interface SessionsStateLike {
  readonly storage: SessionsStorage;
}

/** Data stored under `conv:{id}`. */
interface ConversationRecord {
  id: ConversationId;
  userId?: string;
  createdAt: number;
  rootNodeId: string | null;
  tipNodeId: string | null;
  messageCount: number;
}

export class ConversationNotFoundError extends Error {
  override readonly name = 'ConversationNotFoundError';
  constructor(conversationId: string) {
    super(`Conversation '${conversationId}' not found`);
  }
}

export class StorageQuotaExceededError extends Error {
  override readonly name = 'StorageQuotaExceededError';
  constructor(conversationId: string, tokenCount: number) {
    super(
      `Conversation '${conversationId}' exceeded the compaction token budget (${tokenCount}) even after automatic compaction`,
    );
  }
}

const FTS_MIN_TOKEN_LENGTH = 2;
const PREVIEW_MAX_CHARS = 140;
const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'his']);

/**
 * Sessions — tree-structured, Roost-native conversation store backed by
 * Durable Object storage. Persists via the following key layout:
 *
 * ```
 * conv:{id}                    → ConversationRecord
 * conv:{id}:node:{nodeId}      → SessionNode
 * conv:{id}:children:{nodeId}  → string[] (child node ids)
 * conv:{id}:fts:{term}         → string[] (node ids containing the term)
 * user:{userId}:convs          → ConversationId[]
 * ```
 */
export class Sessions {
  constructor(private readonly state: SessionsStateLike) {}

  async create(opts: { userId?: string } = {}): Promise<ConversationId> {
    const id = newId('conv');
    const record: ConversationRecord = {
      id,
      userId: opts.userId,
      createdAt: Date.now(),
      rootNodeId: null,
      tipNodeId: null,
      messageCount: 0,
    };
    await this.state.storage.put(convKey(id), record);
    if (opts.userId) await this.appendUserConv(opts.userId, id);
    return id;
  }

  async append(
    conversationId: ConversationId,
    node: Omit<SessionNode, 'id' | 'createdAt'>,
  ): Promise<SessionNode> {
    const record = await this.requireRecord(conversationId);
    const parentId = node.parentId ?? record.tipNodeId ?? null;
    const full: SessionNode = {
      id: newId('node'),
      parentId,
      role: node.role,
      content: node.content,
      metadata: node.metadata,
      createdAt: Date.now(),
    };

    await this.state.storage.put(nodeKey(conversationId, full.id), full);

    if (parentId) {
      const childKey = childrenKey(conversationId, parentId);
      const existing = (await this.state.storage.get<string[]>(childKey)) ?? [];
      await this.state.storage.put(childKey, [...existing, full.id]);
    }

    record.messageCount += 1;
    if (!record.rootNodeId) record.rootNodeId = full.id;
    record.tipNodeId = full.id;
    await this.state.storage.put(convKey(conversationId), record);

    await this.indexForFts(conversationId, full);
    return full;
  }

  async branch(conversationId: ConversationId, fromNodeId: string): Promise<SessionBranch> {
    const source = await this.requireRecord(conversationId);
    const fromNode = await this.state.storage.get<SessionNode>(
      nodeKey(conversationId, fromNodeId),
    );
    if (!fromNode) throw new ConversationNotFoundError(`${conversationId}#${fromNodeId}`);

    // Copy the linear path from root → fromNodeId into the branch's namespace
    // so the branch is a self-contained conversation. Nodes are re-identified
    // to avoid cross-conversation key collisions (FTS index is scoped per conv).
    const path = await this.history(conversationId, fromNodeId);
    const branchId = await this.create({ userId: source.userId });

    let previousId: string | null = null;
    for (const original of path) {
      const copy: SessionNode = {
        ...original,
        id: newId('node'),
        parentId: previousId,
      };
      await this.state.storage.put(nodeKey(branchId, copy.id), copy);
      if (previousId) {
        const childKey = childrenKey(branchId, previousId);
        const existing = (await this.state.storage.get<string[]>(childKey)) ?? [];
        await this.state.storage.put(childKey, [...existing, copy.id]);
      }
      await this.indexForFts(branchId, copy);
      previousId = copy.id;
    }

    const branchRecord = await this.requireRecord(branchId);
    branchRecord.tipNodeId = previousId;
    branchRecord.messageCount = path.length;
    branchRecord.rootNodeId = await this.findRootId(branchId, previousId);
    await this.state.storage.put(convKey(branchId), branchRecord);

    return { conversationId: branchId, branchedFrom: fromNodeId };
  }

  async history(conversationId: ConversationId, fromNodeId?: string): Promise<SessionNode[]> {
    const record = await this.requireRecord(conversationId);
    const leaf = fromNodeId ?? record.tipNodeId;
    if (!leaf) return [];

    const path: SessionNode[] = [];
    let current: string | null = leaf;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current)) break;
      visited.add(current);
      const node: SessionNode | undefined = await this.state.storage.get<SessionNode>(
        nodeKey(conversationId, current),
      );
      if (!node) break;
      path.push(node);
      current = node.parentId;
    }
    return path.reverse();
  }

  async list(userId: string): Promise<ConversationSummary[]> {
    const ids = (await this.state.storage.get<string[]>(userConvsKey(userId))) ?? [];
    const summaries: ConversationSummary[] = [];
    for (const id of ids) {
      const record = await this.state.storage.get<ConversationRecord>(convKey(id));
      if (!record) continue;
      let preview: string | undefined;
      if (record.tipNodeId) {
        const tip = await this.state.storage.get<SessionNode>(nodeKey(id, record.tipNodeId));
        if (tip) preview = tip.content.slice(0, PREVIEW_MAX_CHARS);
      }
      summaries.push({
        id: record.id,
        userId: record.userId,
        createdAt: record.createdAt,
        messageCount: record.messageCount,
        preview,
      });
    }
    return summaries;
  }

  async compact(conversationId: ConversationId, strategy: CompactionStrategy): Promise<void> {
    const record = await this.requireRecord(conversationId);
    const history = await this.history(conversationId);
    if (history.length === 0) return;

    let droppedCount = 0;
    let strategyName: 'summarize' | 'drop-oldest' | 'llm';

    switch (strategy.kind) {
      case 'drop-oldest': {
        strategyName = 'drop-oldest';
        droppedCount = await this.compactDropOldest(conversationId, record, history, strategy);
        break;
      }
      case 'summarize': {
        strategyName = 'summarize';
        droppedCount = await this.compactSummarize(
          conversationId,
          record,
          history,
          strategy,
          async (nodes) => defaultSummarize(nodes),
        );
        break;
      }
      case 'llm': {
        strategyName = 'llm';
        droppedCount = await this.compactSummarize(
          conversationId,
          record,
          history,
          { kind: 'summarize' },
          strategy.summarize,
        );
        break;
      }
    }

    await dispatchEvent(
      ConversationCompacted,
      new ConversationCompacted(conversationId, strategyName, droppedCount),
    );
  }

  async search(
    query: string,
    opts: { userId?: string } = {},
  ): Promise<SessionNode[]> {
    const terms = tokenize(query);
    if (terms.length === 0) return [];

    const scopeIds = opts.userId
      ? ((await this.state.storage.get<string[]>(userConvsKey(opts.userId))) ?? [])
      : (await this.listAllConversationIds());

    const matches: SessionNode[] = [];
    for (const convId of scopeIds) {
      const perTerm: Set<string>[] = [];
      for (const term of terms) {
        const ids = (await this.state.storage.get<string[]>(ftsKey(convId, term))) ?? [];
        perTerm.push(new Set(ids));
      }
      if (perTerm.some((s) => s.size === 0)) continue;
      const intersection = perTerm.reduce<Set<string> | null>(
        (acc, s) => (acc === null ? s : new Set([...acc].filter((x) => s.has(x)))),
        null,
      );
      if (!intersection || intersection.size === 0) continue;
      for (const nodeId of intersection) {
        const node = await this.state.storage.get<SessionNode>(nodeKey(convId, nodeId));
        if (node) matches.push(node);
      }
    }
    return matches;
  }

  async delete(conversationId: ConversationId): Promise<void> {
    const record = await this.state.storage.get<ConversationRecord>(convKey(conversationId));
    if (!record) return;

    const entries = await this.state.storage.list({ prefix: `conv:${conversationId}` });
    const keys = Array.from(entries.keys());
    if (keys.length > 0) await this.state.storage.delete(keys);
    await this.state.storage.delete(convKey(conversationId));

    if (record.userId) {
      const userKey = userConvsKey(record.userId);
      const existing = (await this.state.storage.get<string[]>(userKey)) ?? [];
      await this.state.storage.put(userKey, existing.filter((id) => id !== conversationId));
    }
  }

  /* ----------------------------- internals ----------------------------- */

  private async findRootId(conversationId: ConversationId, tipId: string | null): Promise<string | null> {
    let walker: string | null = tipId;
    let root: string | null = walker;
    while (walker) {
      const node: SessionNode | undefined = await this.state.storage.get<SessionNode>(
        nodeKey(conversationId, walker),
      );
      if (!node) break;
      root = node.id;
      walker = node.parentId;
    }
    return root;
  }

  private async requireRecord(id: ConversationId): Promise<ConversationRecord> {
    const record = await this.state.storage.get<ConversationRecord>(convKey(id));
    if (!record) throw new ConversationNotFoundError(id);
    return record;
  }

  private async appendUserConv(userId: string, conversationId: ConversationId): Promise<void> {
    const key = userConvsKey(userId);
    const existing = (await this.state.storage.get<string[]>(key)) ?? [];
    if (!existing.includes(conversationId)) {
      await this.state.storage.put(key, [...existing, conversationId]);
    }
  }

  private async indexForFts(conversationId: ConversationId, node: SessionNode): Promise<void> {
    const terms = tokenize(node.content);
    for (const term of terms) {
      const key = ftsKey(conversationId, term);
      const existing = (await this.state.storage.get<string[]>(key)) ?? [];
      if (!existing.includes(node.id)) {
        await this.state.storage.put(key, [...existing, node.id]);
      }
    }
  }

  private async listAllConversationIds(): Promise<ConversationId[]> {
    const entries = await this.state.storage.list<ConversationRecord>({ prefix: 'conv:' });
    const ids: ConversationId[] = [];
    for (const [key] of entries) {
      // Match `conv:{id}` exactly, excluding node/children/fts nested keys.
      const rest = key.slice('conv:'.length);
      if (!rest.includes(':')) ids.push(rest);
    }
    return ids;
  }

  private async compactDropOldest(
    conversationId: ConversationId,
    record: ConversationRecord,
    history: SessionNode[],
    strategy: Extract<CompactionStrategy, { kind: 'drop-oldest' }>,
  ): Promise<number> {
    const keep = resolveKeepCount(history, strategy);
    if (keep >= history.length) return 0;

    const toDrop = history.slice(0, history.length - keep);
    const keepList = history.slice(history.length - keep);

    await this.purgeNodes(conversationId, toDrop);
    await this.rewireParent(conversationId, keepList);

    record.messageCount = keepList.length;
    record.rootNodeId = keepList[0]?.id ?? null;
    record.tipNodeId = keepList[keepList.length - 1]?.id ?? null;
    await this.state.storage.put(convKey(conversationId), record);

    return toDrop.length;
  }

  private async compactSummarize(
    conversationId: ConversationId,
    record: ConversationRecord,
    history: SessionNode[],
    strategy: Extract<CompactionStrategy, { kind: 'summarize' }>,
    summarize: (nodes: SessionNode[]) => Promise<string>,
  ): Promise<number> {
    const budget = strategy.tokenBudget ?? 50_000;
    const retainCount = Math.max(1, Math.floor(history.length / 2));
    const toSummarize = history.slice(0, history.length - retainCount);
    const kept = history.slice(history.length - retainCount);

    if (toSummarize.length === 0) return 0;

    const summary = await summarize(toSummarize);
    await this.purgeNodes(conversationId, toSummarize);

    const summaryNode: SessionNode = {
      id: newId('node'),
      parentId: null,
      role: 'system',
      content: summary,
      metadata: { compactedFrom: toSummarize.length, tokenBudget: budget },
      createdAt: Date.now(),
    };

    await this.state.storage.put(nodeKey(conversationId, summaryNode.id), summaryNode);
    await this.indexForFts(conversationId, summaryNode);

    if (kept[0]) {
      kept[0] = { ...kept[0], parentId: summaryNode.id };
      await this.state.storage.put(nodeKey(conversationId, kept[0].id), kept[0]);
      await this.state.storage.put(childrenKey(conversationId, summaryNode.id), [kept[0].id]);
    }

    record.messageCount = kept.length + 1;
    record.rootNodeId = summaryNode.id;
    record.tipNodeId = kept[kept.length - 1]?.id ?? summaryNode.id;
    await this.state.storage.put(convKey(conversationId), record);

    return toSummarize.length;
  }

  private async purgeNodes(conversationId: ConversationId, nodes: SessionNode[]): Promise<void> {
    const keys: string[] = [];
    for (const node of nodes) {
      keys.push(nodeKey(conversationId, node.id));
      keys.push(childrenKey(conversationId, node.id));
      for (const term of tokenize(node.content)) {
        const ftsKeyStr = ftsKey(conversationId, term);
        const existing = (await this.state.storage.get<string[]>(ftsKeyStr)) ?? [];
        const filtered = existing.filter((id) => id !== node.id);
        if (filtered.length === 0) keys.push(ftsKeyStr);
        else await this.state.storage.put(ftsKeyStr, filtered);
      }
    }
    if (keys.length > 0) await this.state.storage.delete(keys);
  }

  private async rewireParent(conversationId: ConversationId, nodes: SessionNode[]): Promise<void> {
    if (nodes.length === 0) return;
    const first = nodes[0];
    if (first.parentId === null) return;
    const rewired = { ...first, parentId: null };
    nodes[0] = rewired;
    await this.state.storage.put(nodeKey(conversationId, rewired.id), rewired);
  }
}

function convKey(id: string): string {
  return `conv:${id}`;
}

function nodeKey(convId: string, nodeId: string): string {
  return `conv:${convId}:node:${nodeId}`;
}

function childrenKey(convId: string, nodeId: string): string {
  return `conv:${convId}:children:${nodeId}`;
}

function ftsKey(convId: string, term: string): string {
  return `conv:${convId}:fts:${term}`;
}

function userConvsKey(userId: string): string {
  return `user:${userId}:convs`;
}

let counter = 0;
function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of raw) {
    if (term.length < FTS_MIN_TOKEN_LENGTH) continue;
    if (STOP_WORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    out.push(term);
  }
  return out;
}

function resolveKeepCount(
  history: SessionNode[],
  strategy: Extract<CompactionStrategy, { kind: 'drop-oldest' }>,
): number {
  if (strategy.keep !== undefined) return Math.max(0, Math.min(strategy.keep, history.length));
  if (strategy.tokenBudget !== undefined) {
    let kept = 0;
    let tokens = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      tokens += approximateTokenCount(history[i]);
      if (tokens > strategy.tokenBudget) break;
      kept++;
    }
    return kept;
  }
  return Math.max(1, Math.floor(history.length / 2));
}

function approximateTokenCount(node: SessionNode): number {
  // ~4 chars per token is a conservative English-language approximation.
  return Math.ceil(node.content.length / 4);
}

async function defaultSummarize(nodes: SessionNode[]): Promise<string> {
  const bullets = nodes
    .map((n) => `- [${n.role}] ${n.content.replace(/\s+/g, ' ').slice(0, 200)}`)
    .join('\n');
  return `Summary of ${nodes.length} prior message(s):\n${bullets}`;
}

export type { SessionsStateLike };