# Versioning Policy

This document describes the versioning strategy for the ctx-plugin project.

## Semantic Versioning

ctx-plugin follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) using the **major.minor.patch** format:

```
MAJOR.MINOR.PATCH
```

Given a version number `MAJOR.MINOR.PATCH`, increment the:

- **MAJOR** version when you make incompatible API changes
- **MINOR** version when you add functionality in a backward-compatible manner
- **PATCH** version when you make backward-compatible bug fixes

## Version Increment Rules

### MAJOR Version (Breaking Changes)

Increment the major version when making incompatible changes that break backward compatibility:

**Examples:**
- Removing or renaming commands (e.g., removing `/ctx-search`)
- Changing command signatures or required arguments (e.g., `/ctx start` now requires a project name)
- Removing or renaming configuration options
- Changing the structure of MCP tool inputs/outputs
- Dropping support for a major Node.js version
- Removing provider adapters or changing their interfaces
- Breaking changes to the plugin API or extension points
- Incompatible database schema changes requiring migration
- Changes to the pipeline state machine that break integrations

**Guidelines:**
- Document all breaking changes clearly in CHANGELOG.md
- Provide migration guides for users upgrading from previous major versions
- Consider deprecation warnings in the previous minor version when possible
- Bundle multiple breaking changes into a single major release when feasible

### MINOR Version (New Features)

Increment the minor version when adding new functionality in a backward-compatible way:

**Examples:**
- Adding new commands (e.g., adding `/ctx-export`)
- Adding new MCP tools while keeping existing ones
- Adding new optional configuration options
- Adding new provider adapters
- Enhancing existing commands with optional parameters
- Adding new dashboard features or UI components
- Implementing new optimization strategies or routing algorithms
- Adding support for new Node.js versions
- Introducing new optional dependencies
- Expanding the knowledge base with new indexing capabilities

**Guidelines:**
- New features should not break existing workflows
- Optional parameters should have sensible defaults
- Document new features in CHANGELOG.md under "Added"
- Consider feature flags for experimental functionality

### PATCH Version (Bug Fixes)

Increment the patch version for backward-compatible bug fixes and minor improvements:

**Examples:**
- Fixing crashes or errors in existing commands
- Correcting incorrect behavior without changing the API
- Fixing typos in documentation or error messages
- Performance improvements that don't change behavior
- Dependency updates for security patches
- Fixing memory leaks or resource cleanup issues
- Correcting edge cases in provider routing
- Fixing UI rendering issues in the dashboard
- Improving error messages without changing functionality
- Fixing test flakiness or false positives

**Guidelines:**
- Bug fixes should not introduce new features
- Focus on stability and correctness
- Document fixes in CHANGELOG.md under "Fixed"
- Include regression tests when appropriate

## Pre-Release Versions

Pre-release versions are denoted by appending a hyphen and a series of dot-separated identifiers:

```
1.0.0-alpha.1
1.0.0-beta.2
1.0.0-rc.1
```

**Pre-release labels:**
- `alpha` - Early preview, API may change significantly
- `beta` - Feature complete, stabilizing API
- `rc` (release candidate) - Final testing before release

**Examples:**
- `1.0.0-alpha.1` - First alpha release of version 1.0.0
- `1.0.0-beta.1` - First beta release of version 1.0.0
- `1.0.0-rc.1` - First release candidate of version 1.0.0

## Build Metadata

Build metadata may be appended by a plus sign and dot-separated identifiers:

```
1.0.0+20240115
1.0.0+sha.5114f85
```

Build metadata is ignored when determining version precedence.

## Version 0.x.y (Initial Development)

During initial development (major version 0), the API is considered unstable:

- `0.y.z` - Anything may change at any time
- `0.y.0` - Minor version increments may include breaking changes
- `0.0.z` - Patch version increments for backward-compatible changes

**Current Status:**
ctx-plugin is currently at version `0.1.0`. Once the API stabilizes and the project is production-ready, we will release `1.0.0`.

## Version 1.0.0 and Beyond

Version `1.0.0` defines the public API. After this release:

- The version numbering follows strict semantic versioning
- Breaking changes require a new major version
- Backward compatibility is maintained within major versions
- Deprecation warnings precede breaking changes when possible

## Version Stability Guarantees

### Public API

The following are considered part of the public API and subject to semantic versioning:

- **Commands:** All `/ctx*` slash commands and their signatures
- **MCP Tools:** All tools exposed through the MCP Hub
- **Configuration:** Settings in `.claude/ctx-config.json` and environment variables
- **Provider Adapters:** Public interfaces for provider integration
- **Knowledge Base API:** Interfaces for session logging and search
- **Pipeline States:** The state machine transitions and stage names

### Internal Implementation

The following are NOT considered public API and may change without version increments:

- Internal module structure and file organization
- Private functions and unexported classes
- Database schema details (unless exposed through public API)
- Dashboard UI implementation details
- Internal data structures and algorithms
- Log message formats and debugging output

## Breaking Change Communication

When a breaking change is introduced in a major version:

1. **CHANGELOG.md** - List all breaking changes under a dedicated "Breaking Changes" section
2. **Migration Guide** - Provide step-by-step instructions for upgrading
3. **Deprecation Period** - When possible, deprecate features in a minor release before removal
4. **Version Bump** - Clearly indicate the major version increment (e.g., `0.1.0` → `1.0.0`)

**Example Breaking Change Entry:**

```markdown
## [2.0.0] - 2025-06-01

### Breaking Changes
- Removed `/ctx-old-command` in favor of `/ctx-new-command`
  - **Migration:** Replace all uses of `/ctx-old-command <arg>` with `/ctx-new-command --arg=<arg>`
  - **Reason:** Simplified command syntax and improved consistency
```

## Deprecation Policy

Before removing features in a major version:

1. Mark the feature as deprecated in a minor release
2. Add deprecation warnings to the feature's output
3. Document the deprecation in CHANGELOG.md with the replacement
4. Allow at least one minor version cycle before removal
5. Remove the feature in the next major version

**Example Deprecation:**

```
v1.2.0: Deprecate `oldOption` in favor of `newOption` (warning added)
v1.3.0: Additional minor releases (warning continues)
v2.0.0: Remove `oldOption` (breaking change)
```

## Conventional Commits

To support automated release notes generation, commit messages should follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat:` - New feature (minor version bump)
- `fix:` - Bug fix (patch version bump)
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, no logic changes)
- `refactor:` - Code refactoring (no functional changes)
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks (dependency updates, build config)
- `ci:` - CI/CD pipeline changes

**Breaking Changes:**
Add `BREAKING CHANGE:` in the footer or append `!` after the type/scope:

```
feat!: remove /ctx-old-command

BREAKING CHANGE: /ctx-old-command has been removed. Use /ctx-new-command instead.
```

## Release Cadence

- **Patch releases:** As needed for critical bug fixes
- **Minor releases:** Monthly or when significant features are ready
- **Major releases:** Planned with sufficient deprecation period and migration support

## Version Tags

Git tags follow the format `v<MAJOR>.<MINOR>.<PATCH>`:

```
v0.1.0
v1.0.0
v1.1.0
v2.0.0-beta.1
```

## NPM Distribution Tags

- `latest` - Stable releases (default)
- `next` - Pre-release versions (alpha, beta, rc)
- `legacy` - Previous major version for maintenance

## References

- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- [Conventional Commits](https://www.conventionalcommits.org/)
