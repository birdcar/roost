# Context Map: ai-docs-v3-sync

**Phase**: 1
**Scout Confidence**: 88/100
**Verdict**: GO

## Dimensions

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 19/20 | Spec and contract are exhaustive — exact file list, section order, and per-file step list. Only ambiguity is which sibling cross-link "convention" to pick; spec admits none exists and defaults to a blockquote. |
| Pattern familiarity | 18/20 | Strong references: `reference/orm.mdx` and `guides/orm.mdx` are closest-in-size siblings; `tutorials/build-a-task-api.{mdx,tsx}` is a near-1:1 analogue for the new tutorial + route. `concepts/orm.mdx` and `concepts/queue.mdx` establish the "why, not how" voice. MDX components (`CodeBlock`, `Callout`) and wiring (`mdx-components.tsx`, `doc-head.ts`, `DocLayout`) are minimal and well-factored. |
| Dependency awareness | 17/20 | Route tree auto-generates (`routeTree.gen.ts`) when `bun run --filter roost-site dev` runs — new route picked up automatically. `apps/site/src/components/doc-layout.tsx` sidebar is hard-coded (lines 16-22 tutorials list) — adding a new tutorial requires an edit there if we want sidebar discoverability. Spec does NOT mention this; flagging as risk. Sidebar is the only manual wiring needed beyond the two new files. |
| Edge case coverage | 17/20 | Spec's Failure Modes table covers frontmatter/code-fence/anchor/route-gen issues. Not covered: sidebar wiring for new tutorial; README-vs-source drift for `agent.broadcast()` (README shows an API that does not exist in source — see Risks). |
| Test strategy | 17/20 | Clear: `bun run --filter roost-site build` + dev-server visual + a grep for v0.2 residue. No unit tests appropriate. Could add anchor-link validation step but not required. |

## Key Patterns

- `packages/ai/README.md` (475 lines) — primary source of truth. Has complete TOC (lines 9-40) to mirror verbatim in `reference/ai.mdx`. Each section is terse (one example) so reference page must expand significantly.
- `packages/ai/MIGRATION.md` (379 lines) — canonical breaking-change list and regex recipes; useful for `concepts/ai.mdx` "opt-in contracts" section and for grep'ing out v0.2 residue.
- `packages/ai/CHANGELOG.md` (75 lines) — feature inventory, confirms v0.3.0 shipped 2026-04-20, lists every subpath export.
- `packages/ai/package.json` (lines 5-74) — authoritative subpath exports: `.`, `/rag`, `/media`, `/media/image`, `/media/audio`, `/media/transcription`, `/mcp`, `/testing`, `/client`, `/stateful`, `/hitl`, `/memory`, `/payments`, `/voice`, `/email`, `/browser`, `/code-mode`.
- `packages/ai/src/contracts.ts` (58 lines) — five opt-in interfaces (`Conversational`, `HasTools`, `HasStructuredOutput`, `HasMiddleware`, `HasProviderOptions`) + runtime predicates (`isConversational`, `hasTools`, etc.). Use verbatim in `concepts/ai.mdx` opt-in pattern section.
- `packages/ai/src/decorators.ts` — full decorator inventory: `@Provider`, `@Model`, `@MaxSteps`, `@MaxTokens`, `@Temperature`, `@Timeout`, `@UseCheapestModel`, `@UseSmartestModel`, `@Stateful`, `@Scheduled`, `@Queue`, `@Delay`, `@MaxRetries`, `@RetryAfter`, `@Backoff`, `@JobTimeout`, `@WorkflowStep`, `@SubAgentCapable`, `@RequiresApproval`, `@CodeMode`.
- `packages/ai/src/index.ts` (215 lines) — authoritative root exports. Use as ground truth when writing reference signatures. Notably exports both `WorkersAIProvider` AND `CloudflareAIProvider` (kept for tooling reasons, despite MIGRATION saying hard-removed).
- `packages/ai/src/stateful/agent.ts` (lines 54-114) — `StatefulAgent` class shape, `StatefulAgentCtx` interface; constructor `(ctx, env)`. Source confirms "implements DurableObject directly" claim from Philosophy.
- `packages/ai/src/anonymous.ts` (lines 11-40) — `agent()` factory returns `AnonymousAgent` with `prompt` method only (no `stream` or `queue`). `AgentOptions` shape: `instructions`, `name?`, `messages?`, `tools?`, `schema?`, `middleware?`, `providerOptions?`, `provider?`, plus queue metadata.
- `packages/ai/src/{rag,media,mcp,testing,client}/README.md` — subpath-specific deep dives.
- `apps/site/content/docs/reference/orm.mdx` — closest-in-size reference sibling. Uses `### Instance Methods` / `### Static Methods` subheadings; method signatures as `#### \`methodName(args): ReturnType\``; `bash title="terminal"` and `jsonc title="wrangler.jsonc"` code fences.
- `apps/site/content/docs/concepts/orm.mdx` — establishes "why, not how" voice. No imports; pure prose with H2 sections.
- `apps/site/content/docs/guides/orm.mdx` + `guides/queue.mdx` — each H2 is "How to {verb}" + 2-3-sentence intro + one complete TS code block + optional short follow-up prose.
- `apps/site/content/docs/tutorials/build-a-task-api.mdx` — 11 numbered steps + "What you built" + "Next steps". Uses `<Callout type="note">` heavily (imports from `'../../../src/components/callout'`).
- `apps/site/src/routes/docs/tutorials/build-a-task-api.tsx` (22 lines) — 1:1 template for the new tutorial route.
- `apps/site/src/lib/mdx-components.tsx` (15 lines) — `mdxComponents` exports `pre`, `code`, `Callout`. `code` recognises `className.startsWith('language-')` OR a `title` prop and renders `<CodeBlock title={title}>`.
- `apps/site/src/lib/doc-head.ts` (23 lines) — reads `frontmatter.title` and `frontmatter.description`. Both fields MUST be present.
- `apps/site/src/components/doc-layout.tsx` (lines 6-99) — **Hard-coded sidebar link list**. Tutorials section lines 15-22: the new tutorial should be added here for sidebar discoverability.

