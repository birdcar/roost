#!/usr/bin/env bun
import { glob } from 'fast-glob'
import matter from 'gray-matter'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTENT_DIR = join(__dirname, '../content/docs')
const PUBLIC_DIR = join(__dirname, '../public')
const SITE_URL = 'https://roost.dev'

const SECTIONS = ['tutorials', 'guides', 'reference', 'concepts'] as const
type Section = (typeof SECTIONS)[number]

interface DocEntry {
  path: string
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
    title: (data.title as string) ?? path,
    description: (data.description as string) ?? '',
    section: sectionFromPath(path),
    rawContent: content,
  }
})

const ORDER: Record<Section, number> = { tutorials: 0, guides: 1, reference: 2, concepts: 3 }
entries.sort((a, b) => ORDER[a.section] - ORDER[b.section])

// llms.txt
const sectionLines: Record<Section, string[]> = {
  tutorials: [],
  guides: [],
  reference: [],
  concepts: [],
}
for (const e of entries) {
  sectionLines[e.section].push(
    `- [${e.title}](${SITE_URL}/docs/${e.path}.md): ${e.description}`,
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
      : [],
  ),
].join('\n')

// llms-full.txt
const llmsFullTxt = entries
  .map((e) => `# ${e.title}\n\n> ${e.description}\n\n${e.rawContent}`)
  .join('\n\n---\n\n')

// sitemap.xml
const sitemapEntries = entries.map(
  (e) => `  <url><loc>${SITE_URL}/docs/${e.path}</loc></url>`,
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
  const outPath = join(PUBLIC_DIR, 'docs', `${e.path}.md.txt`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, e.rawContent)
}

console.log(`Generated llms.txt (${entries.length} entries), llms-full.txt, sitemap.xml`)
