# Example App Template Spec

This template defines the shared structure for all three example apps (Phases 10a-c). Each app follows the same scaffolding, development, and validation workflow. See per-app delta files for app-specific details.

## Shared Pattern

For each example app:

### 1. Scaffold
```bash
roost new {app-name} {flags}
cd {app-name}
```

### 2. Generate Models
```bash
roost make:model {ModelName} --factory
# Repeat for each model in the app
```

### 3. Generate Routes
Create route files in `app/routes/` following TanStack Start conventions. Each route has:
- Loader for data fetching (server function)
- Component for rendering
- Action/mutation for writes (server function)

### 4. Configure Services
- Set up WorkOS auth credentials in `.dev.vars`
- Configure D1 database binding in `wrangler.toml`
- Add additional bindings as needed per app

### 5. Run Migrations
```bash
roost migrate
roost db:seed
```

### 6. Write Tests
```typescript
import { describeRoost } from '@roostjs/testing';

describeRoost('{Feature}', ({ client, factory }) => {
  test('{scenario}', async () => {
    // Arrange: factory-create data
    // Act: client request
    // Assert: response status + database state
  });
});
```

### 7. Validate
```bash
bun test                    # All tests pass
bun run typecheck           # No TS errors
bun run dev                 # Dev server works
roost deploy --dry-run      # Build succeeds
```

## Shared File Structure

Each app follows this convention:
```
{app-name}/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── app.config.ts
├── app/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   └── {feature-routes}.tsx
│   ├── components/
│   │   └── {shared-components}.tsx
│   ├── models/
│   │   └── {models}.ts
│   └── lib/
│       └── {utilities}.ts
├── config/
│   ├── app.ts
│   ├── auth.ts
│   └── database.ts
├── database/
│   ├── migrations/
│   ├── seeders/
│   └── factories/
├── tests/
│   └── {feature}.test.ts
└── .dev.vars
```

## Shared Acceptance Criteria

All three apps must:
- [ ] Be scaffolded with `roost new` (no manual project creation)
- [ ] Compile with zero TypeScript errors
- [ ] Have a passing test suite using @roostjs/testing
- [ ] Run locally with `bun run dev`
- [ ] Deploy to Cloudflare Workers successfully
- [ ] Use only Roost framework abstractions (no escape hatches to raw Wrangler APIs)
