# PRD: Roost Framework - Phase 11

**Contract**: ./contract.md
**Phase**: 11 of 11
**Focus**: Documentation site and marketing page — both built as Roost apps

## Phase Overview

Phase 11 ships the public face of Roost. Both the documentation site and the marketing/landing page are built as Roost applications — dogfooding the framework for its own public presence. This proves that Roost can build real, public-facing, content-heavy sites, not just API backends.

This phase is last because it documents everything built in Phases 1-10 and uses the example apps as reference implementations. It also depends on the framework being stable enough to build with confidently.

After this phase, Roost has a public documentation site with getting-started guides, package API references, and example walkthroughs, plus a marketing page that explains the value proposition. Both are deployed to Cloudflare Workers.

## User Stories

1. As a new Roost developer, I want a getting-started guide so that I can go from zero to deployed app quickly.
2. As a Roost developer, I want API documentation for each package so that I can look up methods, interfaces, and configuration.
3. As a Roost developer, I want example walkthroughs so that I can learn patterns from real apps.
4. As a potential Roost adopter, I want a marketing page that explains what Roost is and why I should use it.
5. As the framework author, I want the docs built in Roost so that maintaining docs exercises the framework.

## Functional Requirements

### Documentation Site (apps/docs)

- **FR-11.1**: Built as a Roost app, deployed to Cloudflare Workers
- **FR-11.2**: MDX-based content — documentation written in Markdown with JSX components
- **FR-11.3**: Getting Started guide: install CLI, scaffold project, add auth, add a model, deploy
- **FR-11.4**: Package API docs: @roost/core, @roost/auth, @roost/orm, @roost/ai, @roost/mcp, @roost/billing, @roost/queue, @roost/cloudflare, @roost/testing, @roost/cli
- **FR-11.5**: Example walkthroughs: step-by-step for each example app (todo, AI chat, SaaS starter)
- **FR-11.6**: Search functionality (KV-indexed or client-side)
- **FR-11.7**: Version selector (for future versions)
- **FR-11.8**: Dark/light mode
- **FR-11.9**: Code snippets with syntax highlighting and copy button
- **FR-11.10**: Mobile-responsive layout

### Marketing/Landing Page (apps/marketing)

- **FR-11.11**: Built as a Roost app, deployed to Cloudflare Workers
- **FR-11.12**: Hero section with value proposition and quick start command
- **FR-11.13**: Feature highlights: auth, ORM, AI, MCP, billing, queues, CF bindings
- **FR-11.14**: Code comparison: "Before Roost" (raw Workers) vs "After Roost" (framework code)
- **FR-11.15**: Architecture diagram showing Roost's composition layer
- **FR-11.16**: Links to documentation, GitHub, examples
- **FR-11.17**: Performance callout — edge computing, cold start times, TTFB benchmarks
- **FR-11.18**: SEO optimization — meta tags, Open Graph, structured data

### Content Architecture

- **FR-11.19**: Documentation follows progressive disclosure: getting started → concepts → API reference → advanced
- **FR-11.20**: Each package doc follows consistent structure: overview, installation, quick start, API reference, testing, FAQ
- **FR-11.21**: Code examples are extracted from the actual example apps (not hand-written) to ensure accuracy
- **FR-11.22**: AI/LLM reference section: file conventions, naming patterns, code generation tips — making it easy for AI agents to learn Roost conventions

## Non-Functional Requirements

- **NFR-11.1**: Documentation pages load in < 200ms TTFB (edge-rendered)
- **NFR-11.2**: Marketing page scores 90+ on Lighthouse performance
- **NFR-11.3**: All documentation is searchable within 100ms
- **NFR-11.4**: Mobile-first responsive design — usable on phone screens

## Dependencies

### Prerequisites

- Phases 1-10 complete (all packages exist, example apps built)

### Outputs for Next Phase

- None — this is the final phase. Roost is publicly documented and ready for users.

## Acceptance Criteria

- [ ] Documentation site deploys to Cloudflare Workers as a Roost app
- [ ] Getting Started guide takes a new developer from zero to deployed app
- [ ] Each of the 10 packages has API documentation with examples
- [ ] Example walkthroughs match the actual example app code
- [ ] Documentation search returns relevant results within 100ms
- [ ] Marketing page explains Roost's value proposition clearly
- [ ] Marketing page code comparison shows Roost vs raw Workers
- [ ] Both sites are mobile-responsive
- [ ] Both sites score 90+ on Lighthouse performance
- [ ] AI/LLM reference section documents conventions for code generation
- [ ] All code examples compile and run correctly
