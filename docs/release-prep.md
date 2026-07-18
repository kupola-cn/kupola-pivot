# Release Prep

Use this checklist before publishing a new PIVOT workspace version.

## When to Publish

Publish only when the package contents or public package contracts changed.

Do not publish for repository-only changes such as examples, ignored design notes, or docs that are not included in package tarballs unless the release is intentionally documentation-driven.

## Preflight Commands

Run:

```bash
npm run release:preflight
```

This command runs:

- syntax checks
- lint
- TypeScript declaration validation
- smoke tests
- release version consistency checks
- workspace package dry-runs

## Version Alignment

Before publishing, these must match:

- root `package.json`
- root `package-lock.json`
- every workspace package version
- `@kupola/pivot` workspace dependency versions
- top `CHANGELOG.md` release heading

Use `npm run release:check` for this guard.

## Publish

Run:

```bash
npm run release:publish
```

The publish command runs tests and package dry-runs before `npm publish --workspaces --access public`.

After publishing, verify the npm registry versions and push the matching git commit and tag if the release process created one.
