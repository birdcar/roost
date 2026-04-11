# Spec: Phase 6 — Cross-Platform Agent Skills

**Contract**: [`contract.md`](./contract.md)
**Effort**: M (2–3 days)
**Blocked by**: Phase 1 (llms.txt must exist for `roost-docs` skill to function)
**Independent of**: Phase 2, Phase 3, Phase 4, Phase 5

## Overview

Roost is designed to be built by LLMs, but today's LLMs have no structured way to understand Roost conventions, scaffold projects, or generate correct code. This phase ships an installable skills package that works across Claude Code, Copilot CLI, Gemini CLI, and Codex — giving agents first-class Roost support without requiring the user to paste documentation into every conversation.

The four skills are: `roost-new` (project scaffolding), `roost-make` (code generation), `roost-docs` (documentation lookup), and `roost-conventions` (static pattern knowledge). Distribution is via skills.sh, which provides cross-platform skill discovery and installation.

## Skills Overview

### `roost-new`

Scaffolds a new Roost project. Wraps the `roost new` CLI command with guided parameter collection.

**Behavior:**
1. If a project name is not provided as an argument, the agent asks for one
2. Optionally prompts for feature flags: `--with-ai`, `--with-billing`, `--with-queue`
3. Runs `roost new {name} [flags]`
4. Reports the generated file structure to the agent

**Example invocations:**
```
roost-new my-app
roost-new my-app --with-ai --with-queue
```

### `roost-make`

Generates code artifacts. Maps to the `roost make:*` family of CLI commands.

**Sub-commands:**

| Command | Runs | Output |
|---------|------|--------|
| `model {Name}` | `roost make:model {Name}` | `app/models/{name}.ts` |
| `agent {Name}` | `roost make:agent {Name}` | `app/agents/{name}.ts` |
| `job {Name}` | `roost make:job {Name}` | `app/jobs/{name}.ts` |
| `middleware {Name}` | `roost make:middleware {Name}` | `app/middleware/{name}.ts` |
| `tool {Name}` | `roost make:tool {Name}` | `app/tools/{name}.ts` |
| `controller {Name}` | `roost make:controller {Name}` | `app/controllers/{name}.ts` |
| `mcp-server {Name}` | `roost make:mcp-server {Name}` | `app/mcp/{name}.ts` |

After running, the skill reads the generated file and provides it to the agent as context.

### `roost-docs`

Fetches Roost documentation on demand. Downloads from `llms.txt` and caches locally so subsequent invocations don't need network access.

**Behavior:**
1. On first call: fetch `https://roost.dev/llms.txt`, parse section/URL pairs, cache to `~/.roost/docs-cache/`
2. On subsequent calls: serve from cache (invalidate after 24h or when `--refresh` is passed)
3. Accept a topic argument: `roost-docs orm`, `roost-docs migrations`, `roost-docs auth`
4. Match topic to the most relevant `.md` URL from llms.txt, fetch it, return the content

**Example invocations:**
```
roost-docs                    # returns llms.txt index
roost-docs orm                # fetches /docs/reference/orm.md
roost-docs "database migrations"  # fuzzy matches to /docs/guides/migrations.md
```

The skill returns the raw Markdown content of the matched page, which the agent inserts into its context window for the current task.

### `roost-conventions`

Static knowledge — teaches the agent about Roost file structure, naming conventions, and patterns without fetching docs. This is for high-frequency decisions that don't need docs every time: where files go, how classes are named, what the directory structure looks like.

**Content (embedded in the skill):**

```markdown
# Roost Conventions

## File Structure
app/
  models/       → Eloquent-style ORM models (extend Model)
  controllers/  → Route handler classes
  middleware/   → Request/response middleware
  jobs/         → Background job classes (implement Job)
  agents/       → AI agent definitions
  tools/        → Agent tool definitions
  mcp/          → MCP server definitions

## Naming Conventions
- Models: PascalCase, singular noun (User, BlogPost, OrderItem)
- Controllers: PascalCase + Controller suffix (UserController)
- Jobs: PascalCase + Job suffix (SendEmailJob, ProcessPaymentJob)
- Middleware: PascalCase + Middleware suffix (AuthMiddleware, CorsMiddleware)
- Agents: PascalCase + Agent suffix (ResearchAgent, CodeReviewAgent)
- Tools: camelCase function name, PascalCase class (searchWeb → SearchWebTool)
- Database tables: snake_case, plural (users, blog_posts, order_items)
- Migration files: {timestamp}_{action}_{table}.ts (20240101_create_users.ts)

## Import Paths
- ORM: import { Model, Schema } from '@roost/orm'
- Router: import { Router, Route } from '@roost/router'
- Auth: import { Auth, Session } from '@roost/auth'
- Queue: import { Queue, Job } from '@roost/queue'
- Agents: import { Agent, Tool } from '@roost/agents'
- Storage: import { Storage } from '@roost/storage'
- Cache: import { Cache } from '@roost/cache'
- Config: import { config } from '@roost/config'

## Key Patterns
- Routes registered in app/bootstrap.ts
- Middleware applied via router.use() or route-level .middleware()
- Models auto-infer table name from class name (User → users)
- Jobs dispatched via Queue.dispatch(new SendEmailJob(userId))
- Agents composed of tools; tools are typed async functions
```

## Package Structure

### Repository layout

```
packages/roost-skills/
  package.json
  skills.json          ← skills.sh manifest
  src/
    index.ts           ← re-exports all skills
    skills/
      roost-new.ts
      roost-make.ts
      roost-docs.ts
      roost-conventions.ts
    lib/
      cache.ts         ← local file cache for docs
      llms-parser.ts   ← parse llms.txt format
      runner.ts        ← run roost CLI commands
```

