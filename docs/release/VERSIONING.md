# CTX Release and Versioning

This document defines the current release baseline for CTX and the rules contributors should follow until a more automated release train is introduced.

## Source of Truth

- Package name and version come from `package.json`
- npm publish is currently driven by `.github/workflows/npm-publish-on-push.yml`
- The generated repository snapshot for this policy lives in `docs/release/release-metadata.json`

Generate or refresh the snapshot with:

```bash
node scripts/docs/release-metadata.js --write docs/release/release-metadata.json
```

## Current Release Baseline

- Current package version: `0.1.0`
- Publish trigger: push to `main` or `master`
- Publish gate: workflow requires `NPM_TOKEN` and runs `npm ci` plus `npm test --if-present`
- Publish condition: the workflow skips if `name@version` already exists on npm
- Current version source of truth: `package.json`

## SemVer Policy

- `MAJOR`: breaking changes to CLI behavior, MCP contracts, storage/runtime contracts, or documented provider integration flows
- `MINOR`: backward-compatible features such as new tools, new dashboards, new workflows, or additive provider support
- `PATCH`: backward-compatible fixes, reliability hardening, docs corrections, and behavior-preserving refactors

Before `1.0.0`, minor releases can still include larger product movement, but breaking changes should already be called out explicitly in release notes or release PRs.

## Release Checklist

1. Update `package.json` version.
2. Refresh `docs/release/release-metadata.json`.
3. Run `npm test`.
4. Verify whether the change needs explicit breaking-change notes.
5. Merge to `main` or `master` with `NPM_TOKEN` configured in GitHub Actions.
6. Confirm the new version appears on npm and that the publish workflow did not skip as already released.

## Current Gaps

- `CHANGELOG.md` is not yet part of the canonical release flow.
- There is no automated release notes generation from conventional commits yet.
- There is no explicit prerelease/dist-tag policy yet.

These gaps are known and should be addressed in later slices of epic `#390`; this document only records the baseline that already exists in the repository.
