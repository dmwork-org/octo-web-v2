import type { BindInfoResp } from "@/features/base/api/endpoints/oidc.api";

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
    return { kind: "blocked", reason: "SSO 身份信息不完整，无法自助创建账号" };
  }
  if (blocked === "manual_conflict") {
    return { kind: "blocked", reason: "您的 SSO 身份匹配到多个 Octo 账号，需要管理员协助处理" };
  }
  if (blocked === "consumed") {
    return { kind: "blocked", reason: "当前链接已使用过，请重新发起 SSO 登录" };
  }
  return { kind: "hidden" };
}
