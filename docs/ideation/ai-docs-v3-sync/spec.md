# Implementation Spec: ai-docs-v3-sync

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Four MDX rewrites, one new MDX file, four minimal cross-link additions, one new
TanStack Router route file. No runtime code changes.

**Source of truth** for every v0.3 claim is the published package:

- `packages/ai/README.md` — primary reference (matches Laravel AI SDK TOC).
- `packages/ai/MIGRATION.md` — v0.2 → v0.3 breaking-change list.
- `packages/ai/CHANGELOG.md` — feature index.
- `packages/ai/src/rag/README.md`, `src/media/README.md`, `src/mcp/README.md`,
  `src/testing/README.md`, `src/client/README.md` — subpath deep dives.
- `packages/ai/src/**` — source for signature checks when a doc example
  references a specific API.

When in doubt, read the source file (e.g. `packages/ai/src/stateful/agent.ts`
for `StatefulAgent` members) rather than paraphrasing the READMEs.

## Feedback Strategy

**Inner-loop command**: `bun run --filter roost-site build`

**Playground**: dev server — `bun run --filter roost-site dev`, open
<http://localhost:5173/docs/reference/ai> and the other three touched URLs;
verify each renders without MDX errors and the TOC matches the file.

**Why this approach**: MDX build is fast (sub-second) and catches import or
frontmatter issues. Visual rendering catches heading-structure and code-fence
issues the build misses. No unit test layer is appropriate for doc content.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `apps/site/content/docs/tutorials/ai-agent-walkthrough.mdx` | End-to-end walkthrough: instructions → tools → Sessions → streaming → tests. |
| `apps/site/src/routes/docs/tutorials/ai-agent-walkthrough.tsx` | TanStack Router route wrapper — copy shape from `build-a-task-api.tsx`. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `apps/site/content/docs/reference/ai.mdx` | Full rewrite matching `packages/ai/README.md` structure. All subpath primitives inline as H2 sections. |
| `apps/site/content/docs/concepts/ai.mdx` | Full rewrite — Laravel-parity mental model, opt-in contracts, Philosophy section. |
| `apps/site/content/docs/guides/ai.mdx` | Full rewrite — task-oriented examples for all v0.3 primitives. |
| `apps/site/content/docs/reference/workflow.mdx` | Add a short `@roostjs/ai` cross-link block pointing at `reference/ai.mdx#workflows`. |
| `apps/site/content/docs/reference/mcp.mdx` | Add cross-link pointing at `reference/ai.mdx#mcp`. Clarify this page is `@roostjs/mcp` (server primitives), distinct from `@roostjs/ai/mcp`. |
| `apps/site/content/docs/reference/testing.mdx` | Add cross-link pointing at `reference/ai.mdx#testing`. |
| `apps/site/content/docs/reference/broadcast.mdx` | Add cross-link pointing at `reference/ai.mdx#broadcasting`. |

## Implementation Details

### 1. `reference/ai.mdx` — full rewrite

**Pattern to follow**: `packages/ai/README.md` — mirror its TOC verbatim in
H2 ordering. Expand sections where the README stays terse (the README is
front-page; the reference page is exhaustive).

**Overview**: Port README headings into MDX. Each example block becomes a
`ts`-fenced code block with `title="…"` attributes matching the analogous
examples in `reference/orm.mdx` (which is the closest-in-size sibling).

**Sections (in order)**:

1. Installation
2. Configuration (`AiServiceProvider` registration, config keys)
3. Custom Base URLs (Gateway)
4. Provider Support table
5. Agents
   5.1 Prompting
   5.2 Conversation Context (Sessions)
   5.3 Structured Output
   5.4 Attachments
   5.5 Streaming (+ Vercel protocol)
   5.6 Broadcasting
   5.7 Queueing
   5.8 Tools (user + provider)
   5.9 Middleware
   5.10 Anonymous Agents
   5.11 Agent Configuration (decorators: `@Provider`, `@Model`, `@MaxSteps`,
        `@MaxTokens`, `@Temperature`, `@Timeout`, `@UseCheapestModel`,
        `@UseSmartestModel`)
   5.12 Provider Options
