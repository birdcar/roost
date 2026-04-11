# Roost Diataxis Documentation Contract

**Created**: 2026-04-10
**Confidence Score**: 96/100
**Status**: Approved
**Supersedes**: None

## Problem Statement

Roost's documentation site is a flat collection of package reference pages that blend tutorials, API descriptions, how-to guidance, and explanations into single monolithic pages per package. This violates every principle of the Diataxis framework — a beginner looking for a guided tutorial gets buried in API signatures, while a practitioner looking up a method signature has to scroll past setup instructions they already know.

Additionally, the AI package docs contain factually incorrect claims. The getting-started page references an `ANTHROPIC_API_KEY` environment variable, the AI page subtitle claims multi-provider support ("Works with Cloudflare AI, Anthropic, and other providers"), and the getting-started prerequisites list an "Anthropic API key" — but the actual `@roost/ai` implementation uses **exclusively** Cloudflare Workers AI via the native `Ai` binding. There is no Anthropic provider, no API key, and no multi-provider support in the shipped code. The only provider is `CloudflareAIProvider`, which wraps `AIClient` → `Ai` (the CF Workers runtime binding), with a default model of `@cf/meta/llama-3.1-8b-instruct`.

## Goals

1. **Restructure docs into 4 Diataxis pillars** — Tutorials, How-to Guides, Reference, and Explanation — with pillar-first URL routing (`/docs/tutorials/*`, `/docs/guides/*`, `/docs/reference/*`, `/docs/concepts/*`)
2. **Write full content for all 4 pillars across all 12 packages** — each package gets proper reference docs, task-oriented guides, understanding-oriented explanations, and contributes to cross-cutting tutorial journeys
3. **Fix all factually incorrect AI documentation** — remove Anthropic API key references, correct provider claims to reflect Cloudflare Workers AI exclusively, ensure code examples use `@cf/meta/*` model identifiers
4. **Rewrite getting-started as a proper Diataxis tutorial** — guided, hands-on, safe path from zero to working Roost app
5. **Create a docs orientation hub** — `/docs` becomes a wayfinding page that routes users to the right pillar based on their intent

## Success Criteria

- [ ] Every URL under `/docs/reference/{package}` contains only neutral, factual API descriptions — no tutorials, no how-to guidance
- [ ] Every URL under `/docs/guides/{package}` addresses a specific named task — not teaching, not describing
- [ ] Every URL under `/docs/concepts/{package}` explains *why* without procedural instructions
- [ ] Cross-cutting tutorials under `/docs/tutorials/` take a user from zero to working feature with every step succeeding
- [ ] Zero references to Anthropic, `ANTHROPIC_API_KEY`, or multi-provider claims anywhere in the docs
- [ ] All AI code examples use `@cf/meta/*` model identifiers and reference the CF Workers AI binding
- [ ] Getting-started page is a hands-on tutorial a beginner can follow start-to-finish without making decisions
- [ ] `/docs` orientation hub routes users to the correct pillar within one click
- [ ] Sidebar navigation groups pages by pillar, not by package
- [ ] Search index covers all new pages with correct paths
- [ ] All 12 packages have content in all 4 pillars (reference, guides, concepts; tutorials may group multiple packages)

## Scope Boundaries

### In Scope

- New routing structure: pillar-first URLs for all 4 Diataxis types
- Updated `DocLayout` sidebar navigation organized by pillar
- Updated search index covering all new pages
- Docs orientation hub at `/docs`
- Full reference documentation for all 12 packages (migrate + restructure existing content)
- How-to guides for all 12 packages
- Explanation/concepts pages for all 12 packages
- Cross-cutting tutorial journeys (3-5 tutorials spanning multiple packages)
- Getting-started rewrite as Diataxis tutorial
- AI docs factual corrections (Anthropic → CF Workers AI)
- Getting-started factual corrections (remove `ANTHROPIC_API_KEY`)

### Out of Scope

- Interactive code playgrounds or embedded REPLs — content-only for now
- Versioned docs (v1 vs v2) — single version until there's a breaking change
- API docs auto-generation from TypeScript source — hand-written reference is fine at this scale
- i18n / translations — English only
- Blog or changelog section — not part of Diataxis
- Marketing page changes — only the `/docs` subtree

### Future Considerations

- Auto-generated API reference from TSDoc comments once the package APIs stabilize
- Search powered by AI (semantic search over docs content via `@roost/ai`)
- Community-contributed tutorials and guides
- Video tutorials alongside written ones

## Execution Plan

### Dependency Graph

```
Phase 1: Infrastructure + Critical Fixes
  ├── Phase 2: Reference Documentation  (blocked by Phase 1)
  ├── Phase 3: How-to Guides            (blocked by Phase 1)
  └── Phase 4: Concepts / Explanation    (blocked by Phase 1)
        │         │              │
        └─────────┴──────────────┘
                  │
        Phase 5: Tutorials               (blocked by Phases 2, 3, 4)
```

### Execution Steps

**Strategy**: Hybrid — Phase 1 sequential, then Phases 2-4 parallel, then Phase 5 sequential

1. **Phase 1 — Infrastructure + Critical Fixes** _(blocking)_
   ```
   /execute-spec docs/ideation/roost-diataxis-docs/spec-phase-1.md
   ```

2. **Phases 2, 3, & 4 — parallel after Phase 1**

   Start one Claude Code session, enter delegate mode (Shift+Tab), paste the agent team prompt below.

3. **Phase 5 — Tutorials** _(blocked by Phases 2-4)_
   ```
   /execute-spec docs/ideation/roost-diataxis-docs/spec-phase-5.md
   ```

### Agent Team Prompt

```
Phase 1 (Infrastructure + Critical Fixes) is complete. The docs site now has
pillar-first routing (/docs/tutorials/, /docs/guides/, /docs/reference/,
/docs/concepts/) with updated sidebar navigation and an orientation hub at /docs.
AI docs Anthropic references have been fixed.

Create an agent team to implement 3 content phases in parallel.
Each phase is independent — no shared files between them except sidebar
and search index updates.

Coordinate on shared files (apps/site/src/components/doc-layout.tsx,
apps/site/src/components/search.tsx) to avoid merge conflicts —
only one teammate should modify a shared file at a time. Suggest
each teammate stages their sidebar/search additions as the LAST step,
then merge sequentially.

Spawn 3 teammates with plan approval required. Each teammate should:
1. Read their assigned spec file
2. Read the existing package docs in apps/site/src/routes/docs/packages/ for content reference
3. Read the actual package source code in packages/{name}/src/ to verify API completeness
4. Plan their implementation approach and wait for approval
5. Implement following spec and codebase patterns
6. Run validation commands from their spec after implementation

Teammates:

1. "Reference Docs" — docs/ideation/roost-diataxis-docs/spec-phase-2.md
   Create reference documentation for all 12 packages. Migrate content from
   existing /docs/packages/* pages, strip non-reference material, expand to
   cover complete API surface. Delete old package pages when done.

2. "How-to Guides" — docs/ideation/roost-diataxis-docs/spec-phase-3.md
   Create task-oriented how-to guides for all 12 packages plus 4 cross-cutting
   guides (migrations, deployment, environment, error handling).

3. "Concepts" — docs/ideation/roost-diataxis-docs/spec-phase-4.md
   Create understanding-oriented explanation pages for all 12 packages plus
   5 cross-cutting architecture pages (architecture, service-container,
   edge-computing, laravel-patterns, testing-philosophy).
```
