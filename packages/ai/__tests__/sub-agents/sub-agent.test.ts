import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { StatefulAgent } from '../../src/stateful/agent.js';
import { Stateful } from '../../src/decorators.js';
import {
  subAgent,
  abortSubAgent,
  deleteSubAgent,
  resolveSubAgentClient,
  isRpcCallable,
  SubAgentBindingMissingError,
} from '../../src/sub-agents/sub-agent.js';
import {
  SUB_AGENT_DEPTH_HEADER,
  SUB_AGENT_MAX_DEPTH,
  SubAgentDepthExceededError,
  SubAgentRpcError,
} from '../../src/sub-agents/typed-rpc.js';
import { TestStatefulAgentHarness } from '../../src/testing/stateful-harness.js';

class RecordingStub {
  requests: Array<{ url: string; method: string; body?: unknown; headers: Record<string, string> }> = [];
  nextResponse: { status?: number; body?: unknown } = {};

  async fetch(req: Request): Promise<Response> {
    const body = req.method === 'POST' && req.headers.get('content-type')?.includes('application/json')
      ? await req.json()
      : undefined;
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });
    this.requests.push({ url: req.url, method: req.method, body, headers });
    const status = this.nextResponse.status ?? 200;
    const body_ = this.nextResponse.body ?? { ok: true };
    return new Response(JSON.stringify(body_), { status, headers: { 'Content-Type': 'application/json' } });
  }
}

class FakeNamespace {
  stubs = new Map<string, RecordingStub>();
  lastName = '';

  idFromName(name: string) {
    this.lastName = name;
    return { name };
  }
  idFromString(hex: string) {
    return { name: hex };
  }
  newUniqueId() {
    return { name: 'unique' };
  }
  get(id: { name: string } | string) {
    const key = typeof id === 'string' ? id : id.name;
    if (!this.stubs.has(key)) this.stubs.set(key, new RecordingStub());
    return this.stubs.get(key)!;
  }
}

class ChildAgent extends StatefulAgent<{ CHILDAGENT: FakeNamespace }> {
  instructions(): string {
    return 'child';
  }
  async doWork(input: string): Promise<string> {
    return `child:${input}`;
  }
}

@Stateful({ binding: 'CUSTOM_CHILD' })
class DecoratedChild extends StatefulAgent<{ CUSTOM_CHILD: FakeNamespace }> {
  instructions(): string {
    return 'decorated';
  }
  async greet(name: string): Promise<string> {
    return `hello ${name}`;
  }
}

class ParentAgent extends StatefulAgent {
  instructions(): string {
    return 'parent';
  }
}

describe('subAgent handle', () => {
  let parent: ParentAgent;
  let namespace: FakeNamespace;
  let cleanup: () => void;

  beforeEach(() => {
    namespace = new FakeNamespace();
    const built = TestStatefulAgentHarness.for(ParentAgent)
      .withEnv({ CHILDAGENT: namespace })
      .build();
    parent = built.agent;
    cleanup = built.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('forwards public method calls to the child DO with a JSON envelope', async () => {
    const handle = subAgent(parent, ChildAgent, { namespace: 'worker-1' });
    expect(handle.id).toBe('ChildAgent:worker-1');

    const stub = namespace.stubs.get('ChildAgent:worker-1')!;
    stub.nextResponse = { body: 'child:hi' };

    const result = await handle.doWork('hi');
    expect(result).toBe('child:hi');
    expect(stub.requests.length).toBe(1);
    expect(stub.requests[0].url).toBe('https://internal/_/rpc');
    expect(stub.requests[0].body).toEqual({ v: 1, method: 'doWork', args: ['hi'] });
    expect(stub.requests[0].headers[SUB_AGENT_DEPTH_HEADER]).toBe('1');
  });

  it('sends abort and delete control-plane calls on dedicated routes', async () => {
    const handle = subAgent(parent, ChildAgent, { namespace: 'worker-2' });
    const stub = namespace.stubs.get('ChildAgent:worker-2')!;
    await abortSubAgent(handle);
    await deleteSubAgent(handle);
    expect(stub.requests.map((r) => r.url)).toEqual([
      'https://internal/_/abort',
      'https://internal/_/delete',
    ]);
  });

  it('throws SubAgentRpcError when the stub returns a non-2xx response', async () => {
    const handle = subAgent(parent, ChildAgent, { namespace: 'worker-3' });
    const stub = namespace.stubs.get('ChildAgent:worker-3')!;
    stub.nextResponse = { status: 500, body: 'boom' };
    await expect(handle.doWork('x')).rejects.toThrow(SubAgentRpcError);
  });

  it('honors @Stateful binding name when resolving the namespace', () => {
    const env = { CUSTOM_CHILD: new FakeNamespace() };
    const built = TestStatefulAgentHarness.for(ParentAgent).withEnv(env).build();
    try {
      const client = resolveSubAgentClient(built.agent, DecoratedChild as unknown as new (...args: unknown[]) => StatefulAgent);
      expect(client).toBeDefined();
    } finally {
      built.cleanup();
    }
  });

  it('throws SubAgentBindingMissingError when the binding is absent', () => {
    const bare = TestStatefulAgentHarness.for(ParentAgent).build();
    try {
      expect(() =>
        resolveSubAgentClient(bare.agent, ChildAgent as unknown as new (...args: unknown[]) => StatefulAgent),
      ).toThrow(SubAgentBindingMissingError);
    } finally {
      bare.cleanup();
    }
  });

  it('caps spawn depth at SUB_AGENT_MAX_DEPTH', async () => {
    (parent as unknown as { _subAgentDepth: number })._subAgentDepth = SUB_AGENT_MAX_DEPTH;
    const handle = subAgent(parent, ChildAgent, { namespace: 'w' });
    await expect(handle.doWork('x')).rejects.toThrow(SubAgentDepthExceededError);
  });

  it('auto-generates a stable-looking id when no namespace is provided', () => {
    const h1 = subAgent(parent, ChildAgent);
    const h2 = subAgent(parent, ChildAgent);
    expect(h1.id.startsWith('ChildAgent:')).toBe(true);
    expect(h1.id).not.toBe(h2.id);
  });
});

describe('isRpcCallable', () => {
  it('rejects underscore-prefixed and reserved method names', () => {
    expect(isRpcCallable('doWork')).toBe(true);
    expect(isRpcCallable('_internal')).toBe(false);
    expect(isRpcCallable('fetch')).toBe(false);
    expect(isRpcCallable('onRequest')).toBe(false);
    expect(isRpcCallable('')).toBe(false);
  });
});