6. Images
7. Audio (TTS)
8. Transcription (STT)
9. Embeddings (+ caching)
10. Reranking
11. Files
12. Vector Stores
13. Failover
14. Testing (all feature fakes)
15. Events
16. Stateful Agents (`StatefulAgent`, `@Stateful`, `@Scheduled`, `Sessions`)
17. Workflows (`@Workflow`, `AgentWorkflowClient`, step helpers)
18. Sub-agents (`this.subAgent`, typed RPC, abort/delete)
19. MCP (client, `McpAgent`, `createMcpHandler`, `McpPortal`)
20. HITL (`requireApproval`, `approve`, `@RequiresApproval`, MCP bridge)
21. Memory (four tiers: context, short-form, knowledge, skills)
22. Payments (x402 `chargeForTool`, MPP `payAgent`)
23. Voice (`Voice.stream`, `VoiceSession`, bridges)
24. Email (`Email.send`, `createEmailHandler`)
25. Browser (`Browser.navigate`, `Browser.asTool`)
26. CodeMode (`runCodeMode`, `@CodeMode`, sandbox)

**Key decisions**:

- Each H2 gets a short intro paragraph, then a canonical example, then a
  signature block (only for exported types whose shape matters).
- Cross-link between sections liberally (e.g. "Broadcasting" links to
  `reference/broadcast.mdx` and the main `@roostjs/ai` broadcast bridging).
- Include a one-line "Import from" note under each subpath section, e.g.
  `Import from \`@roostjs/ai/hitl\`.`
- Drop every v0.2-only claim: no "Workers AI only", no "no API keys", no
  "Cloudflare-exclusive".

**Implementation steps**:

1. Read current `reference/ai.mdx` end-to-end to understand tone and fence
   conventions.
2. Read `packages/ai/README.md` as primary source.
3. Spot-check each code example against `packages/ai/src/**` before writing it.
4. Draft frontmatter (`title`, `description`) — update description to mention
   Laravel-parity + CF-native integration, multi-provider failover.
5. Port each section, expanding where reference requires more detail than the
   README front page provides.
6. Build + render check at the end.

**Feedback loop**: `bun run --filter roost-site build` after each big section
(Agents, RAG, Media, Advanced). Render check in dev server once at the end.

### 2. `concepts/ai.mdx` — full rewrite

**Pattern to follow**: existing `concepts/orm.mdx` or `concepts/queue.mdx`
structure — "why" not "how".

**Overview**: Replace v0.2 "Why Workers AI exclusively" framing with a
Laravel-parity + CF-native stance.

**Sections**:

1. Why Class-Based Agents (keep, lightly update)
2. The Opt-In Contract Pattern (NEW — explain `Conversational`, `HasTools`,
   `HasStructuredOutput`, `HasMiddleware`, `HasProviderOptions` with runtime
   predicates)
3. The Agentic Loop (keep, update to mention failover + max-steps)
4. Multi-Provider Strategy (NEW — Workers AI + Gateway + native adapters)
5. Stateful vs Stateless Agents (NEW — when to reach for `StatefulAgent`
   vs `Agent`, DO semantics, Sessions)
6. Roost-Native Integration (NEW — "Philosophy" note from README: we integrate
   CF Agents SDK *semantics* via Roost-native implementations, not via SDK
   inheritance; `StatefulAgent implements DurableObject` directly)
7. Testing Philosophy (NEW — fakes + assertions replace provider mocking)

**Implementation steps**:

1. Read the existing concepts/ai.mdx (122 lines) — preserve any voice choices
   that fit v0.3.
2. Draft the new sections against the README's Philosophy and Laravel-parity
   framing.
3. Build check.

### 3. `guides/ai.mdx` — full rewrite

**Pattern to follow**: existing `guides/orm.mdx` / `guides/queue.mdx` — each
"How to X" section is short, task-focused, ends with a full working code block.

**Tasks to cover** (one H2 per task):

