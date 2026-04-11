# Implementation Spec: Roost Diataxis Docs — Phase 5 (Tutorials)

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Phase 5 creates cross-cutting tutorial journeys and rewrites the getting-started page as a proper Diataxis tutorial. Tutorials are learning-oriented — they take a beginner by the hand through a practical experience where every step succeeds. Unlike guides (which assume competence), tutorials assume the reader is new and provide a safe, guided path.

These are *journey* tutorials that naturally span multiple packages, showing how Roost's integrated stack comes together. This matches the user's preference for cross-cutting tutorials over isolated per-package ones.

Inspired by Laravel's "Getting Started" section and starter kits approach — they don't just document; they walk you through building something real. Roost tutorials follow the same philosophy: build a real thing, learn by doing, never get stuck.

**Tutorial rules (Diataxis)**:
- Learning-oriented: the goal is the *experience*, not the artifact produced
- Every step must succeed — the reader should never hit an error
- Minimum necessary context — link to explanation for "why" questions
- No choices — the reader is on rails, the tutorial makes all decisions
- Meaningful results early and often — build confidence through visible progress
- Repetition is a teaching tool

## Feedback Strategy

**Inner-loop command**: `cd apps/site && bun run dev`

**Playground**: Dev server — verify tutorial pages render with clear step progression, code examples are copy-pasteable, and navigation between sections works.

**Why this approach**: Tutorials are long-form content pages. Visual verification ensures readability, step numbering, and code example presentation.

## File Changes

### New Files

| File Path | Purpose |
|-----------|---------|
| `apps/site/src/routes/docs/tutorials/build-a-chat-app.tsx` | Tutorial: Build an AI chat app |
| `apps/site/src/routes/docs/tutorials/build-a-saas-app.tsx` | Tutorial: Build a SaaS app with auth + billing |
| `apps/site/src/routes/docs/tutorials/deploy-to-cloudflare.tsx` | Tutorial: Deploy your first Roost app |
| `apps/site/src/routes/docs/tutorials/build-a-task-api.tsx` | Tutorial: Build a REST API with database |

### Modified Files

| File Path | Changes |
|-----------|---------|
| `apps/site/src/routes/docs/getting-started.tsx` | Full rewrite as Diataxis tutorial (guided, hands-on, safe) |
| `apps/site/src/components/doc-layout.tsx` | Add tutorial links under "Tutorials" sidebar section |
| `apps/site/src/components/search.tsx` | Add tutorial page entries to search index |
| `apps/site/src/routes/docs/tutorials/index.tsx` | Update landing page with links to all tutorials and descriptions |

## Implementation Details

### Tutorial Page Structure

**Pattern to follow**: `apps/site/src/routes/docs/getting-started.tsx` (existing page structure), but rewritten to follow Diataxis tutorial rules

Tutorials use a step-by-step format with clear numbering and visible progress markers:

```tsx
function Page() {
  return (
    <DocLayout title="{Tutorial Title}" subtitle="{What you'll build in one sentence}">
      <Callout type="tip">
        <p><strong>What you'll learn:</strong> {2-3 bullet points}</p>
        <p><strong>Time:</strong> ~{N} minutes</p>
        <p><strong>Prerequisites:</strong> {Minimal — link to getting-started if needed}</p>
        <p><strong>Packages used:</strong> {List of @roost/* packages}</p>
      </Callout>

      <h2>Step 1: {Action Verb} — {What This Step Does}</h2>
      <p>{1-2 sentences of context}</p>
      <CodeBlock title="{filename or terminal}">{`code`}</CodeBlock>
      <p>{What you should see — confirm success before moving on}</p>

      <h2>Step 2: {Action Verb} — {What This Step Does}</h2>
      {/* Same pattern */}

      {/* ... */}

      <h2>What You Built</h2>
      <p>{Summary of what the reader accomplished}</p>

      <h2>Next Steps</h2>
      <ul>
        {/* Links to guides for extending this, reference for API details, concepts for understanding */}
      </ul>
    </DocLayout>
  );
}
```

### Getting Started Rewrite

**Current state**: `getting-started.tsx` is a mix of reference (project structure), how-to (code generators), and tutorial (first route). It also contains the Anthropic API key error (already fixed in Phase 1).

**New structure** — a proper Diataxis tutorial that takes a beginner from zero to running app:

1. **Step 1: Install Roost CLI** — `bun add -g @roost/cli`, verify with `roost --version`
2. **Step 2: Create your project** — `roost new my-app`, `cd my-app && bun install` — show what the CLI outputs
3. **Step 3: Start the dev server** — `bun run dev`, visit `localhost:3000`, see the welcome page
4. **Step 4: Create your first route** — add `src/routes/hello.tsx`, see it in the browser immediately
5. **Step 5: Add a database model** — `roost make:model Post`, `roost migrate`, show the generated files
6. **Step 6: Query your model** — create a route that reads from D1, see data in the browser
7. **Step 7: Add authentication** — configure WorkOS credentials, add `AuthMiddleware`, see the login flow
8. **Step 8: Deploy** — `roost deploy`, see the live URL

