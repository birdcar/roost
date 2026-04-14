# Audit: @roostjs/cli

## Status: FIXED

## Commands verified (from src/index.ts)
- `roost new <name>` — flags: `--with-ai`, `--with-billing`, `--with-queue`, `--force`
- `roost make:model <Name>`
- `roost make:agent <Name>`
- `roost make:tool <Name>`
- `roost make:job <Name>`
- `roost make:middleware <Name>`
- `roost make:mcp-server <Name>`
- `roost make:controller <Name>`
- `roost dev`
- `roost build`
- `roost deploy`
- `roost migrate`
- `roost migrate:generate`
- `roost db:seed`
- `roost help`

## Discrepancies found and fixed
| File | Issue | Fix applied |
|------|-------|-------------|
| `apps/site/content/docs/reference/cli.mdx` | Documents `roost make:migration <name>` but this command does not exist in `src/index.ts` | Removed `roost make:migration` section |
| `apps/site/content/docs/reference/cli.mdx` | Documents `roost migrate:rollback` but this command does not exist in `src/index.ts` | Removed `roost migrate:rollback` section |
| `apps/site/content/docs/reference/cli.mdx` | Documents `roost migrate:reset` but this command does not exist in `src/index.ts` | Removed `roost migrate:reset` section |
| `apps/site/content/docs/reference/cli.mdx` | Documents `roost dev [--port <n>]` with a `--port` flag but the implementation passes no port flag to vite | Removed the `--port` flag note |
| `apps/site/content/docs/guides/cli.mdx` | Guide documents `roost make:migration` usage | Removed the `make:migration` example |
| `apps/site/content/docs/guides/cli.mdx` | Guide documents `roost migrate:rollback` and `roost migrate:reset` | Removed those examples |

## Files modified
- `apps/site/content/docs/reference/cli.mdx`
- `apps/site/content/docs/guides/cli.mdx`

## Items requiring human review
- `roost migrate:rollback` and `roost migrate:reset` and `roost make:migration` may be planned commands. If they are intentional future commands, the docs should mark them as "coming soon" rather than removing them. Flagging for human decision — removed from docs for now since they are not implemented.
