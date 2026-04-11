# Spec: Phase 4 — LLM Serving

**Contract**: [`contract.md`](./contract.md)
**Effort**: M (1–2 days)
**Blocked by**: Phase 1
**Parallel with**: Phase 2, Phase 3, Phase 5

## Overview

Phase 4 implements the machine-readable documentation layer: `llms.txt`, `llms-full.txt`, `.md` URL variants, and `Accept: text/markdown` content negotiation. The infrastructure for all of this was established in Phase 1 (Worker entrypoint + build-time generation script). This phase ensures the generated output meets the spec, verifies the Worker routing works correctly, and polishes the content quality of the LLM-targeted output.

The primary audience for this work is not human readers — it's LLMs and documentation indexers like context7. The quality bar is: an LLM that reads these files should be able to generate correct Roost code on its first attempt without additional context.

## Technical Approach

### llms.txt Spec Compliance

The `llms.txt` spec (llmstxt.org) requires:
- An H1 with the project name as the first line
- A blockquote with a one-paragraph summary immediately after the H1
- Named sections using H2 headers
- Each entry as a Markdown list item: `- [Title](url): description`
- All URLs pointing to the machine-readable `.md` variants, not HTML pages

The `@doc-version` metadata line follows the Next.js convention and should appear after the blockquote, before the first section:

```
# Roost

> Roost is a Laravel-inspired full-stack framework for building applications on Cloudflare Workers. Convention-over-configuration for the edge — models, routing, auth, queues, AI agents, and more, all wired together out of the box.

@doc-version: 0.1.0

## Tutorials

- [Getting Started](https://roost.dev/docs/getting-started.md): Install Roost and scaffold your first Cloudflare Workers project.
- [Build a REST API](https://roost.dev/docs/tutorials/build-a-rest-api.md): Create a typed REST API with routing, middleware, and ORM integration.

## Guides
...
```

The `## Optional` section (defined in the llmstxt.org spec for supplementary content) should include the concepts section, since it's deep background rather than task-oriented:

```
## Optional

- [Architecture Overview](https://roost.dev/docs/concepts/architecture.md): How Roost structures the request lifecycle on Cloudflare Workers.
...
```

### llms-full.txt Structure

The concatenated file is for bulk ingestion — tools that want all the docs in one fetch. The format:

```
# {title}

> {description}

{raw MDX body content}

---

# {next title}
...
```

Order: Tutorials → Guides → Reference → Concepts. The separator `---` (horizontal rule) provides a clear visual break between pages. Frontmatter is stripped; only title, description, and body are included.

Internal links in the `.md` output should point to `.md` URL variants, not HTML pages. The build script rewrites links during `llms-full.txt` generation:

```
[routing guide](/docs/guides/routing) → [routing guide](/docs/guides/routing.md)
```

### .md URL Serving

The Worker (configured in Phase 1) handles `.md` URL requests. This phase verifies the end-to-end behavior:

1. A request to `GET /docs/guides/database.md` arrives at the Worker
2. Worker strips `.md`, resolves to `content/docs/guides/database.mdx`
3. Worker reads the pre-built static asset at `public/docs/guides/database.md.txt`
4. Worker returns the file content with `Content-Type: text/markdown; charset=utf-8`
5. Internal links in the response are `.md` variants

The raw markdown output must be clean CommonMark with no JSX artifacts. The build script (Phase 1) handles stripping frontmatter from the raw output — the `.md.txt` files contain only the body, not the `---` delimiters.

**Edge case: index routes.** The path `/docs/guides` corresponds to `content/docs/guides/index.mdx`. The `.md` URL is `/docs/guides.md`, not `/docs/guides/index.md`. The Worker normalizes this: strip `.md`, try the exact path, then try appending `/index` if not found.

### Content Negotiation

The Worker checks the `Accept` header:

```ts
function wantsMarkdown(request: Request): boolean {
  const url = new URL(request.url)
  if (url.pathname.endsWith('.md')) return true
  const accept = request.headers.get('Accept') ?? ''
  // Prefer explicit text/markdown; also accept application/markdown
  return accept.includes('text/markdown') || accept.includes('application/markdown')
}
```

