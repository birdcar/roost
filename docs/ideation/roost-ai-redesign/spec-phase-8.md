# Implementation Spec: Roost AI Redesign - Phase 8 (Advanced CF Primitives)

**Contract**: ./contract.md
**Depends on**: Phase 1 (Foundation), Phase 2 (Stateful), Phase 7 (MCP for HITL elicitation)
**Estimated Effort**: XL

## Technical Approach

Phase 8 is the long tail — everything the Cloudflare Agents SDK provides that Laravel has no equivalent for. Each primitive lives in its own module under `packages/ai/src/` with a consistent shape: a primary class or function, a `Service` registration in `AiServiceProvider`, test fakes, and events.

The advanced primitives, in implementation order:

1. **HITL (Human-in-the-Loop)**: `requireApproval(step, payload)` pauses agent execution via DO state + signal; external systems resume via `approve(approvalId, decision)`. Integrates with MCP elicitation — HITL requests can be routed through MCP prompt elicitation.
2. **Memory tiers**: Four tiers — read-only context (loaded at init), writable short-form (in-DO), searchable knowledge (Vectorize RAG from P5), on-demand skills (tool-registered with lazy discovery).
3. **Payments (x402 + MPP)**: `chargeForTool(tool, price)` wraps tools with x402 payment gating; MPP (Machine Payments Protocol) for agent-to-agent payments.
4. **Voice**: `Voice.stream()` for bidirectional realtime voice over CF Realtime SFU + Workers AI voice models.
5. **Email**: `Email.send()` via CF Email Workers; inbound webhook handler that routes email → agent.
6. **Browser**: `Browser.navigate(url)` tool wrapping CF Browser Rendering (Puppeteer API).
7. **CodeMode**: `@CodeMode()` decorator or `agent.codeMode(intent)` method — agent generates code to accomplish the intent, executed in a sandboxed isolate via CF's `DynamicDispatch` or `Loopback Service`.

Each is independently shippable behind a capability check. Phase 9 ties them together with coverage + docs.

## Feedback Strategy

**Inner-loop command**: `bun test packages/ai/__tests__/advanced/`

**Playground**: Test suite per primitive. Voice + Browser require fixture servers; CodeMode needs isolate stubs. HITL is pure state-machine logic.

**Why this approach**: Each primitive is mostly pure logic with I/O mocked at the edges. Voice is the exception (realtime; needs WS harness).

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/src/hitl/approval.ts` | `requireApproval()`, `approve()`, approval state machine |
| `packages/ai/src/hitl/mcp-bridge.ts` | Route HITL requests via MCP elicitation |
| `packages/ai/src/memory/context.ts` | Read-only context tier |
| `packages/ai/src/memory/short-form.ts` | Writable short-form memory tier |
| `packages/ai/src/memory/skills.ts` | On-demand skills tier with lazy tool registration |
| `packages/ai/src/memory/tiers.ts` | Aggregate `Memory` facade combining all tiers |
| `packages/ai/src/payments/x402.ts` | x402 protocol client + server |
| `packages/ai/src/payments/charge-for-tool.ts` | `chargeForTool(tool, price)` wrapper |
| `packages/ai/src/payments/mpp.ts` | Machine Payments Protocol for agent-to-agent |
| `packages/ai/src/voice/voice.ts` | `Voice` class with `.stream()` |
| `packages/ai/src/voice/realtime-bridge.ts` | CF Realtime SFU bridge |
| `packages/ai/src/email/send.ts` | `Email.send()` via CF Email Workers |
| `packages/ai/src/email/inbound.ts` | Inbound email → agent handler |
| `packages/ai/src/browser/browser.ts` | `Browser.navigate()` tool + page primitives |
| `packages/ai/src/code-mode/code-mode.ts` | `@CodeMode()` decorator + `agent.codeMode()` method |
| `packages/ai/src/code-mode/sandbox.ts` | Isolate sandbox wrapper (DynamicDispatch or Loopback) |
| `packages/ai/src/code-mode/code-gen.ts` | Prompt agent to generate code for intent |
| `packages/ai/__tests__/advanced/hitl.test.ts` | State machine, approval flow, timeouts |
| `packages/ai/__tests__/advanced/memory.test.ts` | All four tiers; load/store/search/skills |
| `packages/ai/__tests__/advanced/payments.test.ts` | x402 challenge+pay; MPP flow |
| `packages/ai/__tests__/advanced/voice.test.ts` | Stream lifecycle; mocked Realtime |
| `packages/ai/__tests__/advanced/email.test.ts` | Send + inbound; fake mode |
| `packages/ai/__tests__/advanced/browser.test.ts` | Tool invocation; navigation |
| `packages/ai/__tests__/advanced/code-mode.test.ts` | Code generation + sandbox execution |
| `packages/ai/__tests__/integration/hitl.miniflare.test.ts` | End-to-end approval |
| `packages/ai/__tests__/integration/code-mode.miniflare.test.ts` | Code-mode executing in real isolate |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/src/stateful/agent.ts` | `this.memory`, `this.requireApproval()`, `this.voice`, `this.email`, `this.browser`, `this.codeMode()` convenience accessors |
| `packages/ai/src/decorators.ts` | `@CodeMode()`, `@RequiresApproval()` on methods |
| `packages/ai/src/provider.ts` | `AiServiceProvider` wires all Phase 8 services |
| `packages/ai/src/events.ts` | Add advanced-primitive events |

