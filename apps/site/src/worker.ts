import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { MARKDOWN_CONTENT_TYPE, docPathFromUrl, wantsMarkdown } from './lib/content'

interface Env {
  ASSETS: Fetcher
}

const handler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Static LLM files
    if (url.pathname === '/llms.txt' || url.pathname === '/llms-full.txt') {
      return env.ASSETS.fetch(request)
    }

    // Raw markdown serving with index-route normalization
    if (url.pathname.startsWith('/docs/') && wantsMarkdown(request)) {
      const docPath = docPathFromUrl(url)

      // Try exact path first
      const exactAsset = await env.ASSETS.fetch(
        new Request(`${url.origin}/${docPath}.md.txt`),
      ).catch(() => null)

      if (exactAsset?.ok) {
        return new Response(await exactAsset.text(), {
          headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE },
        })
      }

      // Try index route (e.g., /docs/guides.md → docs/guides/index.md.txt)
      const indexAsset = await env.ASSETS.fetch(
        new Request(`${url.origin}/${docPath}/index.md.txt`),
      ).catch(() => null)

      if (indexAsset?.ok) {
        return new Response(await indexAsset.text(), {
          headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE },
        })
      }
    }

    // Delegate to TanStack Start, forwarding env/ctx for binding access
    return (handler as Function)(request, env, ctx) as Promise<Response>
  },
}
