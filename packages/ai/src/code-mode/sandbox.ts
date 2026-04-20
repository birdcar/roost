export type SandboxKind = 'dynamic-dispatch' | 'loopback' | 'in-process';

export interface SandboxContext {
  /** Bindings explicitly exposed to generated code. Never includes env at large. */
  bindings: Record<string, unknown>;
  /** Timeout in ms — enforced by the runner where possible. */
  timeoutMs: number;
  kind: SandboxKind;
}

export interface SandboxResult {
  value: unknown;
  durationMs: number;
  kind: SandboxKind;
}

export class SandboxTimeoutError extends Error {
  override readonly name = 'SandboxTimeoutError';
  constructor(timeoutMs: number) {
    super(`Sandbox execution exceeded ${timeoutMs}ms.`);
  }
}

export class SandboxViolationError extends Error {
  override readonly name = 'SandboxViolationError';
  constructor(reason: string) {
    super(`Sandbox violation: ${reason}`);
  }
}

export class SandboxParseError extends Error {
  override readonly name = 'SandboxParseError';
  constructor(cause: unknown) {
    super(`Generated code failed to parse: ${(cause as Error).message ?? cause}`);
  }
}

export interface SandboxRunner {
  run(code: string, ctx: SandboxContext): Promise<SandboxResult>;
}

/**
 * In-process sandbox. Wraps generated code in an `AsyncFunction` constructor
 * with only the whitelisted bindings in scope. Timeout enforced by racing
 * against a timer; sandbox escape detected by scanning for disallowed idents.
 */
export class InProcessSandbox implements SandboxRunner {
  async run(code: string, ctx: SandboxContext): Promise<SandboxResult> {
    if (/(\bprocess\b|\benv\b|\brequire\b|\beval\b|\bFunction\b|\bimport\b\s*\()/i.test(code)) {
      throw new SandboxViolationError('disallowed global reference in generated code');
    }
    const argNames = Object.keys(ctx.bindings);
    const argValues = argNames.map((n) => ctx.bindings[n]);
    let fn: (...args: unknown[]) => Promise<unknown>;
    try {
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
      fn = new AsyncFunction(...argNames, code);
    } catch (err) {
      throw new SandboxParseError(err);
    }
    const start = Date.now();
    const value = await runWithTimeout(fn.apply(null, argValues), ctx.timeoutMs);
    return { value, durationMs: Date.now() - start, kind: ctx.kind };
  }
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SandboxTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return (await Promise.race([promise, timeout])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
