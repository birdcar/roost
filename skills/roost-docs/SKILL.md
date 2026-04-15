---
name: roost-docs
description: Fetch Roost framework documentation. Use when the user asks about Roost APIs, needs reference docs, or wants to understand how a Roost package works.
---

# Fetch Roost Documentation

## Quick Reference

| URL | Content |
|---|---|
| `https://roost.birdcar.dev/llms.txt` | Documentation index with links to all pages |
| `https://roost.birdcar.dev/llms-full.txt` | Full documentation (all pages concatenated) |

## How to Use

### For a specific topic

1. Fetch `https://roost.birdcar.dev/llms.txt` using WebFetch
2. The index uses this format:
   - `## Section` headers organize docs into: Tutorials, Guides, Reference, Optional (concepts)
   - Each entry is: `- [Title](url): Description`
3. Find the entry whose title or URL slug best matches the user's topic
4. Fetch that entry's URL to get the full documentation page

### For broad context

Fetch `https://roost.birdcar.dev/llms-full.txt` to get all documentation in a single request. This is large but gives complete coverage.

## Topic Mapping

Common topics and where they live:

| Topic | Section | Package |
|---|---|---|
| orm, models, queries, relationships | Guides + Reference | `@roostjs/orm` |
| auth, login, sessions, WorkOS | Guides + Reference | `@roostjs/auth` |
| queue, jobs, background tasks | Guides + Reference | `@roostjs/queue` |
| ai, agents, tools | Guides + Reference | `@roostjs/ai` |
| billing, stripe, subscriptions | Guides + Reference | `@roostjs/billing` |
| events, listeners, subscribers | Guides + Reference | `@roostjs/events` |
| feature flags, pennant | Guides + Reference | `@roostjs/feature-flags` |
| broadcast, websockets, channels | Guides + Reference | `@roostjs/broadcast` |
| workflow, durable execution, saga | Guides + Reference | `@roostjs/workflow` |
| mcp, model context protocol | Guides + Reference | `@roostjs/mcp` |
| cloudflare, kv, r2, d1, queues | Guides + Reference | `@roostjs/cloudflare` |
| core, container, middleware, providers | Guides + Reference | `@roostjs/core` |
| testing, test client, fakes | Guides + Reference | `@roostjs/testing` |
| start, tanstack, ssr, routes | Guides + Reference | `@roostjs/start` |
| schema, json schema, validation | Guides + Reference | `@roostjs/schema` |
| cli, scaffolding, generators | Guides + Reference | `@roostjs/cli` |
| migrations, database schema | Guides | (standalone guide) |
| deploy, cloudflare workers | Guides + Tutorials | (standalone guide) |
| architecture, how it works | Optional (concepts) | (standalone) |
