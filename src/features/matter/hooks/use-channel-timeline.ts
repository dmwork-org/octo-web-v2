import { useEffect, useState } from "react";
import { listTimeline } from "@/features/matter/api/matter.api";
import type { MatterChannel, TimelineEntry } from "@/features/matter/types/matter.types";

/**
 * 拉取每个 channel 的最新 1 条 timeline（折叠态进度摘要用）。
 * channels 变化时自动重拉。
 */
export function useLatestTimelinePerChannel(matterId: string, channels: MatterChannel[]) {
  const [latestByChannel, setLatestByChannel] = useState<Map<string, TimelineEntry | null>>(
    new Map(),
  );

  useEffect(() => {
    if (channels.length === 0) {
      setLatestByChannel(new Map());
      return;
    }
    let aborted = false;
    const tasks: Promise<{ channelId: string; entry: TimelineEntry | null }>[] = channels.map(
      async (ch) => {
        try {
          const res = await listTimeline(matterId, {
            source_channel_id: ch.channel_id,
            limit: 1,
          });
          const serverFiltered = res.data?.[0];
          if (serverFiltered) {
            return { channelId: ch.channel_id, entry: serverFiltered };
          }

          // 兼容历史数据: 老数据可能没有 source_channel_id, 服务端按 source_channel_id
          // 过滤会返回空。退回拉全量后在前端按 source_channel_id/channel_id 过滤。
          const all = await listTimeline(matterId, { limit: 50 });
          const fallback = (all.data ?? []).find(
            (e) =>
              e.source_channel_id === ch.channel_id ||
              e.channel_id === ch.channel_id ||
              (!e.source_channel_id && !e.channel_id),
          );
          return { channelId: ch.channel_id, entry: fallback ?? null };
        } catch {
          return { channelId: ch.channel_id, entry: null };
        }
      },
    );
    Promise.all(tasks).then((results) => {
      if (aborted) return;
      const map = new Map<string, TimelineEntry | null>();
      for (const r of results) map.set(r.channelId, r.entry);
      setLatestByChannel(map);
    });
    return () => {
      aborted = true;
    };
  }, [matterId, channels]);

  return { latestByChannel };
}

/**
 * 展开指定 channel 时拉取全量 timeline。
 * expandedTimelines 变化时增量拉取，已缓存的 channel 不重复请求。
 */
export function useChannelTimelineOnExpand(matterId: string, expandedTimelines: Set<string>) {
  const [timelineMap, setTimelineMap] = useState<Map<string, TimelineEntry[]>>(new Map());
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    const toLoad = Array.from(expandedTimelines).filter((chId) => !timelineMap.has(chId));
    if (toLoad.length === 0) return;
    let aborted = false;
    setTimelineLoading(true);
    const tasks: Promise<{ channelId: string; entries: TimelineEntry[] }>[] = toLoad.map(
      async (chId) => {
        try {
          // 先按 source_channel_id 过滤
          const res = await listTimeline(matterId, {
            source_channel_id: chId,
            limit: 50,
          });
          if (res.data && res.data.length > 0) {
            return { channelId: chId, entries: res.data };
          }

          // 兼容历史数据: 老数据可能没有 source_channel_id, 服务端过滤会返回空。
          // 退回拉全量后在前端按 source_channel_id/channel_id 过滤。
          const all = await listTimeline(matterId, { limit: 100 });
          const fallback = (all.data ?? []).filter(
            (e) =>
              e.source_channel_id === chId ||
              e.channel_id === chId ||
              (!e.source_channel_id && !e.channel_id),
          );
          return { channelId: chId, entries: fallback };
        } catch {
          return { channelId: chId, entries: [] };
        }
      },
    );
    Promise.all(tasks)
      .then((results) => {
        if (aborted) return;
        setTimelineMap((prev) => {
          const next = new Map(prev);
          for (const r of results) next.set(r.channelId, r.entries);
          return next;
        });
      })
      .finally(() => {
        if (!aborted) setTimelineLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [expandedTimelines, matterId]);

  return { timelineMap, timelineLoading };
}
