# Spec: MDX Migration Template

**Contract**: [`contract.md`](./contract.md)
**Used by**: [`spec-phase-2.md`](./spec-phase-2.md)
**Effort per file**: ~10–20 min (human); ~2 min (agent)

## Purpose

This is the repeatable migration pattern for converting a single TSX route file to an MDX content file + thin route wrapper. Every one of the 57 doc pages follows this exact process. Phase 2 references this template rather than duplicating the instructions.

## Prerequisites

Phase 1 must be complete:
- `apps/site/content/docs/` directory exists
- MDX pipeline is configured in `vite.config.ts`
- `@mdx-js/rollup`, `remark-gfm`, `remark-frontmatter`, `remark-mdx-frontmatter` are installed
- `apps/site/src/lib/content.ts` exists

## Migration Steps

### Step 1: Read the TSX route file

Open the source file at `apps/site/src/routes/docs/{path}.tsx`. Identify:

- The `DocLayout` props: `title`, `description` (these become frontmatter)
- All content inside the `<DocLayout>` body (this becomes the MDX body)
- Any imports used for child components (`CodeBlock`, `Callout`, etc.)

### Step 2: Extract and convert content

Convert JSX elements to Markdown/MDX. Apply these rules:

| JSX | Markdown/MDX |
|-----|-------------|
| `<h1>Text</h1>` | `# Text` |
| `<h2>Text</h2>` | `## Text` |
| `<h3>Text</h3>` | `### Text` |
| `<p>Text</p>` | `Text` (blank line before/after) |
| `<ul><li>Item</li></ul>` | `- Item` |
| `<ol><li>Item</li></ol>` | `1. Item` |
| `<a href="url">text</a>` | `[text](url)` |
| `<code>x</code>` | `` `x` `` |
| `<strong>x</strong>` | `**x**` |
| `<em>x</em>` | `_x_` |
| `<CodeBlock title="x" lang="ts">{code}</CodeBlock>` | ```` ```ts title="x" ```` + code + ```` ``` ```` |
| `<Callout type="tip"><p>text</p></Callout>` | `:::tip` + newline + `text` + newline + `:::` |
| `<Callout type="warning"><p>text</p></Callout>` | `:::warning` + newline + text + newline + `:::` |
| `<Callout type="danger"><p>text</p></Callout>` | `:::danger` + newline + text + newline + `:::` |
| `<Callout type="info"><p>text</p></Callout>` | `:::info` + newline + text + newline + `:::` |
| Inline `{' '}` whitespace JSX | Remove (plain space in markdown) |
| `{/* comment */}` | Remove |

For `CodeBlock`, the full conversion looks like:

```
// Input TSX:
<CodeBlock title="app/models/user.ts" lang="typescript">
{`import { Model } from '@roost/orm'

export class User extends Model {}`}
</CodeBlock>

// Output MDX:
```typescript title="app/models/user.ts"
import { Model } from '@roost/orm'

export class User extends Model {}
```
```

For `Callout` directives, you'll need the `remark-directive` plugin (add in Phase 1 if not already included, or add it now):

```
// Input TSX:
<Callout type="tip">
  <p>Use the schema builder for migrations instead of raw SQL.</p>
</Callout>

// Output MDX:
:::tip
Use the schema builder for migrations instead of raw SQL.
:::
```

If `remark-directive` is not configured, keep `<Callout>` as a JSX component in the MDX file — MDX supports inline JSX, so this is a valid fallback. Import it at the top of the `.mdx` file:

```mdx
import { Callout } from '../../components/Callout'
```

### Step 3: Write the frontmatter

The frontmatter goes at the very top of the `.mdx` file:

```yaml
---
title: Getting Started
description: Install Roost and create your first Cloudflare Workers application in under five minutes.
---
```

- `title`: match the `title` prop from `<DocLayout title="...">`
- `description`: match the `description` prop from `<DocLayout description="...">`

### Step 4: Write the `.mdx` file

Create the file at:

```
apps/site/content/docs/{route-segment}/{page-name}.mdx
```

Where `{route-segment}/{page-name}` mirrors the route path. Examples:

