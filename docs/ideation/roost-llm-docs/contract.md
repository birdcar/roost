# Roost LLM-Optimized Documentation Contract

**Created**: 2026-04-11
**Confidence Score**: 96/100
**Status**: Approved
**Supersedes**: None

## Problem Statement

Roost is a framework designed to be used primarily by LLMs — Claude Code, Codex, Gemini CLI, Copilot CLI — to build applications on Cloudflare Workers. But the documentation site is invisible to these tools. All 57 pages of content are embedded in React TSX components with no machine-readable representation. There is no `llms.txt`, no `.md` URL variants, no `robots.txt`, no sitemap, and no way for context7 or any other doc-indexing service to consume the content.

The result: an LLM trying to build a Roost app today has to either hallucinate the API or rely on the user pasting code snippets. That defeats the entire value proposition of the framework — convention-over-configuration only works if the agent knows the conventions.

The secondary problem: there are no agent skills for Roost. A developer using Claude Code, Copilot CLI, or Gemini CLI has no installable skill that teaches the agent about Roost patterns, scaffolds projects, or generates code. The framework is AI-native by design but ships zero AI tooling.

## Goals

1. **Every documentation page is available as clean Markdown** at a `.md` URL (e.g., `/docs/getting-started.md`), suitable for direct consumption by LLMs, context7, and copy-as-markdown buttons.

2. **Ship a spec-compliant `llms.txt`** at `/llms.txt` that indexes all documentation with section grouping and descriptions, plus a `llms-full.txt` that concatenates all content for bulk ingestion.

3. **Publish a cross-platform agent skills package** (via skills.sh distribution) that works in Claude Code, Copilot CLI, Gemini CLI, and Codex — providing Roost scaffolding, code generation, and documentation lookup.

4. **Full SEO and crawlability** — `robots.txt` (allowing AI crawlers), `sitemap.xml`, per-page meta tags (title, description, OG), and canonical URLs on every page.

5. **Content architecture supports both humans and machines** — migrate from TSX-embedded content to MDX source files that serve as the single source of truth for HTML rendering AND markdown serving.

## Success Criteria

- [ ] `curl https://roost.dev/llms.txt` returns a valid, spec-compliant llms.txt with all doc pages listed
- [ ] `curl https://roost.dev/llms-full.txt` returns all doc content concatenated as markdown
- [ ] Every docs page URL with `.md` appended returns clean CommonMark (e.g., `/docs/getting-started.md`)
- [ ] `curl -H "Accept: text/markdown" https://roost.dev/docs/getting-started` returns markdown (content negotiation)
- [ ] All 57 documentation pages are migrated from TSX to MDX source files
- [ ] MDX source files render to HTML for the site AND serve as raw markdown for LLMs
- [ ] `robots.txt` exists at root, allows GPTBot, ClaudeBot, and standard crawlers
- [ ] `sitemap.xml` lists all public pages
- [ ] Every doc page has a unique `<title>`, `<meta description>`, and Open Graph tags
- [ ] Agent skills package installs via `npx skills.sh install roost` (or equivalent)
- [ ] Skills work in Claude Code, Copilot CLI, and Gemini CLI
- [ ] Skills include: project scaffolding, code generation (model, agent, job, etc.), and docs lookup
- [ ] context7 can index the docs via the llms.txt file (ready to submit post-launch)
- [ ] Docs pages include a "Copy as Markdown" button for human users who want to paste context into LLMs

## Scope Boundaries

### In Scope

**Content Migration (MDX)**
- Migrate all 57 TSX route files to MDX source files
- Build MDX rendering pipeline (MDX → React components for HTML, raw content for .md)
- Maintain existing DocLayout, CodeBlock, Callout component system
- Preserve all existing design system styling

**LLM Serving Infrastructure**
- Custom Cloudflare Worker entrypoint wrapping TanStack Start
- `.md` URL suffix handling for all doc routes
- `Accept: text/markdown` content negotiation
- `/llms.txt` — spec-compliant index with section grouping
- `/llms-full.txt` — concatenated full content
- "Copy as Markdown" button on doc pages

**SEO & Crawlability**
- `robots.txt` with AI crawler allowances (GPTBot, ClaudeBot, Anthropic-AI, Google-Extended)
- `sitemap.xml` generation (static or build-time)
- Per-page `head()` with title, description, OG tags, canonical URL
- Structured data (JSON-LD for TechArticle) on doc pages

**Cross-Platform Agent Skills**
- Skills package distributed via skills.sh (works in Claude Code, Copilot CLI, Gemini CLI, Codex)
- `roost-new` skill — scaffold a new Roost project
- `roost-make` skill — generate models, agents, jobs, middleware, tools, controllers
- `roost-docs` skill — fetch Roost documentation from llms.txt / .md URLs
- `roost-conventions` skill — teach the agent Roost file structure and patterns
- Skill metadata for cross-platform discovery

