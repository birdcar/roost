# Spec Template: Media Builder (Image / Audio / Transcription)

This template defines the shared shape for Phase 6's three media builders. Each delta (Image / Audio / Transcription) fills in the `{placeholders}` with its specifics.

---

## Pattern

Every media builder implements the same five-part shape:

1. **Static factory** — `{MediaClass}.{factoryMethod}(input, opts?)` returns a builder instance.
2. **Chainable config** — fluent methods to set generation parameters (aspect, quality, voice, etc.).
3. **Terminal `.generate()`** — executes the provider call, returns a `{MediaClass}Response`.
4. **Terminal `.queue()`** — dispatches a `{MediaClass}Job` via `@roostjs/queue`, returns a handle.
5. **Storage helpers** — `.store()`, `.storeAs()`, `.storePublicly()`, `.storePubliclyAs()` saving to R2 via `@roostjs/cloudflare`.

All three ship with `.fake()`, `.assertGenerated()`, `.assertQueued()`, `.assertNothingGenerated()`, `.preventStray{MediaName}()`.

## File Changes Shape (per builder)

### New Files

| File Path | Purpose |
| --- | --- |
| `packages/ai/src/media/{mediaName}/builder.ts` | `{MediaClass}` + fluent builder |
| `packages/ai/src/media/{mediaName}/response.ts` | `{MediaClass}Response` with `.store()`, `(string) raw content` |
| `packages/ai/src/media/{mediaName}/job.ts` | `{MediaClass}Job` extending `Job` from `@roostjs/queue` |
| `packages/ai/src/media/{mediaName}/prompt.ts` | `{MediaClass}Prompt` value object for fake assertions |
| `packages/ai/src/media/{mediaName}/testing.ts` | Fake + assertion helpers |
| `packages/ai/src/media/{mediaName}/index.ts` | Subpath re-exports |
| `packages/ai/src/media/{mediaName}/events.ts` | Generating{Media} + {Media}Generated events |
| `packages/ai/src/providers/{providerName}/{mediaName}.ts` | Provider-specific impl (one per supporting provider) |
| `packages/ai/__tests__/media/{mediaName}/builder.test.ts` | Fluent chain; generate; queue |
| `packages/ai/__tests__/media/{mediaName}/response.test.ts` | `.store*` flow |
| `packages/ai/__tests__/media/{mediaName}/job.test.ts` | Serialization + re-materialization |
| `packages/ai/__tests__/media/{mediaName}/testing.test.ts` | Fake modes + assertions |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/ai/src/providers/interface.ts` | Extend `AIProvider` with `{mediaMethod}?(req)` |
| `packages/ai/src/providers/workers-ai.ts` | Implement `{mediaMethod}` if Workers AI supports it |
| `packages/ai/src/providers/{supportingProviders}.ts` | Implement `{mediaMethod}` via provider's API |
| `packages/ai/src/media/index.ts` | Export new builder |
| `packages/ai/src/events.ts` | Re-export new events |
| `packages/ai/src/testing/index.ts` | Re-export fake/assertion helpers |
| `packages/ai/package.json` | Add `./media` subpath export |

## Builder Shape

```typescript
export class {MediaClass} {
  static {factoryMethod}(input: {InputType}, opts?: {OptsType}): {MediaClass}Builder { /* ... */ }
  static fake(responses?: {FakeResponses}): void { /* ... */ }
  static assertGenerated(predicate: ({MediaPrompt}): boolean): void { /* ... */ }
  static assertNotGenerated(predicate: ({MediaPrompt}) => boolean): void { /* ... */ }
  static assertNothingGenerated(): void { /* ... */ }
  static assertQueued(predicate: (Queued{MediaPrompt}) => boolean): void { /* ... */ }
  static assertNotQueued(predicate: (Queued{MediaPrompt}) => boolean): void { /* ... */ }
  static assertNothingQueued(): void { /* ... */ }
  static preventStray{MediaName}(): void { /* ... */ }
}