## Implementation Details

### 1. HITL (Human-in-the-Loop)

**Pattern to follow**: CF Workflows `step.waitForSignal` for pause/resume.

**Overview**: `requireApproval` persists an approval request in DO state and pauses the agent via `blockConcurrencyWhile` waiting for a signal. External systems POST to a resume endpoint with the decision.

```typescript
// packages/ai/src/hitl/approval.ts
export interface ApprovalRequest {
  id: string;
  step: string;
  payload: Record<string, unknown>;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  decision?: { by: string; decidedAt: number; notes?: string };
}

export async function requireApproval(
  agent: StatefulAgent,
  step: string,
  payload: Record<string, unknown>,
  opts: { timeout?: number; via?: 'mcp' | 'email' | 'webhook' | 'channel'; channel?: Channel } = {},
): Promise<ApprovalRequest> {
  const id = crypto.randomUUID();
  const request: ApprovalRequest = { id, step, payload, createdAt: Date.now(), status: 'pending' };
  await agent.state.storage.put(`hitl:${id}`, request);
  dispatch(new ApprovalRequested(request, opts));

  // Route via selected mechanism
  if (opts.via === 'mcp') await routeViaMcp(request, agent);
  else if (opts.via === 'channel' && opts.channel) await broadcastApprovalRequest(request, opts.channel);

  // Block until signal
  const result = await agent.waitForSignal(`hitl:${id}`, { timeout: opts.timeout ?? 60 * 60 * 1000 });
  if (!result) { request.status = 'expired'; await agent.state.storage.put(`hitl:${id}`, request); }
  return request;
}

export async function approve(agent: StatefulAgent, approvalId: string, decision: 'approved' | 'rejected', opts: { by: string; notes?: string } = { by: 'unknown' }): Promise<void> {
  const request = await agent.state.storage.get<ApprovalRequest>(`hitl:${approvalId}`);
  if (!request) throw new ApprovalNotFoundError(approvalId);
  request.status = decision;
  request.decision = { by: opts.by, decidedAt: Date.now(), notes: opts.notes };
  await agent.state.storage.put(`hitl:${approvalId}`, request);
  await agent.sendSignal(`hitl:${approvalId}`, request);
}
```

**Key decisions**:
- Approval requests persist across DO eviction.
- Multiple concurrent approvals supported — keyed by unique ID.
- Routing mechanisms: MCP elicitation (P7), email, webhook, broadcast channel.
- Default timeout 1h; configurable per call + globally.

**Implementation steps**:
1. Define types.
2. Implement approval state machine with DO storage.
3. Implement routing via each mechanism.
4. Implement `approve()` resume path.
5. `@RequiresApproval(step)` method decorator auto-wraps method with approval gate.

