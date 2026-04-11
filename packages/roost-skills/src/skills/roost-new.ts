#!/usr/bin/env node
import { runRoostCli } from '../lib/runner.js'

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help') {
  console.log(`Usage: roost-new <name> [--with-ai] [--with-billing] [--with-queue]

Scaffold a new Roost project on Cloudflare Workers.

Arguments:
  name            Project name (required)
  --with-ai       Include AI agent scaffolding
  --with-billing  Include billing scaffolding
  --with-queue    Include queue/jobs scaffolding`)
  process.exit(args[0] === '--help' ? 0 : 1)
}

const name = args.find((a) => !a.startsWith('--'))
if (!name) {
  console.error('Error: project name is required')
  process.exit(1)
}

const flags = args.filter((a) => a.startsWith('--'))
const cliArgs = ['new', name, ...flags]

console.log(`Creating new Roost project: ${name}`)
if (flags.length > 0) console.log(`Features: ${flags.join(', ')}`)

const result = await runRoostCli(cliArgs)
process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exit(result.code)