export class {MediaClass}Builder {
  // {FluentMethods} — chainable config
  timeout(seconds: number): this { /* ... */ }

  // Terminals:
  async generate(opts?: { provider?: Lab | Lab[] }): Promise<{MediaClass}Response> { /* ... */ }
  queue(opts?: { provider?: Lab | Lab[] }): Queued{MediaClass}Handle { /* ... */ }
}

export class {MediaClass}Response {
  constructor(private bytes: Uint8Array, private meta: {ResponseMeta}) {}
  toString(): string { return this.asBase64(); }  // `(string) $image` equivalent

  async store(opts?: { disk?: string }): Promise<string> { /* stores with generated path */ }
  async storeAs(path: string, opts?: { disk?: string }): Promise<string> { /* ... */ }
  async storePublicly(opts?: { disk?: string }): Promise<string> { /* ... */ }
  async storePubliclyAs(path: string, opts?: { disk?: string }): Promise<string> { /* ... */ }
}
```

## Queue Job Shape

```typescript
@Queue('ai-media')
export class {MediaClass}Job extends Job<{
  input: {InputType};
  options: {OptsType};
  providers: Lab[];
  handleId: string;
}> {
  async handle(): Promise<void> {
    const response = await {MediaClass}.{factoryMethod}(this.payload.input, this.payload.options).generate({ provider: this.payload.providers });
    await callbackRegistry.fulfill(this.payload.handleId, response);
  }
}
```

## Implementation Steps

1. Define `{MediaClass}Prompt` value object with helpers for fake assertions (`.contains(text)`, aspect/voice/language inspectors).
2. Implement `{MediaClass}Builder` with chainable methods → returns `this`.
3. Implement `.generate()` routing through provider's `{mediaMethod}`; dispatch `Generating{Media}` → provider call → dispatch `{Media}Generated`.
4. Implement `.queue()` returning `Queued{MediaClass}Handle` with `.then()/.catch()` using the callback registry from Phase 4.
5. Implement `{MediaClass}Response` with storage helpers via `@roostjs/cloudflare`'s `R2Storage`.
6. Implement fake mode + assertions mirroring Laravel's per-feature test helpers.
7. Implement provider adapter(s) for supporting providers.
8. Emit events via `@roostjs/events`.
9. Wire subpath export `@roostjs/ai/media/{mediaName}`.

## Testing Shape

Each builder ships with:

- **Builder tests**: chainable methods preserve instance; `.generate()` calls provider with correct request shape; `.queue()` dispatches job.
- **Response tests**: `(string) resp` returns base64; `.store*()` writes to R2; `.storeAs()` honors path.
- **Job tests**: Serialize/deserialize; re-materialized job produces same response.
- **Testing tests**: `fake()` with array/closure/none; `assertGenerated/assertNotGenerated` predicates; `preventStray{Media}()` throws on undefined call; queued assertions.

## Failure Modes Shape

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| {MediaClass}Builder | Unsupported provider | `.generate({ provider: X })` where X lacks `{mediaMethod}` | Throw | Capability check at build time |
| {MediaClass}Response | Oversized bytes | Large media output | Memory spike | Stream to R2 when size > threshold |
| {MediaClass}Job | Callback registry expired | Long queue delay | `.then()` not fired | Document TTL; emit `CallbackExpired` event |
| Provider adapter | Provider schema change | Upstream API version bump | Parse error | Pin API version; test with recorded fixtures |

## Feedback Strategy Shape

- **Inner-loop command**: `bun test packages/ai/__tests__/media/{mediaName}/`
- **Playground**: Test suite; fixture directory with tiny bytes for fake generation.
- **Experiment**: Chain every builder method; run generate + queue; assert fake scenarios.

## Validation Commands Shape

```bash
bun run --filter @roostjs/ai typecheck
bun test packages/ai/__tests__/media/{mediaName}/
```