**Key changes from current version**:
- Remove project structure reference section (→ reference docs)
- Remove code generators list (→ cli guides)
- Remove common issues troubleshooting (→ guides/error-handling)
- Add success confirmations after every step ("You should see...")
- Remove all choices ("Optional flags" section) — the tutorial picks for the reader
- Fix AI prerequisite: no Anthropic API key needed — AI uses CF Workers AI binding (already fixed in Phase 1 but double-check)

### Tutorial: Build an AI Chat App

**Packages**: `@roost/ai`, `@roost/orm`, `@roost/start`, `@roost/schema`

**What you'll build**: A simple chat interface that uses an AI agent to answer questions, with conversation history stored in D1.

**Steps**:
1. Create project with `--with-ai` flag
2. Create a `ChatMessage` model to store conversations
3. Run the migration
4. Create a `ChatAssistant` agent with instructions
5. Create a `SummarizeTool` that uses the ORM to look up past messages
6. Create a chat route with a form input and response display
7. Wire `agent.prompt()` to the form submission via a server function
8. Test it — send messages, see AI responses, verify history persists
9. Add streaming with `agent.stream()` for real-time response display

**AI-specific teaching points**:
- The agent runs on Cloudflare Workers AI — no API key configuration needed
- Default model is `@cf/meta/llama-3.1-8b-instruct` — can be changed with `@Model` decorator
- Tool calls happen automatically within the agentic loop
- Agent instances maintain conversation memory

### Tutorial: Build a SaaS App

**Packages**: `@roost/auth`, `@roost/billing`, `@roost/orm`, `@roost/start`, `@roost/queue`

**What you'll build**: A simple SaaS app with user authentication, subscription billing, and a background job for sending welcome emails.

**Steps**:
1. Create project with `--with-billing` flag
2. Configure WorkOS credentials in `.dev.vars`
3. See the auth routes work — login, callback, logout
4. Create a `Workspace` model tied to organizations
5. Add `BillingMiddleware` to protect premium routes
6. Configure Stripe credentials and create a subscription checkout
7. Handle the `subscription.created` webhook
8. Create a `SendWelcomeEmail` job
9. Dispatch the job from the webhook handler
10. Test the full flow: signup → subscribe → webhook → background job

### Tutorial: Deploy to Cloudflare

**Packages**: `@roost/cloudflare`, `@roost/start`, `@roost/cli`

**What you'll build**: Take an existing Roost app from local dev to production on Cloudflare Workers.

**Steps**:
1. Start with a working local app (link to getting-started if needed)
2. Review `wrangler.jsonc` — explain what each binding means
3. Create a Cloudflare account (link to signup)
4. Set production secrets in Cloudflare dashboard
5. Run `roost deploy` — see the deployment output
6. Visit the live URL — confirm the app works
7. Set up a custom domain (optional but guided)
8. Make a change, redeploy, see it live in seconds

### Tutorial: Build a REST API

**Packages**: `@roost/orm`, `@roost/core`, `@roost/testing`, `@roost/start`

**What you'll build**: A CRUD API for managing tasks, with database models, validation, and tests.

**Steps**:
1. Create a new project
2. Create a `Task` model with title, description, status, due_date
3. Run the migration
4. Create API routes: `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`
5. Use the QueryBuilder for filtering and sorting
6. Add request validation using the schema builder
7. Write tests using TestClient
8. Run the tests — see them pass
9. Add relationships: `User hasMany Tasks`
10. Add middleware to protect the API routes

### Sidebar and Search

**Implementation steps**:
1. Add tutorial links to "Tutorials" sidebar section in `doc-layout.tsx`:
   - Getting Started (first item, prominently placed)
   - Build an AI Chat App
   - Build a SaaS App
   - Build a REST API
   - Deploy to Cloudflare
2. Add all tutorial pages and their step headings to the search index
3. Update the tutorials landing page with cards for each tutorial: title, description, time estimate, packages used

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Tutorial steps | Step fails for the reader | Missing prerequisite, version mismatch, wrong assumption about local state | Reader loses trust, abandons tutorial | Test every step yourself. Include "You should see..." confirmations. Pin versions where possible |
| Tutorial content | Becomes a how-to guide | Writer assumes competence and skips explanations | Beginners get lost | Self-check: "Can someone who has never used Roost follow this from step 1?" If not, add context |
| Tutorial content | Overloads with explanation | Writer adds "why" tangents inline | Reader gets distracted from doing | Link to concepts pages instead: "To understand why Roost uses service providers, see [Concepts: Service Container](/docs/concepts/service-container)" |
| Cross-cutting scope | Tutorial requires too many packages | Single tutorial touches 6+ packages | Overwhelming for a beginner | Each tutorial uses 3-5 packages max. Focus on the primary flow |
| Getting-started rewrite | Breaks existing links | External links to `/docs/getting-started` section anchors | Bookmarked links break | Maintain the same route path (`/docs/getting-started`); only internal structure changes |

## Validation Commands

```bash
# Type checking
cd apps/site && bunx tsc --noEmit

# Dev server
cd apps/site && bun run dev

# Verify all tutorial files exist
ls apps/site/src/routes/docs/tutorials/

# Verify getting-started was updated (check for Anthropic references one final time)
grep -ri "anthropic" apps/site/src/routes/docs/getting-started.tsx
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
