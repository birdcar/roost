# Releasing Roost

Roost publishes all `@roostjs/*` packages together on one shared version line.
If `@roostjs/ai` is `0.3.1`, the compatible `@roostjs/start` is also `0.3.1`.

## Versioning policy

- Roost follows SemVer intentionally.
- Until `1.0.0`, use `patch` for backward-compatible fixes and packaging
  corrections.
- Until `1.0.0`, use `minor` for new features and breaking API changes.
- Reserve `major` for the eventual stable `1.0.0` transition and future
  post-1.0 breaking releases.

## Scaffold dependency policy

- New apps use `^<current Roost version>` for first-party `@roostjs/*`
  packages.
- Third-party framework dependencies come from the CLI's checked-in scaffold
  stack manifest, not `latest`.
- Update the scaffold stack intentionally when a new Roost release line adopts a
  new TanStack / Vite / Wrangler combination.

## Contributor workflow

1. Run `bun run changeset`.
2. Select the packages affected by the change.
3. Pick the bump type that matches the API impact.
4. Commit the generated file in `.changeset/`.

If a PR should not publish anything, run `bun run changeset --empty`.

## Release flow

1. Merge feature PRs with changesets into `main`.
2. GitHub Actions opens or updates a `Version Packages` PR.
3. Merge that PR.
4. The release workflow publishes the prepared package artifacts to npm.

## Local validation

```bash
bun install
bun run release:preview
```

`release:preview` rewrites publish manifests into `.publish/packages/*` and runs
`npm pack --dry-run` for every published package.
