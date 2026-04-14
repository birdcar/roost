# Audit: @roostjs/testing

## Status: CLEAN

## Exports verified
- `TestClient`, `TestResponse` (from `./client.js`)
- `fakeAll`, `restoreAll` (from `./fakes.js`)
- `createTestApp`, `setupTestSuite` (from `./setup.js`)
- `TestContext` (type, from `./setup.js`)

## Discrepancies found and fixed
None. All exports are documented accurately in the reference. The `TestContext` type is exported but not explicitly shown in the Types section — however this is a minor omission that doesn't cause confusion.

## Files modified
None

## Items requiring human review
- `TestContext` type is exported but not documented in the reference Types section. Low priority since `setupTestSuite` return type (`TestSuiteHelpers`) is documented.
