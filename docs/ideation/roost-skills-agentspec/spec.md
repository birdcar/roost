# Implementation Spec: Roost Skills Agent Spec Migration

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

Replace the `packages/roost-skills/` npm package (CLI binaries + custom `skills.json`) with a top-level `skills/` directory containing SKILL.md files per the Agent Skills spec (agentskills.io). Each of the 4 existing skills becomes a `skills/<name>/SKILL.md` file that instructs Claude how to accomplish the task, rather than a Node.js binary that does it programmatically.

The `npx skills` CLI (Vercel Labs) discovers skills by cloning the repo and recursively finding directories containing `SKILL.md` files. Placing skills at the repo root under `skills/` makes `npx skills birdcar/roost` work with no special configuration.

Each SKILL.md's frontmatter needs only `name` (matching the parent directory, lowercase + hyphens, 1-64 chars) and `description` (what + when, 1-1024 chars). The body is Markdown instructions that Claude loads as context. The `roost-docs` skill additionally gets a `references/` subdirectory with the llms-parser topic mapping, and `roost-conventions` inlines its content directly.

## Feedback Strategy

**Inner-loop command**: `npx skills add ./skills --all --copy` (install locally from the repo and verify discovery)

**Playground**: Local `npx skills` CLI pointed at the repo's `skills/` directory

**Why this approach**: The deliverable is SKILL.md files that must be discoverable by the skills CLI — testing discovery locally is the tightest loop.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `skills/roost-new/SKILL.md` | Instructions for scaffolding new Roost projects via `roost new` CLI |
| `skills/roost-make/SKILL.md` | Instructions for generating code artifacts via `roost make:<type>` CLI |
| `skills/roost-docs/SKILL.md` | Instructions for fetching and searching Roost documentation |
| `skills/roost-conventions/SKILL.md` | Inline file structure, naming, and import conventions |

### Deleted Files

| File Path | Reason |
|---|---|
| `packages/roost-skills/` (entire directory) | Replaced by `skills/` SKILL.md files. Includes `src/`, `dist/`, `package.json`, `skills.json`, `tsconfig.json`, `README.md` |

### Modified Files

| File Path | Changes |
|---|---|
| `bun.lock` | Auto-updated after workspace member removal (run `bun install`) |

## Implementation Details

### 1. `roost-conventions` SKILL.md

**Overview**: The simplest conversion. The existing skill is a hardcoded string literal — inline it directly as the SKILL.md body.

```yaml
---
name: roost-conventions
description: Roost file structure, naming conventions, and import patterns. Use when creating new files, organizing code, or unsure about naming in a Roost project.
---
```

Body: Copy the `CONVENTIONS` string from `packages/roost-skills/src/skills/roost-conventions.ts` verbatim as Markdown content. No scripts, no references directory.

**Implementation steps**:

1. Create `skills/roost-conventions/SKILL.md`
2. Write frontmatter with `name` and `description`
3. Copy the conventions content from the existing source, formatted as clean Markdown

### 2. `roost-new` SKILL.md

**Overview**: Instructs Claude to scaffold a new project by running `roost new <name>` via Bash. Documents flags and expected behavior.

```yaml
---
name: roost-new
description: Scaffold a new Roost project on Cloudflare Workers. Use when the user asks to create a new project, start a new app, or set up Roost from scratch.
---
```

Body structure:
- Prerequisites: `@roostjs/cli` must be installed (`bun add -g @roostjs/cli`)
- Usage: `roost new <name> [flags]`
- Available flags: `--with-ai`, `--with-billing`, `--with-queue`
- What the command creates (directory structure, key files)
- Post-scaffold steps (cd, install deps, configure wrangler)

**Implementation steps**:

1. Create `skills/roost-new/SKILL.md`
2. Write frontmatter
3. Document the CLI command, flags, and expected output
4. Include post-scaffold guidance

### 3. `roost-make` SKILL.md

**Overview**: Instructs Claude to generate code artifacts by running `roost make:<type> <Name>`. Documents all 7 artifact types, naming conventions, and output locations.

```yaml
---
name: roost-make
description: Generate Roost code artifacts (model, agent, job, middleware, tool, controller, mcp-server). Use when the user asks to create, generate, or scaffold a new component.
---
```

