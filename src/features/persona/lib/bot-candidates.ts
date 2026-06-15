import type { BotCandidate } from "@/features/base/api/endpoints/obo.api";
import type { OboGrant } from "@/features/base/api/endpoints/obo.api";

export function buildPersonaBotCandidates({
  open,
  myBots,
  spaceBots,
  grants,
  myUid,
}: {
  open: boolean;
  myBots: BotCandidate[] | undefined;
  spaceBots: BotCandidate[] | undefined;
  grants: OboGrant[] | undefined;
  myUid: string;
}): BotCandidate[] {
  if (!open) return [];

  const myList = Array.isArray(myBots) ? myBots : [];
  const spaceList = Array.isArray(spaceBots) ? spaceBots : [];
  const ownedMyBots = myUid ? myList.filter((b) => b.creator_uid && b.creator_uid === myUid) : [];
  const ownedSpaceBots = myUid
    ? spaceList.filter((b) => b.creator_uid && b.creator_uid === myUid)
    : [];

  const merged = new Map<string, BotCandidate>();
  for (const b of [...ownedMyBots, ...ownedSpaceBots]) {
    if (!b || !b.uid || merged.has(b.uid)) continue;
    merged.set(b.uid, b);
  }

  const grantedUids = new Set((Array.isArray(grants) ? grants : []).map((g) => g.grantee_bot_uid));
  return Array.from(merged.values()).filter((b) => !grantedUids.has(b.uid));
}