| Route file | Content file |
|-----------|--------------|
| `routes/docs/index.tsx` | `content/docs/index.mdx` |
| `routes/docs/getting-started.tsx` | `content/docs/getting-started.mdx` |
| `routes/docs/guides/index.tsx` | `content/docs/guides/index.mdx` |
| `routes/docs/guides/database.tsx` | `content/docs/guides/database.mdx` |
| `routes/docs/reference/orm.tsx` | `content/docs/reference/orm.mdx` |

Full `.mdx` file structure:

```mdx
---
title: Page Title
description: One sentence describing this page.
---

Body content in Markdown here. Use ## for sections, ### for subsections.

```typescript title="example.ts"
// code examples use fenced code blocks
```

:::tip
Optional callout using directive syntax.
:::
```

### Step 5: Update the route file

Replace the route file's body with a thin wrapper that:
1. Imports the `.mdx` file
2. Extracts frontmatter (automatically exported as `frontmatter` by `remark-mdx-frontmatter`)
3. Renders `<DocLayout>` with the MDX component as children

```tsx
// apps/site/src/routes/docs/getting-started.tsx
import { createFileRoute } from '@tanstack/react-router'
import Content, { frontmatter } from '../../../content/docs/getting-started.mdx'
import { DocLayout } from '../../components/DocLayout'
import { mdxComponents } from '../../lib/mdx-components'
import { MDXProvider } from '@mdx-js/react'

export const Route = createFileRoute('/docs/getting-started')({
  component: GettingStartedPage,
  head: () => ({
    meta: [
      { title: frontmatter.title },
      { name: 'description', content: frontmatter.description },
    ],
  }),
})

function GettingStartedPage() {
  return (
    <DocLayout title={frontmatter.title} description={frontmatter.description}>
      <MDXProvider components={mdxComponents}>
        <Content />
      </MDXProvider>
    </DocLayout>
  )
}
```

The `mdxComponents` map in `apps/site/src/lib/mdx-components.ts` maps MDX element names to the project's design system components:

```ts
// apps/site/src/lib/mdx-components.ts
import { CodeBlock } from '../components/CodeBlock'
import { Callout } from '../components/Callout'
import type { MDXComponents } from 'mdx/types'

export const mdxComponents: MDXComponents = {
  // Map fenced code blocks to CodeBlock component
  pre: ({ children }) => <>{children}</>,
  code: CodeBlock,
  // Callout directive passthrough (if using remark-directive)
  // tip: (props) => <Callout type="tip" {...props} />,
}
```

### Step 6: Verify

After updating both files, verify the page:

1. Dev server renders correctly: `bun run --filter roost-site dev` → open the page in browser
2. No TypeScript errors: `bun run --filter roost-site typecheck`
3. Raw markdown is accessible: `curl http://localhost:5173/docs/{path}.md`
4. Content matches the original: visually compare before/after in browser

## Common Issues

**Code blocks with template literals in TSX**: The original TSX often uses template literal strings inside `CodeBlock`. When converting, remove the surrounding backticks and `{}` wrapper — the content becomes the raw code block body in MDX.

**JSX expressions**: Any `{variable}` or `{expression}` in the original TSX that isn't just a string literal needs to be evaluated and inlined. For example, version numbers stored in constants should be hardcoded in the `.mdx` file (or replaced with a proper MDX expression if dynamic).

**Import cleanup**: After migrating, the original TSX route file no longer needs to import `CodeBlock`, `Callout`, or any content-level components directly. Remove unused imports to keep the route file minimal.

**Relative links**: Links in the original JSX like `<a href="/docs/guides/database">` become `[text](/docs/guides/database)` in Markdown. For `.md` URL consistency, internal doc links should point to `.md` variants: `[text](/docs/guides/database.md)`. Apply this during migration.

**Index routes**: Files at `routes/docs/guides/index.tsx` map to `content/docs/guides/index.mdx` and serve at `/docs/guides`. The `.md` URL is `/docs/guides.md` (not `/docs/guides/index.md`). The Worker handles this normalization.
