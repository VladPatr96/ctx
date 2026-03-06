# Specification: Setup CI/CD pipeline

## Goal
Automate the testing, building, and validation process for the `ctx-plugin` project to ensure high code quality and prevent regressions.

## Scope
- Integration with GitHub Actions.
- Automated execution of 173+ existing unit tests on every push and PR.
- Automated linting and type checking.
- Code coverage reporting (aiming for 90%).
- Build verification for the core scripts and the `ctx-app` React/Electron application.

## Requirements
- Use `.github/workflows/` for configuration.
- Support Node.js 20+ environment.
- Integrate with existing `npm test` and `npm run build` commands.
- Fail the pipeline if tests or coverage requirements are not met.