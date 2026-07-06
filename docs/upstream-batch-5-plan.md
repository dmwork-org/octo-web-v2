# Upstream Batch 5 Plan

## Scope

- upstream range: `6055b724..4c4e9191`
- branch: `codex/upstream-batch-5-port`
- goal: cover user-visible org frontend commits after Batch 4 without changing platform-specific CI/docs assumptions.

## Ported

- `2bb0b45b`: add custom emoji `[尚方宝剑]`.
- `fb4afa95`: load custom emoji manifest from `/v1/common/emojis` with local fallback.
- `ac81b338`: emoji prefix autocomplete in composer.
- `df69203a`: custom sticker panel and upload/delete flow.
- `05051d3c`: render `lottieSticker` messages through MessageRow.
- `bdb24e6f`: create-group name and avatar text/color flow.
- `abd91d47`: IME Enter guard in webhook name input.
- `d85b885d`: remove stale webhook member prefix hint.

## Equivalent / Skipped

- Group disband, summary declined-member handling, folded-message selected copy, and member-cache refresh were already covered by codex commits after Batch 4.
- Runtimes management was reverted upstream.
- GitHub Actions-only commits are skipped because this repository uses GitLab CI.
- `@octo/docs` editor integration is skipped because this repository has no `packages/docs` target; revisit only if codex frontend needs to host docs.

## Verification

- Locale JSON parse.
- TypeScript `tsc --noEmit`.
- Touched-file `vp lint`.
- `git diff --check`.
- Browser validation is left to the reviewer on the pushed branch.
