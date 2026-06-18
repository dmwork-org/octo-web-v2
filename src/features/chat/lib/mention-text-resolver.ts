import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Mention } from "wukongimjssdk";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { isLikelyRealUid, type MentionWithFlags } from "@/features/chat/lib/read-message-mention";

const CHANNEL_TYPE_THREAD = 5;

export interface MentionTextTarget {
  needle: string;
  uid?: string;
  isAll?: boolean;
  start?: number;
  matchAll?: boolean;
}

export function groupChannelOf(channel: Channel): Channel | null {
  if (channel.channelType === ChannelTypeGroup) return channel;
  if (channel.channelType !== CHANNEL_TYPE_THREAD) return null;
  const parsed = parseThreadChannelId(channel.channelID);
  return parsed ? new Channel(parsed.groupNo, ChannelTypeGroup) : null;
}

export function collectMentionCandidateNames(uid: string, channel: Channel): string[] {
  const names: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.length > 0 && !names.includes(value)) {
      names.push(value);
    }
  };

  const groupChannel = groupChannelOf(channel);
  if (groupChannel) {
    const sub = WKSDK.shared()
      .channelManager.getSubscribes(groupChannel)
      ?.find((s) => s.uid === uid);
    push(sub?.remark);
    push(sub?.name);
    const subOrg = sub?.orgData as { real_name?: string; displayName?: string } | undefined;
    push(subOrg?.real_name);
    push(subOrg?.displayName);
  }

  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  push(info?.title);
  const infoOrg = info?.orgData as
    | { remark?: string; real_name?: string; displayName?: string }
    | undefined;
  push(infoOrg?.remark);
  push(infoOrg?.real_name);
  push(infoOrg?.displayName);
  return names;
}

export function lookupMentionUidByDisplayName(channel: Channel, name: string): string | undefined {
  const groupChannel = groupChannelOf(channel);
  if (!groupChannel) return undefined;
  const subs = WKSDK.shared().channelManager.getSubscribes(groupChannel);
  if (!subs) return undefined;
  for (const sub of subs) {
    if (sub.name === name || sub.remark === name) return sub.uid;
    const org = sub.orgData as { real_name?: string; displayName?: string } | undefined;
    if (org?.real_name === name || org?.displayName === name) return sub.uid;
  }
  return undefined;
}

export function resolveMentionTextTargets({
  text,
  mention,
  channel,
  allowRegexFallback = false,
  blockedRanges = [],
}: {
  text: string;
  mention: Mention | undefined;
  channel?: Channel;
  allowRegexFallback?: boolean;
  blockedRanges?: { start: number; end: number }[];
}): MentionTextTarget[] {
  if (!mention) return [];
  const flags = mention as MentionWithFlags;
  if (
    !mention.uids?.length &&
    !mention.all &&
    !flags.humans &&
    !flags.ais &&
    !flags.entities?.length
  ) {
    return [];
  }

  const targets: MentionTextTarget[] = [];
  if (mention.all) {
    targets.push({ needle: "@所有人", isAll: true, matchAll: true });
    targets.push({ needle: "@all", isAll: true, matchAll: true });
  }
  if (flags.humans) {
    targets.push({ needle: "@所有人", isAll: true, matchAll: true });
  }
  if (flags.ais) {
    targets.push({ needle: "@所有AI", isAll: true, matchAll: true });
    return targets;
  }

  if (flags.entities?.length && channel) {
    const seenNeedles = new Set<string>();
    for (const ent of flags.entities) {
      const needle = text.slice(ent.offset, ent.offset + ent.length);
      if (!needle.startsWith("@")) continue;
      if (seenNeedles.has(needle)) continue;
      seenNeedles.add(needle);
      const displayName = needle.slice(1);
      targets.push({
        needle,
        start: ent.offset,
        uid: isLikelyRealUid(ent.uid)
          ? ent.uid
          : lookupMentionUidByDisplayName(channel, displayName),
      });
    }
    return targets;
  }

  const uids = mention.uids ?? [];
  if (channel) {
    for (const uid of uids) {
      for (const name of collectMentionCandidateNames(uid, channel)) {
        const needle = `@${name}`;
        if (!text.includes(needle)) continue;
        targets.push({ needle, uid });
        break;
      }
    }
    return targets;
  }

  if (!allowRegexFallback) return targets;
  const blocked = [...blockedRanges];
  for (const target of targets) {
    if (!target.matchAll) continue;
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(target.needle, from);
      if (start === -1) break;
      blocked.push({ start, end: start + target.needle.length });
      from = start + target.needle.length;
    }
  }
  const re = /@[\p{Script=Han}A-Za-z][\p{Script=Han}\w.()（）-]{0,29}/gu;
  let i = 0;
  for (const match of text.matchAll(re)) {
    if (i >= uids.length) break;
    const start = match.index ?? -1;
    if (start === -1) continue;
    const end = start + match[0].length;
    if (blocked.some((range) => start < range.end && end > range.start)) continue;
    targets.push({ needle: match[0], start, uid: uids[i++] });
    blocked.push({ start, end });
  }
  return targets;
}
