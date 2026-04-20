import type { StatefulAgent } from '../stateful/agent.js';
import { InProcessSandbox, type SandboxKind, type SandboxRunner, type SandboxResult } from './sandbox.js';
import { PromptingCodeGenerator, type CodeGenerator } from './code-gen.js';

export interface CodeModeOpts {
  sandbox?: SandboxKind;
  timeoutMs?: number;
  bindings?: Record<string, unknown>;
  generator?: CodeGenerator;
  runner?: SandboxRunner;
  cache?: CodeModeCache;
}

export interface CodeModeResult {
  result: unknown;
  code: string;
  cached: boolean;
  durationMs: number;
}

export interface CodeModeCache {
  get(key: string): Promise<string | undefined> | string | undefined;
  put(key: string, code: string): Promise<void> | void;
}

export class InMemoryCodeModeCache implements CodeModeCache {
  private data = new Map<string, string>();
  get(key: string) {
    return this.data.get(key);
  }
  put(key: string, code: string) {
    this.data.set(key, code);
  }
}

/**
 * Execute an intent as generated code inside a sandbox. Agent.codeMode()
 * delegates here.
 */
export async function runCodeMode(
  agent: StatefulAgent,
  intent: string,
  opts: CodeModeOpts = {},
): Promise<CodeModeResult> {
  const runner = opts.runner ?? new InProcessSandbox();
  const generator = opts.generator ?? new PromptingCodeGenerator(agent);
  const kind = opts.sandbox ?? 'in-process';
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const bindings = opts.bindings ?? {};

  const cacheKey = hashIntent(intent, Object.keys(bindings));
  let code = opts.cache ? await opts.cache.get(cacheKey) : undefined;
  const cached = !!code;
  if (!code) {
    code = await generator.generate({ intent, availableBindings: Object.keys(bindings) });
    if (opts.cache) await opts.cache.put(cacheKey, code);
  }

  const sandboxResult: SandboxResult = await runner.run(code, {
    bindings,
    timeoutMs,
    kind,
  });
  return {
    result: sandboxResult.value,
    code,
    cached,
    durationMs: sandboxResult.durationMs,
  };
}

/**
 * `@CodeMode()` method decorator. Replaces the method with a call to
 * `runCodeMode(this, intent, opts)`; the original body receives the result
 * for post-processing (optional).
 */
export function CodeMode(opts: CodeModeOpts = {}) {
  return function (target: object, key: string | symbol, descriptor: PropertyDescriptor) {
    void target;
    void key;
    const original = descriptor.value as ((result: unknown) => unknown) | undefined;
    descriptor.value = async function (this: StatefulAgent, intent: string) {
      const outcome = await runCodeMode(this, intent, opts);
      return original ? original.call(this, outcome.result) : outcome.result;
    };
  };
}

function hashIntent(intent: string, bindingNames: string[]): string {
  const base = `${intent}::${bindingNames.sort().join(',')}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (h << 5) - h + base.charCodeAt(i);
    h |= 0;
  }
  return `cm:${h.toString(36)}`;
}
