import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'

const CACHE_DIR = join(homedir(), '.roost', 'docs-cache')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function getCached(key: string): string | null {
  const file = join(CACHE_DIR, key.replace(/[^a-z0-9]/gi, '_'))
  if (!existsSync(file)) return null
  const age = Date.now() - statSync(file).mtimeMs
  if (age > CACHE_TTL_MS) return null
  return readFileSync(file, 'utf8')
}

export function setCached(key: string, value: string): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  const file = join(CACHE_DIR, key.replace(/[^a-z0-9]/gi, '_'))
  writeFileSync(file, value)
}
