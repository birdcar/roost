# Spec: Todo App (examples/todo)

**Template**: ./spec-template-example-app.md
**Contract**: ./contract.md
**PRD**: ./prd-phase-10.md
**Estimated Effort**: S

## Inputs

- App name: `todo`
- Scaffold flags: (none — base Roost app)
- Primary packages: @roostjs/core, @roostjs/auth, @roostjs/orm, @roostjs/cloudflare

## Models

| Model | Columns | Relationships |
|---|---|---|
| `Todo` | id, title, completed (boolean), userId, createdAt, updatedAt | belongsTo(User) |

User comes from WorkOS — no User model needed, just the WorkOS user ID stored on Todo.

## Routes

| Route File | Path | Purpose |
|---|---|---|
| `app/routes/index.tsx` | `/` | Redirect to /todos if authenticated, login prompt if not |
| `app/routes/todos.tsx` | `/todos` | List all todos for current user (auth required) |
| `app/routes/todos.$todoId.tsx` | `/todos/:todoId` | Single todo detail/edit |
| `app/routes/auth/login.tsx` | `/auth/login` | WorkOS AuthKit redirect |
| `app/routes/auth/callback.tsx` | `/auth/callback` | WorkOS callback handler |

## Key Implementation Details

- **Auth**: WorkOS AuthKit redirect flow. `auth` middleware on `/todos` routes.
- **CRUD**: Create todo via form action (POST), toggle complete via PUT, delete via DELETE.
- **Server rendering**: Todo list loads in the loader, renders server-side, hydrates for interactivity.
- **Optimistic UI**: Toggle complete updates UI immediately, syncs in background.
- **Data scoping**: Todos filtered by `currentUser().id` in every query.

## Deviations from Template

- No additional Cloudflare bindings beyond D1 — this is the simplest app.
- No background jobs, no billing, no AI.
- Single model, simple CRUD — proves the basic framework flow.

## Tests

| Test | What it covers |
|---|---|
| Unauthenticated user redirected to login | Auth middleware |
| Create todo via form POST | Model creation, action handling |
| Toggle todo complete | Model update, optimistic UI |
| Delete todo | Model deletion |
| User can only see their own todos | Data scoping by userId |
| Empty state renders correctly | Zero todos UI |
