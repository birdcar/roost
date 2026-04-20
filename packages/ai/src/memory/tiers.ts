import type { StatefulAgent } from '../stateful/agent.js';
import { ReadonlyMemory } from './context.js';
import { ShortFormMemory } from './short-form.js';
import { SkillsMemory } from './skills.js';

export interface KnowledgeQuery<T = unknown> {
  query: string;
  topK?: number;
  filter?: Record<string, unknown>;
  metadata?: T;
}

export interface KnowledgeHit {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeBackend {
  query(q: KnowledgeQuery): Promise<KnowledgeHit[]>;
}

/**
 * Searchable knowledge tier. The concrete backing is Vectorize-via-RAGPipeline
 * (Phase 5); we take a lightweight interface so tests can substitute an
 * in-memory stub without dragging the RAG module in.
 */
export class KnowledgeMemory {
  constructor(private readonly backend?: KnowledgeBackend) {}

  async query(q: KnowledgeQuery): Promise<KnowledgeHit[]> {
    if (!this.backend) return [];
    return this.backend.query(q);
  }

  hasBackend(): boolean {
    return !!this.backend;
  }
}

export interface MemoryDeps {
  context?: Iterable<readonly [string, unknown]>;
  knowledge?: KnowledgeBackend;
}

/**
 * `Memory` — aggregate facade combining the four tiers. Expose as
 * `agent.memory` on `StatefulAgent`.
 */
export class Memory {
  readonly context: ReadonlyMemory;
  readonly shortForm: ShortFormMemory;
  readonly knowledge: KnowledgeMemory;
  readonly skills: SkillsMemory;

  constructor(agent: StatefulAgent, deps: MemoryDeps = {}) {
    this.context = new ReadonlyMemory(deps.context);
    this.shortForm = new ShortFormMemory(agent);
    this.knowledge = new KnowledgeMemory(deps.knowledge);
    this.skills = new SkillsMemory();
  }
}
