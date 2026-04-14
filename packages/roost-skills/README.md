# @roostjs/skills

Claude Code plugin that gives AI agents skills for building Roost applications — scaffold projects, generate code, and fetch framework documentation without leaving the editor.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

Install as a Claude Code plugin:

```bash
claude mcp add @roostjs/skills
```

Or add it to your Claude Code `settings.json` manually:

```json
{
  "plugins": ["@roostjs/skills"]
}
```

## Skills

Once installed, Claude Code gains four skills it can invoke automatically when working in a Roost project:

**`roost-new`** — scaffold a new Roost project

```
roost-new <name> [--with-ai] [--with-billing] [--with-queue]
```

**`roost-make`** — generate a code artifact

```
roost-make <type> <Name>

Types: model, agent, job, middleware, tool, controller, mcp-server
```

**`roost-docs`** — fetch documentation from roost.dev

```
roost-docs [topic]        # topic examples: orm, migrations, auth, queue
roost-docs --refresh      # bypass local cache
```

**`roost-conventions`** — print file structure, naming rules, and import paths

```
roost-conventions
```

## How it works

Each skill is a thin CLI wrapper that delegates to `@roostjs/cli` for code generation and fetches `https://roost.dev/llms.txt` (with local caching) for documentation. When Claude Code needs to scaffold a model or look up how migrations work, it runs the appropriate skill directly rather than guessing.

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/skills](https://roost.birdcar.dev/docs/reference/skills)

## License

MIT
