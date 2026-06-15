import type { MentionItem } from "@/features/chat/components/mention-list";
import { t } from "@/lib/i18n/instance";

export interface MentionMemberSource {
  uid: string;
  name?: string;
  remark?: string;
  isDeleted?: boolean | number;
  orgData?: {
    real_name?: string | null;
    realname_verified?: boolean | number | string | null;
    robot?: number;
    displayName?: string;
  } | null;
}

export interface VoiceMentionMember {
  uid: string;
  name: string;
  label: string;
}

export interface VoiceContextResult {
  memberContext?: string;
  selfName?: string;
}

function normalizeVerified(v: boolean | number | string | null | undefined): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

function nonEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function pushUnique(out: string[], value: string | null | undefined): void {
  const v = nonEmpty(value);
  if (v && !out.includes(v)) out.push(v);
}

function isBot(member: MentionMemberSource): boolean {
  return member.orgData?.robot === 1;
}

export function verifiedRealName(member: MentionMemberSource): string {
  if (isBot(member)) return "";
  return normalizeVerified(member.orgData?.realname_verified)
    ? nonEmpty(member.orgData?.real_name)
    : "";
}

export function mentionDisplayLabel(member: MentionMemberSource): string {
  return (
    verifiedRealName(member) ||
    nonEmpty(member.remark) ||
    nonEmpty(member.name) ||
    nonEmpty(member.orgData?.displayName) ||
    member.uid
  );
}

export function mentionNameAliases(member: MentionMemberSource): string[] {
  const names: string[] = [];
  pushUnique(names, verifiedRealName(member));
  pushUnique(names, member.remark);
  pushUnique(names, member.name);
  return names;
}

export function buildMentionItems(members: readonly MentionMemberSource[]): MentionItem[] {
  return members.map((member) => {
    const aliases = mentionNameAliases(member);
    return {
      id: member.uid,
      label: mentionDisplayLabel(member),
      isBot: isBot(member),
      searchText: [member.uid, ...aliases].join(" ").toLowerCase(),
    };
  });
}

export function buildVoiceMentionMembers(
  members: readonly MentionMemberSource[],
): VoiceMentionMember[] {
  const result: VoiceMentionMember[] = [];
  for (const member of members) {
    const label = mentionDisplayLabel(member);
    for (const name of mentionNameAliases(member)) {
      result.push({ uid: member.uid, name, label });
    }
  }
  return result;
}

export function buildVoiceContext(params: {
  members: readonly MentionMemberSource[];
  selfUid?: string;
  selfName?: string;
}): VoiceContextResult {
  const memberNames: string[] = [];
  let selfNames: string[] = [];
  for (const member of params.members) {
    if (member.isDeleted) continue;
    const names = mentionNameAliases(member);
    if (member.uid === params.selfUid) {
      selfNames = names;
      continue;
    }
    for (const name of names) pushUnique(memberNames, name);
  }
  if (selfNames.length === 0) pushUnique(selfNames, params.selfName);

  return {
    memberContext:
      memberNames.length > 0
        ? t("chatContext.members", { values: { names: memberNames.join("，") } })
        : undefined,
    selfName: selfNames.length > 0 ? selfNames.join("，") : undefined,
  };
}
