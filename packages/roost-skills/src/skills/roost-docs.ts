#!/usr/bin/env node
import { getCached, setCached } from '../lib/cache.js'
import { parseLlmsTxt, findBestMatch } from '../lib/llms-parser.js'

const LLMS_TXT_URL = 'https://roost.dev/llms.txt'
const CACHE_KEY_INDEX = 'llms_txt'

const args = process.argv.slice(2)
const refresh = args.includes('--refresh')
const topic = args.find((a) => !a.startsWith('--'))

async function fetchWithCache(url: string, key: string): Promise<string> {
  if (!refresh) {
    const cached = getCached(key)
    if (cached) return cached
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const text = await res.text()
  setCached(key, text)
  return text
}

const llmsTxt = await fetchWithCache(LLMS_TXT_URL, CACHE_KEY_INDEX)

if (!topic) {
  console.log(llmsTxt)
  process.exit(0)
}

const entries = parseLlmsTxt(llmsTxt)
const match = findBestMatch(entries, topic)

if (!match) {
  console.error(`No documentation found for "${topic}"`)
  console.error(`\nAvailable topics:`)
  for (const e of entries) {
    console.error(`  ${e.title}`)
  }
  process.exit(1)
}

const mdUrl = match.url
const cacheKey = `doc_${mdUrl.replace(/[^a-z0-9]/gi, '_')}`
const content = await fetchWithCache(mdUrl, cacheKey)

console.log(`# ${match.title}\n`)
console.log(`> ${match.description}\n`)
console.log(content)
