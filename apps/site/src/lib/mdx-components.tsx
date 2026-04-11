import type { ReactNode } from 'react'
import { CodeBlock } from '../components/code-block'
import { Callout } from '../components/callout'

export const mdxComponents = {
  pre: ({ children }: { children: ReactNode }) => <>{children}</>,
  code: ({ className, title, children, ...rest }: { className?: string; title?: string; children?: string; [key: string]: unknown }) => {
    if (className?.startsWith('language-') || title) {
      return <CodeBlock title={title}>{String(children)}</CodeBlock>
    }
    return <code {...rest}>{children}</code>
  },
  Callout,
}
