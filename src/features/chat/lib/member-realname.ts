import type { Subscriber } from "wukongimjssdk";
import { isRealnameVerified } from "@/features/base/lib/display-name";

export function isVerifiedMember(member: Subscriber): boolean {
  const org = member.orgData as
    | { real_name?: string; realname_verified?: boolean | number | string; robot?: number }
    | undefined;
  if (org?.robot === 1) return false;
  return isRealnameVerified({
    real_name: org?.real_name,
    realname_verified: org?.realname_verified,
  });
}
