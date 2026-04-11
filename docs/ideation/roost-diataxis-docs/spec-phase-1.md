# Implementation Spec: Roost Diataxis Docs — Phase 1

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Phase 1 restructures the docs site routing, navigation, and layout to support the 4-pillar Diataxis URL scheme. It also fixes all factually incorrect Anthropic/multi-provider claims in the AI and getting-started docs. No new content pages are written in this phase — only the infrastructure that Phases 2-5 build on.

The existing `doc-layout.tsx` sidebar is a hardcoded `sections` array grouping by package category. We'll replace it with a pillar-first structure: Tutorials, Guides, Reference, Concepts. Each pillar gets a landing page (index route). The current `/docs/packages/*` routes remain functional as redirects during migration — they'll be deleted in Phase 2 after content moves to `/docs/reference/*`.

TanStack Start file-based routing means the directory structure *is* the URL structure. New directories under `apps/site/src/routes/docs/` map directly to `/docs/tutorials/`, `/docs/guides/`, `/docs/reference/`, `/docs/concepts/`.

## Feedback Strategy

**Inner-loop command**: `cd apps/site && bun run dev`

**Playground**: Dev server — navigate to `/docs` and verify sidebar navigation, pillar landing pages, and content corrections render correctly.

**Why this approach**: All changes are to route files and components that render HTML. Visual verification via dev server is the tightest loop.

## File Changes

### New Files

| File Path | Purpose |
|-----------|---------|
| `apps/site/src/routes/docs/tutorials/index.tsx` | Tutorials pillar landing page |
| `apps/site/src/routes/docs/guides/index.tsx` | How-to Guides pillar landing page |
| `apps/site/src/routes/docs/reference/index.tsx` | Reference pillar landing page |
| `apps/site/src/routes/docs/concepts/index.tsx` | Concepts/Explanation pillar landing page |

### Modified Files

| File Path | Changes |
|-----------|---------|
| `apps/site/src/components/doc-layout.tsx` | Replace `sections` array with pillar-first navigation structure |
| `apps/site/src/components/search.tsx` | Update `searchIndex` to include pillar landing pages; update existing paths to new locations |
| `apps/site/src/routes/docs/index.tsx` | Rewrite as Diataxis orientation hub (4-pillar wayfinding) |
| `apps/site/src/routes/docs/getting-started.tsx` | Fix Anthropic API key references (line 22, line 75) — replace with CF Workers AI binding info |
| `apps/site/src/routes/docs/packages/ai.tsx` | Fix subtitle (line 10) — remove "Anthropic, and other providers" claim |

## Implementation Details

### Sidebar Navigation Restructure

**Pattern to follow**: `apps/site/src/components/doc-layout.tsx` (existing `sections` array on lines 4-39)

**Overview**: Replace the package-category sidebar with a pillar-first structure. Each pillar is a top-level section containing its pages. The sidebar should also include a "Getting Started" entry at the top.

```typescript
const sections = [
  {
    title: 'Overview',
    links: [
      { to: '/docs', label: 'Introduction' },
      { to: '/docs/getting-started', label: 'Quick Start' },
    ],
  },
  {
    title: 'Tutorials',
    links: [
      { to: '/docs/tutorials', label: 'All Tutorials' },
      // Tutorial journey links added in Phase 5
    ],
  },
  {
    title: 'Guides',
    links: [
      { to: '/docs/guides', label: 'All Guides' },
      // Per-package guide links added in Phase 3
    ],
  },
  {
    title: 'Reference',
    links: [
      { to: '/docs/reference', label: 'All Reference' },
      // Per-package reference links added in Phase 2
    ],
  },
  {
    title: 'Concepts',
    links: [
      { to: '/docs/concepts', label: 'All Concepts' },
      // Per-package concept links added in Phase 4
    ],
  },
] as const;
```

**Key decisions**:
- Pillar landing pages use "All X" labels to distinguish from individual content pages
- Links for individual pages within each pillar are added in their respective phases (2-5), not here
- The Overview section keeps the introduction and quick-start together as entry points

**Implementation steps**:
1. Replace the `sections` array in `doc-layout.tsx` with the pillar-first structure above
2. Verify sidebar renders correctly with pillar sections
3. Verify active link highlighting still works for new paths

**Feedback loop**:
- **Playground**: Start dev server, navigate to `/docs`
- **Experiment**: Click each pillar link in sidebar, verify routing works and active state highlights correctly
- **Check command**: Visual verification in browser at `localhost:3000/docs`

### Docs Orientation Hub

**Pattern to follow**: `apps/site/src/routes/docs/index.tsx` (existing docs index)

**Overview**: Rewrite `/docs` as a wayfinding page that routes users to the right Diataxis pillar based on their intent. Replace the current architecture overview + package index with a clear 4-quadrant layout.