**Feedback loop**: `bun test packages/ai/__tests__/advanced/hitl.test.ts`

### 2. Memory Tiers

**Overview**: Four tiers composed under `agent.memory`:

- `readonly`: static context loaded once at init (e.g., system prompt augmentations, user profile).
- `shortForm`: writable in-DO state (e.g., scratch pad; cleared per conversation).
- `knowledge`: searchable via Vectorize (P5 RAG).
- `skills`: on-demand tool discovery (skills registered lazily, returned as tools when queried).

```typescript
// packages/ai/src/memory/tiers.ts
export class Memory {
  readonly context: ReadonlyMemory;
  readonly shortForm: ShortFormMemory;
  readonly knowledge: KnowledgeMemory;   // RAG-backed
  readonly skills: SkillsMemory;

  constructor(private agent: StatefulAgent, deps: { ragPipeline?: RAGPipeline }) {
    this.context = new ReadonlyMemory(agent);
    this.shortForm = new ShortFormMemory(agent);
    this.knowledge = new KnowledgeMemory(agent, deps.ragPipeline);
    this.skills = new SkillsMemory(agent);
  }
}
```

**Implementation steps**:
1. Implement each tier class.
2. Aggregate into `Memory` facade.
3. Expose as `this.memory` on `StatefulAgent`.

**Feedback loop**: `bun test packages/ai/__tests__/advanced/memory.test.ts`

### 3. Payments — x402 + MPP

**Pattern to follow**: x402 spec (HTTP 402 with challenge headers).

**Overview**: `chargeForTool(tool, price)` wraps tool execution with payment gate. Before execution, tool returns 402 with payment challenge; caller (human or another agent via MPP) responds with payment proof.

```typescript
// packages/ai/src/payments/charge-for-tool.ts
export function chargeForTool<T extends Tool>(tool: T, price: { amount: number; currency: string; asset?: string }): T {
  const originalHandle = tool.handle.bind(tool);
  tool.handle = async (request: ToolRequest): Promise<string> => {
    const payment = request.get<PaymentProof | undefined>('__payment');
    if (!payment) {
      throw new PaymentRequiredError({
        challenge: createChallenge(price),
        priceInfo: price,
      });
    }
    if (!(await verifyPayment(payment, price))) {
      throw new InvalidPaymentError();
    }
    dispatch(new ToolCharged(tool, price, payment));
    return originalHandle(request);
  };
  return tool;
}
```

MPP (agent-to-agent) delegates the payment challenge+response flow between two agent DOs:

```typescript
// packages/ai/src/payments/mpp.ts
export async function payAgent(
  sender: StatefulAgent,
  recipient: SubAgentHandle<any>,
  amount: { amount: number; currency: string },
): Promise<PaymentProof> {
  const challenge = await recipient.requestPayment(amount);
  const proof = await sender.wallet.sign(challenge);
  return proof;
}
```

**Key decisions**:
- x402 implementation wraps tools non-invasively.
- MPP builds on x402 with agent-shaped sender/recipient wallets.
- Wallet is a pluggable abstraction — ship an `InMemoryWallet` for dev and a `CloudflareWalletProvider` stub for prod.

**Implementation steps**:
1. Implement x402 challenge + verify.
2. Implement `chargeForTool` wrapper.
3. Implement `Wallet` interface + `InMemoryWallet` + stub Cloudflare impl.
4. Implement MPP flow between sub-agents.

**Feedback loop**: `bun test packages/ai/__tests__/advanced/payments.test.ts`

### 4. Voice

**Overview**: `Voice.stream()` opens a bidirectional voice session backed by CF Realtime SFU + Workers AI voice models.

```typescript
// packages/ai/src/voice/voice.ts
export class Voice {
  static stream(opts: { agent: StatefulAgent; inputFormat?: 'webrtc' | 'ws-pcm'; voiceId?: string }): VoiceSession { /* ... */ }
}

export class VoiceSession {
  onUtterance(handler: (text: string) => void | Promise<string | void>): this { /* ... */ }
  send(audio: Uint8Array): Promise<void> { /* ... */ }
  say(text: string): Promise<void> { /* TTS → send */ }
  close(): Promise<void> { /* ... */ }
}
```

