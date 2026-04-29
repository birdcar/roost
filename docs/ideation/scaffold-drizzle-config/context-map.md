# Context Map: scaffold-drizzle-config

**Source**: Inline exploration during ideation + execute-spec (no scout subagent).
**Confidence**: 90/100 — spec author already explored this code thoroughly in prior turns.

## Key Patterns

- **Scaffold writes are flat sequential `await writeFile(join(dir, ...), ...)` calls** in `packages/cli/src/commands/new.ts`. No helpers, no abstractions. Match this style.
- **Directory creation uses `await mkdir(join(dir, ...), { recursive: true })`** before file writes. See lines 23-29.
- **Test pattern**: `mkdtemp` + `process.chdir` + run command + `readFile` + `expect(content).toContain(...)`. See `packages/cli/__tests__/generators.test.ts:15-30`.
- **Test runner**: `bun:test` with `describe`, `test`, `expect`, `afterEach`. Run with `bun test <path>`.

## Dependencies / Blast Radius

- `packages/cli/src/index.ts:43-45` invokes `newProject(positional[0], flags as Record<string, boolean>)`. No signature change — adding writes inside the function is transparent to callers.
- `packages/cli/src/index.ts:127,131` shells out to `bunx drizzle-kit push|generate`. No change needed; once `drizzle.config.ts` exists, these commands will find it.
- No other code imports from `packages/cli/src/commands/new.ts`.

## Conventions

- TypeScript strict mode, ES2022, NodeNext modules (per CLAUDE.md user preferences and `tsconfig.base.json`).
- No barrel files. No re-exports unless project already uses them — `new.ts` exports `newProject` directly.
- No comments unless non-obvious. Schema.ts comment IS warranted (instructs the user to declare tables).
- Filenames kebab-case. Tests in `__tests__/` adjacent to `src/`.

## Risks

1. **Spec said `newCommand`; actual export is `newProject`.** Test imports must use the correct name. Resolved during exploration.
2. **Spec proposed `mkdir` calls for `database/migrations/` and `database/seeders/`. They already exist** (`new.ts:27-28`). Only `.gitkeep` writes are new.
3. **`mkdir(join(dir, 'database'), ...)` is implied but should be explicit** — the existing line 27 only ensures `database/migrations/` (recursive creates `database/` as a side effect). Writing `database/schema.ts` requires `database/` to exist, which it will, but order matters: write schema.ts AFTER the existing mkdir calls.
4. **No CLAUDE.md or AGENTS.md at repo root** — user preferences from `~/.claude/CLAUDE.md` apply (concise responses, no unsolicited comments, prefer existing patterns).
5. **No `test` script in root or `packages/cli/package.json`.** Run tests directly with `bun test`.

## Verdict

GO. Implementation is small, mechanical, well-bounded.
