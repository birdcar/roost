# Spec: Phase 1 — MDX Pipeline + Worker Entrypoint

**Contract**: [`contract.md`](./contract.md)
**Effort**: L (3–5 days)
**Blocks**: Phase 2, Phase 4, Phase 5, Phase 6

## Overview

This phase establishes the two foundational infrastructure pieces that every downstream phase depends on: an MDX content pipeline and a custom Cloudflare Worker entrypoint. Neither delivers visible user-facing features on its own, but nothing else in the project ships without them.

The MDX pipeline replaces embedded JSX content with standalone `.mdx` files in `apps/site/content/docs/`. Each file is the single source of truth for a documentation page — it renders to HTML via React components for the website, and serves as raw Markdown for LLM consumers. Route files become thin wrappers that load content rather than embedding it.

The custom Worker entrypoint sits in front of TanStack Start and intercepts requests that the framework doesn't know about: `.md` URL variants, `/llms.txt`, `/llms-full.txt`, and static files like `robots.txt` and `sitemap.xml`. For everything else, the Worker delegates to the existing TanStack Start server entry unchanged.

## Technical Approach

### MDX Pipeline

Install `@mdx-js/rollup` as a Vite plugin and configure it to process `.mdx` files with remark/rehype plugins for GitHub-flavored Markdown and frontmatter. Content files live in `apps/site/content/docs/` with a path structure that mirrors the route tree (e.g., `content/docs/guides/database.mdx` corresponds to `/docs/guides/database`).

Route components become loaders: they import the `.mdx` file, extract frontmatter (title, description), and pass the compiled React component into `<DocLayout>`. The `DocLayout`, `CodeBlock`, and `Callout` components are unchanged — they're provided as MDX components so JSX directives in `.mdx` files resolve correctly.

A build-time generation script (`scripts/generate-llm-files.ts`) reads all `.mdx` files using `fast-glob`, parses frontmatter with `gray-matter`, and writes `llms.txt`, `llms-full.txt`, and `sitemap.xml` to a `apps/site/public/` directory (which must be created). This script runs as a pre-build step.

### Custom Worker Entrypoint

`apps/site/src/worker.ts` wraps `@tanstack/react-start/server-entry`. On each request it checks the URL pathname and `Accept` header before delegating:

- `GET /llms.txt` or `GET /llms-full.txt` → read from KV or from the bundled static asset
- `GET /robots.txt` or `GET /sitemap.xml` → serve from the `public/` directory
- `GET /docs/**/*.md` → strip `.md`, load the matching content file, return raw Markdown
- `Accept: text/markdown` on any `/docs/**` route → same as above
- Everything else → `return fetch(request, env, ctx)` via the TanStack Start entry

`wrangler.jsonc` is updated to set `main` to `./src/worker.ts` instead of the default entry.

### "Copy as Markdown" Button

A `CopyMarkdownButton` component is added to `apps/site/src/components/`. It fetches `{current-path}.md` and writes the response text to the clipboard using the Clipboard API. The button is wired into `DocLayout` so every docs page gets it automatically, rendered in the page header alongside any existing nav controls.

## File Changes

### New Files

| Path | Description |
|------|-------------|
| `apps/site/content/docs/.gitkeep` | Placeholder; content populated in Phase 2 |
| `apps/site/src/worker.ts` | Custom CF Worker entrypoint |
| `apps/site/src/lib/content.ts` | Utility: resolve MDX file path from route path, read raw markdown |
| `apps/site/src/components/CopyMarkdownButton.tsx` | Clipboard button for doc pages |
| `apps/site/scripts/generate-llm-files.ts` | Build-time generator for llms.txt, llms-full.txt, sitemap.xml |
| `apps/site/public/.gitkeep` | Creates the public directory (required by Vite + Wrangler) |

### Modified Files

| Path | Change |
|------|--------|
| `apps/site/vite.config.ts` | Add `@mdx-js/rollup` plugin, configure MDX components |
| `apps/site/wrangler.jsonc` | Set `main` to `./src/worker.ts` |
| `apps/site/package.json` | Add deps: `@mdx-js/rollup`, `@mdx-js/react`, `remark-gfm`, `remark-frontmatter`, `remark-mdx-frontmatter`, `gray-matter`, `fast-glob`; add `prebuild` script |
| `apps/site/src/components/DocLayout.tsx` | Accept optional `rawPath` prop; render `CopyMarkdownButton` |
| `apps/site/tsconfig.json` | Add `content/**/*.mdx` to includes if needed |

## Implementation Details

### `vite.config.ts` — MDX plugin configuration

```ts
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'

// Inside defineConfig plugins array:
mdx({
  remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
  providerImportSource: '@mdx-js/react',
}),
```

### `apps/site/src/worker.ts`

```ts
import { createRequestHandler } from '@tanstack/react-start/server'
import * as serverEntry from './entry-server'

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

function wantsMarkdown(request: Request): boolean {
  const url = new URL(request.url)
  if (url.pathname.endsWith('.md')) return true
  const accept = request.headers.get('Accept') ?? ''
  return accept.includes('text/markdown')
}

function docPathFromUrl(url: URL): string {
  return url.pathname.replace(/\.md$/, '').replace(/^\//, '')
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Static LLM files
    if (url.pathname === '/llms.txt' || url.pathname === '/llms-full.txt') {
      const asset = await env.ASSETS.fetch(request)
      return asset
    }

    // Raw markdown serving
    if (url.pathname.startsWith('/docs/') && wantsMarkdown(request)) {
      const docPath = docPathFromUrl(url)
      const asset = await env.ASSETS.fetch(
        new Request(`${url.origin}/${docPath}.md.txt`, request)
      )
      if (asset.ok) {
        return new Response(await asset.text(), {
          headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE },
        })
      }
    }

    // Delegate to TanStack Start
    return serverEntry.default.fetch(request, env, ctx)
  },
}
```

