# Implementation Spec: Roost AI Redesign - Phase 6 (Media: Image + Audio + Transcription)

**Contract**: ./contract.md
**Template**: ./spec-template-media.md
**Depends on**: Phase 1 (Foundation), Phase 4 (Attachments, for image references)
**Estimated Effort**: M

## Technical Approach

All three media builders (Image, Audio, Transcription) share the builder-pattern shape defined in `spec-template-media.md`. This phase instantiates the template three times with media-specific inputs. Each is implemented in `packages/ai/src/media/{name}/` and exposed via `@roostjs/ai/media` (aggregate) and individual subpaths.

Follow the template strictly for each media. This delta file captures only per-media inputs and deviations.

## Feedback Strategy

**Inner-loop command**: `bun test packages/ai/__tests__/media/`

**Playground**: Test suite with small fixture bytes (`packages/ai/__tests__/fixtures/media/` — 1kb test image, 1kb test audio, 5-second test voice clip).

---

## Delta 1: Image

**Factory**: `Image.of(prompt: string)` → `ImageBuilder`

**Supporting providers**: `workers-ai` (`@cf/black-forest-labs/flux-1-schnell`), `openai` (DALL·E 3 / gpt-image-1), `gemini` (Imagen), `xai` (Grok vision), `anthropic` (through Gateway passthrough only if model supports).

**Fluent methods**:
- `.square()` / `.portrait()` / `.landscape()` — aspect ratio
- `.quality('high' | 'medium' | 'low')`
- `.attachments(files: StorableFile[])` — reference images (uses P4 Attachments API)
- `.steps(n: number)` — Workers AI flux steps param (provider-specific, delegated to `providerOptions`)
- `.seed(n: number)`
- `.negativePrompt(prompt: string)`

**Response extras**:
- `mimeType(): string` — detects from bytes (PNG/JPEG/WEBP)
- `asDataUrl(): string` — `data:image/...;base64,...`

**Queue payload**: `{ prompt, options, providers, handleId }`

**Events**: `GeneratingImage`, `ImageGenerated`

**ImagePrompt assertions**: `.contains(text)`, `.isSquare()`, `.isPortrait()`, `.isLandscape()`, `.hasQuality(q)`, `.hasAttachments(n?)`

**Deviations from template**:
- Attachments go as part of the request body to providers that support img-to-img (Gemini Imagen Edit, Grok) — capability check before call.
- DALL·E 3 rejects `seed` — provider adapter silently drops if unsupported; emits `UnsupportedOptionDropped` event.

---

## Delta 2: Audio (Text-to-Speech)

**Factory**: `Audio.of(text: string | Stringable)` → `AudioBuilder`

**Supporting providers**: `openai` (TTS-1 / TTS-1-HD), `elevenlabs` (via Gateway), `workers-ai` (`@cf/myshell-ai/melotts` or successor; capability check).

**Fluent methods**:
- `.male()` — selects provider's default male voice
- `.female()` — selects provider's default female voice
- `.voice(idOrName: string)` — explicit voice selection
- `.instructions(text: string)` — style/tone guidance (e.g., "said like a pirate")
- `.format('mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm')`
- `.speed(multiplier: number)` — 0.25 to 4.0

**Response extras**:
- `mimeType(): string` — derived from requested format
- `format(): string`

**Queue payload**: `{ text, options, providers, handleId }`

**Events**: `GeneratingAudio`, `AudioGenerated`

**AudioPrompt assertions**: `.contains(text)`, `.isMale()`, `.isFemale()`, `.hasVoice(id)`, `.hasFormat(f)`

**Deviations from template**:
- `male()/female()` resolve to provider-specific voice IDs at request-build time (e.g., OpenAI "alloy" for male-default). Capability table.
- ElevenLabs supports `instructions` natively; OpenAI maps it to TTS `instructions` param (gpt-4o-mini-tts model).
- Workers AI TTS models don't support instructions; emit warning, drop option.

---

## Delta 3: Transcription (Speech-to-Text)

**Factory**:
- `Transcription.fromPath(path: string)`
- `Transcription.fromStorage(key: string, opts?: { disk?: string })`
- `Transcription.fromUpload(file: File)`
- `Transcription.fromString(bytes: Uint8Array, mime: string)` — for in-memory audio

→ `TranscriptionBuilder`

**Supporting providers**: `openai` (Whisper-1, gpt-4o-transcribe), `workers-ai` (`@cf/openai/whisper-large-v3-turbo`), `elevenlabs` (via Gateway), `mistral` (via Gateway).

**Fluent methods**:
- `.diarize()` — include speaker segmentation
- `.language(code: string)` — ISO 639-1; hint to model
- `.prompt(context: string)` — vocabulary hint
- `.timestampGranularity('word' | 'segment')`
- `.temperature(t: number)` — 0 to 1

