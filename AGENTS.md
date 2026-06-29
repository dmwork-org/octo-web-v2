# OCTO Web v2 — Agent Index

This file is a compact index for coding agents and external automation tools. It mirrors the public contribution rules without replacing `README.md`, `CONTRIBUTING.md`, or `CLAUDE.md`.

## Stack

- React 19 + TypeScript 6
- TanStack Router / Query / Store / Form / Table / Virtual / Hotkeys
- Vite+ (`vp`)
- Tailwind CSS v4
- shadcn/ui copy-in components
- ofetch
- pnpm

## Conventions

- **Types**: avoid `any`, `as any`, and `@ts-ignore`; SDK boundary exceptions must be documented locally.
- **Data**: avoid `useEffect + fetch`; use route loaders, query options, or named hooks.
- **API**: avoid raw `fetch`; use the configured `ofetch` client.
- **Routes**: use TanStack file routes with `createFileRoute`.
- **URL state**: use `validateSearch` and `useSearch`, not component-local state.
- **Style**: run `vp check --fix` for formatting and lint fixes.
- **Typecheck**: run `npx tsc -b`; Vite builds do not replace TypeScript project checks.

## Commands

| Purpose              | Command                                                   |
| -------------------- | --------------------------------------------------------- |
| Install dependencies | `pnpm install`                                            |
| Start dev server     | `pnpm dev`                                                |
| Typecheck            | `npx tsc -b`                                              |
| Check                | `pnpm check`                                              |
| Test                 | `pnpm test -- --run`                                      |
| Structure lint       | `pnpm run structure-lint`                                 |
| Wiki lint            | `pnpm run wiki-lint`                                      |
| TanStack docs        | `tanstack doc <topic>` / `tanstack search-docs "<query>"` |
| Add shadcn component | `pnpm dlx shadcn@latest add <component>`                  |

## Skill Index

The `.claude/skills/*` directory contains optional task guides for AI coding assistants. They are not required for human contributors, but they document common project patterns.

| Skill                                | Typical paths                                         | Purpose                                                      |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| `implement-route-with-query-loader`  | `src/routes/**/*.tsx`                                 | File route + loader + `ensureQueryData` + `useSuspenseQuery` |
| `implement-auth-guard`               | `src/routes/_auth*`, `src/routes/login*`, auth stores | `beforeLoad`, redirects, and auth state                      |
| `implement-ofetch-interceptor`       | `src/features/base/api/**`, `src/lib/api.ts`          | Shared ofetch client and independent interceptors            |
| `implement-mutation-with-invalidate` | `src/features/**/mutations.ts`                        | Mutations with query invalidation                            |
| `implement-typed-search-params`      | routes with `validateSearch`                          | Typed URL search params                                      |

## Rule Index

Machine-readable rule metadata lives in `.ai/taste/rules.ts`; human-readable notes live in `.ai/taste/rules.md`.

Important rules:

- `no-useeffect-fetch`
- `no-useeffect-in-component`
- `no-any`
- `fetch-via-ofetch`
- `use-filebased-route`
- `url-state-via-usesearch`
- `mutation-invalidates`
- `querykey-factory`

## Review Checklist

- [ ] `pnpm install` after pulling dependency changes.
- [ ] `npx tsc -b`
- [ ] `pnpm check`
- [ ] `pnpm test -- --run`
- [ ] Check relevant `vite.config.ts` tasks or `package.json` scripts when changing tooling.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project uses Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single CLI called `vp`.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

<!--VITE PLUS END-->
