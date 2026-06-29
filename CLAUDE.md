# CLAUDE.md

This file gives optional guidance to AI coding assistants working in this repository. Human contributors should start with `README.md` and `CONTRIBUTING.md`.

## Project

OCTO Web v2 is a React web client organized as a single application under `src/features/*`.

The project was derived from the earlier OCTO Web codebase, but the current architecture is feature-based rather than a legacy `apps/* + packages/*` monorepo.

## Stack

- React 19
- TypeScript 6
- TanStack Router, Query, Store, Form, Table, Virtual, and Hotkeys
- Vite+ (`vp`)
- Tailwind CSS v4
- shadcn/ui copy-in components
- ofetch
- pnpm

## Commands

```bash
pnpm install
pnpm dev
npx tsc -b
pnpm check
pnpm test -- --run
pnpm run structure-lint
pnpm run wiki-lint
```

## Core Rules

- Do not use `any`, `as any`, or `@ts-ignore` unless the exception is isolated at a documented SDK boundary.
- Do not fetch inside component `useEffect`; use route loaders, query options, or named hooks.
- Do not store URL state in `useState`; use TanStack Router search params.
- Do not hand-write route objects; use file-based routes with `createFileRoute`.
- Do not use raw `fetch`; use the configured `ofetch` client.
- Keep cross-feature imports intentional. Shared code belongs in `src/lib`, `src/components`, or `src/features/base`.
- Keep user-facing text in the i18n resources.

## TanStack Work

Before adding or changing TanStack Router, Query, Form, Table, Store, Virtual, or Hotkeys code, check the relevant upstream documentation.

Common local commands:

```bash
tanstack doc <topic>
tanstack search-docs "<query>"
```

## Directory Notes

```text
src/routes/          TanStack file routes
src/features/base/   shared API client, auth, space state, IM provider
src/features/chat/   conversations, messages, file preview, channel settings
src/features/*/api   feature-specific API clients
src/components/      shared UI, rich editor, data, and compatibility components
src/lib/             router, query client, i18n, and shared utilities
.ai/                 optional rule/eval metadata for assisted development
.claude/             optional assistant rules, skills, and local hook examples
docs/                migration notes, architecture notes, and release-prep records
```

## Verification

Before opening a pull request, run:

```bash
npx tsc -b
pnpm check
pnpm test -- --run
```

For documentation-only changes, explain why code checks were skipped in the PR.