**Response extras**:
- `text` — flat transcription string
- `segments?: Segment[]` — timestamp-aligned segments (when `.timestampGranularity()` used)
- `diarizedSegments?: DiarizedSegment[]` — when `.diarize()` used
- `language?: string` — detected language
- `duration?: number` — audio duration in seconds

**No `.store()` helpers** — transcriptions are text, not binaries. (The template's storage helpers apply to Image/Audio only.)

**Queue payload**: `{ audioRef: { kind: 'path' | 'storage' | 'upload' | 'string'; ... }, options, providers, handleId }`

**Events**: `GeneratingTranscription`, `TranscriptionGenerated`

**TranscriptionPrompt assertions**: `.language === 'en'`, `.isDiarized()`, `.hasGranularity('word')`

**Deviations from template**:
- No `.store()` family on `TranscriptionResponse`.
- `.fromUpload(file)` reads the upload stream into a `Uint8Array` lazily.
- Diarization requires the provider to support it; Workers AI Whisper does not, so `.diarize()` on Workers AI throws `CapabilityNotSupportedError` with suggestion to use OpenAI Whisper.
- Long audio (>25MB for Whisper-1) auto-chunks via VAD-assisted segmentation when available; otherwise a sequential chunker helper ships alongside.

---

## Subpath Exports

```json
// packages/ai/package.json additions
"./media": {
  "types": "./src/media/index.ts",
  "import": "./src/media/index.ts"
},
"./media/image": { ... },
"./media/audio": { ... },
"./media/transcription": { ... }
```

The aggregate `@roostjs/ai/media` re-exports all three. Individual subpaths let users import only what they need.

## Testing Shape

Three folders under `__tests__/media/`, each containing the full template test suite per delta.

| Test File | Coverage |
| --- | --- |
| `media/image/builder.test.ts` | All fluent methods, `.generate()`, `.queue()` |
| `media/image/response.test.ts` | Storage helpers, mime detection, data URL |
| `media/image/job.test.ts` | Serialization, re-materialization |
| `media/image/testing.test.ts` | Fake modes, assertions, preventStrayImages |
| `media/audio/*` | Same shape |
| `media/transcription/*` | Same shape; note diarization assertions |

### Integration Test

| Test File | Coverage |
| --- | --- |
| `integration/media.miniflare.test.ts` | Image generation via Workers AI mock → store to R2 → retrieve; Audio queue round-trip; Transcription fromUpload |

**Key scenarios**:
- `Image.of('...').landscape().quality('high').generate()` sends correct request to each provider
- `Audio.of('...').female().instructions('pirate').generate()` selects correct voice + passes instructions
- `Transcription.fromUpload(file).diarize().generate()` routes to diarization-capable provider; rejects on Workers AI
- Queued path: `.queue().then(r => r.store())` persists to R2 after async completion
- `Image.fake([bytes1, bytes2])` rotates responses; `assertGenerated` matches by prompt predicate
- `Audio.preventStrayAudio()` throws on prompt with no matching fake

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Provider lacks media capability | Capability check at `.generate()` entry; throw `CapabilityNotSupportedError` with suggestion |
| Oversized audio for transcription | Auto-chunk when possible; else throw `AudioTooLargeError` with chunking hint |
| Unsupported format on output | Reject in builder before provider call |
| Voice ID not found on provider | Provider returns 404; surface as `VoiceNotFoundError` |
| Storage disk missing | Validate in `AiServiceProvider` bootstrap |

## Failure Modes

Covered by template; per-media additions:

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| ImageBuilder | `.attachments()` with img-to-img unsupported | Provider doesn't do reference | Provider errors | Capability check; clear message |
| AudioBuilder | Voice ID drift across providers | User copies male voice ID from docs that's actually OpenAI-only | Provider error | Auto-translate `.male()/.female()` per provider; discourage raw IDs |
| TranscriptionBuilder | Language autodetect wrong | Rare but possible | Garbled transcription | Accept; offer `.language()` override; warn when detected language has low confidence |
| TranscriptionBuilder | Diarization output format differs per provider | OpenAI vs ElevenLabs segment shapes | User confusion | Normalize to common `DiarizedSegment[]` shape |

## Validation Commands

```bash
bun run --filter @roostjs/ai typecheck
bun test packages/ai/__tests__/media/
bun test packages/ai/__tests__/integration/media.miniflare.test.ts
```

## Rollout

- **Feature flag**: None.
- **R2 binding**: Required for storage helpers; validated at `AiServiceProvider` boot.
- **Rollback**: Opt-in; non-media agents unaffected.

## Open Items

- [ ] Workers AI TTS model availability — confirm latest model IDs at implementation time.
- [ ] Decide default format per media: Image PNG, Audio MP3, Transcription text.
- [ ] Audio/Transcription provider failover ordering — start with OpenAI primary, Workers AI fallback.
