export function docPathFromUrl(url: URL): string {
  return url.pathname.replace(/\.md$/, '').replace(/^\//, '').replace(/\/$/, '')
}

export function wantsMarkdown(request: Request): boolean {
  const url = new URL(request.url)
  if (url.pathname.endsWith('.md')) return true
  const accept = request.headers.get('Accept') ?? ''
  return accept.includes('text/markdown') || accept.includes('application/markdown')
}

export function isDocsPath(pathname: string): boolean {
  const stripped = pathname.replace(/\.md$/, '').replace(/\/$/, '')
  return stripped === '/docs' || stripped.startsWith('/docs/')
}

export function stripMarkdownAccept(headers: Headers): Headers {
  const next = new Headers(headers)
  const accept = next.get('Accept')
  if (!accept) return next

  const cleaned = accept
    .split(',')
    .map((part) => part.trim())
    .filter((part) => {
      const type = part.split(';')[0]?.trim().toLowerCase()
      return type !== 'text/markdown' && type !== 'application/markdown'
    })
    .join(', ')

  if (cleaned.length === 0) next.set('Accept', 'text/html,*/*;q=0.8')
  else next.set('Accept', cleaned)
  return next
}

// Rough GPT-style token estimate. Agents use this header to plan context
// window usage — a ballpark (chars/4) is acceptable per Cloudflare's
// Markdown for Agents convention.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// RFC 8288 Link header advertising agent-facing resources:
// - alternate representations of the site as markdown (llms.txt, llms-full.txt)
// - the XML sitemap for discovery
// - the HTML service documentation
export function buildLinkHeader(): string {
  return [
    '</llms.txt>; rel="alternate"; type="text/markdown"; title="Site index for LLMs"',
    '</llms-full.txt>; rel="alternate"; type="text/markdown"; title="Full documentation for LLMs"',
    '</sitemap.xml>; rel="sitemap"; type="application/xml"',
    '</docs>; rel="service-doc"; type="text/html"',
  ].join(', ')
}

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'
