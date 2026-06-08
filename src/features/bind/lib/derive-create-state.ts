import type { BindInfoResp } from "@/features/base/api/endpoints/oidc.api";
import { t } from "@/lib/i18n/instance";

/**
 * Create button UI 三态(对齐老仓 dmworklogin BindPage.deriveCreateState):
 *
 * 后端 PR#93 precedence: `disabled > claims_incomplete > manual_conflict > consumed`
 *
 * - `available` — 可点(allow_create=true && create_blocked='')
 * - `hidden`    — 不渲染入口(disabled / 老后端无字段)
 * - `blocked`   — 渲染说明文字,不渲染按钮(claims/conflict/consumed)
 */

export type CreateState =
  | { kind: "available" }
  | { kind: "hidden" }
  | { kind: "blocked"; reason: string };

export function deriveCreateState(info: BindInfoResp): CreateState {
  if (info.allow_create !== true) return { kind: "hidden" };
  const blocked = info.create_blocked ?? "";
  if (blocked === "") return { kind: "available" };
  if (blocked === "disabled") return { kind: "hidden" };
  if (blocked === "claims_incomplete") {
    return { kind: "blocked", reason: t("bind.error.ssoInfoIncomplete") };
  }
  if (blocked === "manual_conflict") {
    return { kind: "blocked", reason: t("bind.error.manualConflict") };
  }
  if (blocked === "consumed") {
    return { kind: "blocked", reason: t("bind.error.linkConsumed") };
  }
  return { kind: "hidden" };
}
