import { useState, useEffect, useRef } from "react";
import WKSDK, { Channel } from "wukongimjssdk";

export interface ChannelRef {
  channelId: string;
  channelType: number;
}

export interface AssigneeInfo {
  uid: string;
  name: string;
}

/**
 * useMembersFromChannels — 并发拉多个 channel 的成员并合并去重。
 *
 * 使用场景 (PRD §5.1):
 *   Matter 负责人候选应当从所有关联 channel 的成员并集中选择。
 */
export function useMembersFromChannels(
  channels: ChannelRef[],
  enabled = true,
) {
  const [members, setMembers] = useState<AssigneeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const channelsKey = channels
    .map((c) => `${c.channelId}:${c.channelType}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!enabled || channels.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const reqId = ++requestIdRef.current;
    setLoading(true);

    Promise.all(
      channels.map(async (ref) => {
        const ch = new Channel(ref.channelId, ref.channelType);
        try {
          await WKSDK.shared().channelManager.syncSubscribes(ch);
          return WKSDK.shared().channelManager.getSubscribes(ch);
        } catch {
          return [];
        }
      }),
    ).then((allBatches) => {
      if (reqId !== requestIdRef.current) return;

      const seen = new Set<string>();
      const merged: AssigneeInfo[] = [];
      for (const batch of allBatches) {
        for (const s of batch) {
          if (seen.has(s.uid)) continue;
          seen.add(s.uid);
          merged.push({
            uid: s.uid,
            name: s.name || s.uid,
          });
        }
      }
      setMembers(merged);
      setLoading(false);
    });

    return () => {
      requestIdRef.current++;
    };
  }, [channelsKey, enabled]);

  return { members, loading };
}
