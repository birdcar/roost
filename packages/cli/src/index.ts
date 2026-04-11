#!/usr/bin/env bun

import { newProject } from './commands/new.js';
import { makeModel, makeAgent, makeTool, makeJob, makeMiddleware, makeMcpServer, makeController } from './commands/make.js';
import { run } from './process.js';

const args = process.argv.slice(2);
const command = args[0];
const rest = args.slice(1);

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, boolean> } {
  const positional: string[] = [];
  const flags: Record<string, boolean> = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

async function main() {
  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return;
  }

  const { positional, flags } = parseFlags(rest);

  switch (command) {
    case 'new':
      if (!positional[0]) { console.error('Usage: roost new <name>'); process.exit(1); }
      await newProject(positional[0], flags);
      break;

    case 'make:model':
      if (!positional[0]) { console.error('Usage: roost make:model <Name>'); process.exit(1); }
      await makeModel(positional[0]);
      break;

    case 'make:agent':
      if (!positional[0]) { console.error('Usage: roost make:agent <Name>'); process.exit(1); }
      await makeAgent(positional[0]);
      break;

    case 'make:tool':
      if (!positional[0]) { console.error('Usage: roost make:tool <Name>'); process.exit(1); }
      await makeTool(positional[0]);
      break;

    case 'make:job':
      if (!positional[0]) { console.error('Usage: roost make:job <Name>'); process.exit(1); }
      await makeJob(positional[0]);
      break;

    case 'make:middleware':
      if (!positional[0]) { console.error('Usage: roost make:middleware <Name>'); process.exit(1); }
      await makeMiddleware(positional[0]);
      break;

    case 'make:mcp-server':
      if (!positional[0]) { console.error('Usage: roost make:mcp-server <Name>'); process.exit(1); }
      await makeMcpServer(positional[0]);
      break;

    case 'make:controller':
      if (!positional[0]) { console.error('Usage: roost make:controller <Name>'); process.exit(1); }
      await makeController(positional[0]);
      break;

    case 'dev':
      await run('npx', ['vite', 'dev']);
      break;

    case 'build':
      await run('npx', ['vite', 'build']);
      break;

    case 'deploy':
      await run('npx', ['vite', 'build']);
      await run('npx', ['wrangler', 'deploy']);
      break;

    case 'migrate':
      await run('npx', ['drizzle-kit', 'push']);
      break;

    case 'migrate:generate':
      await run('npx', ['drizzle-kit', 'generate']);
      break;

    case 'db:seed':
      await run('bun', ['run', 'database/seeders/index.ts']);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
  Roost CLI - The Laravel of Cloudflare Workers

  Usage: roost <command> [options]

  Commands:
    new <name>            Create a new Roost project
      --with-ai           Include AI packages
      --with-billing      Include billing package
      --with-queue        Include queue package
      --force             Overwrite existing directory

    make:model <Name>     Generate a model class
    make:controller <Name> Generate a controller
    make:agent <Name>     Generate an AI agent class
    make:tool <Name>      Generate an AI tool class
    make:mcp-server <Name> Generate an MCP server
    make:job <Name>       Generate a queue job class
    make:middleware <Name> Generate a middleware class

    dev                   Start the dev server
    build                 Build for production
    deploy                Build and deploy to Workers

    migrate               Run pending migrations
    migrate:generate      Generate migration from schema
    db:seed               Run database seeders

    help                  Show this help message
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