## Dependencies

- `reference/ai.mdx` — consumed by → sidebar link in `apps/site/src/components/doc-layout.tsx:59`, cross-link from the four sibling reference pages (anchor fragments `#workflows`, `#mcp`, `#testing`, `#broadcasting`), cross-link from tutorial's "Next steps".
- `concepts/ai.mdx` — consumed by → sidebar `apps/site/src/components/doc-layout.tsx:86`; tutorial "Next steps".
- `guides/ai.mdx` — consumed by → sidebar `apps/site/src/components/doc-layout.tsx:37`; tutorial "Next steps".
- `tutorials/ai-agent-walkthrough.mdx` (new) — consumed by → sidebar tutorials list in `apps/site/src/components/doc-layout.tsx:15-22` **(requires manual edit)**; route file imports the MDX.
- `apps/site/src/routes/docs/tutorials/ai-agent-walkthrough.tsx` (new) — consumed by → `apps/site/src/routeTree.gen.ts` (auto-regenerated on `bun run --filter roost-site dev`).
- `reference/{workflow,mcp,testing,broadcast}.mdx` — each gets a cross-link block pointing at `reference/ai.mdx#{workflows,mcp,testing,broadcasting}`. No consumers change.
- `scripts/generate-llm-files.ts` (via `prebuild` in `apps/site/package.json`) — runs before every `vite build`.

## Conventions

- **Frontmatter**: `title:` (quoted, includes `@roostjs/ai` where applicable) and `description:` (one sentence, sub-140 chars preferred). Both required — `createDocHead` reads them.
- **H1 elision**: DocLayout renders the title as `<h1>`. MDX files MUST NOT include an `# H1 title` — start at `## Section`.
- **H2/H3 structure**: `## Top-level section`, `### Sub-section`, `#### \`methodSignature(args): Return\`` for method-by-method reference. TOC is built from H2/H3 in `DocLayout`.
- **Code fences**:
  - `bash title="terminal"` or `terminal title="terminal"` for shell.
  - `jsonc title="wrangler.jsonc"` for wrangler config.
  - `ts title="src/file.ts"` OR `ts src/file.ts` (both render identically).
  - Plain `ts` for illustrative snippets without a filename.
- **Imports in MDX**: import from relative path `'../../../src/components/callout'` (from `content/docs/tutorials/`, `content/docs/reference/`, `content/docs/concepts/`, `content/docs/guides/` — all 3-deep).
- **Callouts**: `<Callout type="note">`, `type="tip"`, or `type="warning"` only.
- **Cross-link convention**: None currently exists on reference pages. The spec template (blockquote) is NEW. Safe to introduce.
- **Internal links**: `/docs/reference/{pkg}`, `/docs/concepts/{pkg}`, `/docs/guides/{pkg}`, `/docs/tutorials/{slug}`. Anchor fragments are slugified: lowercases, replaces non-alphanum with `-`, trims. So `## Conversation Context (Sessions)` → `#conversation-context-sessions`; `## MCP` → `#mcp`; `## Audio (TTS)` → `#audio-tts`.
- **"Next steps" footer pattern** (tutorials): bullet list linking to reference/guides/concepts for the same package.
- **Title formatting**: Reference/concepts/guides use `"@roostjs/ai"`. Tutorials use plain English title.

## Risks

- **README `agent.broadcast(event, text)` API does not exist in source**. Writing the reference's `### Broadcasting` section by paraphrasing the README would ship a broken example. Use the actual exported API (`broadcastStream`/`broadcastNow` via deep import, or dispatch a `@roostjs/broadcast` event). File an issue against `packages/ai` README per spec Open Items #2.
- **Sidebar not mentioned in spec**. The new tutorial needs an entry in `apps/site/src/components/doc-layout.tsx:15-22` for sidebar discoverability. Add in the same PR — one-line change.
- **Spot-checking README examples against source is labor-intensive across 26 sections**. Allocate time; when in doubt, read source.
- **`CloudflareAIProvider` still exported** in `src/index.ts:136` but MIGRATION says removed. Reference page should use `WorkersAIProvider` canonically — do not mention the legacy alias.
- **Validation grep currently returns matches**. `concepts/ai.mdx`, `reference/ai.mdx`, `guides/ai.mdx` all contain v0.2 residue. Rewrite must purge all of them.
- **No anchor-link validator in build**. Broken internal anchors silently 404 on scroll. Use slugify rule above.
- **Route tree regeneration timing**. `routeTree.gen.ts` updates on `bun run dev` (not on first `build` after adding a route file). Safer sequence: `dev` once → `build`.
- **`prebuild` script (`generate-llm-files.ts`)** runs before every vite build; check its output if build fails without a clear MDX diagnostic.
