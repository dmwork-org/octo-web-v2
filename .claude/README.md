# .claude

This directory contains optional assistant-facing project guidance.

It is included to make common code-generation tasks more reproducible, but it is not required for ordinary development. Human contributors should follow `README.md`, `CONTRIBUTING.md`, and the project checks in GitHub CI.

## Contents

| Path                  | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `rules/`              | Assistant-readable rule notes for recurring code patterns. |
| `skills/`             | Task guides and examples for common implementation work.   |
| `hooks/`              | Example local hooks for pre/post edit checks.              |
| `settings.json`       | Shared safe defaults for assistant tooling.                |
| `settings.local.json` | Local-only overrides; ignored by Git.                      |

## Safety

- Do not commit API keys, access tokens, private domains, or local absolute paths.
- Keep personal overrides in `settings.local.json`; it is ignored by Git.
- Hooks are convenience checks only. GitHub CI is the public source of truth.

## Recommended Local Checks

```bash
npx tsc -b
pnpm check
pnpm test -- --run
```
