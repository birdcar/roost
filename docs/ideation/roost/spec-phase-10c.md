# Spec: SaaS Starter (examples/saas-starter)

**Template**: ./spec-template-example-app.md
**Contract**: ./contract.md
**PRD**: ./prd-phase-10.md
**Estimated Effort**: L

## Inputs

- App name: `saas-starter`
- Scaffold flags: `--with-billing --with-queue`
- Primary packages: @roost/core, @roost/auth, @roost/orm, @roost/billing, @roost/queue, @roost/cloudflare

## Models

| Model | Columns | Relationships |
|---|---|---|
| `Organization` | id, workosOrgId, name, slug, createdAt | hasMany(Member), hasMany(Project), hasOne(Subscription) |
| `Member` | id, orgId, workosUserId, role (admin/member/viewer), createdAt | belongsTo(Organization) |
| `Project` | id, orgId, name, description, createdAt, updatedAt | belongsTo(Organization) |
| `Subscription` | id, orgId, stripeSubscriptionId, status, planId, trialEndsAt, canceledAt | belongsTo(Organization) |
| `Document` | id, projectId, name, r2Key, mimeType, size, uploadedBy, createdAt | belongsTo(Project) |

## Routes

| Route File | Path | Purpose |
|---|---|---|
| `app/routes/index.tsx` | `/` | Marketing/landing, redirect if authenticated |
| `app/routes/_app.tsx` | Layout | Authenticated layout with sidebar nav |
| `app/routes/_app.dashboard.tsx` | `/dashboard` | Org dashboard: subscription status, recent activity |
| `app/routes/_app.projects.tsx` | `/projects` | Project list |
| `app/routes/_app.projects.$id.tsx` | `/projects/:id` | Project detail with document upload |
| `app/routes/_app.team.tsx` | `/team` | Member management (invite, role change, remove) |
| `app/routes/_app.billing.tsx` | `/billing` | Subscription management, portal redirect |
| `app/routes/_app.settings.tsx` | `/settings` | Org settings |
| `app/routes/billing/webhook.ts` | `/billing/webhook` | Stripe webhook endpoint |
| `app/routes/auth/login.tsx` | `/auth/login` | WorkOS AuthKit |
| `app/routes/auth/callback.tsx` | `/auth/callback` | Callback |

## Key Implementation Details

- **Multi-tenancy**: Organization resolved from WorkOS session's current org. All queries scoped by orgId. `org:slug` middleware on `_app` layout.
- **RBAC**: `role:admin` middleware on `/team` and `/settings`. Members can view, admins can modify.
- **Billing flow**:
  1. New org starts on free trial (14 days)
  2. `/billing` shows current plan and Stripe checkout button
  3. Checkout creates Stripe subscription via @roost/billing
  4. Webhook updates local Subscription model
  5. `subscribed` middleware gates premium features
  6. Portal redirect for self-service plan changes
- **File upload**: Documents uploaded to R2 via `/projects/:id` route action. R2 key stored in Document model.
- **Background jobs**:
  - `SendWelcomeEmail` dispatched on member invite (placeholder — logs instead of sending)
  - `GenerateReport` dispatched from dashboard, processes asynchronously
- **Organization switching**: WorkOS Widgets `OrganizationSwitcher` component in sidebar.

## Deviations from Template

- Multiple models with relationships — the most complex data model of the three apps.
- R2 integration for file storage — demonstrates @roost/cloudflare R2 binding.
- Stripe webhooks require raw body access and signature verification.
- Multi-tenant scoping adds a query scope to every database access.
- Job queue demonstrates async processing pattern.

## Tests

| Test | What it covers |
|---|---|
| Org dashboard loads for org member | Multi-tenant scoping, auth |
| Org A cannot see Org B's projects | Data isolation |
| Admin can invite member | RBAC, Member model creation |
| Viewer cannot access team settings | role:admin middleware |
| Subscribe via Stripe checkout | Billing.fake(), subscription created |
| Webhook updates subscription status | Billing.simulateWebhook() |
| Free trial user sees upgrade prompt | Trial logic, middleware |
| File upload stores in R2 | R2 binding, Document model |
| Background job dispatches on invite | Job.fake(), Job.assertDispatched() |
| Project CRUD operations | Full model lifecycle |
