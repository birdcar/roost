# Implementation Spec: Roost Framework - Phase 8

**Contract**: ./contract.md
**PRD**: ./prd-phase-8.md
**Estimated Effort**: L

## Technical Approach

Phase 8 builds the `roost` CLI — the developer's primary interface to the framework. It's a bun-native CLI that handles project scaffolding, code generation, database commands, and dev/deploy orchestration.

The CLI is built as @roostjs/cli using bun's native executable capabilities. Code generation uses a template engine (EJS-like) with framework conventions baked in. The scaffolding templates live alongside the CLI code, not fetched from a remote source.

The CLI delegates to underlying tools where possible: `roost dev` wraps Vinxi's dev server, `roost deploy` wraps Wrangler, `roost migrate` wraps Drizzle Kit. Roost adds framework-aware defaults and conventions on top.

## Feedback Strategy

**Inner-loop command**: `bun test --filter packages/cli`

**Playground**: The CLI itself — run generators and inspect output files. Also bun:test for unit tests.

**Why this approach**: CLI tools are best tested by running them and inspecting output. Unit tests cover template rendering and argument parsing.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/cli/package.json` | @roostjs/cli package manifest with `bin` entry |
| `packages/cli/tsconfig.json` | TS config |
| `packages/cli/src/index.ts` | CLI entry point — command router |
| `packages/cli/src/commands/new.ts` | `roost new` — project scaffolding |
| `packages/cli/src/commands/make/model.ts` | `roost make:model` generator |
| `packages/cli/src/commands/make/controller.ts` | `roost make:controller` generator |
| `packages/cli/src/commands/make/agent.ts` | `roost make:agent` generator |
| `packages/cli/src/commands/make/tool.ts` | `roost make:tool` generator |
| `packages/cli/src/commands/make/mcp-server.ts` | `roost make:mcp-server` generator |
| `packages/cli/src/commands/make/job.ts` | `roost make:job` generator |
| `packages/cli/src/commands/make/middleware.ts` | `roost make:middleware` generator |
| `packages/cli/src/commands/migrate.ts` | `roost migrate` and subcommands |
| `packages/cli/src/commands/dev.ts` | `roost dev` — wraps Vinxi |
| `packages/cli/src/commands/build.ts` | `roost build` — wraps Vinxi build |
| `packages/cli/src/commands/deploy.ts` | `roost deploy` — wraps Wrangler |
| `packages/cli/src/commands/db/seed.ts` | `roost db:seed` |
| `packages/cli/src/generator.ts` | Template engine for code generation |
| `packages/cli/src/scaffold.ts` | Project scaffold logic |
| `packages/cli/src/process.ts` | Safe subprocess execution utility |
| `packages/cli/src/utils.ts` | String helpers (kebab, pascal, camel) |
| `packages/cli/templates/project/` | Full project scaffold template |
| `packages/cli/templates/model.ts.ejs` | Model class template |
| `packages/cli/templates/controller.ts.ejs` | Controller template |
| `packages/cli/templates/agent.ts.ejs` | Agent class template |
| `packages/cli/templates/tool.ts.ejs` | Tool class template |
| `packages/cli/templates/mcp-server.ts.ejs` | MCP server template |
| `packages/cli/templates/job.ts.ejs` | Job class template |
| `packages/cli/templates/middleware.ts.ejs` | Middleware template |
| `packages/cli/templates/migration.ts.ejs` | Migration template |
| `packages/cli/templates/factory.ts.ejs` | Factory template |
| `packages/cli/__tests__/new.test.ts` | Scaffold tests |
| `packages/cli/__tests__/generators.test.ts` | Generator tests |
| `packages/cli/__tests__/utils.test.ts` | String helper tests |

## Implementation Details

### 1. CLI Infrastructure

**Overview**: Command router using a lightweight CLI framework (like `citty` or custom arg parsing). Each command is a module with `name`, `description`, `args`, and `run`.

```typescript
// CLI entry point
interface Command {
  name: string;
  description: string;
  args?: Record<string, ArgDef>;
  run(args: ParsedArgs): Promise<void>;
}

// packages/cli/src/index.ts
const commands: Command[] = [
  newCommand,
  makeModelCommand,
  makeAgentCommand,
  // ...
];

