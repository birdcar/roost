---
"@roostjs/ai": patch
---

Fix non-deterministic typecheck of `globalThis.Buffer` in `@roostjs/ai`. The seven inline `Buffer.from` fallbacks now go through a shared `internal/base64` helper that does a typed extraction instead of relying on `@types/node`'s global augmentation, which races on first install in monorepo CI.