Tools like `curl -H "Accept: text/markdown"` and context7 use this header.

## File Changes

### Modified Files

| Path | Change |
|------|--------|
| `apps/site/scripts/generate-llm-files.ts` | Ensure link rewriting, Optional section in llms.txt, correct separator format in llms-full.txt |
| `apps/site/src/worker.ts` | Add index-route normalization for `.md` URLs; verify content negotiation header handling |

### Generated Files (build artifacts, not committed)

| Path | Description |
|------|-------------|
| `apps/site/public/llms.txt` | Spec-compliant index |
| `apps/site/public/llms-full.txt` | Full concatenated content |
| `apps/site/public/docs/**/*.md.txt` | Per-page raw markdown for Worker serving |

## Implementation Details

### Link rewriting in build script

```ts
function rewriteInternalLinks(content: string): string {
  // Rewrite internal doc links to .md variants
  // Matches: [text](/docs/some/path) but not already .md links
  return content.replace(
    /\[([^\]]+)\]\((\/docs\/[^)]+?)(?<!\.md)\)/g,
    '[$1]($2.md)'
  )
}
```

Apply this when writing `llms-full.txt` and the per-page `.md.txt` files.

### Worker index-route normalization

```ts
async function serveMarkdown(url: URL, env: Env): Promise<Response | null> {
  const docPath = url.pathname.replace(/\.md$/, '')
  const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

  // Try exact path first
  const exactAsset = await env.ASSETS.fetch(
    new Request(`${url.origin}${docPath}.md.txt`)
  ).catch(() => null)

  if (exactAsset?.ok) {
    return new Response(await exactAsset.text(), {
      headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE },
    })
  }

  // Try index route (e.g., /docs/guides → /docs/guides/index)
  const indexAsset = await env.ASSETS.fetch(
    new Request(`${url.origin}${docPath}/index.md.txt`)
  ).catch(() => null)

  if (indexAsset?.ok) {
    return new Response(await indexAsset.text(), {
      headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE },
    })
  }

  return null
}
```

### llms.txt section ordering

```ts
const SECTION_LABELS: Record<Section, string> = {
  tutorials: 'Tutorials',
  guides: 'Guides',
  reference: 'Reference',
  concepts: 'Optional',  // concepts → Optional per llmstxt.org spec
}
```

## Validation Commands

```bash
# Build to generate all files
bun run --filter roost-site build

# Verify llms.txt structure
cat apps/site/public/llms.txt | head -30

# Verify llms.txt has the right number of entries (should be ~57)
grep -c "^- \[" apps/site/public/llms.txt

# Verify llms-full.txt is non-empty and has separators
wc -l apps/site/public/llms-full.txt
grep -c "^---$" apps/site/public/llms-full.txt

# Verify per-page markdown files were generated
ls apps/site/public/docs/guides/ | head -5

# Dev server: test .md URL serving
bun run --filter roost-site dev &
curl -s http://localhost:5173/docs/getting-started.md | head -10
curl -s http://localhost:5173/docs/guides.md | head -10
curl -sH "Accept: text/markdown" http://localhost:5173/docs/guides/database | head -10

# Verify content type header
curl -sI http://localhost:5173/docs/getting-started.md | grep -i content-type

# Verify llms.txt is served
curl -s http://localhost:5173/llms.txt | head -5
curl -s http://localhost:5173/llms-full.txt | wc -l
```

## Acceptance Criteria

- [ ] `curl https://roost.dev/llms.txt` returns valid spec-compliant llms.txt
- [ ] llms.txt H1 is `# Roost`
- [ ] llms.txt has sections: Tutorials, Guides, Reference, Optional
- [ ] llms.txt includes `@doc-version: 0.1.0` metadata line
- [ ] All llms.txt URLs point to `.md` variants
- [ ] `curl https://roost.dev/llms-full.txt` returns all doc content
- [ ] Every `/docs/**` URL with `.md` appended returns `Content-Type: text/markdown`
- [ ] `Accept: text/markdown` header triggers markdown response
- [ ] Index routes work: `/docs/guides.md` returns the guides index content
- [ ] Internal links in `.md` responses point to `.md` URL variants