async function main() {
  const [commandName, ...rest] = process.argv.slice(2);
  const command = commands.find(c => c.name === commandName);
  if (!command) { printHelp(commands); return; }
  await command.run(parseArgs(rest, command.args));
}
```

**Key decisions**:
- Minimal dependencies — avoid heavy CLI frameworks. `citty` (from unjs, same ecosystem as Nitro) or raw arg parsing.
- Commands are individual modules for clean separation.
- `make:*` commands are nested under a `make` namespace.

**Implementation steps**:
1. Set up CLI package with bin entry point
2. Implement argument parser and command router
3. Implement help/usage output
4. Test: unknown command shows help, --help flag works

---

### 2. Safe Subprocess Execution

**Overview**: A utility for running external commands (vinxi, wrangler, drizzle-kit) safely using `Bun.spawn` (not shell execution) to prevent injection.

```typescript
// packages/cli/src/process.ts
import { spawn } from 'bun';

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function run(command: string, args: string[], options?: { cwd?: string }): Promise<RunResult> {
  const proc = spawn([command, ...args], {
    cwd: options?.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { exitCode, stdout, stderr };
}

// Usage: safe, no shell injection
await run('bun', ['install'], { cwd: projectDir });
await run('npx', ['vinxi', 'dev']);
await run('npx', ['wrangler', 'deploy']);
```

**Key decisions**:
- Use `Bun.spawn` with explicit argument arrays — never pass user input through a shell.
- All subprocess execution goes through this utility.
- Errors include both stdout and stderr for debugging.

---

### 3. Project Scaffolding (`roost new`)

**Overview**: Creates a complete Roost project directory with all configuration files, TanStack Start setup, WorkOS auth config, and a starter route.

```typescript
// roost new my-app [--with-billing] [--with-ai] [--with-queue]
async function runNewCommand(args: ParsedArgs) {
  const name = args.positional[0];
  const dir = path.resolve(process.cwd(), name);

  // 1. Copy project template
  await copyTemplate('project', dir, {
    name,
    packageName: toKebabCase(name),
    withBilling: args.flags['with-billing'],
    withAi: args.flags['with-ai'],
    withQueue: args.flags['with-queue'],
  });

  // 2. Prompt for WorkOS credentials (or detect from env)
  const workosApiKey = process.env.WORKOS_API_KEY || await prompt('WorkOS API Key:');
  const workosClientId = process.env.WORKOS_CLIENT_ID || await prompt('WorkOS Client ID:');

  // 3. Write .dev.vars with secrets
  await writeDevVars(dir, { WORKOS_API_KEY: workosApiKey, WORKOS_CLIENT_ID: workosClientId });

  // 4. Install dependencies via safe subprocess
  await run('bun', ['install'], { cwd: dir });

  console.log(`\n  cd ${name}\n  bun run dev\n`);
}
```

**Project template structure**:
```
templates/project/
├── package.json.ejs
├── tsconfig.json
├── wrangler.toml.ejs
├── app.config.ts.ejs          # TanStack Start / Vinxi config
├── app/
│   ├── routes/
│   │   ├── __root.tsx
│   │   └── index.tsx          # Welcome page
│   ├── client.tsx             # Client entry
│   └── ssr.tsx                # SSR entry
├── config/
│   ├── app.ts
│   ├── auth.ts
│   └── database.ts
├── database/
│   ├── migrations/
│   └── seeders/
├── .dev.vars.ejs              # Local secrets (WorkOS keys)
└── .gitignore
```

**Implementation steps**:
1. Create project template directory with all scaffold files
2. Implement template engine (EJS-based, reads .ejs files, renders with context)
3. Implement `roost new` command with flag parsing
4. Implement WorkOS credential prompting
5. Test: scaffold creates correct directory structure, templates render with correct values

**Feedback loop**:
- **Playground**: Temp directory where `roost new test-app` scaffolds into
- **Experiment**: Scaffold with various flags, verify file contents
- **Check command**: `bun test --filter new`

---

### 4. Code Generators (`roost make:*`)

**Overview**: Each generator reads a template, fills in the name/conventions, and writes to the correct location.

```typescript
// roost make:model Post
// → app/models/post.ts
// → database/migrations/{timestamp}_create_posts_table.ts
// → database/factories/post-factory.ts (if --factory flag)

// roost make:agent Assistant
// → app/agents/assistant.ts

// roost make:tool SearchWeb
// → app/tools/search-web.ts
```

**Template example (model.ts.ejs)**:
```typescript
import { Model, column } from '@roostjs/orm';

export class <%= pascalName %> extends Model {
  static table = '<%= tableName %>';

  static schema = {
    id: column.text().primaryKey(),
    // Add your columns here
    createdAt: column.integer({ mode: 'timestamp' }).notNull().default(Date.now),
    updatedAt: column.integer({ mode: 'timestamp' }).notNull().default(Date.now),
  };
}
```

**Key decisions**:
- Templates use EJS for simplicity — it's just string interpolation with logic.
- Naming conventions are automatic: `Post` → table `posts`, file `post.ts`, factory `post-factory.ts`.
- Generators don't modify existing files (no auto-registration) — keeps things predictable and avoids AST manipulation. Users import what they need.

**Implementation steps**:
1. Implement template engine: read .ejs, render with context, write to target path
2. Implement naming convention utilities: pascal, camel, kebab, snake, plural
3. Implement each generator command (7 total)
4. Test: each generator produces valid TypeScript that compiles

**Feedback loop**:
- **Playground**: Temp project directory
- **Experiment**: Run each make:* command, verify output compiles with `tsc --noEmit`
- **Check command**: `bun test --filter generators`

---

### 5. Database Commands

**Overview**: Thin wrappers around Drizzle Kit for migrations, with Roost conventions for file locations.

```typescript
// roost migrate — runs pending migrations
// Delegates to: drizzle-kit push (for D1) via safe subprocess

// roost migrate:rollback — rolls back last batch
// roost migrate:status — shows applied/pending migrations
// roost migrate:fresh — drops and re-runs all (dev only)
// roost db:seed — runs database/seeders/index.ts
```

**Key decisions**:
- Migrations use Drizzle Kit under the hood — Roost doesn't reinvent migration running.
- `roost migrate` is a convenience wrapper that reads Drizzle config from the project.
- Seeding runs a user-defined seeder file via bun.
- All external commands use the safe subprocess utility (Bun.spawn with argument arrays).

---

### 6. Dev & Deploy Commands

**Overview**: Convenience wrappers that abstract underlying tooling via safe subprocess calls.

```typescript
// roost dev → vinxi dev (starts Vinxi dev server with Wrangler bindings)
// roost build → vinxi build (production build with Nitro CF Workers preset)
// roost deploy → wrangler deploy (after vinxi build)

// All use the safe subprocess utility:
await run('npx', ['vinxi', 'dev'], { cwd: projectRoot });
await run('npx', ['wrangler', 'deploy'], { cwd: projectRoot });
```

**Key decisions**:
- These are thin wrappers, not reimplementations. They spawn the underlying command with correct arguments.
- `roost dev` sets up the correct Wrangler bindings for local development.
- `roost deploy` builds then deploys in one command.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/cli/__tests__/new.test.ts` | Scaffold creates correct structure, templates render, flags work |
| `packages/cli/__tests__/generators.test.ts` | Each make:* produces valid TS, naming conventions correct |
| `packages/cli/__tests__/utils.test.ts` | String case conversion helpers |

**Key test cases**:
- `roost new test-app` creates directory with package.json, wrangler.toml, app/routes/
- `roost new test-app --with-billing` includes @roostjs/billing in package.json
- `roost make:model Post` creates app/models/post.ts with correct class name and table name
- `roost make:agent Assistant` creates app/agents/assistant.ts with correct imports
- All generated files pass `tsc --noEmit`
- Naming: `PostComment` → table `post_comments`, file `post-comment.ts`

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| `roost new` target directory exists | Error with "Directory already exists. Use --force to overwrite" |
| `roost make:model` file already exists | Error with "File already exists at {path}. Choose a different name" |
| Missing WorkOS credentials on scaffold | Prompt for them; skip if --skip-auth flag |
| Template rendering fails | Error with template name and variable that's undefined |
| Underlying command (vinxi/wrangler) not found | Error with install instructions |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Scaffold | Partial write on interrupt | Ctrl+C during scaffold | Half-created project | Document: delete dir and re-run |
| Generator | Name collision | Two models with same name | Overwrite risk | Check file exists before writing |
| Templates | Stale template | Framework API changes | Generated code doesn't compile | Tests verify generated code compiles against current packages |

## Validation Commands

```bash
# Run CLI tests
bun test --filter packages/cli

# Test scaffold end-to-end (in temp directory)
bun run packages/cli/src/index.ts new /tmp/test-app && cd /tmp/test-app && bun install && bun run typecheck

# Verify all templates compile
bun test --filter generators
```