1. Create an AI agent (class-based Agent, instructions).
2. Register multiple providers with failover.
3. Call tools from an agent (user tool + provider tool).
4. Stream a response (SSE + Vercel AI SDK protocol).
5. Queue a long-running prompt (`.queue()` thenable).
6. Persist conversation history (Sessions via `RemembersConversations`).
7. Schedule a method to run daily (`@Scheduled`).
8. Run a method as a durable Workflow (`@Workflow`).
9. Spawn a sub-agent and aggregate results.
10. Consume a remote MCP server.
11. Expose an agent as an MCP server (`createMcpHandler`).
12. Require human approval before a destructive action (`requireApproval`).
13. Query RAG knowledge alongside a conversation.
14. Test an agent without hitting the AI binding (`Agent.fake()` +
    `preventStrayPrompts`).

**Implementation steps**:

1. Read current guides/ai.mdx for tone.
2. Write each task as "How to {verb}" with a 3-sentence intro + one full code
   block + one link to the relevant `reference/ai.mdx` section.
3. Build + render check.

### 4. `tutorials/ai-agent-walkthrough.mdx` — new

**Pattern to follow**: `tutorials/build-a-task-api.mdx` for structure (numbered
steps, prose between code blocks, "Next steps" at the end).

**Walkthrough outline**: build a `SupportAgent` from scratch.

1. Scaffolding: `bun add @roostjs/ai @roostjs/schema`, register provider.
2. First prompt: write `instructions()`, call `agent.prompt()`.
3. Add a tool: define `LookupTool` implementing `Tool`, add `HasTools`
   contract, demonstrate tool call.
4. Stream to the browser: swap `prompt()` → `stream()`, wire SSE.
5. Persist conversation: upgrade to `StatefulAgent` + `@Stateful` +
   `RemembersConversations`; show DO binding config in `wrangler.jsonc`.
6. Test it: `SupportAgent.fake()`, `assertPrompted`, `preventStrayPrompts`.
7. Deploy: reference `deploy-to-cloudflare.mdx`.

**Also create the route file** at
`apps/site/src/routes/docs/tutorials/ai-agent-walkthrough.tsx` copying the
shape of `build-a-task-api.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import Content, { frontmatter } from '../../../../content/docs/tutorials/ai-agent-walkthrough.mdx'
import { DocLayout } from '../../../components/doc-layout'
import { mdxComponents } from '../../../lib/mdx-components'
import { createDocHead } from '../../../lib/doc-head'
import { MDXProvider } from '@mdx-js/react'

export const Route = createFileRoute('/docs/tutorials/ai-agent-walkthrough')({
  component: Page,
  head: () => createDocHead(frontmatter, 'docs/tutorials/ai-agent-walkthrough'),
})

function Page() {
  return (
    <DocLayout title={frontmatter.title} subtitle={frontmatter.description}>
      <MDXProvider components={mdxComponents}>
        <Content />
      </MDXProvider>
    </DocLayout>
  )
}
```

**Implementation steps**:

1. Read `tutorials/build-a-task-api.mdx` and its route file.
2. Draft the walkthrough.
3. Create both files; ensure TanStack Router picks up the new route (the
   route tree is generated — check `apps/site/src/routeTree.gen.ts` updates on
   next `bun dev`).
4. Build + render check.

### 5. Sibling cross-link blocks

**Pattern**: add a short callout near the top of each sibling reference page.
Match the phrasing used in other cross-references on the site (spot-check
`reference/workflow.mdx` for the existing "Related packages" convention, or
introduce a new one if none exists).

**Template**:

```mdx
> **Using with AI agents?** `@roostjs/ai` wraps `@roostjs/{sibling}` — see
> [AI reference → {section}](/docs/reference/ai#{anchor}) for agent-side APIs.
```

**Per-file placement**:

- `reference/workflow.mdx`: after the intro, before Installation. Anchor:
  `#workflows`.
- `reference/mcp.mdx`: at the top as a note — clarify this page is
  `@roostjs/mcp` (standalone MCP server package), distinct from
  `@roostjs/ai/mcp` (agent-side MCP client/server). Anchor: `#mcp`.
- `reference/testing.mdx`: after intro. Anchor: `#testing`.
- `reference/broadcast.mdx`: after intro. Anchor: `#broadcasting`.

**Implementation steps**:

