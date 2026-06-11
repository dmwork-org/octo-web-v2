import { useEffect, useMemo, useRef, useState } from "react";
import { listTimeline } from "@/features/matter/api/matter.api";
import type { MatterChannel, TimelineEntry } from "@/features/matter/types/matter.types";

/**
 * 拉取每个 channel 的最新 1 条 timeline（折叠态进度摘要用）。
 * channels 变化时自动重拉。
 *
 * 注意: effect 依赖用序列化后的 channelsKey 而非 channels 数组引用 —
 * 父组件常传 `data.channels ?? []`,channels 为 undefined 时每次 render 都
 * 产生新的 `[]` 引用,若直接依赖数组会导致 effect → setState → 重渲染 →
 * 新数组引用 → effect 无限循环(Maximum update depth exceeded)。
 */
export function useLatestTimelinePerChannel(matterId: string, channels: MatterChannel[]) {
  const [latestByChannel, setLatestByChannel] = useState<Map<string, TimelineEntry | null>>(
    new Map(),
  );

  const channelIds = useMemo(() => channels.map((ch) => ch.channel_id), [channels]);
  const channelsKey = channelIds.join("|");

  useEffect(() => {
    const ids = channelsKey ? channelsKey.split("|") : [];
    if (ids.length === 0) {
      setLatestByChannel(new Map());
      return;
    }
    let aborted = false;
    const tasks: Promise<{ channelId: string; entry: TimelineEntry | null }>[] = ids.map(
      async (channelId) => {
        try {
          const res = await listTimeline(matterId, {
            source_channel_id: channelId,
            limit: 1,
          });
          const serverFiltered = res.data?.[0];
          if (serverFiltered) {
            return { channelId, entry: serverFiltered };
          }

          // 兼容历史数据: 老数据可能没有 source_channel_id, 服务端按 source_channel_id
          // 过滤会返回空。退回拉全量后在前端按 source_channel_id/channel_id 过滤。
          const all = await listTimeline(matterId, { limit: 50 });
          const fallback = (all.data ?? []).find(
            (e) =>
              e.source_channel_id === channelId ||
              e.channel_id === channelId ||
              (!e.source_channel_id && !e.channel_id),
          );
          return { channelId, entry: fallback ?? null };
        } catch {
          return { channelId, entry: null };
        }
      },
    );
    void Promise.all(tasks).then((results) => {
      if (aborted) return;
      const map = new Map<string, TimelineEntry | null>();
      for (const r of results) map.set(r.channelId, r.entry);
      setLatestByChannel(map);
    });
    return () => {
      aborted = true;
    };
  }, [matterId, channelsKey]);

  return { latestByChannel };
}

/**
 * 展开指定 channel 时拉取全量 timeline。
 * expandedTimelines 变化时增量拉取，已缓存的 channel 不重复请求。
 *
 * 注意: effect **不能**依赖 timelineMap — effect 内部会 setTimelineMap,
 * 若把 timelineMap 列入依赖会形成 effect → setState → 新 Map 引用 →
 * effect 无限循环。改用 loadedRef 记录已加载/在途的 channel,既能去重又
 * 不需要把 timelineMap 当依赖。
 */
export function useChannelTimelineOnExpand(matterId: string, expandedTimelines: Set<string>) {
  const [timelineMap, setTimelineMap] = useState<Map<string, TimelineEntry[]>>(new Map());
  const [timelineLoading, setTimelineLoading] = useState(false);

  // 已加载 / 在途的 channelId 集合,避免重复请求,且不污染 effect 依赖。
  const loadedRef = useRef<Set<string>>(new Set());

  // matter 切换时重置缓存与已加载记录。
  useEffect(() => {
    loadedRef.current = new Set();
    setTimelineMap(new Map());
  }, [matterId]);

  const expandedKey = Array.from(expandedTimelines).sort().join("|");

  useEffect(() => {
    const ids = expandedKey ? expandedKey.split("|") : [];
    const toLoad = ids.filter((chId) => !loadedRef.current.has(chId));
    if (toLoad.length === 0) return;

    // 立即标记为在途,防止并发/重渲染重复发请求。
    for (const chId of toLoad) loadedRef.current.add(chId);

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
          // 失败的 channel 允许后续重试: 从已加载集合移除。
          loadedRef.current.delete(chId);
          return { channelId: chId, entries: [] };
        }
      },
    );
    void Promise.all(tasks)
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
  }, [expandedKey, matterId]);

  return { timelineMap, timelineLoading };
}
