# OCTO Web v2

OCTO Web v2 is the modern web client for the OCTO collaboration workspace. It brings chat, contacts, matter workflows, summaries, personas, app bots, and space management into a single React application.

This repository is the open-source preparation line for the upgraded OCTO Web client. It is derived from the earlier `octo-web` codebase, but the architecture has been consolidated into one app under `src/features/*`.

Read this in [Simplified Chinese](README.zh.md).

## Status

This project is being prepared for public release. The core web client is active, but the open-source packaging is still in progress.

Current scope:

- Browser web client only.
- React 19 single-page application.
- Feature-based source layout under `src/features/*`.
- API access through `ofetch` and typed endpoint modules.
- Route, loader, search-param, query, and store flows built on TanStack libraries.

Not currently included:

- Electron desktop packaging from the legacy project.
- Browser extension packaging from the legacy project.
- Internal GitLab CI, Docker image publishing, or Kubernetes deployment manifests.

## Tech Stack

- React 19
- TypeScript 6
- TanStack Router, Query, Store, Form, Table, Virtual, and Hotkeys
- Vite+ (`vp`)
- Tailwind CSS v4
- shadcn/ui copy-in components
- ofetch
- pnpm

## Quick Start

```bash
git clone https://github.com/dmwork-org/octo-web-v2.git
cd octo-web-v2
pnpm install
cp .env.example .env.local
pnpm dev
```

Edit `.env.local` before starting if your backend services are not available at the default values.

## Environment

The app uses Vite client variables:

| Variable                     | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `VITE_API_BASE_URL`          | Browser-side API base path, usually `/v1`.                           |
| `VITE_API_URL`               | Dev server proxy target for OCTO API, Matter, and Summary endpoints. |
| `VITE_ENABLE_ENTERPRISE_SSO` | Enables the enterprise SSO login path when set to `true`.            |

`pnpm dev` uses Vite proxy rules for local development. Production builds are static assets and should be served behind a gateway that routes `/v1`, `/matter/api/v1`, and `/summary/api/v1` to the corresponding services.

## Scripts

```bash
pnpm dev              # Start the Vite+ dev server
pnpm build            # Type-check and build
pnpm check            # Run Vite+ checks
pnpm typecheck        # Run TypeScript without emitting
pnpm run structure-lint
pnpm run wiki-lint
pnpm run scan:upstream
```

The project also contains Vitest tests. CI runs them through Vite+.

## Architecture

Top-level layout:

| Path                    | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `src/routes`            | TanStack file-based routes.                                               |
| `src/features/base`     | Shared API client, auth, space state, IM provider, and base endpoints.    |
| `src/features/chat`     | Conversations, messages, channel settings, file preview, and chat stores. |
| `src/features/contacts` | Contact and organization views.                                           |
| `src/features/matter`   | Matter workflow views and APIs.                                           |
| `src/features/summary`  | Conversation summary views and APIs.                                      |
| `src/features/appbot`   | App bot views and APIs.                                                   |
| `src/features/persona`  | Persona views and APIs.                                                   |
| `src/components`        | Shared UI, rich editor, data, and compatibility components.               |
| `src/lib`               | Router, query client, i18n, and shared utilities.                         |
| `docs`                  | Migration notes, architecture notes, and upstream sync records.           |

Feature modules may include `MANIFEST.md` files that describe responsibilities, entry points, and local constraints.

## Development Rules

- Use TanStack Router file routes instead of hand-written route objects.
- Use route loaders and TanStack Query for server state.
- Use `ofetch` clients instead of raw `fetch`.
- Keep URL state in router search params, not local component state.
- Keep SDK-specific escape hatches inside adapter boundaries.
- Run `npx tsc -b` before shipping changes because Vite builds do not replace TypeScript project checks.

See [AGENTS.md](AGENTS.md) for the current agent-oriented rule index.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Security reports should follow [SECURITY.md](SECURITY.md), not public issues.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
