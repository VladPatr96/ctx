# Release Process

This document describes the step-by-step process for creating and publishing releases of ctx-plugin.

## Overview

ctx-plugin uses:
- **Semantic Versioning** for version numbers (see [VERSIONING.md](./VERSIONING.md))
- **Conventional Commits** for automated changelog generation
- **GitHub Actions** for automated publishing to npm
- **Git tags** for release tracking

## Prerequisites

Before creating a release, ensure:
- [ ] All tests pass (`npm test`)
- [ ] CHANGELOG.md is up to date with unreleased changes
- [ ] All feature branches are merged to `main`
- [ ] Working directory is clean (no uncommitted changes)
- [ ] You're on the `main` branch and up to date with origin

## Release Types

Choose the appropriate release type based on the changes:

- **Patch release** (`0.1.0` → `0.1.1`) - Bug fixes and minor improvements
- **Minor release** (`0.1.0` → `0.2.0`) - New features, backward-compatible
- **Major release** (`0.1.0` → `1.0.0`) - Breaking changes, API changes

See [VERSIONING.md](./VERSIONING.md) for detailed version increment rules.

## Manual Release Process

### 1. Prepare the Release

Review unreleased changes and determine the version bump:

```bash
# View changes since last release
git log v0.1.0..HEAD --oneline

# Check current version
node -p "require('./package.json').version"
```

### 2. Update CHANGELOG.md

Move unreleased changes to a new version section:

```markdown
## [Unreleased]

## [0.2.0] - 2024-12-20

### Added
- New feature X
- New command Y

### Fixed
- Bug Z
```

Update the comparison links at the bottom:

```markdown
[Unreleased]: https://github.com/ctx-plugin/ctx/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ctx-plugin/ctx/releases/tag/v0.2.0
```

Commit the changelog:

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for v0.2.0"
```

### 3. Bump Version with npm version

Use `npm version` to update package.json and create a git tag:

```bash
# For a patch release (0.1.0 → 0.1.1)
npm version patch -m "chore: release v%s"

# For a minor release (0.1.0 → 0.2.0)
npm version minor -m "chore: release v%s"

# For a major release (0.1.0 → 1.0.0)
npm version major -m "chore: release v%s"

# For a pre-release (0.1.0 → 0.2.0-alpha.1)
npm version preminor --preid=alpha -m "chore: release v%s"
```

This command will:
- Update the version in `package.json`
- Create a commit with the message `chore: release vX.Y.Z`
- Create a git tag `vX.Y.Z`

### 4. Push to GitHub

Push the commit and tag to trigger the GitHub Actions workflow:

```bash
# Push the commit and tags
git push && git push --tags
```

### 5. Verify Automated Publishing

The GitHub Actions workflow will automatically:
- Run tests
- Publish to npm if the version is new
- Create a GitHub release (if configured)

Monitor the workflow at: `https://github.com/ctx-plugin/ctx/actions`

### 6. Verify npm Publication

Check that the package was published:

```bash
# Check npm registry
npm view ctx-plugin versions

# Test installation
npm install ctx-plugin@latest
```

### 7. Create GitHub Release Notes

If not automated, manually create release notes on GitHub:

1. Go to `https://github.com/ctx-plugin/ctx/releases`
2. Click "Draft a new release"
3. Select the tag (e.g., `v0.2.0`)
4. Copy the changelog section for this version
5. Add any additional context or migration notes
6. Click "Publish release"

## Automated Release Process (Future)

Once `release-please` is configured (Phase 2), releases will be automated:

1. **Commit with Conventional Commits:**
   ```bash
   git commit -m "feat: add new command"
   git commit -m "fix: correct bug in routing"
   ```

2. **Push to main:**
   ```bash
   git push origin main
   ```

3. **Release Please creates PR:**
   - Automatically creates a release PR
   - Generates changelog from commits
   - Bumps version based on commit types
   - Updates CHANGELOG.md

4. **Review and Merge PR:**
   - Review the generated changelog
   - Merge the release PR

5. **Automatic Publishing:**
   - GitHub Actions publishes to npm
   - Creates GitHub release with notes
   - Tags the release

## Pre-Release Process

For alpha, beta, or release candidate versions:

### 1. Create Pre-Release Version

```bash
# First pre-release (0.2.0-alpha.1)
npm version preminor --preid=alpha -m "chore: release v%s"

# Subsequent pre-releases (0.2.0-alpha.2)
npm version prerelease --preid=alpha -m "chore: release v%s"

# Beta release (0.2.0-beta.1)
npm version preminor --preid=beta -m "chore: release v%s"

# Release candidate (0.2.0-rc.1)
npm version preminor --preid=rc -m "chore: release v%s"
```

