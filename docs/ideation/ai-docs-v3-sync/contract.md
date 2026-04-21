# ai-docs-v3-sync Contract

**Created**: 2026-04-21
**Confidence Score**: 91/100
**Status**: Approved
**Supersedes**: None

## Problem Statement

`@roostjs/ai@0.3.0` shipped on 2026-04-20 with nine phases of work — a breaking
rewrite adding Stateful agents on DO, Sessions, Schedule, Workflows, Sub-agents,
MCP, HITL, Memory tiers, x402 payments, Voice, Email, Browser, CodeMode,
streaming + React client, RAG (Files / Stores / Reranking / EmbeddingPipeline),
Media (Image / Audio / Transcription), tools + attachments + queueing, native
provider adapters (Anthropic / OpenAI / Gemini), and 30+ event classes. The
published package ships a comprehensive README, MIGRATION guide, CHANGELOG, and
five subpath READMEs documenting every primitive.

The Roost docs site at `apps/site/content/docs/` still describes the v0.2 API:
Cloudflare Workers AI exclusively, no API keys, no external providers, no
stateful agents, no multi-provider failover. Users landing on the site from an
npm search or search engine see stale guidance that contradicts the installed
package. Every section in `reference/ai.mdx`, `concepts/ai.mdx`, and
`guides/ai.mdx` requires rewriting against the v0.3 API.

## Goals

1. **Reference parity** — `apps/site/content/docs/reference/ai.mdx` covers every
   v0.3 primitive with working examples, matching the package's README
   structure. Subpath primitives (HITL, Memory, Payments, Voice, Email, Browser,
   CodeMode) appear as H2 sections inline rather than separate pages.
2. **Mental model accuracy** — `concepts/ai.mdx` reframes the Laravel-parity +
   CF-native stance, explains why `StatefulAgent implements DurableObject`
   directly, and documents the opt-in contract pattern
   (`Conversational`, `HasTools`, `HasStructuredOutput`, `HasMiddleware`,
   `HasProviderOptions`).
3. **Task coverage** — `guides/ai.mdx` demonstrates each common task against the
   v0.3 API: class-based agents, tool calling, streaming, queueing, RAG,
   stateful agents, MCP consumption, testing with fakes.
4. **End-to-end tutorial** — `tutorials/ai-agent-walkthrough.mdx` walks a
   developer from empty project to a working stateful agent with tools,
   sessions, and streaming.
5. **Sibling cross-links** — `reference/{workflow,mcp,testing,broadcast}.mdx`
   each get a minimal cross-link to `reference/ai.mdx` pointing at the
   corresponding AI-integration section. No other changes to sibling pages.

## Success Criteria

- [ ] `reference/ai.mdx` contains sections for every subpath export in
      `packages/ai/package.json`: root, rag, media, media/{image,audio,transcription},
      mcp, testing, client, stateful, hitl, memory, payments, voice, email,
      browser, code-mode.
- [ ] `reference/ai.mdx` includes Laravel-parity provider/decorator/failover
      coverage matching the package README's "Provider Support" and "Agents
      (Configuration)" sections.
- [ ] `concepts/ai.mdx` includes a "Philosophy" section mirroring the package
      README's closing note (Roost-native integration of CF Agents SDK
      semantics, not SDK inheritance).
- [ ] `guides/ai.mdx` includes at least one worked example per: agent creation,
      tools, streaming, queueing, Sessions, Workflows, sub-agents, MCP client,
      HITL, and testing.
- [ ] `tutorials/ai-agent-walkthrough.mdx` exists and builds a multi-feature
      agent end-to-end (instructions → tools → Sessions → streaming → tests).
- [ ] `reference/{workflow,mcp,testing,broadcast}.mdx` each have a
      `@roostjs/ai` cross-link block pointing at the relevant
      `reference/ai.mdx` section. No other edits.
- [ ] `bun run --filter roost-site build` succeeds after the rewrites.
- [ ] Visual smoke check: `bun run --filter roost-site dev` renders each touched
      page without MDX errors.

## Scope Boundaries

### In Scope

- Full rewrite of `apps/site/content/docs/reference/ai.mdx`.
- Full rewrite of `apps/site/content/docs/concepts/ai.mdx`.
- Full rewrite of `apps/site/content/docs/guides/ai.mdx`.
- New `apps/site/content/docs/tutorials/ai-agent-walkthrough.mdx`.
- Cross-link additions to
  `apps/site/content/docs/reference/{workflow,mcp,testing,broadcast}.mdx`.
- Verifying `bun run --filter roost-site build` and dev-server rendering.

### Out of Scope

- **Dedicated subpath reference pages** — all subpath primitives stay inline in
  `reference/ai.mdx`. No new `reference/ai-hitl.mdx` etc.
- **Migration page on the site** — users read `packages/ai/MIGRATION.md` in the
  published package; not duplicated on the site.
- **Changelog page on the site** — GitHub releases host the canonical changelog.
- **Tutorials beyond the single walkthrough** — no separate RAG / MCP / voice
  tutorials in this pass.
- **Design-system / component refactors** — MDX content only; no changes to
  `apps/site/src/` layout or styling.
- **Rewriting sibling concept / guide pages** — only the four sibling
  *reference* pages get cross-links; no concepts or guides edits.

### Future Considerations

- Per-subpath deep-dive tutorials (RAG walkthrough, voice agent walkthrough).
- MDX doc-test harness to catch code-example drift.
- Interactive playground embedded in the docs (run examples in-browser).
- Automated site sync from `packages/ai/README.md` on each release.

## Execution Plan

_Added during handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

Single spec, no phases.

### Execution Steps

```bash
/ideation:execute-spec docs/ideation/ai-docs-v3-sync/spec.md
```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