1. Read each sibling to find the right insertion point.
2. Add the callout. No other changes.
3. Build check.

## Testing Requirements

### Unit Tests

No unit tests — this is MDX content.

### Integration / Smoke Tests

1. `bun run --filter roost-site build` exits 0.
2. Dev-server render of each touched page (`dev` + visit URL) — no MDX compile
   errors, no broken internal links.
3. Anchor links in cross-link callouts resolve to real headings inside
   `reference/ai.mdx`.

### Manual Testing

- [ ] Open `/docs/reference/ai` in dev. Walk the ToC. Every v0.3 primitive has
      a section. No v0.2 residue ("Workers AI exclusively", "no API keys").
- [ ] Open `/docs/concepts/ai`. Philosophy and opt-in contract sections
      present.
- [ ] Open `/docs/guides/ai`. Each listed task has a worked example.
- [ ] Open `/docs/tutorials/ai-agent-walkthrough`. Steps 1–7 render; code
      blocks are syntactically valid TypeScript.
- [ ] Open each sibling page: cross-link callout renders and its anchor link
      jumps to the right section in `reference/ai.mdx`.

## Error Handling

| Error Scenario | Handling |
| --- | --- |
| MDX frontmatter missing `title` / `description` | Build fails — DocLayout reads these. Always include both. |
| Code fence language unsupported | Rendered as plain text; build succeeds. Prefer `ts`, `tsx`, `jsonc`, `bash`. |
| Broken internal link (anchor typo) | No build-time check; caught in manual review. |
| TanStack Router doesn't pick up new route | Run `bun run --filter roost-site dev` once; it regenerates `routeTree.gen.ts`. |
| Sibling page already has a cross-link convention | Reuse it instead of introducing a new one. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `reference/ai.mdx` rewrite | Code example drifts from actual API | Paraphrasing README instead of reading source | User copy-paste fails | Spot-check each example against `packages/ai/src/` before committing |
| `guides/ai.mdx` | Task example references removed v0.2 API | Carried-forward snippet not updated | Confuses v0.3 users | Grep for `CloudflareAIProvider`, `queued: true`, inline `tools = [...]` patterns before finalising |
| Tutorial | Steps skip a wrangler.toml prerequisite | Assuming context from other tutorials | Readers hit runtime errors | Include wrangler config in step 5 explicitly |
| Cross-link callouts | Anchor typo → 404 on scroll | Section renamed during rewrite | Broken scroll behaviour | Add cross-links *after* `reference/ai.mdx` section names are finalised |
| Build | `bun run build` fails on missing frontmatter | Forgot title / description | CI breaks | Copy frontmatter from neighbouring page when creating new MDX |

## Validation Commands

```bash
# Docs site build
bun run --filter roost-site build

# Dev-server render check
bun run --filter roost-site dev
# Visit:
#   http://localhost:5173/docs/reference/ai
#   http://localhost:5173/docs/concepts/ai
#   http://localhost:5173/docs/guides/ai
#   http://localhost:5173/docs/tutorials/ai-agent-walkthrough
#   http://localhost:5173/docs/reference/workflow
#   http://localhost:5173/docs/reference/mcp
#   http://localhost:5173/docs/reference/testing
#   http://localhost:5173/docs/reference/broadcast

# Grep for v0.2 residue
rg "CloudflareAIProvider|Workers AI exclusively|no API keys" apps/site/content/docs/
```

Last command should return zero matches after the rewrite.

## Rollout Considerations

- **Deployment**: `deploy-site.yml` auto-deploys on pushes touching
  `apps/site/**`. No manual step required.
- **Rollback**: `git revert` on the docs commit; redeploy triggers automatically.
- **Announcement**: optional — mention in the next release note that docs are
  now synced with v0.3.

## Open Items

- [ ] If an existing sibling cross-link convention isn't found during step 5,
      decide whether to introduce a new callout style or inline the link in
      prose. Default: callout blockquote as shown in the template.
- [ ] If any v0.3 API proves under-documented in the README (spotted while
      writing the reference page), file an issue against `packages/ai` to
      update the README — do not silently invent behaviour in the doc site.