Body structure:
- Usage: `roost make:<type> <Name>`
- Artifact type table: type, command, output directory, naming example
- Naming rules: PascalCase input, kebab-case filename output
- Examples for each type

**Key decisions**:
- Include the full `dirMap` from the existing source so Claude knows where files land
- Document all 7 artifact types with concrete examples

**Implementation steps**:

1. Create `skills/roost-make/SKILL.md`
2. Write frontmatter
3. Document each artifact type with command, output path, and example
4. Include naming convention rules

### 4. `roost-docs` SKILL.md

**Overview**: Instructs Claude to fetch Roost documentation from `https://roost.birdcar.dev/llms.txt`, then optionally follow links to specific topic pages. The fuzzy matching logic from `llms-parser.ts` becomes natural language instructions — Claude can match topics itself.

```yaml
---
name: roost-docs
description: Fetch Roost framework documentation. Use when the user asks about Roost APIs, needs reference docs, or wants to understand how a Roost package works.
---
```

Body structure:
- Step 1: Fetch `https://roost.birdcar.dev/llms.txt` using WebFetch
- Step 2: If the user asked about a specific topic, find the matching entry in the index
- Step 3: Fetch the specific doc page URL from the matched entry
- Format: llms.txt uses `## Section` headers and `- [Title](url): Description` entries
- Available sections: Tutorials, Guides, Reference, Optional (concepts)
- For full documentation (all pages concatenated): fetch `https://roost.birdcar.dev/llms-full.txt`

**Key decisions**:
- No `scripts/` or `references/` needed — the instructions are short enough to inline
- The caching logic from the CLI version is irrelevant; WebFetch handles this
- The fuzzy matching logic becomes "find the entry whose title or URL best matches the topic"

**Implementation steps**:

1. Create `skills/roost-docs/SKILL.md`
2. Write frontmatter
3. Document the fetch-then-follow workflow
4. List the two URL endpoints (llms.txt index vs llms-full.txt complete)

### 5. Remove `packages/roost-skills/`

**Overview**: Delete the entire directory and update the workspace.

**Implementation steps**:

1. `rm -rf packages/roost-skills/`
2. Run `bun install` to update `bun.lock` (workspace auto-discovery via `packages/*` glob means no `package.json` edit needed)
3. Verify no broken imports: `grep -r "@roostjs/skills" --include="*.ts" --include="*.json" packages/ apps/` (should find nothing outside historical ideation docs)

## Testing Requirements

### Manual Testing

- [ ] `npx skills add ./skills --all --copy` installs all 4 skills to `.claude/skills/`
- [ ] Each installed `SKILL.md` has valid frontmatter (name matches directory, description present)
- [ ] `bun install` succeeds after `packages/roost-skills/` removal
- [ ] `bun run build` still passes (the removed package should not be a dependency of anything)
- [ ] `grep -r "@roostjs/skills" packages/ apps/` returns no results

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| skills discovery | Skills not found by CLI | SKILL.md in wrong location or with invalid frontmatter | `npx skills birdcar/roost` shows empty picker | Validate with local `npx skills add ./skills` before committing |
| roost-docs | Wrong docs URL | Domain changes again | Skill fetches from dead URL | Use `roost.birdcar.dev` as the current live domain; single place to update |
| workspace removal | Build breaks | Another package depends on `@roostjs/skills` | `bun run build` fails | Grep for imports before deleting; the package has zero dependents |

## Validation Commands

```bash
# Verify skills are discoverable locally
npx skills add ./skills --all --copy

# Verify workspace is clean after removal
bun install

# Verify no broken references
grep -r "@roostjs/skills" --include="*.ts" --include="*.json" packages/ apps/

# Verify monorepo still builds
bun run build
```

## Rollout Considerations

- **No feature flag needed** — this is a distribution format change, not a runtime feature
- **npm deprecation**: After merging, publish a final `@roostjs/skills@0.3.0` that logs a deprecation notice pointing to `npx skills birdcar/roost`, then `npm deprecate @roostjs/skills "Use npx skills birdcar/roost instead"`
- **Rollback**: Revert the commit; the old package is in git history

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