> Note: Raw markdown files are stored as `.md.txt` in the `public/` directory during build so Wrangler's asset handling doesn't confuse them with routes. The Worker rewrites the path internally.

### `apps/site/scripts/generate-llm-files.ts`

```ts
#!/usr/bin/env bun
import { glob } from 'fast-glob'
import matter from 'gray-matter'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT_DIR = join(import.meta.dir, '../content/docs')
const PUBLIC_DIR = join(import.meta.dir, '../public')
const SITE_URL = 'https://roost.dev'

const SECTIONS = ['tutorials', 'guides', 'reference', 'concepts'] as const
type Section = typeof SECTIONS[number]

interface DocEntry {
  path: string      // content-relative: guides/database
  title: string
  description: string
  section: Section
  rawContent: string
}

function sectionFromPath(p: string): Section {
  for (const s of SECTIONS) {
    if (p.startsWith(s + '/') || p === s) return s
  }
  return 'guides'
}

const files = await glob('**/*.mdx', { cwd: CONTENT_DIR, absolute: false })
const entries: DocEntry[] = files.map((file) => {
  const raw = readFileSync(join(CONTENT_DIR, file), 'utf8')
  const { data, content } = matter(raw)
  const path = file.replace(/\.mdx$/, '')
  return {
    path,
    title: data.title ?? path,
    description: data.description ?? '',
    section: sectionFromPath(path),
    rawContent: content,
  }
})

// Sort entries: tutorials → guides → reference → concepts
const ORDER: Record<Section, number> = { tutorials: 0, guides: 1, reference: 2, concepts: 3 }
entries.sort((a, b) => ORDER[a.section] - ORDER[b.section])

// llms.txt
const sectionLines: Record<Section, string[]> = {
  tutorials: [], guides: [], reference: [], concepts: [],
}
for (const e of entries) {
  sectionLines[e.section].push(
    `- [${e.title}](${SITE_URL}/docs/${e.path}.md): ${e.description}`
  )
}

const llmsTxt = [
  `# Roost`,
  ``,
  `> Roost is a Laravel-inspired full-stack framework for Cloudflare Workers. Convention-over-configuration for the edge.`,
  ``,
  `@doc-version: 0.1.0`,
  ``,
  ...SECTIONS.flatMap((s) =>
    sectionLines[s].length
      ? [`## ${s.charAt(0).toUpperCase() + s.slice(1)}`, ``, ...sectionLines[s], ``]
      : []
  ),
].join('\n')

// llms-full.txt
const llmsFullTxt = entries
  .map((e) => `# ${e.title}\n\n> ${e.description}\n\n${e.rawContent}`)
  .join('\n\n---\n\n')

// sitemap.xml
const sitemapEntries = entries.map(
  (e) => `  <url><loc>${SITE_URL}/docs/${e.path}</loc></url>`
)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc></url>
${sitemapEntries.join('\n')}
</urlset>`

mkdirSync(PUBLIC_DIR, { recursive: true })
writeFileSync(join(PUBLIC_DIR, 'llms.txt'), llmsTxt)
writeFileSync(join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt)
writeFileSync(join(PUBLIC_DIR, 'sitemap.xml'), sitemap)

// Write raw markdown copies for Worker serving
for (const e of entries) {
  writeFileSync(join(PUBLIC_DIR, `docs/${e.path}.md.txt`), e.rawContent)
}

console.log(`Generated llms.txt (${entries.length} entries), llms-full.txt, sitemap.xml`)
```

### `apps/site/package.json` — prebuild script

```json
{
  "scripts": {
    "prebuild": "bun run scripts/generate-llm-files.ts",
    "build": "tsr generate && vite build"
  }
}
```

### `apps/site/src/components/CopyMarkdownButton.tsx`

```tsx
import { useState } from 'react'

export function CopyMarkdownButton({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function handleClick() {
    try {
      const res = await fetch(`${path}.md`)
      if (!res.ok) throw new Error('fetch failed')
      await navigator.clipboard.writeText(await res.text())
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }

  return (
    <button onClick={handleClick} aria-label="Copy page as Markdown">
      {state === 'copied' ? 'Copied!' : state === 'error' ? 'Error' : 'Copy as Markdown'}
    </button>
  )
}
```

## Validation Commands

```bash
# Install new dependencies
cd apps/site && bun install

# Verify MDX plugin loads without error
bun run vite build --dry-run 2>&1 | head -20

# Run the build-time generator manually
bun run scripts/generate-llm-files.ts

# Confirm generated files exist
ls apps/site/public/llms.txt apps/site/public/llms-full.txt apps/site/public/sitemap.xml

# Full build (runs prebuild automatically)
bun run --filter roost-site build

# Local dev — verify worker routes
bun run --filter roost-site dev
# In another terminal:
curl -s http://localhost:5173/llms.txt | head -10
curl -s http://localhost:5173/docs/getting-started.md | head -20
curl -sH "Accept: text/markdown" http://localhost:5173/docs/getting-started | head -20
```

## Dependencies

```
@mdx-js/rollup        ^3.x
@mdx-js/react         ^3.x
remark-gfm            ^4.x
remark-frontmatter    ^5.x
remark-mdx-frontmatter ^3.x
gray-matter           ^4.x
fast-glob             ^3.x
```
