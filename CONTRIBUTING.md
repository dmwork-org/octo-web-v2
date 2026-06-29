# Contributing to OCTO Web v2

Thanks for your interest in contributing to OCTO Web v2.

This repository is the web client for OCTO's collaboration workspace. It is a React 19 single application organized by feature modules under `src/features/*`.

## Getting Started

1. Fork the repository and create a branch from `main`.
2. Install dependencies with `pnpm install`.
3. Copy `.env.example` to `.env.local` and point it at your backend services.
4. Start the app with `pnpm dev`.
5. Make focused changes and add tests when behavior changes.
6. Open a pull request using the template.

## Development Commands

```bash
pnpm install
pnpm dev
npx tsc -b
pnpm check
pnpm exec vp test
pnpm run structure-lint
```

## Code Style

- Use TypeScript without `any`, `as any`, or `@ts-ignore` except for documented SDK boundary adapters.
- Use TanStack Router file routes.
- Use route loaders and TanStack Query for server state.
- Use `ofetch` clients instead of raw `fetch`.
- Keep API modules under `src/features/base/api/endpoints` or the relevant feature's `api` directory.
- Keep UI copy in the i18n files when text is user-facing.
- Keep changes scoped to the feature you are modifying.

## Tests

Add or update tests for bug fixes, API mapping changes, state logic, renderers, and core user flows. Existing tests use Vitest.

High-priority test areas:

- login and token handling
- API interceptors
- space switching
- IM provider and message rendering
- chat file preview
- matter workflows
- summary rendering

## Pull Requests

- Describe what changed and why.
- Link related issues.
- Include screenshots or screen recordings for UI changes.
- Include the commands you ran for verification.
- Keep PR descriptions in English so project history remains accessible to the wider community.

## Commit Messages

Use Conventional Commits:

```text
feat: add channel search filter
fix: handle expired token redirect
docs: update setup guide
chore: refresh dependencies
```

## Security

Do not report security issues through public GitHub issues. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the project's [Apache License 2.0](LICENSE).
