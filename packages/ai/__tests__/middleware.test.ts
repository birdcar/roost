import { describe, it, expect } from 'bun:test';
import { runPipeline, addThenHook, type AgentMiddleware, type NextFn } from '../src/middleware';
import { AgentPrompt } from '../src/prompt';
import type { AgentResponse } from '../src/responses/agent-response';

const okResponse = (text = 'ok'): AgentResponse => ({ text, messages: [], toolCalls: [] });

describe('middleware pipeline', () => {
  it('runs middleware in nested order and returns the terminal response', async () => {
    const trace: string[] = [];
    const mw1: AgentMiddleware = {
      async handle(p, next) {
        trace.push('a');
        const r = await next(p);
        trace.push('d');
        return r;
      },
    };
    const mw2: AgentMiddleware = {
      async handle(p, next) {
        trace.push('b');
        const r = await next(p);
        trace.push('c');
        return r;
      },
    };
    const terminal: NextFn = async () => {
      trace.push('T');
      return okResponse();
    };

    const result = await runPipeline([mw1, mw2], new AgentPrompt('x'), terminal);
    expect(result.text).toBe('ok');
    expect(trace).toEqual(['a', 'b', 'T', 'c', 'd']);
  });

  it('middleware can short-circuit without calling next', async () => {
    let terminalRan = false;
    const shortCircuit: AgentMiddleware = {
      async handle(_p, _next) {
        return okResponse('short');
      },
    };
    const terminal: NextFn = async () => {
      terminalRan = true;
      return okResponse('from terminal');
    };
    const result = await runPipeline([shortCircuit], new AgentPrompt('x'), terminal);
    expect(result.text).toBe('short');
    expect(terminalRan).toBe(false);
  });

  it('runs .then() hooks after the pipeline resolves', async () => {
    const fired: string[] = [];
    const terminal: NextFn = async () => {
      const r = okResponse('ok');
      addThenHook(r, () => { fired.push('hook-1'); });
      addThenHook(r, async () => { fired.push('hook-2'); });
      return r;
    };
    await runPipeline([], new AgentPrompt('x'), terminal);
    expect(fired).toEqual(['hook-1', 'hook-2']);
  });

  it('swallows errors in .then() hooks without crashing the pipeline', async () => {
    const terminal: NextFn = async () => {
      const r = okResponse();
      addThenHook(r, () => { throw new Error('boom'); });
      return r;
    };
    // Should not throw
    const result = await runPipeline([], new AgentPrompt('x'), terminal);
    expect(result.text).toBe('ok');
  });
});
