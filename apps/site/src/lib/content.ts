export function docPathFromUrl(url: URL): string {
  return url.pathname.replace(/\.md$/, '').replace(/^\//, '')
}

export function wantsMarkdown(request: Request): boolean {
  const url = new URL(request.url)
  if (url.pathname.endsWith('.md')) return true
  const accept = request.headers.get('Accept') ?? ''
  return accept.includes('text/markdown') || accept.includes('application/markdown')
}

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'
