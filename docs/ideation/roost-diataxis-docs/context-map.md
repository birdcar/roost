# Context Map: roost-diataxis-docs

**Phase**: 1
**Scout Confidence**: 91/100
**Verdict**: GO

## Dimensions

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 19/20 | All 9 file paths fully identified: 5 modified, 4 new. Exact line numbers confirmed for factual fixes. |
| Pattern familiarity | 19/20 | Read both pattern files. `doc-layout.tsx` establishes `sections as const`, `normalize()` helper, `DocLayout` wrapper. |
| Dependency awareness | 18/20 | `doc-layout.tsx` consumed by all 14+ docs routes. `search.tsx` consumed only by `__root.tsx`. Other files are leaf routes. |
| Edge case coverage | 17/20 | Key: `normalize()` trailing slash handling, `as const` typing, `DocLayout` requires subtitle, `activeOptions={{ exact: true }}` |
| Test strategy | 18/20 | No automated tests in apps/site. Validation: `bunx tsc --noEmit` + visual dev server. |

## Key Patterns

- `apps/site/src/components/doc-layout.tsx` — `sections` array typed `as const`; `normalize()` strips trailing slashes; `DocLayout` requires `title`, `subtitle`, `children` (all non-optional); active link uses manual path comparison
- `apps/site/src/routes/docs/index.tsx` — Route file structure: `createFileRoute('/docs/')({component: ...})`, named function, `DocLayout` wrapper, `Link` for navigation

## Dependencies

- `doc-layout.tsx` → consumed by all 14 doc route files (sidebar change affects all pages)
- `search.tsx` → consumed by `__root.tsx` only
- `getting-started.tsx`, `ai.tsx`, `docs/index.tsx` → leaf routes, no consumers

## Conventions

- Route files: lowercase kebab-case. Components: PascalCase.
- Imports: all relative, no aliases. Pillar pages need `../../../components/doc-layout` (3 levels up).
- Route path strings: trailing slash for index routes (`/docs/tutorials/`).
- `verbatimModuleSyntax: true` — use `import type` for type-only imports.

## Risks

- `as const` must be maintained on new `sections` array (TypeScript `Link` type constraint)
- Import depth for pillar pages: 3 levels up, not 2
- `subtitle` is required on `DocLayout` — every page must provide one
- Trailing slash in `createFileRoute` path string for index routes
