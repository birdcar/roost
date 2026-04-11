# PRD: Roost Framework - Phase 10

**Contract**: ./contract.md
**Phase**: 10 of 11
**Focus**: Three example applications proving the framework works

## Phase Overview

Phase 10 is the proof. Three example apps — a todo app, an AI chat app, and a SaaS starter — each exercise a different slice of the framework. They serve as both validation (does the framework actually work end-to-end?) and documentation (how do you build a real app with Roost?).

This phase depends on Phases 8 (CLI for scaffolding) and 9 (testing for test suites). Each app is scaffolded with `roost new`, built using framework conventions, and includes a test suite using @roost/testing.

After this phase, the framework has been battle-tested against three real applications. Any rough edges in the DX have been found and fixed. The examples also become reference implementations for the documentation site.

## User Stories

1. As a prospective Roost user, I want to see a todo app so that I understand basic CRUD, auth, and rendering in Roost.
2. As a prospective Roost user, I want to see an AI chat app so that I understand how Roost's AI primitives work in practice.
3. As a prospective Roost user, I want to see a SaaS starter so that I understand how to build a production app with billing, multi-tenancy, and queues.
4. As the framework author, I want real apps exercising the framework so that I find and fix DX issues before others hit them.

## Functional Requirements

### Todo App (examples/todo)

- **FR-10.1**: Scaffolded with `roost new todo`
- **FR-10.2**: WorkOS AuthKit login/signup
- **FR-10.3**: Todo model with CRUD (create, read, update, delete, toggle complete)
- **FR-10.4**: Server-rendered todo list with optimistic UI updates
- **FR-10.5**: D1-backed storage via @roost/orm
- **FR-10.6**: Tests covering auth flow, CRUD operations, and edge cases
- **FR-10.7**: Deployable to Cloudflare Workers

### AI Chat App (examples/ai-chat)

- **FR-10.8**: Scaffolded with `roost new ai-chat --with-ai`
- **FR-10.9**: WorkOS AuthKit login
- **FR-10.10**: Chat agent with system instructions and at least two tools (e.g., web search, calculator)
- **FR-10.11**: Streaming responses via SSE displayed in real-time chat UI
- **FR-10.12**: Conversation persistence — users can continue past chats
- **FR-10.13**: Structured output example — agent returns typed data alongside text
- **FR-10.14**: MCP server exposing chat history as a resource
- **FR-10.15**: Tests with Agent.fake() covering prompt paths and tool calls

### SaaS Starter (examples/saas-starter)

- **FR-10.16**: Scaffolded with `roost new saas-starter --with-billing --with-queue`
- **FR-10.17**: WorkOS AuthKit with organizations and roles
- **FR-10.18**: Multi-tenant data scoping — each org sees only its data
- **FR-10.19**: Stripe billing via @roost/billing — free trial, subscribe, upgrade, cancel
- **FR-10.20**: Background job processing — e.g., send welcome email on signup, generate reports
- **FR-10.21**: Role-based access control — admin/member/viewer roles
- **FR-10.22**: Dashboard with subscription status, team members, recent activity
- **FR-10.23**: Tests covering: auth, billing webhooks, job dispatch, org scoping
- **FR-10.24**: R2 file upload example — user profile avatars or document storage

## Non-Functional Requirements

- **NFR-10.1**: Each example app deploys to Cloudflare Workers in under 60 seconds
- **NFR-10.2**: Each example app's test suite passes with `bun test`
- **NFR-10.3**: Each example app has < 2 second TTFB on cold start
- **NFR-10.4**: Example apps use no framework escape hatches — all features use Roost abstractions

## Dependencies

### Prerequisites

- Phase 8 complete (CLI for scaffolding)
- Phase 9 complete (testing utilities for test suites)
- All runtime packages (Phases 1-7) complete

### Outputs for Next Phase

- Three reference applications for documentation walkthroughs (Phase 11)
- Real-world DX feedback that may require framework fixes
- Deployment examples for docs

## Acceptance Criteria

- [ ] Todo app: login, create todo, toggle complete, delete — full flow works
- [ ] Todo app: deploys to Workers and serves real traffic
- [ ] AI chat app: login, send message, receive streaming response — full flow works
- [ ] AI chat app: conversation persists across page reloads
- [ ] AI chat app: MCP server responds to tool/list and tool/call
- [ ] SaaS starter: login, create org, invite member, assign role — full flow works
- [ ] SaaS starter: subscribe via Stripe checkout, access premium features
- [ ] SaaS starter: background job dispatches and processes
- [ ] SaaS starter: org data isolation — org A cannot see org B's data
- [ ] All three apps scaffolded with `roost new` (no manual file creation)
- [ ] All three apps have passing test suites
- [ ] All three apps deploy to Cloudflare Workers
