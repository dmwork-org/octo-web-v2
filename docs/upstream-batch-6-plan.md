# Upstream Batch 6 Plan

## Scope

- upstream range: `4c4e9191..f12c0f95`
- branch: `codex/upstream-batch-6-port`
- goal: cover post-Batch-5 user-visible frontend changes that map to existing OCTO Web v2 modules; keep `@octo/docs` work recorded but deferred unless this repository gains a docs surface.

## Candidate Commits

### Contacts / Presence

- [x] `1f5b022c` feat(contacts): show online status badge for AI entries.
- [x] `2035097f` fix: restore offline online-status badge tip.

### Sticker

- [x] `a8befe22` feat(sticker): gate custom sticker entry by appconfig flag.
- [x] `c1155f41` feat(sticker): "Add to my stickers" context menu.

### Summary

- [x] `0c38da2c` feat(summary): pre-submit personal draft edit entry.

### Docs Surface

- [~] `4d595118` feat(docs): gate Docs entry behind appconfig docs_on flag.
- [~] `1297da9f` feat(docs): standalone document page for shared `/d/:docId` links.
- [~] `93659b58` fix(docs): reload document list when the current Space switches.
- [~] `459953cc` feat(docs): forward document to chat with grant + access requests.
- [~] `f12c0f95` feat(docs): Excel-style collaborative spreadsheet with Univer + Yjs.

This repository currently has no `packages/docs` target or route surface for docs. Keep these commits deferred until product decides OCTO Web v2 should host docs.

## Verification Plan

- [x] `npx tsc -b`
- [x] `pnpm check`
- [x] `pnpm test -- --run src/features/chat/lib/conversation-online.test.ts src/features/summary/components/citation-text.test.tsx`

## Result

- Contacts: AI rows in Added AI / All Contacts render the shared online badge. Online stays a dot; offline within 1 hour renders the short time pill. Presence lookup strips the current Space uid prefix only for online-status cache reads.
- Sticker: `sticker_custom_enabled` gates the custom sticker tab/upload entry; lottie/bitmap sticker message context menu can collect received stickers via `sticker/user/collect`.
- Summary: pending personal result can be edited before submission via `PUT /summaries/{taskId}/personal-draft`; submitted personal and team edit flows remain unchanged.
- Docs: docs-related commits remain deferred because this repository still has no docs package or route surface.
