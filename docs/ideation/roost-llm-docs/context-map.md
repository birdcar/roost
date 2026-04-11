# Context Map: roost-llm-docs

**Phase**: 1
**Scout Confidence**: 82/100
**Verdict**: GO

## Dimensions

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 18/20 | All 5 modified files and 6 new files identified. Actual `DocLayout` filename is `doc-layout.tsx` (kebab-case), not `DocLayout.tsx` as the spec says — builder must use the real filename. `entry-server.tsx` does not exist; TanStack Start manages its own server entry via the wrangler `main` field. |
| Pattern familiarity | 17/20 | Component files read. Naming is kebab-case (`doc-layout.tsx`, `code-block.tsx`, `callout.tsx`). Named exports. TypeScript strict mode, `verbatimModuleSyntax`. No barrel files. Route files use `createFileRoute` with inline `function Page()`. Spec's `CopyMarkdownButton` component matches existing `CopyButton` pattern in `code-block.tsx`. |
| Dependency awareness | 16/20 | 55 route files import `DocLayout` from `../../components/doc-layout` (or relative equivalent). Adding `rawPath` as an optional prop is non-breaking — no consumers need to change for Phase 1. The `CopyMarkdownButton` will be imported only by `doc-layout.tsx`. |
| Edge case coverage | 14/20 | Key edge: `@cloudflare/workers-types` is in the workspace catalog but NOT in `apps/site/package.json` — must be added for `worker.ts` to typecheck (`Env`, `ExecutionContext`). `wrangler` itself is also not listed in site package.json. The spec's `worker.ts` imports `./entry-server` which doesn't exist as a file — TanStack Start generates its server entry differently; builder must verify correct import path. `public/docs/` subdirectory must be `mkdirSync`'d in the generate script. |
| Test strategy | 17/20 | No automated test infrastructure exists in `apps/site/`. Spec validation is entirely manual `curl` commands and build checks. Validation commands in spec are explicit and complete. No test files to write. |

## Key Patterns

- `apps/site/src/components/doc-layout.tsx` — The component to be modified. Named export `DocLayout`. Props: `{ title: string, subtitle: string, children: ReactNode }`. Currently renders a `<main>` with sidebar and TOC. The `rawPath` prop should be added as optional and used to render `CopyMarkdownButton` in the `<main>` header. Uses `useLocation` from TanStack Router.

- `apps/site/src/components/code-block.tsx` — Establishes the internal button pattern. `CopyButton` uses `useState<boolean>` for copied state, `navigator.clipboard.writeText`, and a fallback via textarea + `execCommand`. Spec's `CopyMarkdownButton` uses `useState<'idle' | 'copied' | 'error'>`.

- `apps/site/src/components/callout.tsx` — Establishes named export pattern, `type ReactNode` import style, interface-inline props.

- `apps/site/src/routes/docs/guides/core.tsx` — Route file pattern: `createFileRoute`, inline `function Page()`, imports `DocLayout` from relative path.

- `apps/site/vite.config.ts` — Minimal config: `defineConfig` with `plugins: [tanstackStart(), react(), viteTsConfigPaths()]`. MDX plugin goes into the plugins array.

- `apps/site/wrangler.jsonc` — Currently has `"main": "@tanstack/react-start/server-entry"`. Change to `"./src/worker.ts"`.

- `apps/site/tsconfig.json` — `include` is `["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]`. Must add `"scripts/**/*.ts"` and `"content/**/*.mdx"`.

## Dependencies

- `apps/site/src/components/doc-layout.tsx` — consumed by → 55 route files under `apps/site/src/routes/docs/`. Optional `rawPath` prop is non-breaking.
- `apps/site/vite.config.ts` — consumed by → Vite build process, `@tanstack/react-start` plugin.
- `apps/site/wrangler.jsonc` — consumed by → Wrangler CLI for deployment.
- `apps/site/package.json` — consumed by → bun workspace, build scripts.
- `apps/site/tsconfig.json` — consumed by → TypeScript compiler, `vite-tsconfig-paths`.

## Conventions

- **Naming**: Files are kebab-case. Exported components are PascalCase. Routes use kebab-case matching URL segments.
- **Imports**: Relative imports. No barrel files. `import type` for type-only imports (`verbatimModuleSyntax`).
- **Error handling**: No try/catch except around clipboard/async. Spec's `CopyMarkdownButton` catch pattern matches existing code.
- **Types**: Inline interface-style props. Discriminated unions for state variants.
- **Testing**: No test infrastructure in `apps/site/`. Validation is manual.
- **Scripts**: `bun run` for `.ts` scripts. `#!/usr/bin/env bun` shebang. `import.meta.dir` for dirname.
- **Worker pattern**: `export default { async fetch(...) }` — standard CF Workers module syntax.

## Risks

- **`@cloudflare/workers-types` missing from site package.json**: Must add for `Env`/`ExecutionContext` types.
- **`./entry-server` import doesn't exist**: TanStack Start doesn't generate `src/entry-server.tsx`. Must verify correct delegation pattern.
- **`public/docs/` subdirectory creation**: Generate script must `mkdirSync` nested dirs before writing.
- **55 route files import `DocLayout`**: `rawPath` prop must stay optional.
- **Empty `content/docs/` in Phase 1**: Generate script must not error on zero MDX files.
- **Spec refers to `DocLayout.tsx` (PascalCase)**: Actual file is `doc-layout.tsx` (kebab-case).