```tsx
// Core structure of the new orientation hub
function DocsIndexPage() {
  return (
    <DocLayout title="Roost Documentation" subtitle="...">
      {/* Brief welcome + what Roost is (2-3 sentences max) */}
      {/* 4 pillar cards with intent-based headings: */}
      {/*   "Learning Roost?" → Tutorials */}
      {/*   "Building something?" → How-to Guides */}
      {/*   "Looking something up?" → Reference */}
      {/*   "Want to understand why?" → Concepts */}
      {/* Quick Start callout linking to /docs/getting-started */}
    </DocLayout>
  );
}
```

**Key decisions**:
- Keep the orientation hub concise — it's a routing page, not a reading page
- Use intent-based questions as card headings (matches Diataxis's user-state model)
- Retain the Quick Start callout as the primary CTA for new users
- Drop the architecture overview and package index — those move to Concepts and Reference respectively

**Implementation steps**:
1. Rewrite `docs/index.tsx` with 4 pillar cards using intent-based headings
2. Add brief 1-sentence descriptions under each card explaining what that pillar contains
3. Add a prominent "New to Roost?" callout linking to `/docs/getting-started`
4. Style cards as a 2x2 grid (or stacked on mobile)

**Feedback loop**:
- **Playground**: Dev server at `/docs`
- **Experiment**: Verify each card links to the correct pillar landing page; resize window to verify responsive layout
- **Check command**: Visual verification at `localhost:3000/docs`

### Pillar Landing Pages

**Pattern to follow**: `apps/site/src/routes/docs/index.tsx` (page structure with `DocLayout`)

**Overview**: Create 4 landing pages, one per pillar. Each explains what that type of documentation is (per Diataxis) and lists available content. Initially these pages will have placeholder content — actual links are populated in Phases 2-5 as content is written.

Each landing page follows the same structure:
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';

export const Route = createFileRoute('/docs/{pillar}/')({ component: Page });

function Page() {
  return (
    <DocLayout title="{Pillar Name}" subtitle="{Diataxis description}">
      <p>{What this section contains and who it's for}</p>
      {/* Content links added in later phases */}
      <p>Content coming soon.</p>
    </DocLayout>
  );
}
```

**Implementation steps**:
1. Create `apps/site/src/routes/docs/tutorials/index.tsx` — "Learning-oriented lessons that guide you through building real features"
2. Create `apps/site/src/routes/docs/guides/index.tsx` — "Task-oriented instructions for accomplishing specific goals"
3. Create `apps/site/src/routes/docs/reference/index.tsx` — "Technical descriptions of every package, class, and method"
4. Create `apps/site/src/routes/docs/concepts/index.tsx` — "Explanations of architecture, design decisions, and how things work"

### AI Docs Factual Fix

**Overview**: Correct 3 factually incorrect claims about AI providers.

**Fix 1** — `apps/site/src/routes/docs/packages/ai.tsx` line 10:
```
// BEFORE:
subtitle="...Works with Cloudflare AI, Anthropic, and other providers."

// AFTER:
subtitle="...Powered by Cloudflare Workers AI — no API keys required."
```

**Fix 2** — `apps/site/src/routes/docs/getting-started.tsx` line 22:
```
// BEFORE:
<p>Optional: Stripe account for billing, Anthropic API key for AI agents.</p>

// AFTER:
<p>Optional: Stripe account for billing. AI features use Cloudflare Workers AI (included with your Workers account).</p>
```

**Fix 3** — `apps/site/src/routes/docs/getting-started.tsx` lines 74-75:
```
// BEFORE:
# If using AI features
ANTHROPIC_API_KEY=sk-...

// AFTER: remove these 2 lines entirely. AI uses the Workers AI binding, not an API key.
```

**Implementation steps**:
1. Edit `ai.tsx` subtitle
2. Edit `getting-started.tsx` prerequisites paragraph
3. Remove `ANTHROPIC_API_KEY` lines from `.dev.vars` code example
4. Verify no other Anthropic references remain (grep for "anthropic" case-insensitive)

### Search Index Update

**Pattern to follow**: `apps/site/src/components/search.tsx` (existing `searchIndex` array)

**Overview**: Add entries for the 4 new pillar landing pages to the search index.

**Implementation steps**:
1. Add entries for `/docs/tutorials`, `/docs/guides`, `/docs/reference`, `/docs/concepts`
2. Keep existing `/docs/packages/*` entries (they still resolve until Phase 2 migrates content)
3. Update as content pages are added in later phases

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Sidebar navigation | Broken active link highlighting | Path mismatch between sidebar `to` prop and actual route path | Active state not shown, confusing UX | Normalize paths in both sidebar and router; test each link |
| Pillar landing pages | 404 on navigation | File-based route directory doesn't match expected URL | Broken navigation | Verify TanStack Start resolves `/docs/tutorials/` to `docs/tutorials/index.tsx` |
| Search index | Stale paths | Search entries point to old `/docs/packages/*` URLs after Phase 2 deletes them | Search links to 404 pages | Phase 2 spec must update search index when migrating content |

## Validation Commands

```bash
# Type checking
cd apps/site && bunx tsc --noEmit

# Dev server (visual verification)
cd apps/site && bun run dev

# Grep for remaining Anthropic references (should return zero results)
grep -ri "anthropic" apps/site/src/
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
