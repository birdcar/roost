import { describe, it, expect } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';
import {
  runCodeMode,
  InMemoryCodeModeCache,
  InProcessSandbox,
  SandboxTimeoutError,
  SandboxViolationError,
  SandboxParseError,
  CodeMode,
} from '../../src/code-mode/index.js';
import type { CodeGenerator } from '../../src/code-mode/index.js';

class DemoAgent extends StatefulAgent {
  instructions() {
    return 'code-mode';
  }
}

function stubGenerator(code: string): CodeGenerator {
  return {
    async generate() {
      return code;
    },
  };
}

describe('runCodeMode', () => {
  it('executes generated code in the sandbox and returns the result', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const outcome = await runCodeMode(agent, 'add', {
        bindings: { a: 2, b: 3 },
        generator: stubGenerator('return a + b;'),
      });
      expect(outcome.result).toBe(5);
      expect(outcome.cached).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('reuses cached code when the same intent is invoked twice', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      const cache = new InMemoryCodeModeCache();
      let generateCount = 0;
      const generator: CodeGenerator = {
        async generate() {
          generateCount++;
          return 'return 42;';
        },
      };
      await runCodeMode(agent, 'answer', { cache, generator });
      const second = await runCodeMode(agent, 'answer', { cache, generator });
      expect(second.cached).toBe(true);
      expect(generateCount).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('rejects code that references forbidden globals', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      await expect(
        runCodeMode(agent, 'bad', { generator: stubGenerator('return process.env.SECRET;') }),
      ).rejects.toThrow(SandboxViolationError);
    } finally {
      cleanup();
    }
  });

  it('throws SandboxTimeoutError when execution exceeds the deadline', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      await expect(
        runCodeMode(agent, 'slow', {
          generator: stubGenerator('await new Promise(r => setTimeout(r, 100));'),
          timeoutMs: 20,
        }),
      ).rejects.toThrow(SandboxTimeoutError);
    } finally {
      cleanup();
    }
  });

  it('wraps parse failures in SandboxParseError', async () => {
    const { agent, cleanup } = TestStatefulAgentHarness.for(DemoAgent).build();
    try {
      await expect(
        runCodeMode(agent, 'parse', { generator: stubGenerator('this is not valid js }') }),
      ).rejects.toThrow(SandboxParseError);
    } finally {
      cleanup();
    }
  });
});

describe('@CodeMode decorator', () => {
  it('replaces the method with a sandboxed call returning the sandbox result', async () => {
    const cache = new InMemoryCodeModeCache();
    class CodeAgent extends StatefulAgent {
      instructions() {
        return 'c';
      }
      @CodeMode({
        generator: stubGenerator('return 7;'),
        cache,
      })
      async resolve(result: unknown): Promise<number> {
        return (result as number) + 0;
      }
    }
    const { agent, cleanup } = TestStatefulAgentHarness.for(CodeAgent).build();
    try {
      const result = await agent.resolve('compute');
      expect(result).toBe(7);
    } finally {
      cleanup();
    }
  });
});

describe('InProcessSandbox', () => {
  it('runs code with provided bindings', async () => {
    const sandbox = new InProcessSandbox();
    const result = await sandbox.run('return multiply(x, y);', {
      bindings: { x: 6, y: 7, multiply: (a: number, b: number) => a * b },
      timeoutMs: 1000,
      kind: 'in-process',
    });
    expect(result.value).toBe(42);
  });
});
