import { Lab } from '../../enums.js';
import type { RerankResult } from '../types.js';
import { RerankerUnavailableError } from '../types.js';
import { RerankingStarted, Reranked } from '../events.js';
import { dispatchEvent } from '../../events.js';
import type { RerankerAdapter } from './providers/cohere.js';

export interface RerankingPrompt {
  query: string;
  documents: string[];
  provider: string;
}

const adapters = new Map<string, RerankerAdapter>();
let defaultProvider: string = Lab.Cohere;

export function registerReranker(provider: string, adapter: RerankerAdapter): void {
  adapters.set(provider, adapter);
}

export function setDefaultReranker(provider: string): void {
  defaultProvider = provider;
}

export function resolveReranker(provider?: string): RerankerAdapter {
  const key = provider ?? defaultProvider;
  const adapter = adapters.get(key);
  if (!adapter) throw new RerankerUnavailableError(key, 'no adapter registered');
  return adapter;
}

export function resetRerankers(): void {
  adapters.clear();
  defaultProvider = Lab.Cohere;
}

type DocEntry = string | { id: string; text: string };

function textOf(doc: DocEntry): string {
  return typeof doc === 'string' ? doc : doc.text;
}

interface RerankingFake {
  recordedPrompts: RerankingPrompt[];
  responses: RerankResult[][];
  index: number;
}

let fake: RerankingFake | null = null;

export class RerankingBuilder {
  private _limit?: number;

  constructor(private readonly docs: DocEntry[]) {}

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  async rerank(query: string, opts: { provider?: string; model?: string } = {}): Promise<RerankResult[]> {
    const providerName = opts.provider ?? defaultProvider;
    const texts = this.docs.map(textOf);
    const prompt: RerankingPrompt = { query, documents: texts, provider: providerName };

    if (fake) {
      fake.recordedPrompts.push(prompt);
      const response = fake.responses[Math.min(fake.index, fake.responses.length - 1)] ?? [];
      fake.index++;
      return response;
    }

    await dispatchEvent(RerankingStarted, new RerankingStarted(providerName, query, texts.length));

    if (texts.length === 0) {
      await dispatchEvent(Reranked, new Reranked(providerName, query, []));
      return [];
    }

    const adapter = resolveReranker(providerName);
    const results = await adapter.rerank(query, texts, { limit: this._limit, model: opts.model });

    await dispatchEvent(Reranked, new Reranked(providerName, query, results));
    return results;
  }

  async first(query: string, opts?: { provider?: string; model?: string }): Promise<RerankResult | undefined> {
    const all = await this.rerank(query, opts);
    return all[0];
  }
}

export const Reranking = {
  of(documents: DocEntry[]): RerankingBuilder {
    return new RerankingBuilder(documents);
  },

  fake(responses?: RerankResult[][]): void {
    fake = { recordedPrompts: [], responses: responses ?? [[]], index: 0 };
  },

  restore(): void {
    fake = null;
  },

  assertReranked(predicate: (prompt: RerankingPrompt) => boolean): void {
    if (!fake) throw new Error('Reranking.fake() was not called');
    if (!fake.recordedPrompts.some(predicate)) {
      throw new Error('Expected a reranking prompt to match the predicate, but none did');
    }
  },

  assertNothingReranked(): void {
    if (!fake) throw new Error('Reranking.fake() was not called');
    if (fake.recordedPrompts.length > 0) {
      throw new Error(`Expected no reranking, but ${fake.recordedPrompts.length} calls recorded`);
    }
  },
};
