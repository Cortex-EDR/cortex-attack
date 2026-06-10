# Contributing to Cortex Attack

Thank you for your interest in contributing! This document outlines the process for contributing to Cortex Attack.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker (optional, for testing the cortex-engine image)

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/hamza-hafeez82/cortex-attack.git
cd cortex-attack

# Install dependencies
npm install

# Build the project
npm run build

# Link globally for local testing
npm link

# Verify it works
cortex --version
```

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing [issues](https://github.com/hamza-hafeez82/cortex-attack/issues) to avoid duplicates.

When filing a bug report, include:
- Cortex Attack version (`cortex --version`)
- Node.js version (`node --version`)
- Operating system and version
- Steps to reproduce
- Expected vs. actual behaviour
- Relevant output/logs

### Suggesting Features

Feature requests are welcome! Open an issue with the `enhancement` label and describe:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Pull Requests

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add new scan phase for SSL/TLS analysis
   fix: resolve crash when target is unreachable
   docs: update installation instructions
   refactor: extract report generator into separate module
   ```

3. **Ensure** the CI passes locally:
   ```bash
   npm run build
   npm test --if-present
   ```

4. **Open a Pull Request** against `main` with a clear description of the changes.

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Type       | When to use                              |
|------------|------------------------------------------|
| `feat`     | New feature                              |
| `fix`      | Bug fix                                  |
| `docs`     | Documentation changes                    |
| `refactor` | Code refactor (no feature/fix)           |
| `perf`     | Performance improvement                  |
| `test`     | Adding or fixing tests                   |
| `chore`    | Build, tooling, or dependency updates    |
| `security` | Security fix or hardening                |

## Branch Strategy

| Branch      | Purpose                                  |
|-------------|------------------------------------------|
| `main`      | Stable, production-ready code            |
| `develop`   | Integration branch for new features      |
| `feat/*`    | Feature branches                         |
| `fix/*`     | Bug fix branches                         |
| `release/*` | Release preparation branches             |

## Release Process

Releases are automated via the `release.yml` workflow. Maintainers bump the version and push a tag:

```bash
npm version patch|minor|major
git push origin main --tags
```

This triggers the pipeline to publish to npm and GHCR automatically.
