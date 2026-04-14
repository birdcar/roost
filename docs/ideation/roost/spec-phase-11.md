# Implementation Spec: Roost Framework - Phase 11

**Contract**: ./contract.md
**PRD**: ./prd-phase-11.md
**Estimated Effort**: L

## Technical Approach

Phase 11 builds two Roost apps: a documentation site and a marketing page. Both are built using the Roost framework itself (dogfooding). They're standard Roost apps scaffolded with `roost new`, using TanStack Start for routing/rendering and deployed to Cloudflare Workers.

The docs site uses MDX for content — Markdown files with embedded React components for interactive examples, code blocks, and diagrams. Content lives in the repo alongside the app code. Search is implemented via KV-indexed content or client-side search (flexsearch).

The marketing page is a single-page app with a hero, feature sections, and code comparisons. It's a simpler Roost app — mostly static content with server rendering for SEO.

## Feedback Strategy

**Inner-loop command**: `bun run dev` (inside each app)

**Playground**: Dev server — navigate to pages and verify rendering.

**Why this approach**: Content sites need visual verification. Dev server with HMR is the tightest loop.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `apps/docs/` | Documentation site (full Roost app) |
| `apps/docs/package.json` | App manifest with @roostjs/* deps |
| `apps/docs/wrangler.toml` | CF Workers deployment config |
| `apps/docs/app.config.ts` | TanStack Start config |
| `apps/docs/app/routes/__root.tsx` | Docs layout with sidebar nav |
| `apps/docs/app/routes/index.tsx` | Docs home / getting started |
| `apps/docs/app/routes/docs.$.tsx` | Dynamic catch-all for MDX content |
| `apps/docs/app/components/mdx.tsx` | MDX rendering components |
| `apps/docs/app/components/code-block.tsx` | Syntax-highlighted code with copy |
| `apps/docs/app/components/sidebar.tsx` | Navigation sidebar |
| `apps/docs/app/components/search.tsx` | Search component |
| `apps/docs/app/lib/mdx.ts` | MDX loader and processor |
| `apps/docs/content/` | MDX content files |
| `apps/docs/content/getting-started.mdx` | Getting started guide |
| `apps/docs/content/core/` | @roostjs/core docs |
| `apps/docs/content/auth/` | @roostjs/auth docs |
| `apps/docs/content/orm/` | @roostjs/orm docs |
| `apps/docs/content/ai/` | @roostjs/ai docs |
| `apps/docs/content/mcp/` | @roostjs/mcp docs |
| `apps/docs/content/billing/` | @roostjs/billing docs |
| `apps/docs/content/queue/` | @roostjs/queue docs |
| `apps/docs/content/cloudflare/` | @roostjs/cloudflare docs |
| `apps/docs/content/testing/` | @roostjs/testing docs |
| `apps/docs/content/cli/` | @roostjs/cli docs |
| `apps/docs/content/ai-reference/` | LLM/AI conventions guide |
| `apps/marketing/` | Marketing site (full Roost app) |
| `apps/marketing/package.json` | App manifest |
| `apps/marketing/wrangler.toml` | CF Workers config |
| `apps/marketing/app.config.ts` | TanStack Start config |
| `apps/marketing/app/routes/__root.tsx` | Marketing layout |
| `apps/marketing/app/routes/index.tsx` | Landing page |
| `apps/marketing/app/components/hero.tsx` | Hero section |
| `apps/marketing/app/components/features.tsx` | Feature grid |
| `apps/marketing/app/components/code-compare.tsx` | Before/after code comparison |
| `apps/marketing/app/components/footer.tsx` | Footer |

## Implementation Details

### 1. Documentation Site

**Overview**: MDX-powered docs with sidebar navigation, search, and responsive layout. Each package has its own section following a consistent structure.

**Content structure per package**:
```
content/{package}/
├── index.mdx          # Overview + quick start
├── installation.mdx   # How to add to a project
├── concepts.mdx       # Core concepts and patterns
├── api-reference.mdx  # Full API reference
├── testing.mdx        # How to test with this package
└── examples.mdx       # Code examples (pulled from example apps)
```

**MDX processing**:
- MDX files parsed at build time or on-demand via a server function
- Custom components: `<CodeBlock>`, `<Callout>`, `<ApiTable>`, `<Example>`
- Syntax highlighting via shiki (runs in Worker)
- Table of contents auto-generated from headings

**Search**:
- Content indexed at build time into a JSON search index
- Client-side search via flexsearch (lightweight, no server round-trip)
- Search index stored in KV if it exceeds client bundle size limits

**Navigation**:
- Sidebar generated from content directory structure
- Previous/next links at page bottom
- Breadcrumbs from route hierarchy
- Version selector (UI ready, single version for v0.1)

**Key decisions**:
- MDX over plain Markdown because docs need interactive components (live code examples, tabbed content).
- Client-side search over server-side because it's faster and doesn't require D1.
- No authentication — docs are public.

**Implementation steps**:
1. Scaffold docs app with `roost new docs`
2. Set up MDX processing pipeline (vite-plugin-mdx or custom loader)
3. Create layout with sidebar, search, dark/light mode
4. Write content for all 10 packages following consistent structure
5. Create AI/LLM reference section documenting Roost conventions
6. Add syntax highlighting and copy-to-clipboard
7. Test: all pages render, search returns results, mobile responsive

**Feedback loop**:
- **Playground**: `bun run dev` in apps/docs
- **Experiment**: Navigate to each package's docs, verify rendering. Search for "model" → verify relevant results.
- **Check command**: `bun run dev` + manual browser check

---

### 2. Marketing/Landing Page

**Overview**: Single landing page with hero, features, code comparisons, and links to docs/GitHub.

**Sections**:
1. **Hero**: "The Laravel of Cloudflare Workers" tagline, `npm create roost` quick start, animated terminal demo
2. **Value props**: Enterprise auth (WorkOS), AI-native, edge performance, full TypeScript
3. **Code comparison**: Side-by-side "Raw Workers" vs "Roost" showing the same feature in both
4. **Feature grid**: Cards for each package with icons and one-line descriptions
5. **Architecture diagram**: Visual showing Roost as composition layer over Drizzle, TanStack, WorkOS, Wrangler
6. **CTA**: Links to docs getting-started, GitHub repo, example apps
7. **Footer**: Links, license, Cloudflare + WorkOS attribution

**Key decisions**:
- Server-rendered for SEO — Workers SSR gives fast TTFB.
- No JavaScript required for core content — progressive enhancement for animations.
- Code comparison is the strongest selling point — show concrete before/after.

**Implementation steps**:
1. Scaffold marketing app with `roost new marketing`
2. Build responsive layout with sections
3. Create code comparison component with syntax highlighting
4. Write marketing copy focusing on productivity and enterprise-readiness
5. Add meta tags, Open Graph, and structured data for SEO
6. Test: Lighthouse 90+, mobile responsive, all links work

**Feedback loop**:
- **Playground**: `bun run dev` in apps/marketing
- **Experiment**: Load page, check all sections render. Run Lighthouse audit.
- **Check command**: `bun run dev` + Lighthouse CLI

## Testing Requirements

### Docs Site Tests

| Test | Coverage |
|---|---|
| All MDX files parse without errors | Content validity |
| Navigation sidebar matches content structure | Nav generation |
| Search returns relevant results for "model" | Search indexing |
| Code blocks render with syntax highlighting | MDX components |
| 404 page renders for invalid paths | Error handling |

### Marketing Site Tests

| Test | Coverage |
|---|---|
| Landing page renders with all sections | SSR rendering |
| Meta tags present for SEO | Head management |
| Mobile viewport renders correctly | Responsive design |
| All links resolve to valid destinations | Link integrity |

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| MDX parse error | Build fails with file name and line number |
| Missing content file for route | 404 page with suggestion to check docs index |
| Search index exceeds KV limit | Fall back to client-side-only search |
| Shiki language not supported | Fall back to plain text code block |

## Validation Commands

```bash
# Docs site
cd apps/docs && bun run dev          # Dev server
cd apps/docs && bun run build        # Production build
cd apps/docs && bun test             # Content and component tests

# Marketing site
cd apps/marketing && bun run dev     # Dev server
cd apps/marketing && bun run build   # Production build

# Lighthouse (requires Chrome)
# Run manually after dev server is up
```

## Rollout Considerations

- **DNS**: docs.roost.dev and roost.dev (or similar) pointing to Workers
- **Caching**: Static assets cached at edge with long TTL, MDX pages cached with short TTL
- **Analytics**: PostHog or Cloudflare Web Analytics for tracking docs usage patterns
- **Monitoring**: Cloudflare dashboard for Workers metrics (request count, latency, errors)
