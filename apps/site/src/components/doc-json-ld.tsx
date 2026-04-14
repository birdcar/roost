interface Props {
  title: string
  description: string
  url: string
}

export function DocJsonLd({ title, description, url }: Props) {
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    url,
    publisher: {
      '@type': 'Organization',
      name: 'Roost',
      url: 'https://roost.birdcar.dev',
    },
  })

  return <script type="application/ld+json">{json}</script>
}
