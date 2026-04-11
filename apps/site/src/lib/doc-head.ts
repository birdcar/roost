interface DocFrontmatter {
  title: string
  description: string
}

export function createDocHead(frontmatter: DocFrontmatter, path: string) {
  const url = `https://roost.dev/${path}`
  const title = `${frontmatter.title} — Roost`
  return {
    meta: [
      { title },
      { name: 'description', content: frontmatter.description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: frontmatter.description },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: url },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: frontmatter.description },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
