/**
 * 展示名解析(对应旧 dmworkbase Utils/displayName.ts):
 * 优先级 remark > real_name(若已实名) > name
 *
 * GH #1121 OCTO 实名认证:realname_verified=true 时优先用 real_name 覆盖 name,
 * remark 永远最高优先级。
 */

export interface DisplayNameUser {
  name?: string | null;
  real_name?: string | null;
  realname_verified?: boolean | number | string | null;
  remark?: string | null;
}

function nonEmpty(v: string | null | undefined): v is string {
  return typeof v === "string" && v.length > 0;
}

/** 归一 realname_verified — 后端可能返 boolean / 1 / "1" / "true"。 */
function normalizeVerified(v: boolean | number | string | null | undefined): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

export function displayName(user: DisplayNameUser | null | undefined): string {
  if (!user) return "";
  if (nonEmpty(user.remark)) return user.remark;
  if (normalizeVerified(user.realname_verified) && nonEmpty(user.real_name)) {
    return user.real_name;
  }
  return nonEmpty(user.name) ? user.name : "";
}

export function isRealnameVerified(user: DisplayNameUser | null | undefined): boolean {
  if (!user) return false;
  return normalizeVerified(user.realname_verified);
}
