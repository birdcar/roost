import { createFileRoute } from '@tanstack/react-router'
import { createDocHead } from '../../../lib/doc-head'
import { MDXProvider } from '@mdx-js/react'
import Content, { frontmatter } from '../../../../content/docs/reference/mcp.mdx'
import { DocLayout } from '../../../components/doc-layout'
import { mdxComponents } from '../../../lib/mdx-components'

export const Route = createFileRoute('/docs/reference/mcp')({
  component: Page,
  head: () => createDocHead(frontmatter, 'docs/reference/mcp'),
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