### 2. Push and Publish

```bash
git push && git push --tags
```

### 3. Verify Distribution Tag

Pre-releases should use the `next` tag:

```bash
npm view ctx-plugin dist-tags
```

If not set correctly, update manually:

```bash
npm dist-tag add ctx-plugin@0.2.0-alpha.1 next
```

## Hotfix Release Process

For critical bug fixes that need immediate release:

### 1. Create Hotfix Branch

```bash
# From the latest release tag
git checkout -b hotfix/critical-bug v0.1.0
```

### 2. Apply Fix and Test

```bash
# Make the fix
git commit -m "fix: critical bug in provider routing"

# Run tests
npm test
```

### 3. Update CHANGELOG

Add hotfix entry:

```markdown
## [0.1.1] - 2024-12-20

### Fixed
- Critical bug in provider routing that caused crashes
```

### 4. Bump Patch Version

```bash
npm version patch -m "chore: hotfix release v%s"
```

### 5. Push and Verify

```bash
git push origin hotfix/critical-bug --tags
```

### 6. Merge Back to Main

```bash
git checkout main
git merge hotfix/critical-bug
git push origin main
```

## Version 1.0.0 Release

The transition to 1.0.0 is a special release that signals production readiness:

### Requirements

Before releasing 1.0.0:
- [ ] All core features are stable and tested
- [ ] Documentation is comprehensive and accurate
- [ ] Breaking changes are minimized or well-documented
- [ ] Migration guide exists for users upgrading from 0.x
- [ ] Public API is clearly defined (see [VERSIONING.md](./VERSIONING.md))
- [ ] Security audit completed (if applicable)
- [ ] Performance benchmarks meet targets

### Process

1. **Update Documentation:**
   - Finalize API documentation
   - Create migration guide from 0.x
   - Update README with 1.0.0 status

2. **Update CHANGELOG:**
   - Comprehensive entry for 1.0.0
   - List all features included
   - Document any breaking changes from 0.x

3. **Bump to 1.0.0:**
   ```bash
   npm version major -m "chore: release v1.0.0 - production ready"
   ```

4. **Push and Verify:**
   ```bash
   git push && git push --tags
   ```

5. **Announce:**
   - GitHub release with detailed notes
   - Update project homepage/README
   - Notify users through appropriate channels

## Troubleshooting

### Version Already Published

If `npm publish` fails because the version exists:

```bash
# Check published versions
npm view ctx-plugin versions

# Bump to a new version
npm version patch
git push && git push --tags
```

### Failed GitHub Actions Workflow

If the workflow fails:

1. Check the Actions tab for error details
2. Fix the issue locally
3. Create a new patch release

### Tag Already Exists

If you need to recreate a tag:

```bash
# Delete local tag
git tag -d v0.2.0

# Delete remote tag
git push origin :refs/tags/v0.2.0

# Create new tag
npm version 0.2.0 -m "chore: release v%s"
git push --tags
```

## Best Practices

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add new command
fix: correct routing bug
docs: update README
chore: update dependencies
test: add test for edge case
```

### Testing

Always test before release:

```bash
# Run full test suite
npm test

# Test specific functionality
npm run test:kb
npm run test:mcp
```

### Version Pinning

For development dependencies:

```bash
# Use exact versions for tools
npm install --save-exact prettier eslint
```

### Release Notes

Include in release notes:
- Summary of changes
- Breaking changes (if any)
- Migration instructions (if needed)
- Known issues or limitations
- Credits to contributors

## Release Checklist

Use this checklist for each release:

- [ ] All tests pass
- [ ] CHANGELOG.md updated
- [ ] Version bumped with `npm version`
- [ ] Git tag created
- [ ] Pushed to GitHub
- [ ] GitHub Actions workflow succeeded
- [ ] Package published to npm
- [ ] GitHub release created
- [ ] Release notes comprehensive
- [ ] Documentation updated (if needed)
- [ ] Known issues documented (if any)

## References

- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [npm version](https://docs.npmjs.com/cli/v8/commands/npm-version)
- [GitHub Actions](https://docs.github.com/en/actions)

## Support

For questions or issues with the release process:
- Open an issue on GitHub
- Review past releases for examples
- Consult [VERSIONING.md](./VERSIONING.md) for version rules
