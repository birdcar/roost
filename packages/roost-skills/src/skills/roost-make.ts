#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runRoostCli } from '../lib/runner.js'

const ARTIFACT_TYPES = ['model', 'agent', 'job', 'middleware', 'tool', 'controller', 'mcp-server'] as const

const args = process.argv.slice(2)
const type = args[0]
const name = args[1]

if (!type || !name || args[0] === '--help') {
  console.log(`Usage: roost-make <type> <Name>

Generate a Roost code artifact.

Types: ${ARTIFACT_TYPES.join(', ')}

Examples:
  roost-make model User
  roost-make agent ResearchAgent
  roost-make job SendEmailJob`)
  process.exit(args[0] === '--help' ? 0 : 1)
}

if (!ARTIFACT_TYPES.includes(type as (typeof ARTIFACT_TYPES)[number])) {
  console.error(`Error: unknown type "${type}". Must be one of: ${ARTIFACT_TYPES.join(', ')}`)
  process.exit(1)
}

const cliCommand = `make:${type}`
const result = await runRoostCli([cliCommand, name])
process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.code === 0) {
  const dirMap: Record<string, string> = {
    model: 'src/models',
    agent: 'src/agents',
    job: 'src/jobs',
    middleware: 'src/middleware',
    tool: 'src/agents/tools',
    controller: 'src/controllers',
    'mcp-server': 'src/mcp',
  }
  const dir = dirMap[type] ?? 'src'
  const fileName = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const filePath = join(process.cwd(), dir, `${fileName}.ts`)

  try {
    const content = readFileSync(filePath, 'utf8')
    console.log(`\n--- Generated: ${dir}/${fileName}.ts ---\n`)
    console.log(content)
  } catch {
    // File may be at a different path — the CLI output should have shown it
  }
}

process.exit(result.code)
