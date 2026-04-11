# PRD: Roost Framework - Phase 9

**Contract**: ./contract.md
**Phase**: 9 of 11
**Focus**: Testing utilities — fakes, assertions, and test helpers

## Phase Overview

Phase 9 formalizes the testing story. Individual packages (AI, Billing, Queue) already ship their own `.fake()` methods from their respective phases, but this phase creates @roost/testing as a unified package that provides HTTP test client, database helpers, and cross-package test orchestration.

This phase depends on Phases 5-7 because it wraps their testing primitives into a cohesive layer. It's sequenced before example apps because the examples should demonstrate proper testing patterns.

After this phase, a developer has Laravel-grade testing DX: `test('user can subscribe', async () => { ... })` with request helpers, database assertions, and fake services — all on bun:test.

## User Stories

1. As a Roost app developer, I want an HTTP test client so that I can test routes without starting a server.
2. As a Roost app developer, I want database helpers so that I can seed, refresh, and assert on database state in tests.
3. As a Roost app developer, I want unified fakes so that I can disable all external services (AI, billing, queues) in one call.
4. As a Roost app developer, I want factory integration so that I can create test data with one-liner model factories.
5. As a Roost app developer, I want assertion helpers so that I can write expressive test assertions.

## Functional Requirements

### HTTP Test Client (@roost/testing)

- **FR-9.1**: `TestClient` class that sends requests through the Roost application without HTTP
- **FR-9.2**: Request builders: `client.get('/users')`, `client.post('/users', body)`, `client.put()`, `client.delete()`
- **FR-9.3**: Auth helpers: `client.actingAs(user)` sets authenticated user for the request
- **FR-9.4**: Response assertions: `.assertStatus(200)`, `.assertJson({ key: value })`, `.assertRedirect('/login')`, `.assertHeader('x-custom', 'value')`
- **FR-9.5**: Session assertions: `.assertSessionHas('key')`, `.assertSessionMissing('key')`

### Database Helpers

- **FR-9.6**: `refreshDatabase()` — resets database between tests (truncate all tables)
- **FR-9.7**: `seedDatabase(SeederClass)` — runs specific seeders before tests
- **FR-9.8**: `assertDatabaseHas('table', { column: value })` — verify row exists
- **FR-9.9**: `assertDatabaseMissing('table', { column: value })` — verify row absent
- **FR-9.10**: `assertDatabaseCount('table', n)` — verify row count
- **FR-9.11**: Transaction wrapping — each test runs in a transaction that's rolled back (where D1 supports it)

### Factory Integration

- **FR-9.12**: `factory(User).create()` — creates and persists a model instance
- **FR-9.13**: `factory(User).make()` — creates instance without persisting
- **FR-9.14**: `factory(User, 5).create()` — creates multiple instances
- **FR-9.15**: `factory(User).state('admin').create()` — applies factory states
- **FR-9.16**: `factory(User).with('posts', 3).create()` — creates with related models

### Unified Fakes

- **FR-9.17**: `fakeAll()` — enables fakes for AI, Billing, Queue simultaneously
- **FR-9.18**: `restoreAll()` — restores all fakes to real implementations
- **FR-9.19**: Individual fakes still available: `Agent.fake()`, `Billing.fake()`, `Job.fake()`
- **FR-9.20**: Queue fake: `Job.fake()`, `Job.assertDispatched(SendEmail)`, `Job.assertNotDispatched()`
- **FR-9.21**: Time helpers: `freezeTime(date)`, `advanceTime(duration)` for time-dependent tests

### bun:test Integration

- **FR-9.22**: Test setup via `beforeAll`/`beforeEach` hooks that boot a test Application instance
- **FR-9.23**: Custom matchers for bun:test: `expect(response).toHaveStatus(200)`, `expect(database).toHave('users', { email })`
- **FR-9.24**: `describe.roost()` wrapper that auto-configures application boot, database refresh, and fake services

## Non-Functional Requirements

- **NFR-9.1**: HTTP test client requests complete in < 10ms (no network, no serialization)
- **NFR-9.2**: Database refresh between tests < 50ms
- **NFR-9.3**: Factory model creation < 5ms per instance
- **NFR-9.4**: Test suite of 100 tests runs in < 10 seconds

## Dependencies

### Prerequisites

- Phase 1 complete (core application for test boot)
- Phase 4 complete (ORM for database helpers and factories)
- Phase 5 complete (AI fakes/assertions to wrap)
- Phase 6 complete (Queue fakes/assertions to wrap)
- Phase 7 complete (Billing fakes/assertions to wrap)

### Outputs for Next Phase

- Test patterns for Phase 10 example app test suites
- Testing documentation for Phase 11 docs site

## Acceptance Criteria

- [ ] `TestClient.get('/').assertStatus(200)` tests a route without HTTP
- [ ] `client.actingAs(user).get('/dashboard')` authenticates the request
- [ ] `assertDatabaseHas('users', { email: 'test@test.com' })` passes after insert
- [ ] `factory(User).create()` returns a persisted, typed model instance
- [ ] `factory(User).with('posts', 3).create()` creates user with 3 related posts
- [ ] `fakeAll()` disables AI, Billing, and Queue external calls
- [ ] `Job.assertDispatched(SendEmail)` passes after dispatch in test
- [ ] `refreshDatabase()` clears all tables between tests
- [ ] Custom bun:test matchers work: `expect(response).toHaveStatus(200)`
- [ ] Full test suite runs in < 10 seconds for 100 tests