**Implementation steps**:
1. Integrate with CF Realtime via SFU.
2. VAD + transcription (reuse Transcription from P6).
3. TTS out (reuse Audio from P6).
4. Wire session lifecycle to StatefulAgent.

**Feedback loop**: `bun test packages/ai/__tests__/advanced/voice.test.ts`

### 5. Email

**Overview**: `Email.send()` wraps CF Email Workers; inbound handler routes incoming email to an agent's `onEmail()` method.

```typescript
// packages/ai/src/email/send.ts
export const Email = {
  async send(opts: { to: string; from: string; subject: string; text?: string; html?: string; attachments?: StorableFile[] }): Promise<void> { /* ... */ },
  fake(): EmailFake,
  assertSent(predicate: (msg: EmailMessage) => boolean): void,
};

// Inbound
export function createEmailHandler<A extends StatefulAgent>(AgentClass: new () => A): (msg: ForwardedEmail) => Promise<void> { /* ... */ }
```

**Implementation steps**:
1. Implement send via CF Email Workers API.
2. Implement inbound handler wrapping `ForwardableEmailMessage`.
3. Implement `onEmail()` convention on `StatefulAgent`.

**Feedback loop**: `bun test packages/ai/__tests__/advanced/email.test.ts`

### 6. Browser

**Overview**: `Browser.navigate(url)` wraps CF Browser Rendering. Exposes a Tool agents can use.

```typescript
// packages/ai/src/browser/browser.ts
export const Browser = {
  async navigate(url: string, opts?: BrowserOptions): Promise<BrowserPage> { /* ... */ },
  asTool(opts?: { maxPages?: number }): Tool { /* Tool wrapping navigate for agent use */ },
};

export class BrowserPage {
  async html(): Promise<string>,
  async text(): Promise<string>,
  async screenshot(): Promise<Uint8Array>,
  async pdf(): Promise<Uint8Array>,
  async click(selector: string): Promise<void>,
  async fill(selector: string, value: string): Promise<void>,
  async close(): Promise<void>,
}
```

**Implementation steps**:
1. Wrap CF Browser Rendering binding.
2. Expose BrowserPage methods.
3. Ship `Browser.asTool()` for agent integration.

### 7. CodeMode

**Overview**: Agent generates code to accomplish an intent; code runs in sandboxed isolate.

```typescript
// packages/ai/src/code-mode/code-mode.ts
export function CodeMode(opts?: { sandbox?: 'dynamic-dispatch' | 'loopback'; timeout?: number }) {
  return function (target: StatefulAgent, key: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = async function (this: StatefulAgent, intent: string) {
      const code = await generateCodeForIntent(this, intent);
      const result = await executeInSandbox(this, code, { sandbox: opts?.sandbox ?? 'dynamic-dispatch', timeout: opts?.timeout ?? 30_000 });
      return original ? original.call(this, result) : result;
    };
  };
}

// On StatefulAgent:
async codeMode(intent: string, opts?: CodeModeOpts): Promise<unknown> { /* ... */ }
```

Code generation: agent prompts an LLM with the intent + available tools/bindings → receives JS/TS code. Code executed in a sandbox with a restricted API surface (only explicitly-allowed bindings + a minimal runtime).

**Key decisions**:
- Default sandbox: CF DynamicDispatch (isolate-in-isolate).
- Timeout + memory limits configurable.
- Code cached by intent hash for replay without regeneration.

**Implementation steps**:
1. Implement prompt template for code generation.
2. Implement sandbox runner with restricted bindings.
3. Implement result validation (agent-defined schema).
4. Wire to `@CodeMode()` decorator + convenience method.

