/**
 * Integration harness — shared miniflare lifecycle for Phase 9's consolidated
 * `bun run test:integration` script. Each integration test file imports
 * `setupHarness()` / `teardownHarness()` from here instead of creating its own
 * Miniflare instance.
 *
 * Keep the surface narrow — expanding this belongs in v0.3.1 where we also
 * add the esbuild bundle step (see learning #5 in the spec).
 */

import type { Miniflare, MiniflareOptions } from 'miniflare';

let instance: Miniflare | undefined;

const DEFAULT_BINDINGS = {
  AI: {},
  VECTORIZE: {},
  KV: {},
  R2: {},
} satisfies Record<string, unknown>;

export interface HarnessOptions extends Partial<MiniflareOptions> {
  bindings?: Record<string, unknown>;
}

export async function setupHarness(opts: HarnessOptions = {}): Promise<Miniflare> {
  if (instance) return instance;
  const { Miniflare: MiniflareClass } = await import('miniflare');
  instance = new MiniflareClass({
    modules: true,
    script: opts.script ?? 'export default { async fetch() { return new Response("ok"); } }',
    bindings: { ...DEFAULT_BINDINGS, ...(opts.bindings ?? {}) },
    ...opts,
  } as MiniflareOptions);
  await instance.ready;
  return instance;
}

export async function teardownHarness(): Promise<void> {
  if (!instance) return;
  await instance.dispose();
  instance = undefined;
}

export function getHarness(): Miniflare | undefined {
  return instance;
}
