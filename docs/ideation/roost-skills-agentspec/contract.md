# Roost Skills Agent Spec Migration Contract

**Created**: 2026-04-15
**Confidence Score**: 96/100
**Status**: Approved
**Supersedes**: None

## Problem Statement

The `@roostjs/skills` npm package (at `packages/roost-skills/`) is built as CLI binaries with a custom `skills.json` manifest — a format that no skill discovery tool actually consumes. The intended distribution channel, `npx skills` (Vercel Labs skills CLI v1.5.0), uses the Agent Skills spec (`SKILL.md` files discoverable via GitHub repo cloning), not npm packages or custom JSON manifests.

The result is that Roost's AI coding skills are not installable via the standard ecosystem tooling. Users cannot run `npx skills birdcar/roost` because no `SKILL.md` files exist in the repo. The existing npm package also has a broken `files` field (missing `dist/`), so even the CLI binary path doesn't work when installed from the registry.

## Goals

1. `npx skills birdcar/roost` discovers and installs all Roost skills into `.claude/skills/`
2. Each skill follows the Agent Skills spec (agentskills.io) with valid SKILL.md frontmatter
3. The old CLI binary package (`@roostjs/skills`) is removed from the monorepo — no dual maintenance
4. Skills reference the correct docs domain (`roost.birdcar.dev`)

## Success Criteria

- [ ] Running `npx skills birdcar/roost` presents a picker listing all Roost skills
- [ ] Each installed skill has a valid `SKILL.md` with `name` and `description` frontmatter
- [ ] `roost-new` skill instructs Claude to scaffold projects via `roost new <name>` CLI
- [ ] `roost-make` skill instructs Claude to generate artifacts via `roost make:<type> <Name>` CLI
- [ ] `roost-docs` skill instructs Claude to fetch docs from `https://roost.birdcar.dev/llms.txt`
- [ ] `roost-conventions` skill provides file structure, naming, and import conventions inline
- [ ] `packages/roost-skills/` directory is fully removed from the workspace
- [ ] `package.json` workspace config no longer references the removed package
- [ ] No broken references to `@roostjs/skills` remain in the repo

## Scope Boundaries

### In Scope

- Converting all 4 skills (roost-new, roost-make, roost-docs, roost-conventions) to SKILL.md format
- Creating a `skills/` directory structure at the repo root following the Agent Skills spec
- Removing `packages/roost-skills/` entirely (source, dist, config, skills.json)
- Updating workspace configuration (root package.json, bun workspace)
- Fixing any remaining references to the old package or `roost.dev` domain in skills content

### Out of Scope

- `.well-known/agent-skills/index.json` discovery on the Roost website — separate concern
- Publishing skills to the skills.sh leaderboard/directory — happens organically once SKILL.md files exist
- Supporting agents other than Claude Code — the spec is agent-agnostic but we only test Claude Code
- Creating new skills beyond the existing 4
- Updating the `docs/ideation/roost-llm-docs/` specs that reference `skills.sh` — those are historical artifacts

### Future Considerations

- `.well-known` discovery endpoint on roost.birdcar.dev for URL-based skill installation
- Additional skills (roost-debug, roost-deploy, roost-test)
- `references/` subdirectories per skill for detailed API docs (loaded on demand)
- `allowed-tools` frontmatter once Claude Code's support stabilizes (currently buggy per #14956)

## Execution Plan

_Single-phase project — no dependency graph needed._

### Execution Steps

**Strategy**: Sequential (single spec)

1. **Spec** — Create SKILL.md files, remove old package
   ```bash
   /execute-spec docs/ideation/roost-skills-agentspec/spec.md
   ```
