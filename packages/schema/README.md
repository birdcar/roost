# @roostjs/schema

Fluent JSON Schema builder for defining tool parameters and validation schemas.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/schema
```

## Quick Start

```typescript
import { schema } from '@roostjs/schema';

const params = schema.object()
  .property('email', schema.string().description('User email').minLength(5).maxLength(100), true)
  .property('age', schema.integer().min(0).max(120), false)
  .build();

// { type: 'object', properties: { email: {...}, age: {...} }, required: ['email'] }
```

## Features

- Builders for `string`, `integer`, `number`, `boolean`, `object`, `array`, and `enum`
- Immutable — each modifier returns a new instance, so you can safely fork and reuse base schemas
- Fluent chainable API that produces plain JSON Schema objects via `.build()`
- Used by `@roostjs/ai` and `@roostjs/mcp` for agent tool parameter definitions

## API

```typescript
schema.string()           // StringSchemaBuilder — .minLength(n), .maxLength(n)
schema.integer()          // IntegerSchemaBuilder — .min(n), .max(n)
schema.number()           // NumberSchemaBuilder  — .min(n), .max(n)
schema.boolean()          // BooleanSchemaBuilder
schema.object()           // ObjectSchemaBuilder  — .property(name, builder, required?)
schema.array()            // ArraySchemaBuilder   — .items(builder), .minItems(n), .maxItems(n)
schema.enum(values[])     // SchemaBuilder with enum constraint

// All builders share:
.description(text)        // Sets JSON Schema description
.default(value)           // Sets default value
.build()                  // Returns plain JsonSchemaOutput object
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/schema](https://roost.birdcar.dev/docs/reference/schema)

## License

MIT
