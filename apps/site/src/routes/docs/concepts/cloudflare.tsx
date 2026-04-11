import { createFileRoute } from '@tanstack/react-router'
import Content, { frontmatter } from '../../../../content/docs/concepts/cloudflare.mdx'
import { DocLayout } from '../../../components/doc-layout'
import { mdxComponents } from '../../../lib/mdx-components'
import { MDXProvider } from '@mdx-js/react'

export const Route = createFileRoute('/docs/concepts/cloudflare')({
  component: Page,
  head: () => ({
    meta: [
      { title: frontmatter.title },
      { name: 'description', content: frontmatter.description },
    ],
  }),
})

function Page() {
  return (
    <DocLayout title={frontmatter.title} subtitle={frontmatter.description}>
      <MDXProvider components={mdxComponents}>
        <Content />
      </MDXProvider>
    </DocLayout>
  )
}
