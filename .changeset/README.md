# Changesets

This repo uses Changesets for release versioning.

- Run `bun run changeset` for user-facing or release-worthy changes.
- The Version Packages workflow opens or updates a release PR on `main`.
- Merging that PR updates `package.json` and changelog entries for the next release.