**Feedback loop**: `bun test packages/ai/__tests__/advanced/code-mode.test.ts`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `advanced/hitl.test.ts` | Request + approve/reject; timeout expiry; multiple concurrent; MCP routing |
| `advanced/memory.test.ts` | Each tier CRUD; skills lazy-load; knowledge RAG query |
| `advanced/payments.test.ts` | x402 challenge + verify; MPP sender+recipient; invalid payment rejection |
| `advanced/voice.test.ts` | Session lifecycle; VAD chunking; onUtterance → say roundtrip |
| `advanced/email.test.ts` | Send fake + assertions; inbound routes correctly |
| `advanced/browser.test.ts` | Navigate + tool mode |
| `advanced/code-mode.test.ts` | Generate → execute → return; timeout; sandbox escape attempt |

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `integration/hitl.miniflare.test.ts` | Real DO approval flow with signal |
| `integration/code-mode.miniflare.test.ts` | Real sandboxed execution |

**Key scenarios**:
- HITL: agent requests approval → mock human decides → agent resumes with decision
- Memory: load context on init → mutate short-form → query knowledge → register skill on demand
- x402: agent-A calls tool on agent-B → receives challenge → pays → result
- Voice: mock WebRTC stream → transcribe → respond → TTS
- CodeMode: agent generates code to call 2 existing tools → sandbox runs → results aggregated

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| HITL timeout | Mark request expired; emit `ApprovalExpired`; agent continues with default path |
| Memory tier storage full | Auto-compact short-form; knowledge tier defers to Vectorize quota handling |
| Payment proof invalid | Reject tool call; emit `InvalidPayment`; caller retries |
| Voice session drops | Close gracefully; don't crash agent; emit event |
| Email send fails | Retry per CF Email Workers retry policy; DLQ after max |
| Browser page crash | Close page; retry once; surface as `BrowserNavigationError` |
| CodeMode sandbox escape | Sandbox enforces CSP-like restrictions; on violation, throw `SandboxViolationError` |
| CodeMode generated code fails to parse | Retry generation with error context; max 3 attempts |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| HITL | Approval ID leaked to wrong user | Poor URL design | Unauthorized approval | Require auth on approve endpoint + signed URLs |
| Memory | Skill registration cycle | Skill A loads Skill B loads A | Infinite loop | Depth-limit lazy loads |
| Payments | Double-spend | Replay proof | Unauthorized charge | Proofs are single-use; tracked in DO state |
| Voice | Latency spike | Network jitter | Choppy audio | Adaptive jitter buffer; document latency expectations |
| Email | Spoofed inbound | Unauth relay | Agent acts on fake mail | Require SPF/DKIM validation at handler entry |
| Browser | Target site blocks CF | Rendered IP blocked | Navigation fails | Surface as typed error; recommend proxy |
| CodeMode | Generated code burns CPU | Adversarial intent | Worker CPU limit | Timeout + isolation; disallow loops above N iters |
| CodeMode | Generated code leaks secrets | Code reads env | Credential exposure | Isolate strips env; only explicitly-exposed bindings visible |

## Validation Commands

```bash
bun run --filter @roostjs/ai typecheck
bun test packages/ai/__tests__/advanced/
bun test packages/ai/__tests__/integration/hitl.miniflare.test.ts
bun test packages/ai/__tests__/integration/code-mode.miniflare.test.ts
```

## Rollout Considerations

- **Feature flags**: Each primitive opt-in via `ai.features.{hitl,payments,voice,email,browser,codeMode}.enabled`.
- **Bindings**: Voice needs CF Realtime; Email needs CF Email Workers; Browser needs Browser Rendering — all validated at `AiServiceProvider` boot.
- **Monitoring**: Event stream covers approvals, payments, voice sessions, email sent, browser nav, code executions.
- **Rollback**: Each primitive isolated; disable via config.

## Open Items

- [ ] CodeMode sandbox preference (DynamicDispatch vs Loopback) — DynamicDispatch stronger isolation but more setup; likely default.
- [ ] Voice model selection — Workers AI voice models are new; pin list at implementation time.
- [ ] Payments: real on-chain integration vs simulator — ship simulator first with clear docs.
- [ ] Email inbound: DKIM validation library — pick one that runs in Workers.
