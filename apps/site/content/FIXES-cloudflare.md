# Audit: @roost/cloudflare

## Status: CLEAN

## Exports verified
- `KVStore` (from `./bindings/kv.js`)
- `R2Storage` (from `./bindings/r2.js`)
- `QueueSender` (from `./bindings/queues.js`)
- `D1Database` (from `./bindings/d1.js`)
- `AIClient` (from `./bindings/ai.js`)
- `VectorStore` (from `./bindings/vectorize.js`)
- `DurableObjectClient` (from `./bindings/durable-objects.js`)
- `HyperdriveClient` (from `./bindings/hyperdrive.js`)
- `CloudflareServiceProvider` (from `./provider.js`)

## Discrepancies found and fixed
None. All nine exports match the reference docs exactly.

## Files modified
None

## Items requiring human review
- The concepts doc refers to `R2Bucket` and `Queue` as wrapper names (raw Cloudflare types) in passing prose — these are the underlying binding types, not Roost wrapper names. This is accurate and not a discrepancy.
- `DurableObjectClient` and `HyperdriveClient` are documented in the reference but not covered in the guides. This is a docs gap but not an inaccuracy — no fix needed unless guides coverage is desired.
