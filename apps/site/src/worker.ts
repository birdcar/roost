import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import {
  MARKDOWN_CONTENT_TYPE,
  buildLinkHeader,
  docPathFromUrl,
  estimateTokens,
  isDocsPath,
  stripMarkdownAccept,
  wantsMarkdown,
} from './lib/content'

interface Env {
  ASSETS: Fetcher
}

const handler = createStartHandler(defaultStreamHandler)

const LINK_HEADER = buildLinkHeader()

function markdownResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': MARKDOWN_CONTENT_TYPE,
      'x-markdown-tokens': String(estimateTokens(body)),
      Link: LINK_HEADER,
      Vary: 'Accept',
    },
  })
}

async function fetchAsset(origin: string, path: string, env: Env): Promise<Response | null> {
  const asset = await env.ASSETS.fetch(new Request(`${origin}${path}`)).catch(() => null)
  return asset?.ok ? asset : null
}

async function serveDocMarkdown(url: URL, env: Env): Promise<Response | null> {
  const docPath = docPathFromUrl(url)
  const basePath = docPath === '' ? 'docs' : docPath

  const exact = await fetchAsset(url.origin, `/${basePath}.md.txt`, env)
  if (exact) return markdownResponse(await exact.text())

  const index = await fetchAsset(url.origin, `/${basePath}/index.md.txt`, env)
  if (index) return markdownResponse(await index.text())

  return null
}

async function serveHomepageMarkdown(url: URL, env: Env): Promise<Response | null> {
  const llms = await fetchAsset(url.origin, '/llms.txt', env)
  return llms ? markdownResponse(await llms.text()) : null
}

function withAgentHeaders(response: Response): Response {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('text/html')) return response

  const headers = new Headers(response.headers)
  if (!headers.has('Link')) headers.set('Link', LINK_HEADER)
  const vary = headers.get('Vary')
  if (!vary) headers.set('Vary', 'Accept')
  else if (!vary.split(',').map((s) => s.trim().toLowerCase()).includes('accept')) {
    headers.set('Vary', `${vary}, Accept`)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Static LLM files
    if (url.pathname === '/llms.txt' || url.pathname === '/llms-full.txt') {
      return env.ASSETS.fetch(request)
    }

    if (wantsMarkdown(request)) {
      // Homepage → serve llms.txt as the markdown representation of the site
      if (url.pathname === '/' || url.pathname === '') {
        const home = await serveHomepageMarkdown(url, env)
        if (home) return home
      }

      // Docs root and children → serve corresponding .md.txt asset
      if (isDocsPath(url.pathname)) {
        const doc = await serveDocMarkdown(url, env)
        if (doc) return doc
      }

      // No markdown representation available — strip Accept to prevent
      // downstream handlers from 500'ing on an unhandled content type
      const downgraded = new Request(request, { headers: stripMarkdownAccept(request.headers) })
      const response = await (handler as Function)(downgraded, env, ctx) as Response
      return withAgentHeaders(response)
    }

    const response = await (handler as Function)(request, env, ctx) as Response
    return withAgentHeaders(response)
  },
}