### `package.json`

```json
{
  "name": "@roost/skills",
  "version": "0.1.0",
  "description": "Agent skills for building Roost applications",
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "roost-new": "./dist/skills/roost-new.js",
    "roost-make": "./dist/skills/roost-make.js",
    "roost-docs": "./dist/skills/roost-docs.js",
    "roost-conventions": "./dist/skills/roost-conventions.js"
  },
  "skills": "./skills.json",
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "bun run build"
  }
}
```

### `skills.json` — skills.sh manifest

```json
{
  "name": "roost",
  "description": "Roost framework skills — scaffold projects, generate code, fetch docs",
  "version": "0.1.0",
  "skills": [
    {
      "name": "roost-new",
      "description": "Scaffold a new Roost project on Cloudflare Workers",
      "command": "roost-new",
      "arguments": [
        { "name": "name", "description": "Project name", "required": true },
        { "name": "--with-ai", "description": "Include AI agent scaffolding", "required": false },
        { "name": "--with-billing", "description": "Include billing scaffolding", "required": false },
        { "name": "--with-queue", "description": "Include queue/jobs scaffolding", "required": false }
      ]
    },
    {
      "name": "roost-make",
      "description": "Generate Roost code artifacts (model, agent, job, middleware, tool, controller, mcp-server)",
      "command": "roost-make",
      "arguments": [
        { "name": "type", "description": "Artifact type", "required": true },
        { "name": "name", "description": "Artifact name (PascalCase)", "required": true }
      ]
    },
    {
      "name": "roost-docs",
      "description": "Fetch Roost documentation. Pass a topic to get specific content.",
      "command": "roost-docs",
      "arguments": [
        { "name": "topic", "description": "Documentation topic (e.g. 'orm', 'migrations', 'auth')", "required": false }
      ]
    },
    {
      "name": "roost-conventions",
      "description": "Get Roost file structure, naming conventions, and import patterns",
      "command": "roost-conventions",
      "arguments": []
    }
  ]
}
```

## Implementation Details

### `src/lib/llms-parser.ts`

```ts
export interface LlmsEntry {
  title: string
  url: string
  description: string
  section: string
}

export function parseLlmsTxt(content: string): LlmsEntry[] {
  const entries: LlmsEntry[] = []
  let currentSection = ''

  for (const line of content.split('\n')) {
    const sectionMatch = line.match(/^## (.+)/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      continue
    }

    const entryMatch = line.match(/^- \[(.+?)\]\((.+?)\)(?:: (.+))?/)
    if (entryMatch) {
      entries.push({
        title: entryMatch[1],
        url: entryMatch[2],
        description: entryMatch[3] ?? '',
        section: currentSection,
      })
    }
  }

  return entries
}

export function findBestMatch(entries: LlmsEntry[], query: string): LlmsEntry | null {
  const q = query.toLowerCase()
  // Exact title match first
  const exact = entries.find((e) => e.title.toLowerCase() === q)
  if (exact) return exact
  // URL segment match
  const urlMatch = entries.find((e) => e.url.toLowerCase().includes(q.replace(/\s+/g, '-')))
  if (urlMatch) return urlMatch
  // Partial title or description match
  return entries.find(
    (e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
  ) ?? null
}
```

### `src/lib/cache.ts`

```ts
import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'

const CACHE_DIR = join(homedir(), '.roost', 'docs-cache')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function getCached(key: string): string | null {
  const file = join(CACHE_DIR, key.replace(/[^a-z0-9]/gi, '_'))
  if (!existsSync(file)) return null
  const age = Date.now() - statSync(file).mtimeMs
  if (age > CACHE_TTL_MS) return null
  return readFileSync(file, 'utf8')
}

export function setCached(key: string, value: string): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  const file = join(CACHE_DIR, key.replace(/[^a-z0-9]/gi, '_'))
  writeFileSync(file, value)
}
```

### Installation

```bash
# Via skills.sh (once registered)
npx skills.sh install roost

# Manual install
npm install -g @roost/skills

# Verify
roost-docs --version
roost-conventions
```

## Publishing Checklist

- [ ] Package builds cleanly: `bun run build`
- [ ] All four bin entries work when installed globally
- [ ] `skills.json` passes skills.sh manifest validation
- [ ] Cache writes/reads correctly on macOS and Linux
- [ ] Skills work in Claude Code (test via `/roost-docs orm`)
- [ ] Skills work in Copilot CLI
- [ ] Package published to npm as `@roost/skills`
- [ ] Registered with skills.sh registry

## Validation Commands

```bash
# Build the package
cd packages/roost-skills && bun run build

# Test each skill locally
node dist/skills/roost-conventions.js
node dist/skills/roost-docs.js
node dist/skills/roost-docs.js orm
node dist/skills/roost-docs.js migrations

# Test with a real Roost project
cd /tmp && roost-new test-app --with-ai
cd test-app && roost-make model Post
cat app/models/post.ts

# Type check
bun run --filter roost-skills typecheck
```

## Acceptance Criteria

- [ ] `npx skills.sh install roost` installs the package
- [ ] `roost-new` asks for project name if not provided, runs `roost new`
- [ ] `roost-make model User` runs `roost make:model User` and returns the generated file
- [ ] `roost-docs` with no args returns the llms.txt index
- [ ] `roost-docs orm` returns the ORM reference page content
- [ ] `roost-docs` caches responses and serves from cache on repeated calls
- [ ] `roost-conventions` returns static convention guide without network access
- [ ] All four skills work in Claude Code
- [ ] Package published to npm as `@roost/skills@0.1.0`
