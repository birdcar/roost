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

    // Raw markdown serving
    if (url.pathname.startsWith('/docs/') && wantsMarkdown(request)) {
      const docPath = docPathFromUrl(url)
      const asset = await env.ASSETS.fetch(
        new Request(`${url.origin}/${docPath}.md.txt`),
      )
      if (asset.ok) {
        return new Response(await asset.text(), {
          headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE },
        })
      }
    }

    // Delegate to TanStack Start, forwarding env/ctx for binding access
    return (handler as Function)(request, env, ctx) as Promise<Response>
  },
}