**Content Accuracy & Consistency Audit**
- Audit ALL 57 doc pages against the actual codebase — no doc should be incorrect compared to the source code in `packages/`
- Verify every code example compiles and matches the real API signatures (class names, method signatures, parameter types, return types)
- Fix migration docs: use schema builder / migration helpers as the primary API, note raw SQL as escape hatch
- Ensure guides, tutorials, and reference all use the same API patterns — no contradictions between pages
- Flag and fix any deprecated or non-existent APIs referenced in docs
- Cross-reference `packages/*/src/index.ts` exports against what the docs claim is available

### Out of Scope

- Versioned documentation (e.g., `/docs/v1/`, `/docs/v2/`) — defer until Roost has multiple versions
- Full-text search backend (Algolia, Meilisearch) — current client-side search is adequate
- Automated doc generation from source code (JSDoc → docs) — content is hand-authored
- Translation / i18n — English only for now
- Custom MCP server for Roost docs — context7 serves this purpose
- Interactive playground / REPL in docs — future consideration

### Future Considerations

- context7 submission after docs site is deployed
- Versioned llms.txt (following Next.js pattern: `/docs/v1/llms.txt`)
- Auto-generated API reference from TypeScript types (supplement hand-written docs)
- `@doc-version: 0.1.0` metadata in llms.txt
- MCP server that serves Roost docs directly (alternative to context7)
- AI coding agents guide page (like Next.js `/docs/app/guides/ai-agents`)

## Execution Plan

_Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Phase 1: MDX Pipeline + Worker Entrypoint
  ├── Phase 2: Content Migration (57 pages TSX → MDX)
  │     └── Phase 3: Content Accuracy Audit
  ├── Phase 4: LLM Serving (llms.txt, .md URLs)
  └── Phase 5: SEO (robots.txt, sitemap, meta tags)
Phase 6: Cross-Platform Agent Skills (independent)
```

### Execution Steps

**Strategy**: Hybrid — sequential foundation, then parallel waves.

**Wave 1** — Foundation _(sequential, blocks everything)_
```bash
/execute-spec docs/ideation/roost-llm-docs/spec-phase-1.md
```

**Wave 2** — Content migration + LLM serving + SEO _(parallel after Wave 1)_

Start one Claude Code session, enter delegate mode (Shift+Tab), paste the Wave 2 agent team prompt below.

```bash
# Or run sequentially:
/execute-spec docs/ideation/roost-llm-docs/spec-phase-2.md
/execute-spec docs/ideation/roost-llm-docs/spec-phase-4.md
/execute-spec docs/ideation/roost-llm-docs/spec-phase-5.md
```

**Wave 3** — Content accuracy audit _(after Phase 2 completes)_
```bash
/execute-spec docs/ideation/roost-llm-docs/spec-phase-3.md
```

**Wave 4** — Agent skills _(can start anytime after Wave 1)_
```bash
/execute-spec docs/ideation/roost-llm-docs/spec-phase-6.md
```

### Agent Team Prompt — Wave 2

```
Phase 1 (MDX Pipeline + Worker Entrypoint) is complete.
Create an agent team to implement 3 phases in parallel.

Spawn 3 teammates with plan approval required. Each teammate should:
1. Read their assigned spec file
2. Read spec-phase-1.md to understand the infrastructure they're building on
3. Explore apps/site/ for the current state and patterns
4. Plan their implementation approach and wait for approval
5. Implement following spec and codebase patterns
6. Run validation commands from their spec after implementation

Teammates:

1. "Content Migration" — docs/ideation/roost-llm-docs/spec-phase-2.md
   Migrate all 57 TSX doc pages to MDX source files following
   spec-template-mdx-migration.md. Can sub-dispatch 5 parallel agents
   (one per section: overview, tutorials, guides, reference, concepts).

2. "LLM Serving" — docs/ideation/roost-llm-docs/spec-phase-4.md
   Build llms.txt and llms-full.txt generation, .md URL serving,
   and content negotiation in the Worker entrypoint.

3. "SEO" — docs/ideation/roost-llm-docs/spec-phase-5.md
   Add robots.txt, sitemap.xml generation, per-page meta tags
   with OG/canonical, and JSON-LD structured data.

Coordinate on shared files:
- apps/site/src/worker.ts — LLM Serving teammate owns this file,
  SEO teammate adds robots.txt/sitemap routes via a separate function
  that the worker imports. Only one teammate should modify worker.ts.
- apps/site/scripts/generate-llm-files.ts — LLM Serving teammate
  owns this. SEO teammate can add sitemap generation as a separate
  script or extend the existing one after LLM Serving finishes.
```
