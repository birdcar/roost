export interface LlmsEntry {
  title: string
  url: string
  description: string
  section: string
}

export function parseLlmsTxt(content: string): LlmsEntry[] {
  const entries: LlmsEntry[] = []
  let currentSection = ''

  for (const line of content.split('\n')) {
    const sectionMatch = line.match(/^## (.+)/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]!
      continue
    }

    const entryMatch = line.match(/^- \[(.+?)\]\((.+?)\)(?:: (.+))?/)
    if (entryMatch) {
      entries.push({
        title: entryMatch[1]!,
        url: entryMatch[2]!,
        description: entryMatch[3] ?? '',
        section: currentSection,
      })
    }
  }

  return entries
}

export function findBestMatch(entries: LlmsEntry[], query: string): LlmsEntry | null {
  const q = query.toLowerCase()
  const exact = entries.find((e) => e.title.toLowerCase() === q)
  if (exact) return exact
  const urlMatch = entries.find((e) => e.url.toLowerCase().includes(q.replace(/\s+/g, '-')))
  if (urlMatch) return urlMatch
  return (
    entries.find(
      (e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
    ) ?? null
  )
}
