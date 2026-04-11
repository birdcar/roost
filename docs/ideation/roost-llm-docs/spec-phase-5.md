# Spec: Phase 5 — SEO

**Contract**: [`contract.md`](./contract.md)
**Effort**: S (0.5–1 day)
**Blocked by**: Phase 1
**Parallel with**: Phase 2, Phase 3, Phase 4

## Overview

Three SEO deliverables: `robots.txt`, `sitemap.xml`, and per-page meta tags. All three are straightforward once Phase 1's MDX pipeline and build-time generation script are in place. The sitemap and per-page meta tags are driven by frontmatter from the content files.

This phase also adds JSON-LD structured data (`TechArticle`) to documentation pages, which improves how search engines understand and display doc content.

## Technical Approach

### robots.txt

A static file in `apps/site/public/robots.txt`. The content explicitly allows all major AI crawlers by user-agent name, which is the current best practice for an AI-native project that wants its docs indexed by LLM providers:

```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Anthropic-AI
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: https://roost.dev/sitemap.xml
```

The Worker (Phase 1) already serves `robots.txt` from the `public/` directory. No Worker changes required.

### sitemap.xml

Generated at build time by the Phase 1 script (`scripts/generate-llm-files.ts`). The sitemap includes all HTML pages (not `.md` URL variants — sitemaps list canonical URLs).

Extended format with `<changefreq>` and `<priority>`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://roost.dev/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://roost.dev/docs/getting-started</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  ...
</urlset>
```

Priority tiers:
- Homepage: `1.0`
- Tutorial and guide pages: `0.8`
- Reference pages: `0.7`
- Concept pages: `0.6`

### Per-page Meta Tags

Each doc route exports a `head()` function from TanStack Start's route API. The title and description come from MDX frontmatter, which is imported into the route file as `frontmatter`.

To avoid repeating boilerplate in all 57 route files, create a `createDocHead()` helper:

```ts
// apps/site/src/lib/doc-head.ts
interface DocFrontmatter {
  title: string
  description: string
}

export function createDocHead(frontmatter: DocFrontmatter, path: string) {
  const url = `https://roost.dev/${path}`
  const title = `${frontmatter.title} — Roost`
  return {
    meta: [
      { title },
      { name: 'description', content: frontmatter.description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: frontmatter.description },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: url },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: frontmatter.description },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
```

Usage in each route file:

```tsx
export const Route = createFileRoute('/docs/getting-started')({
  component: GettingStartedPage,
  head: () => createDocHead(frontmatter, 'docs/getting-started'),
})
```

### JSON-LD Structured Data

Add a `DocJsonLd` component that renders a `<script type="application/ld+json">` tag with `TechArticle` schema. The structured data is built from trusted, controlled frontmatter values — not user input. Wire it into `DocLayout`.

```tsx
// apps/site/src/components/DocJsonLd.tsx
interface Props {
  title: string
  description: string
  url: string
}

export function DocJsonLd({ title, description, url }: Props) {
  // All values come from build-time frontmatter — not user-supplied content.
  // JSON.stringify produces valid JSON with no unescaped HTML.
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    url,
    publisher: {
      '@type': 'Organization',
      name: 'Roost',
      url: 'https://roost.dev',
    },
  })

  return <script type="application/ld+json">{json}</script>
}
```

> Note: React renders `<script>` children as text content, not innerHTML, so no XSS risk. This is the standard pattern for JSON-LD in React SSR applications.

The `DocLayout` component renders `<DocJsonLd>` when `title`, `description`, and the current pathname are available. Use TanStack Start's `useRouter()` to get the current pathname.

## File Changes

### New Files

| Path | Description |
|------|-------------|
| `apps/site/public/robots.txt` | Static robots.txt with AI crawler allowances |
| `apps/site/src/lib/doc-head.ts` | `createDocHead()` helper for route `head()` functions |
| `apps/site/src/components/DocJsonLd.tsx` | JSON-LD TechArticle component |

### Modified Files

| Path | Change |
|------|--------|
| `apps/site/scripts/generate-llm-files.ts` | Extend sitemap with priority tiers and `<changefreq>` |
| `apps/site/src/components/DocLayout.tsx` | Render `<DocJsonLd>` |
| All 57 route files | Add `head: () => createDocHead(frontmatter, 'docs/{path}')` |

> Note: The route file changes can be applied during Phase 2 migration if Phase 2 and Phase 5 are being worked simultaneously. The `createDocHead()` helper should be written and available before Phase 2 agents start.

## Implementation Details

### Sitemap generation with priority tiers

```ts
function sitemapPriority(section: Section): string {
  const tiers: Record<Section, string> = {
    tutorials: '0.8',
    guides: '0.8',
    reference: '0.7',
    concepts: '0.6',
  }
  return tiers[section]
}

const sitemapEntries = entries.map((e) => `  <url>
    <loc>${SITE_URL}/docs/${e.path}</loc>
    <changefreq>weekly</changefreq>
    <priority>${sitemapPriority(e.section)}</priority>
  </url>`)

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${sitemapEntries.join('\n')}
</urlset>`
```

## Validation Commands

```bash
# Verify robots.txt exists and has correct content
cat apps/site/public/robots.txt

# Verify sitemap was generated
cat apps/site/public/sitemap.xml | head -20

# Count sitemap entries (should be ~58: 1 homepage + 57 docs)
grep -c "<loc>" apps/site/public/sitemap.xml

# Dev server: verify all files are served
bun run --filter roost-site dev &
curl -s http://localhost:5173/robots.txt
curl -s http://localhost:5173/sitemap.xml | head -10

# Check a doc page has correct title tag
curl -s http://localhost:5173/docs/getting-started | grep -o "<title>[^<]*</title>"

# Check a doc page has description meta tag
curl -s http://localhost:5173/docs/getting-started | grep 'name="description"'

# Check JSON-LD is present
curl -s http://localhost:5173/docs/getting-started | grep 'application/ld+json'

# Check canonical link
curl -s http://localhost:5173/docs/getting-started | grep 'rel="canonical"'
```

## Acceptance Criteria

- [ ] `robots.txt` exists at root; allows GPTBot, ClaudeBot, Anthropic-AI, Google-Extended, PerplexityBot
- [ ] `sitemap.xml` lists all 58 URLs (homepage + 57 docs pages)
- [ ] Every doc page has a unique `<title>` tag in the format `{Page Title} — Roost`
- [ ] Every doc page has a `<meta name="description">` tag matching the frontmatter description
- [ ] Every doc page has Open Graph tags (`og:title`, `og:description`, `og:type`, `og:url`)
- [ ] Every doc page has a `<link rel="canonical">` tag
- [ ] Every doc page has a `<script type="application/ld+json">` with `@type: TechArticle`
- [ ] No two doc pages have the same `<title>` value
