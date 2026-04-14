import { createFileRoute } from '@tanstack/react-router'
import Content, { frontmatter } from '../../../../content/docs/reference/feature-flags.mdx'
import { DocLayout } from '../../../components/doc-layout'
import { mdxComponents } from '../../../lib/mdx-components'
import { createDocHead } from '../../../lib/doc-head'
import { MDXProvider } from '@mdx-js/react'

export const Route = createFileRoute('/docs/reference/feature-flags')({
  component: Page,
  head: () => createDocHead(frontmatter, 'docs/reference/feature-flags'),
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
