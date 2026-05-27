import { useCallback, useEffect, useState } from "react";

/**
 * 关注 tab 父群下"子区展开状态"的 per-user + per-space localStorage 持久化(对应旧
 * dmworkbase ConversationList compact 模式 expandedGroupIds + _storageKey 行为):
 *
 *   key = `wk-thread-expanded-groups_${uid}_${spaceId}`
 *
 * 默认全部折叠(MAX_VISIBLE_THREADS=0,旧版同语义)。用户点父群行尾的子区指示图标
 * 切换。展开状态在跨 session / 跨 tab(同一 uid+spaceId)间保留,切 space 后是新 key,
 * 新 space 下从空集合开始。
 *
 * 不放进 store/store-fanout — 只关注 tab 用,scope 极窄,组件本地 state 配 effect
 * 写回 storage 即可。effect 依赖 storageKey,uid/spaceId 切换时同步从新 key 读。
 */

const STORAGE_KEY_PREFIX = "wk-thread-expanded-groups";

function loadFromStorage(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveToStorage(key: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // 静默忽略(隐身模式 / quota 满)
  }
}

export function useExpandedGroupIds(
  uid: string,
  spaceId: string | null,
): {
  expanded: Set<string>;
  toggle: (groupId: string) => void;
  isExpanded: (groupId: string) => boolean;
} {
  const storageKey = `${STORAGE_KEY_PREFIX}_${uid || "anon"}_${spaceId ?? "default"}`;
  const [expanded, setExpanded] = useState<Set<string>>(() => loadFromStorage(storageKey));

  // uid / spaceId 切换 → key 变 → 用新 key 重新 load
  useEffect(() => {
    setExpanded(loadFromStorage(storageKey));
  }, [storageKey]);

  const toggle = useCallback(
    (groupId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        saveToStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const isExpanded = useCallback((groupId: string) => expanded.has(groupId), [expanded]);

  return { expanded, toggle, isExpanded };
}
