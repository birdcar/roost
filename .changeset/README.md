# Changesets

Roost uses [Changesets](https://github.com/changesets/changesets) for release
management.

- Every published `@roostjs/*` package is in one fixed release group.
- A release PR bumps the entire ecosystem to one shared version.
- Internal package dependencies should use `workspace:^` so published manifests
  become semver ranges like `^0.3.1`.

Common commands:

```bash
bun run changeset
bun run changeset --empty
bun run version:packages
bun run release:preview
```
